import { EmptyStreamError } from "./openai-compatible";
import { ProviderError } from "./types";
import type { ChatMessage, Credentials, ModelInfo, Provider } from "./types";

/**
 * The shared free tier, and falling through it.
 *
 * A signed-in user with no provider of their own runs on LADX's own OpenRouter
 * key, restricted to free models. That is what makes the product usable in the
 * first five minutes instead of after a signup at a third party.
 *
 * Free models are unreliable in a specific way: an individual model is
 * frequently rate limited, briefly withdrawn, or busy, and the failure arrives
 * as a 429 or a 404 rather than as a slow answer. Picking one and surfacing its
 * error would make the whole product look broken several times a day. So the
 * request falls through a ranked list, trying the next model whenever one fails
 * *before producing any output*, and stops at the first that actually starts
 * answering.
 *
 * Once a model has emitted a token the fall-through is over: switching
 * mid-answer would splice two different models' prose together, which is worse
 * than the failure it would be hiding.
 */

/** This key runs on LADX's account, so it must never reach a paid model. */
export function platformKey(): string | null {
  const key = process.env.LADX_OPENROUTER_KEY?.trim();
  return key && key.length > 20 ? key : null;
}

/**
 * The fall-through order.
 *
 * `openrouter/free` goes first when it is present: it is OpenRouter's own
 * auto-routing free endpoint, which picks whatever free model is healthy right
 * now. That is the same job this fall-through does, done upstream with better
 * information, so it is the right first choice.
 *
 * After that, families that follow instructions well on technical prose. The
 * list is matched as substrings and is expected to go stale: the free line-up
 * rotates, and on the day this was written not one of the previous entries
 * still existed. That is precisely why the ranking is a preference and the tail
 * is everything else, rather than a fixed list that breaks when it ages.
 */
const PREFERRED = [
  "openrouter/free",
  "glm-",
  "gemma-4-31b",
  "gemma-4",
  "nemotron-3-super",
  "nemotron-3-ultra",
  "llama-3.3-70b",
  "qwen",
  "mistral",
  "nemotron",
];

const REASONING_ONLY = ["-r1", "deepseek-r1", "qwq", "thinking", "reasoner", "o1-", "o3-"];

/**
 * Free listings are not lists of chat models.
 *
 * They contain music generators, safety classifiers, embedding and rerank
 * endpoints, and speech models. Every one of them will accept a chat request
 * and return something useless. Ranking by context window without this filter
 * picks a music model, because those advertise enormous context.
 */
const NOT_CHAT = [
  "lyria",
  "content-safety",
  "guard",
  "moderation",
  "embed",
  "rerank",
  "whisper",
  "tts",
  "-vl",
  "vision-only",
  "clip",
  "image",
];

function isReasoningOnly(id: string): boolean {
  const l = id.toLowerCase();
  return REASONING_ONLY.some((m) => l.includes(m));
}

function isChatModel(m: ModelInfo): boolean {
  const id = m.id.toLowerCase();
  if (NOT_CHAT.some((n) => id.includes(n))) return false;
  // Anything that emits audio or images is not answering a question in prose.
  const out = m.outputModalities;
  if (out && out.length > 0 && !out.every((o) => o === "text")) return false;
  return true;
}

/**
 * Build the ordered candidate list from what the key can actually reach.
 *
 * Ranked names first, in order, then every other usable free model as a tail
 * sorted by context, so the chain still has somewhere to go when the whole
 * preferred list is busy or has been renamed out from under us.
 */
export function rankFreeModels(models: ModelInfo[]): ModelInfo[] {
  const free = models.filter((m) => m.free && !isReasoningOnly(m.id) && isChatModel(m));

  const ranked: ModelInfo[] = [];
  for (const name of PREFERRED) {
    for (const m of free) {
      if (m.id.toLowerCase().includes(name) && !ranked.includes(m)) ranked.push(m);
    }
  }

  const rest = free
    .filter((m) => !ranked.includes(m))
    .sort((a, b) => (b.contextTokens ?? 0) - (a.contextTokens ?? 0));

  return [...ranked, ...rest];
}

export interface FreeTierStream {
  /** The model that actually answered. */
  model: string;
  /** Models that failed before it, for the log and the notice. */
  attempts: { model: string; error: string }[];
  stream: AsyncIterable<string>;
}

/**
 * Errors worth moving to the next model for. A bad request is not one.
 *
 * An empty answer is. A hybrid model given a long prompt can spend its whole
 * budget reasoning and produce nothing, and the right response to that is the
 * next model in the list, not an error to the person who asked: the request
 * was fine, that model was the wrong one for it.
 */
function isWorthRetrying(err: unknown): boolean {
  if (err instanceof EmptyStreamError) return true;
  if (!(err instanceof ProviderError)) return true;
  return err.kind === "rate_limited" || err.kind === "model_unavailable" || err.kind === "network";
}

/**
 * Try each candidate until one starts producing output.
 *
 * The first token is the commitment point. Everything before it is a candidate
 * that may be abandoned; everything after it is the answer.
 */
export async function streamWithFallback(input: {
  provider: Provider;
  creds: Credentials;
  candidates: ModelInfo[];
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** How many to try before giving up. Keeps a bad day from taking a minute. */
  limit?: number;
}): Promise<FreeTierStream> {
  const { provider, creds, candidates, messages, maxTokens, temperature, signal } = input;
  const limit = input.limit ?? 5;
  const attempts: { model: string; error: string }[] = [];

  if (candidates.length === 0) {
    throw new ProviderError("model_unavailable", "no free models are reachable on this key");
  }

  for (const candidate of candidates.slice(0, limit)) {
    const iterator = provider
      .stream(creds, {
        model: candidate.id,
        messages,
        maxTokens,
        temperature,
        signal,
      })
      [Symbol.asyncIterator]();

    try {
      // Pull the first chunk here. A model that is going to fail almost always
      // fails on this call, before anything has been shown to the user.
      const first = await iterator.next();

      if (first.done) {
        attempts.push({ model: candidate.id, error: "returned nothing" });
        continue;
      }

      // Committed. Replay the first chunk, then pass the rest straight through.
      const stream = (async function* () {
        yield first.value;
        while (true) {
          const next = await iterator.next();
          if (next.done) return;
          yield next.value;
        }
      })();

      return { model: candidate.id, attempts, stream };
    } catch (err) {
      const message = err instanceof ProviderError ? err.userMessage : String(err);
      attempts.push({ model: candidate.id, error: message });
      if (!isWorthRetrying(err)) throw err;
    }
  }

  throw new ProviderError(
    "model_unavailable",
    `every free model tried was busy or unavailable (${attempts.length} attempted). Free tiers rate limit hard at peak times; try again shortly, or connect your own key in Settings.`,
  );
}

/** The line shown once per conversation when running on the shared free tier. */
export function freeTierNotice(model: string, attempts: number): string {
  const fellThrough =
    attempts > 0 ? ` The first ${attempts === 1 ? "choice was" : `${attempts} were`} busy.` : "";
  return `Running on LADX's shared free tier (${model}).${fellThrough} Free models are slower, rate limited at peak times, and less precise on technical detail. Connect your own API key in Settings and pick a paid model for noticeably better answers.`;
}
