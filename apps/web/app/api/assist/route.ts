import { getApiUser } from "@/lib/auth/server";
import { auditInBackground } from "@/lib/db/audit";
import { complete } from "@/lib/inference/complete";
import { ProviderError } from "@/lib/providers";
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
 * Explaining is a different risk profile from generating and the prompt reflects
 * it. Nothing here writes to a document, so the failure mode is not a bad edit,
 * it is confident nonsense about a machine. The system prompts below push hard
 * on saying "I cannot tell from this" rather than producing a plausible
 * diagnosis, because a plausible wrong diagnosis about why a conveyor will not
 * start is worse than no answer: somebody acts on it.
 */

const TOOLS = {
  monitor: {
    label: "the ladder simulator",
    system: [
      "You help an engineer read a running ladder program in a simulator.",
      "",
      "You are given the program's rungs, its tag values at this instant, and a",
      "question. Answer the question about THIS program and THESE values.",
      "",
      "Rules that matter more than being helpful:",
      "",
      "- Reason from the tag values you were given. Do not invent a value.",
      "- If the values do not explain it, say which tag you would need to see.",
      '  "I cannot tell from this, watch X while you press Y" is a good answer.',
      "- A normally closed device reads 1 when healthy. A stop button reading 0",
      "  is a stop button that is pressed or a wire that is broken, and that is",
      "  usually the answer when a seal-in will not latch.",
      "- Name rungs the way the person sees them: rung numbers, tag names.",
      "- Never suggest changing logic on live equipment. This is a simulator.",
      "",
      "Two or three short paragraphs at most. No headings, no lists unless the",
      "answer is genuinely a list.",
    ].join("\n"),
  },
  convert: {
    label: "the converter",
    system: [
      "You help an engineer act on the result of a PLC code conversion.",
      "",
      "You are given the source program, the converted output, the notes the",
      "conversion produced, and a question.",
      "",
      "Rules:",
      "",
      "- A note marked manual means a human has to do that part. Say what to do,",
      "  concretely, in the target platform's terms.",
      "- Never claim the conversion is complete or safe to download. It is a",
      "  starting point that a person has to verify.",
      "- Timer and counter semantics differ between platforms. If the question",
      "  touches one, say what the difference is rather than glossing it.",
      "- Safety related logic is never converted automatically. If the question",
      "  is about safety code, say that it has to be rewritten and recertified",
      "  on the target platform.",
      "- If the answer depends on the target controller and you were not told",
      "  which one, ask.",
      "",
      "Two or three short paragraphs at most.",
    ].join("\n"),
  },
} as const;

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

  const tool = TOOLS[parsed.tool];

  try {
    const result = await complete({
      userId: auth.user.id,
      model: parsed.model,
      messages: [
        { role: "system", content: tool.system },
        {
          role: "user",
          content: `Here is what I am looking at in ${tool.label}:\n\n${parsed.context}\n\nMy question: ${parsed.question}`,
        },
      ],
      maxTokens: 900,
      // Low, because this is a question about a specific machine state and
      // there is nothing to be creative about.
      temperature: 0.2,
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
