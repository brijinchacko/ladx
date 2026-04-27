// POST /api/inference — non-streaming convenience wrapper used internally
// (e.g. for project naming, conversation titles). For streaming, use /api/chat.

import { streamChat } from "@/lib/inference/openrouter";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

const requestSchema = z.object({
  prompt: z.string().min(1).max(8000),
  model: z.string().default("anthropic/claude-haiku-4.5"),
  maxTokens: z.number().int().min(1).max(2048).optional(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  let combined = "";
  for await (const delta of streamChat({
    model: parsed.data.model,
    messages: [{ role: "user", content: parsed.data.prompt }],
    maxTokens: parsed.data.maxTokens,
  })) {
    combined += delta;
  }

  return Response.json({ output: combined });
}
