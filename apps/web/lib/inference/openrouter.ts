// Minimal OpenRouter chat-completion streaming client. Mirrors the Rust
// `ladx-inference::openrouter` crate — same wire format, same model field.
// We keep both sides because Next.js API routes run server-side TS, and
// shelling out to Rust per request is overkill for plain inference.

import { env } from "../env";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatStreamOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Calls OpenRouter's streaming completion endpoint and returns an
 * `AsyncIterable<string>` of token deltas. Caller is responsible for
 * concatenating and persisting.
 */
export async function* streamChat(opts: ChatStreamOptions): AsyncIterable<string> {
  const apiKey = env.requireOpenRouter();

  const resp = await fetch(ENDPOINT, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://ladx.ai",
      "X-Title": "ladX.ai",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
  });

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenRouter error ${resp.status}: ${detail.slice(0, 500)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on newlines; SSE separates events with blank lines but most
    // OpenRouter responses send one `data:` per line.
    while (true) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      const raw = buffer.slice(0, nl).trimEnd();
      buffer = buffer.slice(nl + 1);
      if (!raw || raw.startsWith(":")) continue;
      if (!raw.startsWith("data: ")) continue;

      const payload = raw.slice("data: ".length);
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore unparseable keep-alives etc
      }
    }
  }
}
