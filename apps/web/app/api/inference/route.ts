// POST /api/inference — non-streaming convenience wrapper used internally
// (e.g. for project naming, conversation titles). For streaming, use /api/chat.

import { getApiUser } from "@/lib/auth/server";
import { streamChat } from "@/lib/inference/openrouter";
import { z } from "zod";

const requestSchema = z.object({
  prompt: z.string().min(1).max(8000),
  model: z.string().default("anthropic/claude-haiku-4.5"),
  maxTokens: z.number().int().min(1).max(2048).optional(),
});

export async function POST(req: Request) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

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
