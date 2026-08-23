import { classifyHttp, listModelsCompat, splitSystem, streamCompat } from "./openai-compatible";
import {
  type Credentials,
  type ModelInfo,
  type Provider,
  ProviderError,
  type ProviderKind,
  type StreamOptions,
} from "./types";

/**
 * The four adapters.
 *
 * Three speak the OpenAI wire format and differ only in base URL and headers.
 * Anthropic speaks its own, so it gets a real implementation rather than a
 * config object.
 */

const openrouter: Provider = {
  kind: "openrouter",
  label: "OpenRouter",
  keyHint:
    "Free to create at openrouter.ai/keys, email or GitHub, no card. Its free models cost nothing to run.",
  validateKeyFormat(key) {
    const k = key.trim();
    if (!k.startsWith("sk-or-")) return "OpenRouter keys start with sk-or-.";
    if (k.length < 26) return "That key looks too short.";
    if (/\s/.test(k)) return "That key contains a space.";
    return null;
  },
  listModels: (creds) =>
    listModelsCompat(creds, { baseUrl: "https://openrouter.ai/api/v1", headers: attribution }),

  /**
   * OpenRouter's /models is PUBLIC, it answers without a key at all.
   *
   * Verifying by listing therefore accepted anything shaped like a key,
   * including a string of zeros, and the person only found out when their
   * first message failed. /key is the authenticated endpoint: it reports the
   * limits and spend for the key presenting it, and 401s for anything else.
   */
  async verify(creds) {
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${creds.apiKey}`, ...attribution },
      });
    } catch {
      throw new ProviderError("network", "could not reach OpenRouter");
    }
    if (!res.ok) throw classifyHttp(res.status, await res.text().catch(() => ""));
  },
  stream: (creds, opts) =>
    streamCompat(creds, opts, {
      baseUrl: "https://openrouter.ai/api/v1",
      headers: attribution,
    }),
};

const openai: Provider = {
  kind: "openai",
  label: "OpenAI",
  keyHint: "From platform.openai.com/api-keys. Usage bills to your own OpenAI account.",
  validateKeyFormat(key) {
    const k = key.trim();
    if (!k.startsWith("sk-")) return "OpenAI keys start with sk-.";
    if (k.length < 20) return "That key looks too short.";
    return null;
  },
  // OpenAI's /models requires the key, so listing is a genuine check here.
  listModels: (creds) => listModelsCompat(creds, { baseUrl: "https://api.openai.com/v1" }),
  verify: (creds) => verifyByListing(openai, creds),
  stream: (creds, opts) => streamCompat(creds, opts, { baseUrl: "https://api.openai.com/v1" }),
};

/** Attribution headers OpenRouter uses for its app leaderboard. */
const attribution = {
  "HTTP-Referer": "https://ladx.ai",
  "X-Title": "LADX",
};

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

const anthropic: Provider = {
  kind: "anthropic",
  label: "Anthropic",
  keyHint: "From console.anthropic.com. Usage bills to your own Anthropic account.",
  validateKeyFormat(key) {
    const k = key.trim();
    if (!k.startsWith("sk-ant-")) return "Anthropic keys start with sk-ant-.";
    if (k.length < 20) return "That key looks too short.";
    return null;
  },

  async listModels(creds) {
    let res: Response;
    try {
      res = await fetch(`${ANTHROPIC_BASE}/models`, {
        headers: {
          "x-api-key": creds.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
      });
    } catch {
      throw new ProviderError("network", "could not reach Anthropic");
    }
    if (!res.ok) throw classifyHttp(res.status, await res.text().catch(() => ""));

    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    return (json.data ?? []).map(
      (m) =>
        ({
          id: String(m.id ?? ""),
          label: typeof m.display_name === "string" ? m.display_name : String(m.id ?? ""),
          tools: true,
          vision: true,
        }) satisfies ModelInfo,
    );
  },

  verify: (creds) => verifyByListing(anthropic, creds),

  async *stream(creds, opts) {
    const { system, rest } = splitSystem(opts.messages);

    let res: Response;
    try {
      res = await fetch(`${ANTHROPIC_BASE}/messages`, {
        method: "POST",
        signal: opts.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": creds.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: opts.model,
          // Anthropic requires max_tokens; the others treat it as optional.
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature,
          system,
          messages: rest,
          stream: true,
        }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      throw new ProviderError("network", "could not reach Anthropic");
    }

    if (!res.ok || !res.body) {
      throw classifyHttp(res.status, await res.text().catch(() => ""));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const parsed = JSON.parse(payload) as {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              // Anthropic streams several event types; only the text deltas
              // carry content.
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                yield parsed.delta.text;
              }
            } catch {
              // keepalive or unknown event
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};

const custom: Provider = {
  kind: "custom",
  label: "Custom (OpenAI-compatible)",
  keyHint:
    "Any endpoint speaking the OpenAI chat-completions API, Groq, Together, a corporate gateway, or a local Ollama at http://localhost:11434/v1.",
  validateKeyFormat(key) {
    // Local servers frequently take any string, or none. Refusing an empty key
    // here would block the one setup that needs no key at all.
    return key.length > 512 ? "That key is implausibly long." : null;
  },
  listModels(creds) {
    if (!creds.baseUrl) throw new ProviderError("bad_request", "a base URL is required");
    return listModelsCompat(creds, { baseUrl: creds.baseUrl });
  },
  verify: (creds) => verifyByListing(custom, creds),
  stream(creds, opts) {
    if (!creds.baseUrl) throw new ProviderError("bad_request", "a base URL is required");
    return streamCompat(creds, opts, { baseUrl: creds.baseUrl });
  },
};

/**
 * Verify by listing.
 *
 * Correct only where /models actually requires the key, true for OpenAI and
 * Anthropic, and for most OpenAI-compatible servers. It is NOT true for
 * OpenRouter, which serves its catalogue publicly and therefore has its own
 * verify above. Check before reusing this for a new provider: a verification
 * step that passes for any input is worse than none, because it converts a
 * clear failure at connect time into a confusing one later.
 */
async function verifyByListing(provider: Provider, creds: Credentials): Promise<void> {
  const models = await provider.listModels(creds);
  if (!models.length) {
    throw new ProviderError("auth", "the key worked but no models are available on it");
  }
}

const REGISTRY: Record<ProviderKind, Provider> = {
  openrouter,
  anthropic,
  openai,
  custom,
};

export function getProvider(kind: ProviderKind): Provider {
  return REGISTRY[kind];
}

export const ALL_PROVIDERS: Provider[] = [openrouter, anthropic, openai, custom];

export type { Credentials, ModelInfo, Provider, ProviderKind, StreamOptions };
export { ProviderError };
