import {
  type ChatMessage,
  type Credentials,
  type EmbedOptions,
  type ModelInfo,
  ProviderError,
  type StreamOptions,
} from "./types";

/**
 * The OpenAI chat-completions wire format.
 *
 * Shared by OpenRouter, OpenAI itself, Groq, Together, vLLM, LM Studio, Ollama's
 * compatibility endpoint, and most corporate gateways. Writing it once and
 * pointing different base URLs at it is the reason `custom` can support a
 * provider that does not exist yet.
 */

export interface CompatOptions {
  baseUrl: string;
  /** Extra headers, OpenRouter wants attribution, others want nothing. */
  headers?: Record<string, string>;
}

export function classifyHttp(status: number, body: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError("auth", "key rejected");
  }
  if (status === 429) {
    // Providers report the wait inconsistently; pull a number out of the body
    // when there is one, because "try again in 18s" is a far better message
    // than "rate limited".
    const seconds = Number(body.match(/(\d+)\s*(?:s|sec|seconds)/i)?.[1]);
    return new ProviderError(
      "rate_limited",
      "rate limited",
      Number.isFinite(seconds) ? seconds : undefined,
    );
  }
  if (status === 404) {
    return new ProviderError("model_unavailable", "model not found on this key");
  }
  if (status >= 500) {
    return new ProviderError("network", `provider returned ${status}`);
  }
  // 400s that are not auth or rate limits are usually a malformed request, and
  // the provider's own text is the most useful thing we have.
  const detail = body.slice(0, 300).replace(/\s+/g, " ").trim();
  return new ProviderError("bad_request", detail || `status ${status}`);
}

function url(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export async function listModelsCompat(
  creds: Credentials,
  opts: CompatOptions,
): Promise<ModelInfo[]> {
  let res: Response;
  try {
    res = await fetch(url(opts.baseUrl, "/models"), {
      headers: { Authorization: `Bearer ${creds.apiKey}`, ...opts.headers },
    });
  } catch {
    throw new ProviderError("network", "could not reach the provider");
  }
  if (!res.ok) throw classifyHttp(res.status, await res.text().catch(() => ""));

  const json = (await res.json()) as { data?: unknown[] };
  const rows = Array.isArray(json.data) ? json.data : [];

  return rows.map((raw) => {
    const m = raw as Record<string, unknown>;
    const id = String(m.id ?? "");
    const pricing = m.pricing as Record<string, unknown> | undefined;
    // OpenRouter reports pricing as decimal strings; "0" in both directions is
    // what makes a model free. Providers without a pricing block are paid.
    const free =
      pricing !== undefined &&
      Number(pricing.prompt ?? 1) === 0 &&
      Number(pricing.completion ?? 1) === 0;
    const architecture = m.architecture as Record<string, unknown> | undefined;
    const modalities = architecture?.input_modalities;

    return {
      id,
      label: typeof m.name === "string" && m.name ? m.name : id,
      contextTokens:
        typeof m.context_length === "number"
          ? m.context_length
          : typeof m.context_window === "number"
            ? m.context_window
            : undefined,
      free: free || id.endsWith(":free"),
      vision: Array.isArray(modalities) ? modalities.includes("image") : undefined,
    } satisfies ModelInfo;
  });
}

/**
 * Why an empty stream needs its own error.
 *
 * Reasoning models return their working in a `reasoning` field and leave
 * `content` null until they are ready to answer. Give one a small token budget
 * and it spends the whole allowance thinking, finishes with reason "length",
 * and produces a technically successful response containing nothing at all.
 *
 * Read naively that looks like a working stream with no output, which is the
 * worst thing to show somebody: no answer, no error, nothing to act on. So the
 * reasoning deltas are counted even though they are not shown, and a stream
 * that produced only reasoning says so.
 */
export class EmptyStreamError extends ProviderError {
  constructor(sawReasoning: boolean) {
    super(
      "bad_request",
      sawReasoning
        ? "The model spent its entire token budget reasoning and never produced an answer. Raise the token limit, or choose a model that is not reasoning-only."
        : "The model returned an empty response.",
    );
  }
}

export async function* streamCompat(
  creds: Credentials,
  opts: StreamOptions,
  compat: CompatOptions,
): AsyncIterable<string> {
  let res: Response;
  try {
    res = await fetch(url(compat.baseUrl, "/chat/completions"), {
      method: "POST",
      signal: opts.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiKey}`,
        ...compat.headers,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return;
    throw new ProviderError("network", "could not reach the provider");
  }

  if (!res.ok || !res.body) {
    throw classifyHttp(res.status, await res.text().catch(() => ""));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawContent = false;
  let sawReasoning = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Keeping the trailing partial
      // in `buffer` is the whole trick: a chunk boundary lands mid-frame far
      // more often than it looks like it should.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string; reasoning?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.reasoning) sawReasoning = true;
            if (delta?.content) {
              sawContent = true;
              yield delta.content;
            }
          } catch {
            // A frame that will not parse is not worth killing the stream for;
            // providers occasionally emit keepalives and comments.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!sawContent) throw new EmptyStreamError(sawReasoning);
}

/** Anthropic's Messages API needs the system prompt lifted out of the array. */
export function splitSystem(messages: ChatMessage[]): {
  system: string | undefined;
  rest: ChatMessage[];
} {
  const systems = messages.filter((m) => m.role === "system").map((m) => m.content);
  return {
    system: systems.length ? systems.join("\n\n") : undefined,
    rest: messages.filter((m) => m.role !== "system"),
  };
}

/**
 * Embeddings, for any endpoint that speaks the OpenAI shape.
 *
 * Batched in one request. The response order is not guaranteed to match the
 * input order, which is a detail easy to miss and impossible to notice later:
 * the index would simply return the wrong passage for every query, quietly and
 * plausibly. The `index` field on each item is what says where it belongs, so
 * the result is placed rather than pushed.
 */
export async function embedCompat(
  creds: Credentials,
  opts: EmbedOptions,
  cfg: { baseUrl: string; headers?: Record<string, string> },
): Promise<number[][]> {
  const res = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${creds.apiKey}`,
      ...cfg.headers,
    },
    body: JSON.stringify({ model: opts.model, input: opts.input }),
    signal: opts.signal,
  }).catch(() => null);

  if (!res) throw new ProviderError("network", "could not reach the provider");
  if (!res.ok) throw classifyHttp(res.status, await res.text().catch(() => ""));

  const json = (await res.json()) as {
    data?: { embedding?: number[]; index?: number }[];
  };
  const data = json.data ?? [];
  if (data.length !== opts.input.length) {
    throw new ProviderError(
      "bad_request",
      `asked for ${opts.input.length} embeddings and got ${data.length}`,
    );
  }

  const out: number[][] = new Array(opts.input.length);
  data.forEach((item, i) => {
    const at = typeof item.index === "number" ? item.index : i;
    if (!item.embedding?.length) {
      throw new ProviderError("bad_request", "provider returned an empty embedding");
    }
    out[at] = item.embedding;
  });

  for (let i = 0; i < out.length; i++) {
    if (!out[i]) throw new ProviderError("bad_request", `no embedding returned for input ${i}`);
  }
  return out;
}
