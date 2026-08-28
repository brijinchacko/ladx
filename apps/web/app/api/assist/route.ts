import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { complete } from "@/lib/inference/complete";
import { ProviderError } from "@/lib/providers";
import { ASSIST_MAX_TOKENS, ASSIST_TEMPERATURE, ASSIST_TOOLS, assistUserPrompt } from "@ladx/ui";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Answering a question about what is on screen.
 *
 * The other assistants produce something: a rung, a screen, geometry. This one
 * explains. Convert and Monitor both need it and neither needs generation, and
 * the two questions they exist to answer are the two most asked in this trade:
 * "why is this rung not conducting" and "what do I actually do about this
 * conversion note".
 *
 * This is the web's transport for it. The prompts themselves live in
 * @ladx/ui, because the desktop reaches a local model instead of this route
 * and would otherwise need its own hand written copy of the same
 * instructions: two assistants giving different answers to the same question
 * about the same machine, only one of which anybody had thought about.
 */

const body = z.object({
  tool: z.enum(["monitor", "convert"]),
  /** What the person is looking at, assembled by the tool. */
  context: z.string().trim().min(1).max(24000),
  question: z.string().trim().min(2).max(2000),
  model: z.string().trim().max(200).nullish(),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof body>;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }

  const tool = ASSIST_TOOLS[parsed.tool];

  try {
    const result = await complete({
      userId: auth.user.id,
      model: parsed.model,
      messages: [
        { role: "system", content: tool.system },
        {
          role: "user",
          content: assistUserPrompt(parsed.tool, parsed.context, parsed.question),
        },
      ],
      maxTokens: ASSIST_MAX_TOKENS,
      temperature: ASSIST_TEMPERATURE,
    });

    /*
     * Audited as facts, not as content.
     *
     * The audit entry's own contract says metadata carries counts, models and
     * outcomes, and never anything the user or a model wrote. A question about
     * a machine is exactly the sort of thing that reads as harmless and is not:
     * it can name a customer, a plant or a fault, and the audit log is read by
     * people who were never meant to see any of that.
     */
    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "assist_answered",
      payload: {
        tool: parsed.tool,
        model: result.model,
        questionChars: parsed.question.length,
        answerChars: result.text.length,
      },
    });

    return NextResponse.json({ answer: result.text, model: result.model });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Could not reach a model. Try again, or connect a key in Settings." },
      { status: 502 },
    );
  }
}
