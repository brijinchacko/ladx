import type { ElementType } from "./types";

/**
 * How the instruction palette is grouped.
 *
 * Data, not UI, and in its own module so a test can read it without importing
 * a React component, the component imports a CSS module, which Node cannot
 * parse, so the test that guards palette coverage could not load it.
 *
 * Grouped the way PicoSoft groups it, because that is the mental filing
 * cabinet the hardware itself uses and a student who learns it here
 * recognises it on the panel.
 */
export type GroupKey =
  | "Contacts"
  | "Coils"
  | "Timers & counters"
  | "Compare"
  | "Move & maths"
  | "Program";

/**
 * Compare and maths used to share one tab, which made it nine buttons wide and
 * pushed MUL and DIV off the end, they were unreachable from the palette
 * entirely. They are different jobs anyway: one asks a question about a value,
 * the other changes one.
 */
export const GROUPS: { key: GroupKey; types: ElementType[]; hint: string }[] = [
  { key: "Contacts", types: ["XIC", "XIO", "ONS"], hint: "Conditions on the left of the rung" },
  { key: "Coils", types: ["OTE", "OTL", "OTU"], hint: "Outputs on the right of the rung" },
  {
    key: "Timers & counters",
    types: ["TON", "TOF", "CTU", "CTD", "RES"],
    hint: "Delays and counts",
  },
  {
    key: "Compare",
    types: ["EQU", "NEQ", "GRT", "LES", "GEQ", "LEQ"],
    hint: "Ask a question about a value",
  },
  { key: "Move & maths", types: ["MOV", "ADD", "SUB", "MUL", "DIV"], hint: "Change a value" },
  { key: "Program", types: ["JSR"], hint: "Call another routine" },
];

/** The keyboard shortcut that places an instruction, where it has one. */
export const PALETTE_KEYS: Partial<Record<ElementType, string>> = {
  XIC: "A",
  XIO: "S",
  OTE: "D",
};
