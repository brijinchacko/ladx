/**
 * Turning a description of a machine into a ladder program.
 *
 * Everything here except reaching the model itself: the prompt, the shape the
 * reply must arrive in, and the assembly and checking of what comes back.
 *
 * It lived inside the web app's API route, which was fine while the web was the
 * only place a model could be reached. It is not: the desktop talks to a local
 * Ollama and had no ladder assistant at all, because bringing one over would
 * have meant a second hand written copy of the prompt below.
 *
 * That prompt is not boilerplate. It carries the rules that make ladder
 * correct, including two where getting it wrong is a safety defect rather than
 * a style choice: a stop button is normally closed and examined with XIC, and a
 * seal-in leg has to repeat the stop conditions. A second copy of those rules
 * is a second copy that drifts, and the surface that drifts is the one running
 * on a laptop in a switchroom with no network.
 */

import { z } from "zod";
import { validate } from "./engine";
import { sealInWarnings } from "./seal-in";
import { INSTRUCTIONS, type LadxProgram } from "./types";

const VALID_TYPES = new Set(INSTRUCTIONS.map((i) => i.type));

/**
 * Tolerant of the numbers a model actually returns.
 *
 * Presets come back as "5000", as 5000, and occasionally as null. Rejecting
 * the string means rejecting an otherwise correct program over a quote mark.
 */
const loose = (fallback?: number) =>
  z.preprocess(
    (v) => {
      if (v === null || v === undefined || v === "") return fallback;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      }
      return v;
    },
    fallback === undefined ? z.number().optional() : z.number(),
  );

const tagSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["BOOL", "INT", "TIMER", "COUNTER"]),
  value: loose(0),
  address: z.string().optional(),
  isInput: z.boolean().optional(),
  isOutput: z.boolean().optional(),
  device: z.string().optional(),
  preset: loose(),
  comment: z.string().optional(),
});

const elementSchema = z.object({
  type: z.string(),
  tag: z.string(),
  preset: loose(),
  /*
   * A tag name or a literal number, and always stored as a string.
   *
   * Models return both `"5"` and `5` for the same comparison. The element type
   * is a string either way, so the number is coerced here rather than being
   * quietly assigned into a field that says string and holds a number.
   */
  operand: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (typeof v === "number" ? String(v) : v)),
  dest: z.string().optional(),
});

const rungSchema = z.object({
  comment: z.string().optional(),
  branches: z.array(z.array(elementSchema)),
  outputs: z.array(elementSchema),
});

export const generatedReply = z.object({
  name: z.string().optional(),
  tags: z.array(tagSchema),
  rungs: z.array(rungSchema),
  notes: z.string().optional(),
});

/**
 * What the model is told, once, for every surface.
 *
 * Built rather than a constant because the instruction list is derived from
 * the engine's own table: an instruction added to the editor and not to this
 * list is one the model will never use.
 */
export function ladderSystemPrompt(): string {
  return [
    "You write IEC 61131-3 ladder logic for industrial control.",
    "",
    "Reply with one JSON object and nothing else:",
    '{ "name": "", "tags": [...], "rungs": [...], "notes": "what you assumed" }',
    "",
    "A tag: {name, type: BOOL|INT|TIMER|COUNTER, value, address?, isInput?, isOutput?,",
    "        device?, preset?, comment?}",
    "  device is one of PUSHBUTTON_NO, PUSHBUTTON_NC, SELECTOR, SENSOR, LAMP, MOTOR, VALUE.",
    "  Timer presets are MILLISECONDS. Five seconds is 5000.",
    "",
    "A rung: {comment, branches: [[element,...],...], outputs: [element,...]}",
    "  branches are the parallel legs of the condition side; each leg is a series",
    "  chain read left to right. One leg means no branching.",
    "  outputs are the coils and instructions the rung drives.",
    "An element: {type, tag, preset?, operand?, dest?}",
    "",
    `Instructions available: ${[...VALID_TYPES].join(", ")}.`,
    "",
    "The things that make ladder correct, and that get written wrong:",
    "",
    "- A STOP button and an E-STOP are wired NORMALLY CLOSED. The tag is true when",
    "  healthy. On the rung they are examined with XIC, not XIO. A broken wire then",
    "  stops the machine instead of disabling the stop button. Getting this backwards",
    "  is a safety defect, not a style choice.",
    "- A start button is momentary. Latching a motor needs a seal-in: a second",
    "  parallel leg examining the motor's own coil. But a leg runs from the left",
    "  rail to the output, so the stop conditions must be REPEATED in it. This:",
    "    branches: [[XIC(Start), XIC(Stop), XIC(EStop)], [XIC(Motor), XIC(Stop), XIC(EStop)]]",
    "  A seal-in leg of just [XIC(Motor)] latches the motor on and the stop button",
    "  then does nothing at all. That is the single most common way this is written",
    "  wrong, and it is a defect, not a simplification.",
    "- A timer's done bit is a MEMBER of the tag, not the tag. A contact that waits",
    "  for a five second timer examines T1.DN, never T1. Examining the timer itself",
    "  reads a value that is always zero, so the rung never turns on. Use .DN for",
    "  the done bit, .ACC for the elapsed value and .PRE for the preset.",
    "- Rungs execute top to bottom against one set of values. A coil reaches the",
    "  rungs below it in the same scan and the rungs above it only on the next.",
    "- One coil per tag. Two OTEs on the same tag means the lower one always wins.",
    "- Every tag an element names must be in the tags list.",
    "",
    "Do not claim a safety rating. Ladder logic alone does not provide one: a",
    "category 3 stop needs a safety relay and dual channels in hardware. If asked",
    "for one, write the logic and say so in notes.",
  ].join("\n");
}

/** What already exists, so the model extends it rather than duplicating it. */
export function ladderContext(
  existing: LadxProgram | null | undefined,
  mode: "extend" | "replace",
): string {
  if (mode !== "extend" || !existing?.rungs?.length) {
    return "The program is empty. Return the whole thing.";
  }
  return [
    "The program already contains these tags:",
    (existing.tags ?? []).map((t) => `  ${t.name} (${t.type})`).join("\n"),
    "",
    `And ${existing.rungs.length} rungs. Reuse the existing tag names rather than`,
    "inventing parallel ones, and return only the NEW rungs to add.",
  ].join("\n");
}

export interface GeneratedLadder {
  program: LadxProgram;
  /** What the validator and the seal-in check objected to. Never hidden. */
  problems: string[];
  notes: string;
}

/** A reply that arrived in a shape the editor cannot load. */
export class LadderReplyError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      "That came back in a shape the editor could not load. Try describing it differently, or pick a stronger model.",
    );
    this.name = "LadderReplyError";
    this.issues = issues;
  }
}

/**
 * The model's JSON, turned into a program the editor can load.
 *
 * Ids are minted here rather than trusted from the model: a duplicate id makes
 * two instructions share the engine's per-instruction edge memory, so one
 * one-shot fires for both.
 *
 * The validator runs before this goes anywhere near a canvas and the findings
 * come back rather than being hidden. An unknown tag or a doubled coil is
 * exactly what a model gets wrong.
 */
export function buildGeneratedLadder(raw: unknown, existing?: LadxProgram | null): GeneratedLadder {
  const out = generatedReply.safeParse(raw);
  if (!out.success) {
    throw new LadderReplyError(
      out.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }

  let seq = 0;
  const stamp = Date.now().toString(36);
  const nextId = (p: string) => `${p}${stamp}${seq++}`;

  const rungs = out.data.rungs.map((r) => ({
    id: nextId("r"),
    ...(r.comment ? { comment: r.comment } : {}),
    branches: r.branches.map((leg) =>
      leg
        .filter((el) => VALID_TYPES.has(el.type as never))
        .map((el) => ({ id: nextId("e"), ...el, type: el.type as never })),
    ),
    outputs: r.outputs
      .filter((el) => VALID_TYPES.has(el.type as never))
      .map((el) => ({ id: nextId("o"), ...el, type: el.type as never })),
  }));

  const program: LadxProgram = {
    name: out.data.name || existing?.name || "Generated",
    scanMs: existing?.scanMs ?? 100,
    tags: out.data.tags as LadxProgram["tags"],
    rungs,
  };

  return {
    program,
    problems: [...validate(program), ...sealInWarnings(program)],
    notes: out.data.notes ?? "",
  };
}
