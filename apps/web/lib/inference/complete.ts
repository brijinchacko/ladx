import { credentialsFor, preferredProvider } from "@/lib/db/provider-keys";
import { ProviderError, getProvider } from "@/lib/providers";
import { platformKey, rankFreeModels } from "@/lib/providers/free-tier";
import { streamWithFallback } from "@/lib/providers/free-tier";
import type { ChatMessage } from "@/lib/providers/types";

/**
 * One answer, whole, from whatever the user can reach.
 *
 * The chat route streams because a person is watching the words arrive. The
 * jobs here are not conversations: reading a specification and proposing field
 * values is a single question with a single structured answer, and nothing is
 * gained by showing it letter by letter.
 *
 * Provider resolution is the same either way, and deliberately so: a user's own
 * key first, the shared free tier behind it with its fall-through, so a feature
 * never works for the paying user and quietly fails for everyone else.
 */
export interface CompletionResult {
  text: string;
  /** The model that actually answered, for the audit trail. */
  model: string;
}

export async function complete(input: {
  userId: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<CompletionResult> {
  const { userId, messages, maxTokens = 2048, temperature = 0, signal } = input;

  const preferred = await preferredProvider(userId);
  if (preferred) {
    const creds = await credentialsFor(userId, preferred.kind);
    if (creds) {
      const provider = getProvider(preferred.kind);
      const model = preferred.defaultModel ?? creds.defaultModel;
      if (model) {
        const chunks: string[] = [];
        for await (const delta of provider.stream(creds, {
          model,
          messages,
          maxTokens,
          temperature,
          signal,
        })) {
          chunks.push(delta);
        }
        return { text: chunks.join(""), model };
      }
    }
  }

  const key = platformKey();
  if (!key) {
    throw new ProviderError(
      "model_unavailable",
      "No provider is connected and the shared free tier is unavailable. Connect a key in Settings.",
    );
  }

  const provider = getProvider("openrouter");
  const creds = { apiKey: key };
  const candidates = rankFreeModels(await provider.listModels(creds));
  const result = await streamWithFallback({
    provider,
    creds,
    candidates,
    messages,
    maxTokens,
    temperature,
    signal,
  });

  const chunks: string[] = [];
  for await (const delta of result.stream) chunks.push(delta);
  return { text: chunks.join(""), model: result.model };
}

/**
 * The first JSON object in a reply.
 *
 * Models wrap structured answers in prose and fences however the mood takes
 * them, and a free model does it more than most. Rather than insisting on
 * clean output and failing when it is not, the object is found by matching
 * braces from the first one, which survives both a preamble and a fence.
 */
export function firstJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
