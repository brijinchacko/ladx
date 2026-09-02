// POST /api/chat, streaming chat-completion endpoint with persistence.
// Reads the session cookie, loads the user, ensures a conversation exists,
// appends the user message, streams the assistant response while
// accumulating it, then writes the final assistant message at end-of-stream.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { appendMessage, ensureConversation } from "@/lib/db/conversations";
import { credentialsFor, preferredProvider } from "@/lib/db/provider-keys";
import { cadDrawings, documents, projects } from "@/lib/db/schema";
import { type ProjectContext, buildProjectSystemPrompt } from "@/lib/inference/project-prompt";
import { ssEncode } from "@/lib/inference/stream";
import { getClient, getCompany } from "@/lib/platform/queries";
import { ProviderError, getProvider } from "@/lib/providers";
import {
  freeTierNotice,
  platformKey,
  rankFreeModels,
  streamWithFallback,
} from "@/lib/providers/free-tier";
import type { Credentials } from "@/lib/providers/types";
import type { ChatMessage } from "@/lib/providers/types";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

/**
 * Headroom for a reasoning model to think and still answer. Measured against a
 * free model that needed roughly 800 tokens of reasoning before its first word.
 */
const DEFAULT_MAX_TOKENS = 2048;

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
  // Bounded generously: a low ceiling truncates mid-answer, and on a
  // reasoning model it can consume the whole budget before any answer starts.
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

  // Where the inference runs.
  //
  // Preference is the user's own provider: it is their key, their choice of
  // model, and their account with the provider. Failing that, LADX's own
  // OpenRouter key runs a shared free tier so that chat works in the first five
  // minutes rather than after a signup at a third party. That key is restricted
  // to free models, and the answer says so.
  const preferred = await preferredProvider(user.id);
  const ownCreds = preferred ? await credentialsFor(user.id, preferred.kind) : null;

  const usingOwnKey = Boolean(preferred && ownCreds);
  const provider = getProvider(usingOwnKey && preferred ? preferred.kind : "openrouter");

  const shared = platformKey();
  if (!usingOwnKey && !shared) {
    return Response.json(
      {
        error: "no_provider",
        message: "Connect an AI provider in Settings before chatting.",
      },
      { status: 428 },
    );
  }

  const creds: Credentials = usingOwnKey ? (ownCreds as Credentials) : { apiKey: shared as string };

  // A model named by the request wins, then the user's saved default. With
  // neither, the free tier falls through a ranked list of free models.
  const explicitModel = parsed.model ?? (usingOwnKey ? ownCreds?.defaultModel : null);

  let autoNotice: string | null = null;
  let freeCandidates: Awaited<ReturnType<typeof rankFreeModels>> = [];

  if (!explicitModel) {
    let listed: Awaited<ReturnType<typeof provider.listModels>> = [];
    try {
      listed = await provider.listModels(creds);
    } catch {
      // Listing failed; the fallback below will report it properly.
    }
    freeCandidates = rankFreeModels(listed);

    if (freeCandidates.length === 0) {
      return Response.json(
        {
          error: "no_model",
          message: usingOwnKey
            ? "No free model was reachable on your key. Choose a model in Settings to continue."
            : "The shared free tier is unavailable right now. Connect your own key in Settings to continue.",
        },
        { status: 428 },
      );
    }
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
  let projectContext: ProjectContext | undefined;
  if (parsed.projectId) {
    project = await loadProject(user.id, parsed.projectId);
    if (!project) {
      return Response.json({ error: "project not found" }, { status: 404 });
    }
    projectContext = await loadProjectContext(user.id, project);
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
              { role: "system", content: buildProjectSystemPrompt(project, projectContext) },
              ...parsed.messages.filter((m) => m.role !== "system"),
            ]
          : parsed.messages;

        // A generous token budget matters more than it looks. Several free
        // models emit reasoning into a separate field before the answer, and a
        // small budget means they finish without ever answering.
        const maxTokens = parsed.maxTokens ?? DEFAULT_MAX_TOKENS;

        let deltas: AsyncIterable<string>;

        if (explicitModel) {
          deltas = provider.stream(creds, {
            model: explicitModel,
            messages: messagesWithGrounding,
            temperature: parsed.temperature,
            maxTokens,
            signal: req.signal,
          });
        } else {
          // Fall through the free models until one actually starts answering.
          const result = await streamWithFallback({
            provider,
            creds,
            candidates: freeCandidates,
            messages: messagesWithGrounding,
            temperature: parsed.temperature,
            maxTokens,
            signal: req.signal,
          });
          deltas = result.stream;
          autoNotice = usingOwnKey
            ? `Running on ${result.model}, a free model on your key. Choose a paid model in Settings for better results.`
            : freeTierNotice(result.model, result.attempts.length);

          controller.enqueue(
            encoder.encode(
              `event: notice\ndata: ${JSON.stringify({
                message: autoNotice,
                model: result.model,
              })}\n\n`,
            ),
          );
        }

        for await (const delta of deltas) {
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
    .where(and(eq(projects.id, projectId), inArray(projects.userId, await accessIds(userId))))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Everything about the engagement, for grounding.
 *
 * Loaded alongside the project so the assistant can answer "what is left before
 * handover" from the record rather than from general knowledge.
 */
async function loadProjectContext(
  userId: string,
  project: NonNullable<Awaited<ReturnType<typeof loadProject>>>,
): Promise<ProjectContext> {
  const [client, company, docs, drawings] = await Promise.all([
    project.clientId ? getClient(userId, project.clientId) : Promise.resolve(null),
    getCompany(userId),
    db()
      .select({
        title: documents.title,
        kind: documents.kind,
        templateSlug: documents.templateSlug,
      })
      .from(documents)
      .where(
        and(
          inArray(documents.userId, await accessIds(userId)),
          eq(documents.projectId, project.id),
        ),
      ),
    db()
      .select({ name: cadDrawings.name })
      .from(cadDrawings)
      .where(
        and(
          inArray(cadDrawings.userId, await accessIds(userId)),
          eq(cadDrawings.projectId, project.id),
        ),
      ),
  ]);

  return {
    client,
    company,
    documents: docs,
    drawings: drawings.map((d) => d.name),
  };
}
