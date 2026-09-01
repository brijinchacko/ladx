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
import { ProviderError } from "@/lib/providers";
import {
  LadderReplyError,
  buildGeneratedLadder,
  ladderContext,
  ladderSystemPrompt,
} from "@ladx/studio";
import type { LadxProgram } from "@ladx/studio";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

const request = z.object({
  prompt: z.string().trim().min(3).max(4000),
  // Chosen in the assistant, where the work happens. Optional: absent
  // means the saved default, or whatever the free tier has healthy.
  model: z.string().trim().max(200).nullish(),
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
export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const existing = parsed.data.current as LadxProgram | undefined;
  // The prompt goes in too, so the tag list is the ones this request is about
  // rather than the first sixty in the table.
  const context = ladderContext(existing, parsed.data.mode, parsed.data.prompt);

  const system = ladderSystemPrompt();

  try {
    let raw: unknown = null;
    let text = "";
    let model = "";
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      try {
        const result = await complete({
          userId: auth.user.id,
          model: parsed.data.model,
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

    let built: ReturnType<typeof buildGeneratedLadder>;
    try {
      built = buildGeneratedLadder(raw, existing);
    } catch (err) {
      if (!(err instanceof LadderReplyError)) throw err;
      return NextResponse.json(
        {
          error: err.message,
          // Development only: seeing which field a free model got wrong is the
          // difference between a five minute fix and an afternoon of guessing.
          ...(process.env.NODE_ENV !== "production"
            ? { debugIssues: err.issues, debugRaw: JSON.stringify(raw).slice(0, 900) }
            : {}),
        },
        { status: 502 },
      );
    }
    const { program, problems, notes } = built;

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
      notes,
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
