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
  /**
   * A model chosen for this one request, overriding the saved preference.
   *
   * The assistants let somebody pick a model in the place the work happens,
   * which is the right place for it: which model answered is the single biggest
   * factor in whether a generated rung or screen is any good. A picker that did
   * not actually change the model would be worse than no picker, so the choice
   * arrives here and wins over the default.
   *
   * Only honoured against the user's own key. On the shared free tier the model
   * is whatever is healthy at that moment, and pinning one there would mean a
   * request that fails outright instead of falling through to one that works.
   */
  model?: string | null;
}): Promise<CompletionResult> {
  const { userId, messages, maxTokens = 2048, temperature = 0, signal, model: wanted } = input;

  const preferred = await preferredProvider(userId);
  if (preferred) {
    const creds = await credentialsFor(userId, preferred.kind);
    if (creds) {
      const provider = getProvider(preferred.kind);
      const model = wanted || preferred.defaultModel || creds.defaultModel;
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
  const ranked = rankFreeModels(await provider.listModels(creds));
  /*
   * A chosen model goes to the front of the free tier rather than replacing it.
   *
   * Honouring the choice matters, but a free model that is rate limited or down
   * is a normal condition rather than an error, and pinning to it would turn a
   * working request into a failed one. Putting it first tries it, and keeps the
   * fall-through behind it.
   */
  const candidates = wanted
    ? [...ranked.filter((m) => m.id === wanted), ...ranked.filter((m) => m.id !== wanted)]
    : ranked;
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
