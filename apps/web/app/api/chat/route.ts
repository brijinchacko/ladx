// POST /api/chat — streaming chat-completion endpoint with persistence.
// Pulls the Clerk user, upserts a `users` row, ensures a conversation exists,
// appends the user message immediately, streams the assistant response while
// accumulating it, then writes the final assistant message at end-of-stream.

import { appendMessage, ensureConversation } from "@/lib/db/conversations";
import { upsertUserFromClerk } from "@/lib/db/users";
import { env } from "@/lib/env";
import { streamChat } from "@/lib/inference/openrouter";
import { ssEncode } from "@/lib/inference/stream";
import { auth, currentUser } from "@clerk/nextjs/server";
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

const clerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export async function POST(req: Request) {
  // Dev mode (no Clerk keys): skip auth so the OpenRouter pipeline is
  // testable without a sign-in flow. Persistence is also skipped because
  // we don't know whose data to attribute. Production must set Clerk keys.
  let clerkAuth: Awaited<ReturnType<typeof currentUser>> | null = null;
  if (clerkConfigured) {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });
    clerkAuth = await currentUser();
    if (!clerkAuth) return new Response("Unauthorized", { status: 401 });
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

  const dbEnabled = !!env.databaseUrl && !!clerkAuth;

  // The last entry MUST be the user's new message — that's what we persist
  // before streaming. The earlier entries are conversation history the
  // client already has.
  const lastUser = parsed.messages[parsed.messages.length - 1];
  if (!lastUser || lastUser.role !== "user") {
    return Response.json({ error: "the final message must be role='user'" }, { status: 400 });
  }

  let conversationId: string | undefined;
  if (dbEnabled && clerkAuth) {
    try {
      const dbUser = await upsertUserFromClerk({
        id: clerkAuth.id,
        emailAddresses: clerkAuth.emailAddresses?.map((e) => ({
          emailAddress: e.emailAddress,
        })),
        firstName: clerkAuth.firstName,
        lastName: clerkAuth.lastName,
      });

      const convo = await ensureConversation({
        userId: dbUser.id,
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
      // DB failure is logged but doesn't block streaming — we'd rather
      // serve the user a working chat with no persistence than 500.
      console.error("[chat] persistence failed:", err);
    }
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

        for await (const delta of streamChat({
          model: parsed.model,
          messages: parsed.messages,
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
