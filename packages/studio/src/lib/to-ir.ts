/**
 * An editor program as a LADX IR project.
 *
 * The counterpart to `from-ir.ts`, and the reason it exists is that everything
 * built on the IR, the dependency graph first, is useless if it can only be
 * pointed at projects that arrived through an importer. The programs somebody
 * actually has are the ones in the ladder editor.
 *
 * This direction loses nothing, which is the whole argument for the IR being
 * the model everything converges on: every instruction the editor can draw has
 * a place in the IR, so the conversion has no notes to report and no decisions
 * to make. The other direction has both.
 */

// `IrDataType`, because @ladx/studio has a `DataType` of its own and the
// types barrel aliases the IR one rather than letting a wrong import pass.
import type { Instruction, IrDataType, IrProject, Logic, Operand, Pou, Rung } from "@ladx/types";
import type { LadderNode } from "./tree";
import { rungLogic } from "./tree";
import type { Element, ElementType, LadxProgram, Tag, TagType } from "./types";
import { programRoutines } from "./types";

const ELEMENT_TO_OPCODE: Record<ElementType, string> = {
  XIC: "contact",
  XIO: "contactNegated",
  ONS: "risingEdge",
  OTE: "coil",
  OTL: "setCoil",
  OTU: "resetCoil",
  TON: "timerOn",
  TOF: "timerOff",
  CTU: "countUp",
  CTD: "countDown",
  RES: "reset",
  EQU: "equal",
  NEQ: "notEqual",
  GRT: "greater",
  LES: "less",
  GEQ: "greaterOrEqual",
  LEQ: "lessOrEqual",
  MOV: "move",
  ADD: "add",
  SUB: "subtract",
  MUL: "multiply",
  DIV: "divide",
  JSR: "call",
};

const TAKES_PRESET = new Set<ElementType>(["TON", "TOF", "CTU", "CTD"]);
const THREE_OPERAND = new Set<ElementType>(["ADD", "SUB", "MUL", "DIV"]);

/**
 * A written operand as a tag or a number.
 *
 * The editor stores both in the same string field, so a value that parses as a
 * number is one. Getting this wrong would put a literal into the graph as a tag
 * name, and "what writes 10" is not a question anybody wants answered.
 */
function operand(value: string): Operand {
  const n = Number(value);
  if (value.trim() !== "" && Number.isFinite(n)) return { kind: "number", value: n } as Operand;
  return { kind: "tag", name: value } as Operand;
}

function operandsFor(el: Element): Operand[] {
  const out: Operand[] = [{ kind: "tag", name: el.tag } as Operand];

  if (TAKES_PRESET.has(el.type)) {
    out.push({ kind: "number", value: el.preset ?? 0 } as Operand);
  } else if (el.type === "MOV") {
    out.push(operand(el.dest ?? ""));
  } else if (THREE_OPERAND.has(el.type)) {
    out.push(operand(el.operand ?? ""));
    out.push(operand(el.dest ?? ""));
  } else if (el.operand !== undefined) {
    out.push(operand(el.operand));
  }

  return out;
}

function instruction(el: Element): Instruction {
  return {
    id: el.id,
    op: ELEMENT_TO_OPCODE[el.type],
    operands: operandsFor(el),
    vendor: null,
  } as Instruction;
}

function toLogic(node: LadderNode): Logic {
  if (node.kind === "el") {
    return {
      kind: "element",
      instruction: instruction({
        id: node.id,
        type: node.type,
        tag: node.tag,
        preset: node.preset,
        operand: node.operand,
        dest: node.dest,
      }),
    } as Logic;
  }
  return { kind: node.kind, children: node.children.map(toLogic) } as Logic;
}

function dataType(t: TagType): IrDataType {
  switch (t) {
    case "BOOL":
      return { kind: "bool" } as IrDataType;
    case "TIMER":
      return { kind: "timer" } as IrDataType;
    case "COUNTER":
      return { kind: "counter" } as IrDataType;
    default:
      return { kind: "int" } as IrDataType;
  }
}

function tag(t: Tag) {
  return {
    name: t.name,
    data_type: dataType(t.type),
    address: t.address ?? null,
    initial_value: null,
    comment: t.comment ?? null,
    field:
      t.isInput || t.isOutput ? { direction: t.isInput ? "input" : "output", kind: null } : null,
  };
}

/**
 * The editor's program, as the IR.
 *
 * Live simulator state, a tag's current value, a timer's accumulator, the last
 * rung result, is deliberately left behind. It describes a running program
 * rather than a program, and putting it in the IR would mean a saved project
 * differed depending on when it was saved.
 */
export function ladxProgramToIr(program: LadxProgram): IrProject {
  const routines = programRoutines(program);

  const pous: Pou[] = routines.map((routine) => ({
    name: routine.name,
    kind: "Program",
    body: {
      language: "ladder",
      rungs: routine.rungs.map(
        (r) =>
          ({
            id: r.id,
            comment: r.comment ?? null,
            logic: toLogic(rungLogic(r)),
            outputs: r.outputs.map(instruction),
          }) as Rung,
      ),
    },
    local_tags: [],
    comment: null,
    container: null,
  })) as Pou[];

  return {
    ir_version: 1,
    name: program.name,
    source_vendor: null,
    pous,
    tags: program.tags.map(tag),
    data_types: [],
    // routines[0] is Main by the editor's own convention.
    entry_point: routines[0]?.name ?? null,
    scan_ms: program.scanMs,
  } as IrProject;
}
