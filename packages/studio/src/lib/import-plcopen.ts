import type { ImportNote, ImportedProgram } from "./import-l5x";
import { resetImportIds } from "./import-l5x";
import type { Element, LadxProgram, Rung, Tag, TagType } from "./types";

/**
 * Reading PLCopen TC6 XML.
 *
 * One format that reaches a lot of vendors: CODESYS 3.5 and everything built on
 * it, which is Beckhoff TwinCAT 3, WAGO, Festo, and large parts of ABB and
 * Schneider, plus B&R. It is an open standard rather than a vendor's file, so
 * unlike the binary project formats there is nothing to reverse engineer and
 * nobody's licence to read. See ADR 0003.
 *
 * ## What actually survives, and what does not
 *
 * The standard can express ladder as a coordinate graph, and vendors implement
 * that part inconsistently enough that it cannot be relied on. What is reliably
 * there is the interface, meaning the declared variables, and a body in one of
 * ST, LD, FBD, IL or SFC.
 *
 * So this reads two things: the variable declarations, which are genuinely
 * portable, and an LD body when there is one. An ST body is not translated into
 * ladder, because turning arbitrary Structured Text back into rungs is a
 * decompiler, not an importer, and one that got it subtly wrong would be worse
 * than not having it. The tags still come across, which is most of the tedium.
 *
 * Vendor `addData` blocks are noted rather than dropped silently. They carry the
 * things that made the file work in its own tool, and the documented failure
 * mode when they are lost is an import that fails silently somewhere else.
 */

const NS = "http://www.plcopen.org/xml/tc6_0201";

/** Which IEC types LADX has a real equivalent for. */
function iecType(name: string): TagType | null {
  const t = name.toUpperCase();
  if (t === "BOOL") return "BOOL";
  if (t === "INT" || t === "DINT" || t === "SINT" || t === "UINT" || t === "UDINT" || t === "WORD")
    return "INT";
  if (t === "TIME" || t === "TON" || t === "TOF" || t === "TP") return "TIMER";
  if (t === "CTU" || t === "CTD" || t === "CTUD") return "COUNTER";
  return null;
}

/** The type element inside a `<variable>`, which is a child element name. */
function typeNameOf(variable: Element0): string {
  const type = child(variable, "type");
  if (!type) return "";
  for (const c of Array.from(type.children)) {
    if (c.localName === "derived") return c.getAttribute("name") ?? "derived";
    return c.localName;
  }
  return "";
}

type Element0 = globalThis.Element;

function child(parent: Element0, local: string): Element0 | null {
  for (const c of Array.from(parent.children)) if (c.localName === local) return c;
  return null;
}

function all(root: Document | Element0, local: string): Element0[] {
  return Array.from(root.getElementsByTagNameNS(NS, local)).concat(
    // Some exports omit the namespace on the body elements. Falling back to a
    // plain tag lookup reads those rather than reporting an empty file, which
    // is what a strict reader would do and would look like a bug to the person
    // holding a file their own tool wrote.
    Array.from(root.getElementsByTagName(local)).filter((e) => e.namespaceURI !== NS),
  );
}

/* ─────────────────────────── ladder from LD ─────────────────────────── */

let seq = 0;
function nid(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}

/**
 * An LD body, as LADX rungs.
 *
 * TC6 draws ladder as a graph: contacts and coils carry an id, and a
 * `connectionPointIn` naming the ids that feed them. Following that graph
 * backwards from each coil gives the logic without needing the coordinates,
 * which is the part vendors disagree about.
 *
 * Only the shapes that occur in practice are read: a series chain, and a
 * parallel group feeding one point. Anything more tangled is reported rather
 * than guessed at, because a rung that is nearly right is worse than a rung
 * that is marked for review.
 */
function readLdBody(body: Element0, where: string, notes: ImportNote[]): Rung[] {
  const nodes = new Map<string, Element0>();
  for (const kind of ["contact", "coil", "block", "leftPowerRail", "rightPowerRail"]) {
    for (const el of all(body, kind)) {
      const id = el.getAttribute("localId");
      if (id) nodes.set(id, el);
    }
  }

  /** The ids feeding a node. */
  const feeders = (el: Element0): string[] => {
    const cin = child(el, "connectionPointIn");
    if (!cin) return [];
    return Array.from(cin.children)
      .filter((c) => c.localName === "connection")
      .map((c) => c.getAttribute("refLocalId") ?? "")
      .filter(Boolean);
  };

  const asElement = (el: Element0): Element | null => {
    const variable = child(el, "variable")?.textContent?.trim() ?? "";
    if (el.localName === "contact") {
      const negated = el.getAttribute("negated") === "true";
      return { id: nid("el"), type: negated ? "XIO" : "XIC", tag: variable };
    }
    if (el.localName === "coil") {
      const kind = (el.getAttribute("storage") ?? "").toLowerCase();
      const negated = el.getAttribute("negated") === "true";
      if (negated) {
        notes.push({
          severity: "manual",
          where,
          message: `A negated coil on ${variable || "an unnamed tag"} has no LADX equivalent and was read as a plain coil. The output is inverted from the original.`,
        });
      }
      return {
        id: nid("el"),
        type: kind === "set" ? "OTL" : kind === "reset" ? "OTU" : "OTE",
        tag: variable,
      };
    }
    if (el.localName === "block") {
      const type = (el.getAttribute("typeName") ?? "").toUpperCase();
      if (type === "TON" || type === "TOF" || type === "CTU" || type === "CTD") {
        return {
          id: nid("el"),
          type,
          tag: el.getAttribute("instanceName") ?? type,
        };
      }
      notes.push({
        severity: "manual",
        where,
        message: `The function block ${el.getAttribute("typeName") ?? "?"} has no LADX equivalent and was left out.`,
      });
      return null;
    }
    return null;
  };

  /** Walk back from a node, collecting the series chain that feeds it. */
  const chainInto = (
    startIds: string[],
    seen: Set<string>,
  ): { series: Element[]; parallel: Element[][] } => {
    const series: Element[] = [];
    let parallel: Element[][] = [];
    let ids = startIds;

    while (ids.length === 1) {
      const only = ids[0];
      if (!only || seen.has(only)) break;
      seen.add(only);
      const node = nodes.get(only);
      if (!node || node.localName === "leftPowerRail") break;
      const el = asElement(node);
      if (el) series.unshift(el);
      ids = feeders(node);
    }

    if (ids.length > 1) {
      // A parallel group. Each leg is walked on its own.
      parallel = ids
        .map((legId) => {
          const legSeen = new Set(seen);
          const leg = chainInto([legId], legSeen);
          if (leg.parallel.length) {
            notes.push({
              severity: "manual",
              where,
              message:
                "A branch inside a branch was read as flat parallel legs, which is not the same logic. This rung needs checking.",
            });
          }
          return leg.series;
        })
        .filter((l) => l.length > 0);
    }

    return { series, parallel };
  };

  const rungs: Rung[] = [];
  for (const coil of all(body, "coil")) {
    const out = asElement(coil);
    if (!out) continue;
    const { series, parallel } = chainInto(feeders(coil), new Set());
    const branches = parallel.length ? parallel.map((leg) => [...leg, ...series]) : [series];
    rungs.push({ id: nid("r"), branches, outputs: [out] });
  }

  return rungs;
}

/* ────────────────────────────── the file ────────────────────────────── */

export function parsePlcopenXml(xml: string): ImportedProgram | { error: string } {
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
    return { error: "That file is not valid XML. Export it again from your engineering tool." };
  }
  if (doc.documentElement.localName !== "project" || !all(doc, "pou").length) {
    return {
      error:
        "That is not a PLCopen XML file. In CODESYS, TwinCAT or Automation Studio, export the POU as PLCopen XML.",
    };
  }

  resetImportIds();
  seq = 0;
  const notes: ImportNote[] = [];

  const header = all(doc, "fileHeader")[0];
  const wrote = header?.getAttribute("productName");
  const content = all(doc, "contentHeader")[0];
  const name = content?.getAttribute("name") ?? "Imported program";

  notes.push({
    severity: "info",
    where: name,
    message: `Read from PLCopen TC6 XML${wrote ? `, written by ${wrote}` : ""}. Declared variables and ladder bodies came across; hardware mapping, task configuration and anything vendor specific did not, because they are not part of the interchange.`,
  });

  if (all(doc, "addData").length) {
    notes.push({
      severity: "warning",
      where: name,
      message:
        "This file carries vendor specific addData blocks. They are not read here, and they are what made the file work in the tool that wrote it, so treat this as a starting point rather than a copy.",
    });
  }

  const tags: Tag[] = [];
  const seenTags = new Set<string>();
  const rungs: Rung[] = [];
  let stBodies = 0;
  let otherBodies = 0;

  for (const pou of all(doc, "pou")) {
    const pouName = pou.getAttribute("name") ?? "POU";

    for (const variable of all(pou, "variable")) {
      const vName = variable.getAttribute("name");
      if (!vName || seenTags.has(vName)) continue;
      const raw = typeNameOf(variable);
      const type = iecType(raw);
      if (!type) {
        notes.push({
          severity: "warning",
          where: pouName,
          message: `${vName} is a ${raw || "type"} that LADX does not have, and was left out rather than converted to something close.`,
        });
        continue;
      }
      seenTags.add(vName);
      const tag: Tag = { name: vName, type, value: 0 };
      const doc0 = child(variable, "documentation")?.textContent?.trim();
      if (doc0) tag.comment = doc0;
      tags.push(tag);
    }

    const body = all(pou, "body")[0];
    if (!body) continue;
    const ld = child(body, "LD");
    if (ld) {
      const got = readLdBody(ld, pouName, notes);
      for (const r of got) rungs.push({ ...r, comment: pouName });
      continue;
    }
    if (child(body, "ST")) {
      stBodies++;
      continue;
    }
    if (child(body, "FBD") || child(body, "IL") || child(body, "SFC")) otherBodies++;
  }

  if (stBodies) {
    notes.push({
      severity: "manual",
      where: name,
      message: `${stBodies} Structured Text ${stBodies === 1 ? "body was" : "bodies were"} found and not converted to ladder. Turning arbitrary ST back into rungs is a decompiler rather than an importer, and one that got it subtly wrong would be worse than not having it. The variables came across; the logic has to be brought over by hand.`,
    });
  }
  if (otherBodies) {
    notes.push({
      severity: "manual",
      where: name,
      message: `${otherBodies} ${otherBodies === 1 ? "body is" : "bodies are"} in FBD, IL or SFC, which LADX does not read. The variables came across.`,
    });
  }

  /*
   * An empty result is not a failure, as long as it is explained.
   *
   * A file whose variables are all types LADX does not have, or whose only body
   * is Structured Text, produces nothing to import and a list of notes saying
   * exactly why. Turning that into an error would throw away the one useful
   * thing in it and tell somebody their file was unreadable when it was read
   * perfectly well. The error is reserved for a file that did not parse.
   */
  if (rungs.length === 0 && tags.length === 0) {
    notes.push({
      severity: "manual",
      where: name,
      message:
        "Nothing in this file could be brought across. The reasons are above; the file itself was read without trouble.",
    });
  }

  const declared = new Set(tags.map((t) => t.name));
  const used = new Set<string>();
  for (const r of rungs) {
    for (const b of r.branches) for (const e of b) if (e.tag) used.add(e.tag);
    for (const e of r.outputs) if (e.tag) used.add(e.tag);
  }
  const missing = [...used].filter((n) => n && !declared.has(n));
  if (missing.length) {
    for (const n of missing) tags.push({ name: n, type: "BOOL", value: 0 });
    notes.push({
      severity: "warning",
      where: "Variables",
      message: `${missing.length} name${missing.length === 1 ? " was" : "s were"} used by the ladder but not declared, so ${missing.length === 1 ? "it was" : "they were"} created as BOOL: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}.`,
    });
  }

  const program: LadxProgram = { name, rungs, tags, scanMs: 100 };
  return { program, notes };
}
