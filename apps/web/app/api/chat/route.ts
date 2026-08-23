// POST /api/chat, streaming chat-completion endpoint with persistence.
// Reads the session cookie, loads the user, ensures a conversation exists,
// appends the user message, streams the assistant response while
// accumulating it, then writes the final assistant message at end-of-stream.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { appendMessage, ensureConversation } from "@/lib/db/conversations";
import { credentialsFor, preferredProvider } from "@/lib/db/provider-keys";
import { projects } from "@/lib/db/schema";
import { buildProjectSystemPrompt } from "@/lib/inference/project-prompt";
import { ssEncode } from "@/lib/inference/stream";
import { ProviderError, getProvider } from "@/lib/providers";
import type { ChatMessage } from "@/lib/providers/types";
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
  // No default. A hardcoded fallback here would silently win over the model the
  // user actually chose in Settings, because `.default()` means the field is
  // never undefined and the `??` below would never reach their choice. It also
  // named a model that may not exist on their key at all.
  model: z.string().optional(),
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

  // No quota gate. Inference runs on the user's own provider key (BYOK), so
  // usage is metered by their provider, not by us. Rate limiting, when it
  // matters, is the provider's, we surface their 429 rather than inventing one.
  //
  // Which also means: no key, no chat. That is a 428 rather than a 500, and the
  // client turns it into "connect a provider" rather than "something broke".
  const preferred = await preferredProvider(user.id);
  if (!preferred) {
    return Response.json(
      {
        error: "no_provider",
        message: "Connect an AI provider in Settings before chatting.",
      },
      { status: 428 },
    );
  }

  const creds = await credentialsFor(user.id, preferred.kind);
  if (!creds) {
    return Response.json({ error: "no_provider" }, { status: 428 });
  }
  const provider = getProvider(preferred.kind);
  // The request may name a model; otherwise use whichever the user chose when
  // they connected the provider.
  const model = parsed.model ?? creds.defaultModel;
  if (!model) {
    return Response.json(
      { error: "no_model", message: "Choose a default model in Settings." },
      { status: 428 },
    );
  }

  // The last entry MUST be the user's new message, that's what we persist
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
  } catch (err) {
    // DB failure is logged but doesn't block streaming, we'd rather serve
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

        for await (const delta of provider.stream(creds, {
          model,
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
        // A provider error carries a message written for a person, rate limits
        // in particular, where "wait 18s" is the difference between a queue and
        // a broken product.
        const msg =
          err instanceof ProviderError
            ? err.userMessage
            : err instanceof Error
              ? err.message
              : "stream error";
        const kind = err instanceof ProviderError ? err.kind : "unknown";
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ msg, kind })}\n\n`),
        );
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
