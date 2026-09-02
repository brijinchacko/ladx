import { type LadxProgram, programRoutines } from "@ladx/studio";

/**
 * Every place a tag is used, across every tool.
 *
 * The question an engineer asks fifty times a day is "where else is this
 * used", and until now the answer was in five tools: the rungs in Ladder, the
 * bindings in HMI, the labels on a drawing, the alarm list. This walks all of
 * them once and answers per tag.
 *
 * The walk is structural rather than typed. The HMI document has a dozen
 * widget kinds and three places a binding can sit, the drawing has text in
 * entities and dimensions, and each of those shapes will grow. Looking for the
 * few shapes that mean "this names a tag" wherever they occur is what keeps
 * this true as the tools change, and it is why a new widget cannot silently
 * hide a use.
 */

export interface ProgramUse {
  routine: string;
  /** One based, the way the editor numbers them. */
  rung: number;
  /** The instruction, XIC, OTE, TON and so on. */
  instruction: string;
  /** Whether the instruction reads the tag or writes it. */
  role: "reads" | "writes";
  comment?: string;
}

export interface HmiUse {
  applicationId: string;
  application: string;
  /** The screen the widget sits on, when it does. Alarms have none. */
  screen?: string;
  /** What the binding is for: a widget's value, an animation, an action, an alarm. */
  use: string;
}

export interface CadUse {
  drawingId: string;
  drawing: string;
  /** The text the tag appears in, so a label like "M1 Start_PB" is recognisable. */
  text: string;
}

export interface XrefEntry {
  tag: string;
  /** Whether the program declares it. A tag used but never declared is a finding. */
  declared: boolean;
  type?: string;
  address?: string;
  comment?: string;
  program: ProgramUse[];
  hmi: HmiUse[];
  cad: CadUse[];
  total: number;
}

const WRITES = new Set([
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
]);
const INSTRUCTIONS = new Set([
  ...WRITES,
  "XIC",
  "XIO",
  "ONS",
  "EQU",
  "NEQ",
  "GRT",
  "LES",
  "GEQ",
  "LEQ",
  "JSR",
]);

/** A tag name, as opposed to a literal number or an empty operand. */
function isTagName(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && Number.isNaN(Number(v));
}

/** Every object reachable from a value, depth first. */
function* objects(value: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 40 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) yield* objects(v, depth + 1);
    return;
  }
  yield value as Record<string, unknown>;
  for (const v of Object.values(value as Record<string, unknown>)) yield* objects(v, depth + 1);
}

class Index {
  entries = new Map<string, XrefEntry>();

  entry(tag: string): XrefEntry {
    let e = this.entries.get(tag);
    if (!e) {
      e = { tag, declared: false, program: [], hmi: [], cad: [], total: 0 };
      this.entries.set(tag, e);
    }
    return e;
  }
}

function walkProgram(program: LadxProgram, index: Index) {
  for (const tag of program.tags ?? []) {
    const e = index.entry(tag.name);
    e.declared = true;
    e.type = tag.type;
    e.address = tag.address;
    e.comment = tag.comment;
  }

  let routines: ReturnType<typeof programRoutines> = [];
  try {
    routines = programRoutines(program);
  } catch {
    return;
  }

  for (const routine of routines) {
    (routine.rungs ?? []).forEach((rung, i) => {
      // The tree and the flat branches can both hold the same elements on a
      // program saved by an editor that writes both. One use per element.
      const seen = new Set<string>();
      for (const o of objects(rung)) {
        const type = o.type;
        if (typeof type !== "string" || !INSTRUCTIONS.has(type)) continue;
        const id = typeof o.id === "string" ? o.id : JSON.stringify(o);
        if (seen.has(id)) continue;
        seen.add(id);

        const role: ProgramUse["role"] = WRITES.has(type) ? "writes" : "reads";
        const comment = typeof rung.comment === "string" ? rung.comment : undefined;
        const add = (tag: unknown, r: ProgramUse["role"]) => {
          if (!isTagName(tag)) return;
          index.entry(tag).program.push({
            routine: routine.name,
            rung: i + 1,
            instruction: type,
            role: r,
            comment,
          });
        };
        add(o.tag, role);
        // A compare or a move reads its second operand and writes its destination.
        add(o.operand, "reads");
        add(o.dest, "writes");
      }
    });
  }
}

function walkHmi(app: { id: string; name: string; doc: unknown }, index: Index) {
  const doc = app.doc as { screens?: { name?: string; widgets?: unknown[] }[]; alarms?: unknown[] };

  const found = (tag: unknown, screen: string | undefined, use: string) => {
    if (!isTagName(tag)) return;
    index.entry(tag).hmi.push({ applicationId: app.id, application: app.name, screen, use });
  };

  for (const screen of doc.screens ?? []) {
    for (const widget of screen.widgets ?? []) {
      const w = widget as Record<string, unknown>;
      const label =
        typeof w.type === "string" ? w.type : typeof w.kind === "string" ? w.kind : "widget";
      for (const o of objects(widget)) {
        // A binding that names a PLC tag, wherever it sits.
        if (o.kind === "plc" && isTagName(o.tag)) found(o.tag, screen.name, `${label} binding`);
        // An action that writes a PLC tag.
        if (o.kind === "setTag") {
          const target = o.target as { source?: string; tag?: unknown } | undefined;
          if (target?.source === "plc") found(target.tag, screen.name, `${label} writes it`);
        }
      }
    }
  }

  for (const alarm of doc.alarms ?? []) {
    const a = alarm as { target?: { source?: string; tag?: unknown }; condition?: unknown };
    if (a.target?.source === "plc") {
      found(
        a.target.tag,
        undefined,
        `alarm${typeof a.condition === "string" ? ` (${a.condition})` : ""}`,
      );
    }
  }
}

function walkDrawing(
  drawing: { id: string; name: string; data: unknown },
  tags: Iterable<string>,
  index: Index,
) {
  const names = [...tags];
  if (names.length === 0) return;
  // Whole word, so "Motor_Run" is not found inside "Motor_Run_2".
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![A-Za-z0-9_])`,
    "g",
  );

  for (const o of objects(drawing.data)) {
    const text = typeof o.text === "string" ? o.text : typeof o.label === "string" ? o.label : null;
    if (!text) continue;
    for (const m of text.matchAll(pattern)) {
      const tag = m[2];
      if (!tag) continue;
      index.entry(tag).cad.push({ drawingId: drawing.id, drawing: drawing.name, text });
    }
  }
}

export interface XrefInput {
  program: LadxProgram | null;
  hmi: { id: string; name: string; doc: unknown }[];
  drawings: { id: string; name: string; data: unknown }[];
}

/**
 * The cross reference for one project.
 *
 * Drawings are searched for the names the program and the HMI already use,
 * because free text on a drawing has no other way of saying it is a tag. A
 * label that names nothing the program knows is not a use, it is a label.
 */
export function buildXref(input: XrefInput): XrefEntry[] {
  const index = new Index();
  if (input.program) walkProgram(input.program, index);
  for (const app of input.hmi) walkHmi(app, index);
  const known = [...index.entries.keys()];
  for (const d of input.drawings) walkDrawing(d, known, index);

  const out = [...index.entries.values()];
  for (const e of out) e.total = e.program.length + e.hmi.length + e.cad.length;
  // Most used first, then by name, which puts the important tags at the top
  // and the spares at the bottom where they belong.
  out.sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
  return out;
}

/** What the index says is wrong, as findings rather than as a list to read. */
export function xrefFindings(entries: XrefEntry[]): { tag: string; finding: string }[] {
  const findings: { tag: string; finding: string }[] = [];
  for (const e of entries) {
    if (!e.declared && e.program.length > 0) {
      findings.push({ tag: e.tag, finding: "used in the program but never declared" });
    }
    if (!e.declared && e.hmi.length > 0 && e.program.length === 0) {
      findings.push({ tag: e.tag, finding: "the HMI binds to it but the program has no such tag" });
    }
    if (e.declared && e.total === 0) {
      findings.push({ tag: e.tag, finding: "declared but never used" });
    }
    const writes = e.program.filter((p) => p.role === "writes");
    if (
      e.declared &&
      writes.length === 0 &&
      e.program.length > 0 &&
      !e.address &&
      e.hmi.length === 0
    ) {
      findings.push({ tag: e.tag, finding: "read but nothing ever writes it" });
    }
  }
  return findings;
}
