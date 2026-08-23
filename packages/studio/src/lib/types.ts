import type { SeriesNode } from "./tree";

/**
 * LADX Mini — the program model.
 *
 * A ladder program is a list of rungs. Each rung has a condition side and an
 * output side, and the condition side is a set of PARALLEL branches, each of
 * which is a SERIES chain of elements. That two-level shape is the smallest
 * model that expresses real ladder: series contacts are a chain, and a seal-in
 * is a second branch in parallel with the first. Anything less cannot express
 * the motor latch, which is the first thing anybody learns.
 *
 * Deliberately vendor-neutral in the data, TIA-Portal-flavoured in the UI.
 * Storing "XIC" rather than a Siemens or Rockwell mnemonic means the same saved
 * project can be rendered in either dialect later without a migration.
 */

export type ElementType =
  // Bit logic
  | "XIC" // examine if closed  — normally open contact
  | "XIO" // examine if open    — normally closed contact
  | "OTE" // output energise    — coil
  | "OTL" // output latch       — set
  | "OTU" // output unlatch     — reset
  | "ONS" // one shot           — rising edge
  // Timers and counters
  | "TON"
  | "TOF"
  | "CTU"
  | "CTD"
  | "RES"
  // Compare and move
  | "EQU"
  | "NEQ"
  | "GRT"
  | "LES"
  | "GEQ"
  | "LEQ"
  | "MOV"
  | "ADD"
  | "SUB"
  | "MUL"
  | "DIV"
  // Program control
  | "JSR"; // jump to subroutine — runs another routine, then returns

export type Element = {
  id: string;
  type: ElementType;
  /** The bit or word this element examines or drives. */
  tag: string;
  /** Timers and counters: preset. Timer presets are milliseconds. */
  preset?: number;
  /** Compare/move/math: the second operand, a tag name or a literal number. */
  operand?: string;
  /** MOV/ADD/SUB destination. */
  dest?: string;
};

export type Rung = {
  id: string;
  /**
   * The condition side as a series/parallel tree. This is the real model —
   * it is the only one that can express a branch which opens and closes
   * between two contacts. See lib/ladx/tree.ts.
   */
  logic?: SeriesNode;
  /**
   * The original flat shape: parallel branches, each a series chain. Kept so
   * that projects and exercise answers saved before the tree still open. Read
   * through rungLogic(), never directly.
   */
  branches: Element[][];
  /** Coils and instructions driven by the rung's power. */
  outputs: Element[];
  comment?: string;
};

export type TagType = "BOOL" | "INT" | "TIMER" | "COUNTER";

/**
 * What the tag is wired to in the real world.
 *
 * A simulator that shows every input as the same toggle teaches the wrong
 * reflex. On a panel a START button is momentary — it springs back the instant
 * you let go, which is the entire reason a seal-in exists — while a selector
 * switch stays where you put it and a sensor follows the process. Making the
 * student choose forces the question "what kind of device is this?", and then
 * the control behaves like that device.
 */
export type DeviceKind =
  | "PUSHBUTTON_NO" // momentary, normally open   — START
  | "PUSHBUTTON_NC" // momentary, normally closed — STOP, E-STOP
  | "SELECTOR" // maintained switch, latches — AUTO/MANUAL
  | "SENSOR" // proximity, photocell, float
  | "LAMP" // indicator output
  | "MOTOR" // contactor / motor output
  | "VALUE"; // analog, driven by a slider

export const DEVICE_LABEL: Record<DeviceKind, string> = {
  PUSHBUTTON_NO: "Pushbutton (NO)",
  PUSHBUTTON_NC: "Pushbutton (NC)",
  SELECTOR: "Selector switch",
  SENSOR: "Sensor",
  LAMP: "Lamp",
  MOTOR: "Motor / contactor",
  VALUE: "Analog value",
};

/** The devices that make sense for an input, in the order a panel is built. */
export const INPUT_DEVICES: DeviceKind[] = [
  "PUSHBUTTON_NO",
  "PUSHBUTTON_NC",
  "SELECTOR",
  "SENSOR",
  "VALUE",
];
export const OUTPUT_DEVICES: DeviceKind[] = ["LAMP", "MOTOR", "VALUE"];

/** A sensible default when a tag has never been told what it is. */
export function defaultDevice(t: {
  type: TagType;
  isInput?: boolean;
  isOutput?: boolean;
}): DeviceKind {
  if (t.type === "INT") return "VALUE";
  if (t.isOutput) return "LAMP";
  return "PUSHBUTTON_NO";
}

export type Tag = {
  name: string;
  type: TagType;
  /** BOOL -> 0/1, INT -> number. Timers and counters use the fields below. */
  value: number;
  /**
   * Where this signal physically is: I0.0, Q0.0, M0.0, IW64, T0, C0.
   *
   * The name says what a signal means; the address says which terminal it is
   * on. A panel does not know your tag is called "Start_PB" — it knows I0.0.
   * See lib/ladx/addressing.ts.
   */
  address?: string;
  /** Shown as a switch on the I/O panel. */
  isInput?: boolean;
  /** What it is wired to, which decides how the simulator control behaves. */
  device?: DeviceKind;
  /** Shown as a lamp on the I/O panel. */
  isOutput?: boolean;
  comment?: string;

  // ── Timer / counter state, live only ────────────────────────────────
  /** Accumulated: milliseconds for a timer, counts for a counter. */
  acc?: number;
  preset?: number;
  dn?: boolean;
  tt?: boolean;
  en?: boolean;
  /** Internal: last state of the rung driving this, for edge detection. */
  lastRung?: boolean;
};

/**
 * One page of the program.
 *
 * Real controllers organise logic into routines — Studio 5000 calls them
 * routines, TIA calls them blocks, IEC 61131-3 calls them POUs — with one
 * entry point that calls the rest. A single flat list of rungs is fine for a
 * three-rung exercise and unreadable by the twentieth, which is the point at
 * which a student needs to learn to split a program up.
 *
 * routines[0] is Main: the one the controller executes. Everything else runs
 * only when a JSR calls it, exactly as on hardware.
 */
export type Routine = {
  id: string;
  name: string;
  rungs: Rung[];
};

export type LadxProgram = {
  name: string;
  /** Pages of logic. routines[0] is Main. */
  routines?: Routine[];
  /** The original single page. Read through programRoutines(), never directly. */
  rungs: Rung[];
  tags: Tag[];
  /** Milliseconds per scan. Real PLCs are 1–20 ms; slower is easier to watch. */
  scanMs: number;
};

export const EMPTY_PROGRAM: LadxProgram = {
  name: "Untitled",
  rungs: [],
  tags: [],
  scanMs: 100,
};

/** What each instruction is, for the palette and the help text. */
export const INSTRUCTIONS: {
  type: ElementType;
  label: string;
  group: "Bit" | "Timer/Counter" | "Compare" | "Move/Math" | "Program";
  side: "input" | "output";
  help: string;
  needsPreset?: boolean;
  needsOperand?: boolean;
  needsDest?: boolean;
}[] = [
  {
    type: "XIC",
    label: "Examine On",
    group: "Bit",
    side: "input",
    help: "Passes power when the bit is 1. A normally-open contact.",
  },
  {
    type: "XIO",
    label: "Examine Off",
    group: "Bit",
    side: "input",
    help: "Passes power when the bit is 0. A normally-closed contact.",
  },
  {
    type: "ONS",
    label: "One Shot",
    group: "Bit",
    side: "input",
    help: "Passes power for a single scan on the rising edge.",
  },
  {
    type: "OTE",
    label: "Coil",
    group: "Bit",
    side: "output",
    help: "Follows the rung: 1 while powered, 0 when not.",
  },
  {
    type: "OTL",
    label: "Latch",
    group: "Bit",
    side: "output",
    help: "Sets the bit to 1 and leaves it there.",
  },
  { type: "OTU", label: "Unlatch", group: "Bit", side: "output", help: "Resets the bit to 0." },

  {
    type: "TON",
    label: "Timer On",
    group: "Timer/Counter",
    side: "output",
    help: "Times while powered. DN goes true at the preset.",
    needsPreset: true,
  },
  {
    type: "TOF",
    label: "Timer Off",
    group: "Timer/Counter",
    side: "output",
    help: "DN is true while powered, and stays true for the preset after power is lost.",
    needsPreset: true,
  },
  {
    type: "CTU",
    label: "Count Up",
    group: "Timer/Counter",
    side: "output",
    help: "Counts one on each rising edge. DN at the preset.",
    needsPreset: true,
  },
  {
    type: "CTD",
    label: "Count Down",
    group: "Timer/Counter",
    side: "output",
    help: "Counts down one on each rising edge.",
    needsPreset: true,
  },
  {
    type: "RES",
    label: "Reset",
    group: "Timer/Counter",
    side: "output",
    help: "Clears a timer or counter's accumulator.",
  },

  {
    type: "EQU",
    label: "Equal",
    group: "Compare",
    side: "input",
    help: "Passes power when the two values are equal.",
    needsOperand: true,
  },
  {
    type: "NEQ",
    label: "Not Equal",
    group: "Compare",
    side: "input",
    help: "Passes power when the two values differ.",
    needsOperand: true,
  },
  {
    type: "GRT",
    label: "Greater",
    group: "Compare",
    side: "input",
    help: "Passes power when the first value is greater.",
    needsOperand: true,
  },
  {
    type: "LES",
    label: "Less",
    group: "Compare",
    side: "input",
    help: "Passes power when the first value is less.",
    needsOperand: true,
  },
  {
    type: "GEQ",
    label: "Greater or Equal",
    group: "Compare",
    side: "input",
    help: "Passes power when the first is greater or equal.",
    needsOperand: true,
  },
  {
    type: "LEQ",
    label: "Less or Equal",
    group: "Compare",
    side: "input",
    help: "Passes power when the first is less or equal.",
    needsOperand: true,
  },

  {
    type: "JSR",
    label: "Call routine",
    group: "Program",
    side: "output",
    help: "Runs another routine and comes back. The tag is the routine's name.",
  },

  {
    type: "MOV",
    label: "Move",
    group: "Move/Math",
    side: "output",
    help: "Copies a value into another tag.",
    needsDest: true,
  },
  {
    type: "ADD",
    label: "Add",
    group: "Move/Math",
    side: "output",
    help: "Adds two values into a destination.",
    needsOperand: true,
    needsDest: true,
  },
  {
    type: "SUB",
    label: "Subtract",
    group: "Move/Math",
    side: "output",
    help: "Subtracts the second value from the first.",
    needsOperand: true,
    needsDest: true,
  },
  {
    type: "MUL",
    label: "Multiply",
    group: "Move/Math",
    side: "output",
    help: "Multiplies the two values into a destination.",
    needsOperand: true,
    needsDest: true,
  },
  {
    type: "DIV",
    label: "Divide",
    group: "Move/Math",
    side: "output",
    help: "Divides the first value by the second. Dividing by zero is reported rather than written.",
    needsOperand: true,
    needsDest: true,
  },
];

export const INSTRUCTION_BY_TYPE = new Map(INSTRUCTIONS.map((i) => [i.type, i]));

/**
 * The program's routines, migrating a single-page program on read.
 *
 * Every saved project, starter and exercise answer predates routines and holds
 * a flat `rungs` list. That list IS Main, so the conversion is exact and
 * nothing needs re-authoring.
 */
const flatRungsAsMain = (p: LadxProgram): Routine => ({
  id: "main",
  name: "Main",
  rungs: p.rungs ?? [],
});

export function programRoutines(p: LadxProgram): Routine[] {
  if (p.routines && p.routines.length > 0) return p.routines;
  return [flatRungsAsMain(p)];
}

export function mainRoutine(p: LadxProgram): Routine {
  // Never actually empty — programRoutines falls back to a Main built from the
  // flat rungs — so the fallback here is the same routine, not a second one.
  return programRoutines(p)[0] ?? flatRungsAsMain(p);
}
