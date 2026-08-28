import type { Element, ElementType, LadxProgram, Rung, Tag, TagType } from "./types";

/**
 * Reading a Rockwell L5X export.
 *
 * L5X is the documented XML export from Studio 5000, and its schema ships with
 * the product as `L5XSchema.xsd`. That matters more than the convenience: this
 * reads a file the customer exported from a seat they licensed, which is a
 * thing their licence permits and which asks nothing of us. The `.ACD` project
 * file is a proprietary binary and is deliberately not touched. See ADR 0003.
 *
 * The useful accident of L5X is that the ladder inside it is not XML. Each rung
 * carries its logic as Rockwell neutral text in a CDATA block:
 *
 *   [XIC(Start_PB),XIC(Motor)]XIO(Stop_PB)OTE(Motor);
 *
 * which is the same notation LADX already writes out. So the XML layer is thin
 * and the real work is the neutral text parser below, which is shared with
 * anything else that speaks the same notation.
 *
 * ## What this does not pretend
 *
 * An import that refuses the whole file because one rung used an instruction it
 * did not know is the behaviour that makes people give up on a converter. So
 * every rung is attempted, anything unrecognised is reported by name and
 * position, and what could be read is returned. A partial import that says what
 * it dropped is worth more than a clean failure.
 */

export type ImportSeverity = "info" | "warning" | "manual";

export interface ImportNote {
  severity: ImportSeverity;
  where: string;
  message: string;
}

export interface ImportedProgram {
  program: LadxProgram;
  notes: ImportNote[];
}

/* ───────────────────────── neutral text ───────────────────────── */

/**
 * Instructions LADX has an equivalent for.
 *
 * Everything outside this is reported rather than approximated. A converter
 * that silently turns an instruction it does not understand into the nearest
 * thing it does is how a migration produces logic that looks right and behaves
 * differently, which is the single worst outcome available here.
 */
const KNOWN: Record<string, ElementType> = {
  XIC: "XIC",
  XIO: "XIO",
  OTE: "OTE",
  OTL: "OTL",
  OTU: "OTU",
  ONS: "ONS",
  OSR: "ONS",
  TON: "TON",
  TOF: "TOF",
  RTO: "TON",
  CTU: "CTU",
  CTD: "CTD",
  RES: "RES",
  MOV: "MOV",
  ADD: "ADD",
  SUB: "SUB",
  MUL: "MUL",
  DIV: "DIV",
  EQU: "EQU",
  NEQ: "NEQ",
  GRT: "GRT",
  LES: "LES",
  GEQ: "GEQ",
  LEQ: "LEQ",
  JSR: "JSR",
};

/** Instructions that drive the rung rather than condition it. */
const OUTPUTS = new Set<ElementType>([
  "OTE",
  "OTL",
  "OTU",
  "TON",
  "TOF",
  "CTU",
  "CTD",
  "RES",
  "MOV",
  "ADD",
  "SUB",
  "MUL",
  "DIV",
  "JSR",
]);

interface Call {
  name: string;
  args: string[];
}

/**
 * Split neutral text into calls and branch groups.
 *
 * Written by hand rather than with a regex because branches nest: `[a,[b,c]d]`
 * is legal, and a regex that appears to handle it is a regex that handles the
 * cases you thought of. The parser tracks depth and splits on commas only at
 * the top level of the group it is in.
 */
function splitTop(text: string, open: string, close: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === open || c === "(") depth++;
    else if (c === close || c === ")") depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** Every call at the top level of a chunk, ignoring anything inside brackets. */
function callsIn(text: string): { calls: Call[]; branches: string[][] } {
  const calls: Call[] = [];
  const branches: string[][] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === undefined) break;
    if (c === "[") {
      // A parallel group. Find its matching close, then split on commas.
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        if (text[j] === "[") depth++;
        if (text[j] === "]") {
          depth--;
          if (depth === 0) break;
        }
      }
      branches.push(splitTop(text.slice(i + 1, j), "[", "]", ","));
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j] ?? "")) j++;
      const name = text.slice(i, j);
      if (text[j] === "(") {
        let depth = 0;
        let k = j;
        for (; k < text.length; k++) {
          if (text[k] === "(") depth++;
          if (text[k] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        const inner = text.slice(j + 1, k);
        calls.push({
          name: name.toUpperCase(),
          args: inner.length ? splitTop(inner, "(", ")", ",").map((a) => a.trim()) : [],
        });
        i = k + 1;
        continue;
      }
      calls.push({ name: name.toUpperCase(), args: [] });
      i = j;
      continue;
    }
    i++;
  }
  return { calls, branches };
}

let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}

/** Reset the counter, so a fixture-driven test gets stable ids. */
export function resetImportIds(): void {
  seq = 0;
}

function toElement(call: Call, where: string, notes: ImportNote[]): Element | null {
  const type = KNOWN[call.name];
  if (!type) {
    notes.push({
      severity: "manual",
      where,
      message: `${call.name} has no LADX equivalent and was left out. The rung around it was kept, so what it did has to be put back by hand.`,
    });
    return null;
  }
  if (call.name === "OSR") {
    notes.push({
      severity: "warning",
      where,
      message:
        "OSR was read as a one shot (ONS). Rockwell's OSR sets a storage bit and an output bit; LADX has the storage form only, so check anything that read the output bit.",
    });
  }
  if (call.name === "RTO") {
    notes.push({
      severity: "warning",
      where,
      message:
        "RTO was read as TON. A retentive timer keeps its accumulated value when the rung goes false and TON does not, so any rung relying on that needs a look.",
    });
  }

  const el: Element = { id: id("el"), type, tag: call.args[0] ?? "" };

  if (type === "TON" || type === "TOF" || type === "CTU" || type === "CTD") {
    const preset = Number(call.args[1]);
    if (Number.isFinite(preset)) el.preset = preset;
  }
  if (type === "MOV") {
    el.tag = call.args[0] ?? "";
    el.operand = call.args[0];
    el.dest = call.args[1];
  }
  if (type === "ADD" || type === "SUB" || type === "MUL" || type === "DIV") {
    el.operand = call.args[1];
    el.dest = call.args[2];
  }
  if (
    type === "EQU" ||
    type === "NEQ" ||
    type === "GRT" ||
    type === "LES" ||
    type === "GEQ" ||
    type === "LEQ"
  ) {
    el.operand = call.args[1];
  }
  return el;
}

/**
 * One rung of neutral text, as LADX's branches-and-outputs shape.
 *
 * LADX models a rung as parallel branches of series elements, plus the outputs
 * they drive. Neutral text is a flat string with bracket groups, so the mapping
 * is: everything before the first output instruction is the condition, and the
 * bracket group, if there is one, is the parallel part.
 *
 * This handles the shapes that occur in practice, which is a seal-in and a
 * series chain. It does not attempt arbitrary nesting: a branch inside a branch
 * is reported rather than flattened, because flattening changes the logic and
 * would do it silently.
 */
export function parseNeutralRung(
  text: string,
  where: string,
  notes: ImportNote[],
): { branches: Element[][]; outputs: Element[] } {
  const body = text.trim().replace(/;\s*$/, "");
  const { calls, branches: groups } = callsIn(body);

  const outputs: Element[] = [];
  const series: Element[] = [];

  for (const call of calls) {
    const el = toElement(call, where, notes);
    if (!el) continue;
    if (OUTPUTS.has(el.type)) outputs.push(el);
    else series.push(el);
  }

  const branches: Element[][] = [];
  for (const group of groups) {
    for (const leg of group) {
      if (/\[/.test(leg)) {
        notes.push({
          severity: "manual",
          where,
          message:
            "This rung has a branch inside a branch. It was read as a flat set of parallel legs, which is not the same logic, so the rung needs checking.",
        });
      }
      const { calls: legCalls } = callsIn(leg);
      const legEls: Element[] = [];
      for (const call of legCalls) {
        const el = toElement(call, where, notes);
        if (!el) continue;
        if (OUTPUTS.has(el.type)) outputs.push(el);
        else legEls.push(el);
      }
      // Every leg carries the series conditions that follow the group, which is
      // what juxtaposition means in neutral text.
      branches.push([...legEls, ...series]);
    }
  }

  if (branches.length === 0) branches.push(series);
  return { branches, outputs };
}

/* ─────────────────────────────── L5X ─────────────────────────────── */

/**
 * Read the tags an L5X declares.
 *
 * Only the types LADX has. A REAL or a STRING is reported rather than coerced,
 * because a REAL silently becoming an INT is a class of bug that shows up as a
 * setpoint being wrong by a rounding error months later.
 */
function readTags(doc: Document, notes: ImportNote[]): Tag[] {
  const out: Tag[] = [];
  const seen = new Set<string>();
  for (const el of Array.from(doc.querySelectorAll("Tag"))) {
    const name = el.getAttribute("Name");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const raw = (el.getAttribute("DataType") ?? "").toUpperCase();
    let type: TagType | null = null;
    if (raw === "BOOL") type = "BOOL";
    else if (raw === "DINT" || raw === "INT" || raw === "SINT") type = "INT";
    else if (raw === "TIMER") type = "TIMER";
    else if (raw === "COUNTER") type = "COUNTER";

    if (!type) {
      notes.push({
        severity: "warning",
        where: "Tags",
        message: `${name} is a ${raw || "type LADX does not have"} and was left out rather than converted to something close.`,
      });
      continue;
    }
    const tag: Tag = { name, type, value: 0 };
    const desc = el.querySelector("Description")?.textContent?.trim();
    if (desc) tag.comment = desc;
    out.push(tag);
  }
  return out;
}

/**
 * Parse an L5X file into a LADX program.
 *
 * `DOMParser` rather than a dependency: the browser has an XML parser, the
 * desktop's webview has the same one, and adding an XML library to read one
 * documented format would be a dependency to keep current for no gain.
 */
export function parseL5X(xml: string): ImportedProgram | { error: string } {
  if (typeof DOMParser === "undefined") {
    return { error: "XML parsing is not available on this surface." };
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return { error: "That file could not be read as XML." };
  }
  if (doc.querySelector("parsererror")) {
    return { error: "That file is not valid XML. Export it again from Studio 5000." };
  }
  if (!doc.querySelector("RSLogix5000Content")) {
    return {
      error:
        "That is not an L5X export. In Studio 5000, right click the program or the controller and choose Export, which writes a .L5X file.",
    };
  }

  resetImportIds();
  const notes: ImportNote[] = [];
  const schema = doc.documentElement.getAttribute("SchemaRevision");
  const target = doc.documentElement.getAttribute("TargetName");

  notes.push({
    severity: "info",
    where: target ?? "Project",
    message: `Read from an L5X export${schema ? `, schema revision ${schema}` : ""}. Ladder came across as logic; rung layout, cross references and the controller's hardware tree are not part of what LADX models.`,
  });

  const tags = readTags(doc, notes);
  const rungs: Rung[] = [];

  const routines = Array.from(doc.querySelectorAll("Routine"));
  if (routines.length > 1) {
    notes.push({
      severity: "warning",
      where: target ?? "Project",
      message: `The export has ${routines.length} routines. They were read in order into one program, because LADX has a single rung list; the routine each rung came from is in its comment.`,
    });
  }

  for (const routine of routines) {
    const rName = routine.getAttribute("Name") ?? "Routine";
    const type = routine.getAttribute("Type");
    if (type && type.toUpperCase() !== "RLL") {
      notes.push({
        severity: "manual",
        where: rName,
        message: `${rName} is ${type}, not ladder, and was skipped. LADX reads ladder routines only.`,
      });
      continue;
    }
    const rungEls = Array.from(routine.querySelectorAll("Rung"));
    rungEls.forEach((rungEl, i) => {
      const where = `${rName}, rung ${i + 1}`;
      const text = rungEl.querySelector("Text")?.textContent ?? "";
      if (!text.trim()) return;
      const comment = rungEl.querySelector("Comment")?.textContent?.trim();
      const { branches, outputs } = parseNeutralRung(text, where, notes);
      if (branches.every((b) => b.length === 0) && outputs.length === 0) {
        notes.push({
          severity: "manual",
          where,
          message: "Nothing in this rung could be read, so it came across empty.",
        });
      }
      rungs.push({
        id: id("r"),
        branches,
        outputs,
        comment: comment ? `${rName}: ${comment}` : `${rName}`,
      });
    });
  }

  if (rungs.length === 0) {
    return {
      error:
        "No ladder rungs were found in that export. If the project is Structured Text or Function Block, LADX cannot read it yet.",
    };
  }

  /*
   * Tags the logic uses but the export did not declare.
   *
   * Common when a single routine is exported rather than the controller, and it
   * matters: a rung binding to a tag that does not exist compiles to nothing.
   * They are created as BOOL and reported, which is a guess, so it is said out
   * loud rather than left to be discovered.
   */
  const declared = new Set(tags.map((t) => t.name));
  const used = new Set<string>();
  for (const r of rungs) {
    for (const b of r.branches) for (const e of b) if (e.tag) used.add(e.tag.split(".")[0] ?? "");
    for (const e of r.outputs) if (e.tag) used.add(e.tag.split(".")[0] ?? "");
  }
  const missing = [...used].filter((n) => n && !declared.has(n));
  if (missing.length) {
    for (const name of missing) tags.push({ name, type: "BOOL", value: 0 });
    notes.push({
      severity: "warning",
      where: "Tags",
      message: `${missing.length} tag${missing.length === 1 ? " was" : "s were"} used by the logic but not declared in the export, so ${missing.length === 1 ? "it was" : "they were"} created as BOOL: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}. Exporting the whole controller rather than one routine avoids this.`,
    });
  }

  return {
    program: {
      name: target ?? "Imported program",
      rungs,
      tags,
      scanMs: 100,
    },
    notes,
  };
}
