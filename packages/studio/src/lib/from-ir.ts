/**
 * A LADX IR project, in the shape the ladder editor can open.
 *
 * The editor works on `LadxProgram` and the importers now produce `IrProject`,
 * so something has to sit between them until the editor itself is moved over.
 * This is that thing, and it is meant to be temporary: it exists so the Rust
 * importer can be used and looked at before the much larger job of porting the
 * editor, not as a permanent second model.
 *
 * It is lossy in one direction and that is the interesting part. The IR models
 * instructions the editor has no way to draw, so a conversion has to say what
 * it could not bring across rather than quietly dropping it. Every caller gets
 * a list of what was left behind.
 *
 * That asymmetry is also the argument for the direction of travel: the IR is
 * the superset, so the editor moving onto it loses nothing, while the reverse
 * would lose exactly the instructions listed below.
 */

import type {
  Instruction as IrInstruction,
  IrProject,
  Rung as IrRung,
  Logic,
  OpCode,
  Operand,
} from "@ladx/types";
import type { LadderNode, SeriesNode } from "./tree";
import type { Element, ElementType, LadxProgram, Routine, Tag, TagType } from "./types";

/** What could not be brought across, and where it was. */
export interface DroppedInstruction {
  /** Routine and rung, so somebody can go and look at it. */
  where: string;
  /** The IR opcode, or the vendor mnemonic when LADX never understood it. */
  what: string;
  why: string;
}

export interface FromIrResult {
  program: LadxProgram;
  dropped: DroppedInstruction[];
}

/**
 * The editor's instruction set, which is smaller than the IR's.
 *
 * Absent on purpose, each for its own reason:
 *
 *   coilNegated, timerRetentive, fallingEdge   the editor cannot draw them
 *   jump, label, return                        it has no notion of flow control
 *   unsupported                                LADX never understood it either
 */
const OPCODE_TO_ELEMENT: Partial<Record<OpCode, ElementType>> = {
  contact: "XIC",
  contactNegated: "XIO",
  risingEdge: "ONS",
  coil: "OTE",
  setCoil: "OTL",
  resetCoil: "OTU",
  timerOn: "TON",
  timerOff: "TOF",
  countUp: "CTU",
  countDown: "CTD",
  reset: "RES",
  equal: "EQU",
  notEqual: "NEQ",
  greater: "GRT",
  less: "LES",
  greaterOrEqual: "GEQ",
  lessOrEqual: "LEQ",
  move: "MOV",
  add: "ADD",
  subtract: "SUB",
  multiply: "MUL",
  divide: "DIV",
  call: "JSR",
};

/** Instructions that take a numeric preset in their second position. */
const TAKES_PRESET = new Set<ElementType>(["TON", "TOF", "CTU", "CTD"]);
/** Instructions whose last operand is where the answer goes. */
const TAKES_DEST = new Set<ElementType>(["MOV", "ADD", "SUB", "MUL", "DIV"]);

function operandText(o: Operand | undefined): string {
  if (!o) return "";
  if (o.kind === "tag") return o.name;
  if (o.kind === "text") return o.value;
  return String(o.value);
}

function operandNumber(o: Operand | undefined): number | undefined {
  if (o?.kind === "number") return o.value;
  const n = Number(operandText(o));
  return Number.isFinite(n) ? n : undefined;
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}

/**
 * One IR instruction as an editor element, or null when the editor has no way
 * to show it.
 */
function toElement(i: IrInstruction): Element | null {
  const type = OPCODE_TO_ELEMENT[i.op];
  if (!type) return null;

  const el: Element = {
    id: i.id || nextId("e"),
    type,
    tag: operandText(i.operands[0]),
  };

  if (TAKES_PRESET.has(type)) {
    const preset = operandNumber(i.operands[1]);
    if (preset !== undefined) el.preset = preset;
  } else if (TAKES_DEST.has(type)) {
    if (type === "MOV") {
      // MOV(source, destination): the editor reads the source as its tag.
      el.dest = operandText(i.operands[1]);
    } else {
      // ADD(a, b, destination) and friends.
      el.operand = operandText(i.operands[1]);
      el.dest = operandText(i.operands[2]);
    }
  } else if (i.operands.length > 1) {
    // Comparisons, which take two values and drive nothing.
    el.operand = operandText(i.operands[1]);
  }

  return el;
}

function describe(i: IrInstruction): string {
  if (i.op === "unsupported") {
    return i.vendor?.original_mnemonic ?? "an unrecognised instruction";
  }
  return i.op;
}

function whyDropped(i: IrInstruction): string {
  if (i.op === "unsupported") {
    return "LADX did not recognise this instruction, so the editor has nothing to draw for it. It is still in the project file.";
  }
  return "The ladder editor has no element for this instruction yet.";
}

function toNode(logic: Logic, where: string, dropped: DroppedInstruction[]): LadderNode | null {
  if (logic.kind === "element") {
    const el = toElement(logic.instruction);
    if (!el) {
      dropped.push({
        where,
        what: describe(logic.instruction),
        why: whyDropped(logic.instruction),
      });
      return null;
    }
    return {
      kind: "el",
      id: el.id,
      type: el.type,
      tag: el.tag,
      preset: el.preset,
      operand: el.operand,
      dest: el.dest,
    };
  }

  const children = logic.children
    .map((c) => toNode(c, where, dropped))
    .filter((c): c is LadderNode => c !== null);

  return { kind: logic.kind, id: nextId("n"), children };
}

function toRung(rung: IrRung, where: string, dropped: DroppedInstruction[]) {
  const node = toNode(rung.logic, where, dropped);
  // The editor's root is always a series, whatever the IR had at the top.
  const logic: SeriesNode =
    node && node.kind === "series"
      ? node
      : { kind: "series", id: nextId("n"), children: node ? [node] : [] };

  const outputs: Element[] = [];
  for (const o of rung.outputs) {
    const el = toElement(o);
    if (el) outputs.push(el);
    else dropped.push({ where, what: describe(o), why: whyDropped(o) });
  }

  return {
    id: rung.id || nextId("r"),
    logic,
    // Kept empty: the tree is the real model and `branches` exists only so
    // programs saved before it still open.
    branches: [] as Element[][],
    outputs,
    comment: rung.comment ?? undefined,
  };
}

/**
 * The editor has four types and the IR has more, so some tags arrive as
 * something they are not.
 *
 * `INT` is the least wrong home for a number the editor cannot hold, and it is
 * still wrong: a REAL setpoint of 75.5 becomes 75, and a scaled analogue value
 * becomes nonsense. So the loss is reported rather than performed quietly. The
 * tag is kept rather than dropped because the logic references it, and a rung
 * pointing at a tag that does not exist is a worse thing to hand somebody than
 * a tag with the wrong type and a note saying so.
 */
function tagType(dt: { kind: string }): { type: TagType; lost?: string } {
  switch (dt.kind) {
    case "bool":
      return { type: "BOOL" };
    case "timer":
      return { type: "TIMER" };
    case "counter":
      return { type: "COUNTER" };
    case "int":
    case "dint":
      return { type: "INT" };
    case "real":
      return {
        type: "INT",
        lost: "This is a REAL. The ladder editor has no floating point type, so it is shown as an INT and anything after the decimal point will be lost here. The project file still has it as a REAL.",
      };
    case "string":
      return {
        type: "INT",
        lost: "This is a STRING. The ladder editor cannot show text, so it appears as an INT.",
      };
    default:
      return {
        type: "INT",
        lost: `This is a ${dt.kind}. The ladder editor has no type for it, so it appears as an INT.`,
      };
  }
}

/**
 * Open an IR project in the editor's model.
 *
 * Ladder POUs only. Structured text, FBD and SFC are carried in the IR but the
 * ladder editor cannot show them, so they are reported rather than silently
 * missing from the routine list.
 */
export function ladxProgramFromIr(project: IrProject): FromIrResult {
  const dropped: DroppedInstruction[] = [];
  const routines: Routine[] = [];

  for (const pou of project.pous) {
    if (pou.body.language !== "ladder") {
      dropped.push({
        where: pou.name,
        what: `a ${pou.body.language} routine`,
        why: "The ladder editor only shows ladder. It is still in the project.",
      });
      continue;
    }
    routines.push({
      id: nextId("rt"),
      name: pou.name,
      rungs: pou.body.rungs.map((r) => toRung(r, `${pou.name} rung ${r.id}`, dropped)),
    });
  }

  const tags: Tag[] = project.tags.map((t) => {
    const { type, lost } = tagType(t.data_type);
    if (lost) dropped.push({ where: `Tag ${t.name}`, what: t.data_type.kind, why: lost });
    return {
      name: t.name,
      type,
      value: 0,
      address: t.address ?? undefined,
      comment: t.comment ?? undefined,
      isInput: t.field?.direction === "input" || undefined,
      isOutput: t.field?.direction === "output" || undefined,
    };
  });

  // The entry point goes first, because routines[0] is the one the editor
  // treats as Main and a project that opens on a subroutine reads as broken.
  if (project.entry_point) {
    const i = routines.findIndex((r) => r.name === project.entry_point);
    if (i > 0) {
      const [main] = routines.splice(i, 1);
      if (main) routines.unshift(main);
    }
  }

  return {
    program: {
      name: project.name,
      routines,
      rungs: routines[0]?.rungs ?? [],
      tags,
      scanMs: project.scan_ms ?? 100,
    },
    dropped,
  };
}
