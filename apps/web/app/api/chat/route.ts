// POST /api/chat — streaming chat-completion endpoint with persistence.
// Reads the session cookie, loads the user, ensures a conversation exists,
// appends the user message, streams the assistant response while
// accumulating it, then writes the final assistant message at end-of-stream.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { appendMessage, ensureConversation } from "@/lib/db/conversations";
import { projects } from "@/lib/db/schema";
import { checkQuota, incrementPromptCount } from "@/lib/db/subscriptions";
import { type ChatMessage, streamChat } from "@/lib/inference/openrouter";
import { buildProjectSystemPrompt } from "@/lib/inference/project-prompt";
import { ssEncode } from "@/lib/inference/stream";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const requestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
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
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: "invalid request", detail: err instanceof Error ? err.message : "" },
      { status: 400 },
    );
  }

  // Quota gate: free tier blocks at 50 prompts/month. Pro/Site/Enterprise
  // are unlimited. We check before invoking the model so a blocked user
  // gets a clean 402 (Payment Required) instead of consuming inference.
  const quota = await checkQuota(user.id);
  if (quota.blocked) {
    return Response.json(
      {
        error: "free_quota_exceeded",
        message: `Free tier limit of ${quota.limit} prompts/month reached. Upgrade to Pro for unlimited.`,
        used: quota.used,
        limit: quota.limit,
      },
      { status: 402 },
    );
  }

  // The last entry MUST be the user's new message — that's what we persist
  // before streaming. Earlier entries are conversation history the client
  // already has.
  const lastUser = parsed.messages[parsed.messages.length - 1];
  if (!lastUser || lastUser.role !== "user") {
    return Response.json({ error: "the final message must be role='user'" }, { status: 400 });
  }

  // Load the project (if scoped) so we can both verify ownership and
  // build the grounding system prompt.
  let project: Awaited<ReturnType<typeof loadProject>> = null;
  if (parsed.projectId) {
    project = await loadProject(user.id, parsed.projectId);
    if (!project) {
      return Response.json({ error: "project not found" }, { status: 404 });
    }
  }

  let conversationId: string | undefined;
  try {
    const convo = await ensureConversation({
      userId: user.id,
      conversationId: parsed.conversationId,
      projectId: parsed.projectId,
    });
    conversationId = convo.id;

    await appendMessage({
      conversationId: convo.id,
      role: "user",
      content: lastUser.content,
    });

    // Counts against the user's quota. Done after the message persists so
    // a DB-write failure on the message doesn't burn a prompt slot.
    await incrementPromptCount(user.id).catch((err) =>
      console.error("[chat] increment prompt count failed:", err),
    );
  } catch (err) {
    // DB failure is logged but doesn't block streaming — we'd rather serve
    // the user a working chat with no persistence than 500.
    console.error("[chat] persistence failed:", err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let accumulated = "";
      try {
        if (conversationId) {
          // Tell the client which conversation row was used so subsequent
          // turns can pass it back via `conversationId`.
          controller.enqueue(
            encoder.encode(
              `event: conversation\ndata: ${JSON.stringify({ id: conversationId })}\n\n`,
            ),
          );
        }

        const messagesWithGrounding: ChatMessage[] = project
          ? [
              { role: "system", content: buildProjectSystemPrompt(project) },
              ...parsed.messages.filter((m) => m.role !== "system"),
            ]
          : parsed.messages;

        for await (const delta of streamChat({
          model: parsed.model,
          messages: messagesWithGrounding,
          temperature: parsed.temperature,
          maxTokens: parsed.maxTokens,
          signal: req.signal,
        })) {
          accumulated += delta;
          controller.enqueue(encoder.encode(ssEncode(delta)));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));

        if (conversationId && accumulated) {
          await appendMessage({
            conversationId,
            role: "assistant",
            content: accumulated,
          }).catch((err) => console.error("[chat] assistant persistence failed:", err));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ msg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function loadProject(userId: string, projectId: string) {
  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
