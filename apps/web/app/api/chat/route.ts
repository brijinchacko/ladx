// POST /api/chat — streaming chat-completion endpoint.
// Phase 1 minimum: takes { messages, model? } and pipes OpenRouter SSE back.
// Future: pulls project context, runs retrieval, validates generated code.

import { streamChat } from "@/lib/inference/openrouter";
import { makeSseStream } from "@/lib/inference/stream";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(64_000),
      }),
    )
    .min(1)
    .max(100),
  model: z.string().default("anthropic/claude-sonnet-4.6"),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: "invalid request", detail: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  const stream = makeSseStream(
    streamChat({
      model: parsed.model,
      messages: parsed.messages,
      temperature: parsed.temperature,
      maxTokens: parsed.maxTokens,
      signal: req.signal,
    }),
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
