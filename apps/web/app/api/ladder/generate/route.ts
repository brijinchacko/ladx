// POST /api/ladder/generate
//
// A description of what a machine should do, in, a ladder program out.
//
// Nothing is saved. The program comes back to the editor, which loads it as an
// ordinary edit that History undoes. A model writing straight into a program
// that is about to be downloaded to a controller, with no step in between, is
// not something this will do.

import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { complete, firstJsonObject } from "@/lib/inference/complete";
import { sealInWarnings } from "@/lib/ladder/seal-in";
import { ProviderError } from "@/lib/providers";
import { INSTRUCTIONS, validate } from "@ladx/studio";
import type { LadxProgram } from "@ladx/studio";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

const request = z.object({
  prompt: z.string().trim().min(3).max(4000),
  /** The program as it stands, so "add an interlock to that" means something. */
  current: z.unknown().optional(),
  /** Replace the program, or add rungs to it. */
  mode: z.enum(["replace", "extend"]).default("extend"),
});

/**
 * A number, however the model chose to write it.
 *
 * A BOOL tag's value is naturally `false` to anything writing JSON, and it
 * arrives as a string often enough too. The engine wants a number, and
 * rejecting an otherwise correct program over the representation of a single
 * field is the kind of brittleness that makes a feature feel broken when it is
 * working. Coerced here, once.
 */
const loose = (fallback?: number) =>
  z.preprocess(
    (v) => {
      if (typeof v === "boolean") return v ? 1 : 0;
      if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
      if (v === null || v === undefined) return fallback;
      return v;
    },
    fallback === undefined ? z.number() : z.number().default(fallback),
  );

const tagSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(["BOOL", "INT", "TIMER", "COUNTER"]),
  value: loose(0),
  address: z.string().max(24).optional(),
  isInput: z.boolean().optional(),
  isOutput: z.boolean().optional(),
  device: z
    .enum(["PUSHBUTTON_NO", "PUSHBUTTON_NC", "SELECTOR", "SENSOR", "LAMP", "MOTOR", "VALUE"])
    .optional(),
  preset: loose().optional(),
  acc: loose().optional(),
  comment: z.string().max(200).optional(),
});

const elementSchema = z.object({
  // Instruction names arrive in whatever case the model felt like.
  type: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().min(2).max(8),
  ),
  tag: z.string().max(64).default(""),
  preset: loose().optional(),
  operand: z.string().max(64).optional(),
  dest: z.string().max(64).optional(),
});

const rungSchema = z.object({
  comment: z.string().max(300).optional(),
  /** Parallel branches, each a series chain. The flat shape the engine reads. */
  branches: z.array(z.array(elementSchema).max(20)).max(8),
  outputs: z.array(elementSchema).max(8),
});

const reply = z.object({
  name: z.string().max(120).optional(),
  tags: z.array(tagSchema).max(120),
  rungs: z.array(rungSchema).max(60),
  notes: z.string().max(800).optional(),
});

const VALID_TYPES = new Set(INSTRUCTIONS.map((i) => i.type));

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const existing = parsed.data.current as LadxProgram | undefined;
  const context =
    parsed.data.mode === "extend" && existing?.rungs?.length
      ? [
          "The program already contains these tags:",
          (existing.tags ?? []).map((t) => `  ${t.name} (${t.type})`).join("\n"),
          "",
          `And ${existing.rungs.length} rungs. Reuse the existing tag names rather than`,
          "inventing parallel ones, and return only the NEW rungs to add.",
        ].join("\n")
      : "The program is empty. Return the whole thing.";

  const system = [
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

  try {
    let raw: unknown = null;
    let text = "";
    let model = "";
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      try {
        const result = await complete({
          userId: auth.user.id,
          messages: [
            { role: "system", content: system },
            { role: "user", content: `${context}\n\n${parsed.data.prompt}` },
            ...(attempt === 0
              ? []
              : [
                  { role: "assistant" as const, content: text.slice(0, 1500) },
                  {
                    role: "user" as const,
                    content:
                      "That was not usable JSON. Reply with the object only, starting { and ending }.",
                  },
                ]),
          ],
          maxTokens: 4000,
          temperature: 0.1,
        });
        text = result.text;
        model = result.model;
        raw = firstJsonObject(text);
      } catch (err) {
        lastError = err;
      }
    }
    if (!raw && lastError) throw lastError;

    const out = reply.safeParse(raw);
    if (!out.success) {
      return NextResponse.json(
        {
          error:
            "That came back in a shape the editor could not load. Try describing it differently, or pick a stronger model.",
          // Development only: seeing which field a free model got wrong is the
          // difference between a five minute fix and an afternoon of guessing.
          ...(process.env.NODE_ENV !== "production"
            ? {
                debugIssues: out.error.issues
                  .slice(0, 8)
                  .map((i) => `${i.path.join(".")}: ${i.message}`),
                debugRaw: JSON.stringify(raw).slice(0, 900),
              }
            : {}),
        },
        { status: 502 },
      );
    }

    // Ids are minted here rather than trusted from the model: a duplicate id
    // makes two instructions share the engine's per-instruction edge memory,
    // so one one-shot fires for both.
    let seq = 0;
    const nextId = (p: string) => `${p}${Date.now().toString(36)}${seq++}`;

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

    // Run the editor's own validator over it before it goes anywhere near the
    // canvas, and hand the findings back rather than hiding them. An unknown
    // tag or a doubled coil is exactly what a model gets wrong.
    const problems = [...validate(program), ...sealInWarnings(program)];

    // The facts, not the program. Which model, how much it wrote and whether
    // the validator objected is what an auditor needs to reconstruct what
    // happened; the rungs themselves are the user's and stay theirs.
    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "ladder_generated",
      payload: {
        model,
        mode: parsed.data.mode,
        rungs: program.rungs.length,
        tags: program.tags.length,
        problems: problems.length,
      },
    });

    return NextResponse.json({
      program,
      problems,
      notes: out.data.notes ?? "",
      model,
    });
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.userMessage
        : "Could not write that. Try again, or write it by hand.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
