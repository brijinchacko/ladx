// POST /api/hmi/generate
//
// A description of an operator screen in, objects on the glass out.
//
// Nothing is saved. The screen comes back to the editor, which loads it as one
// ordinary edit that Undo takes straight out again, and every widget on it has
// already been checked against the project's real tag table by normaliseScreen.
// The route's job is the talking; the judgement is in @ladx/hmi so the desktop,
// which reaches Ollama over IPC rather than HTTP, applies exactly the same one.

import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { complete } from "@/lib/inference/complete";
import { ProviderError } from "@/lib/providers";
import {
  type GenContext,
  firstJsonObject,
  normaliseScreen,
  screenSystemPrompt,
  screenUserPrompt,
} from "@ladx/hmi";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

/**
 * The context, validated but not trusted for anything but prompting.
 *
 * It describes what the caller has open, and the caller is the browser, so it
 * is prompt material and a spelling checker for bindings. It grants no access:
 * a tag list is not a permission, and nothing here reads the database.
 */
const tag = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(["BOOL", "INT", "TIMER", "COUNTER"]),
  value: z.number().default(0),
  comment: z.string().max(200).optional(),
  device: z.string().max(32).optional(),
  isInput: z.boolean().optional(),
  isOutput: z.boolean().optional(),
  preset: z.number().optional(),
});

const request = z.object({
  prompt: z.string().trim().min(3).max(4000),
  ctx: z.object({
    plcTags: z.array(tag).max(500).default([]),
    hmiTags: z
      .array(
        z.object({
          name: z.string().min(1).max(64),
          type: z.enum(["BOOL", "INT", "TIMER", "COUNTER"]),
          value: z.number().default(0),
          comment: z.string().max(200).optional(),
        }),
      )
      .max(500)
      .default([]),
    // A panel is a fixed number of pixels, and these are the bounds of real
    // hardware: below 128 nothing is drawable, and above 4096 the model is
    // being asked to lay out a video wall it cannot see.
    size: z.object({
      width: z.number().int().min(128).max(4096),
      height: z.number().int().min(128).max(4096),
    }),
    existing: z.array(z.unknown()).max(500).default([]),
    screenSlugs: z.array(z.string().max(64)).max(100).default([]),
    alarms: z.array(z.unknown()).max(1000).default([]),
    mode: z.enum(["replace", "extend"]).default("extend"),
  }),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const ctx = parsed.data.ctx as unknown as GenContext;
  const system = screenSystemPrompt();
  const user = screenUserPrompt(ctx, parsed.data.prompt);

  try {
    let raw: unknown = null;
    let text = "";
    let model = "";
    let lastError: unknown = null;

    // Two goes, the second one holding up what came back and asking for the
    // object on its own. A free model wraps JSON in prose often enough that
    // giving up after one attempt reads as the feature not working.
    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      try {
        const result = await complete({
          userId: auth.user.id,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
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
          maxTokens: 6000,
          temperature: 0.2,
        });
        text = result.text;
        model = result.model;
        raw = firstJsonObject(text);
      } catch (err) {
        lastError = err;
      }
    }
    if (!raw && lastError) throw lastError;

    const out = normaliseScreen(raw, ctx);

    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "hmi_screen_generated",
      payload: {
        model,
        mode: ctx.mode,
        widgets: out.widgets.length,
        alarms: out.alarms.length,
        problems: out.problems.length,
      },
    });

    return NextResponse.json({ ...out, model });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "Could not draw that. Try describing the screen more concretely." },
      { status: 502 },
    );
  }
}
