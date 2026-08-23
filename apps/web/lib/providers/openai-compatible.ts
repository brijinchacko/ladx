import {
  type ChatMessage,
  type Credentials,
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
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
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
