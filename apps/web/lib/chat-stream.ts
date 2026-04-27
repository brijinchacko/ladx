// Client-side SSE iterator. Calls /api/chat, parses `data: ` lines, yields
// token deltas. Handles the special `event: conversation` frame to surface
// the persisted conversation id back to the caller.

export interface SendOpts {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  conversationId?: string;
  projectId?: string;
  model?: string;
  signal?: AbortSignal;
  onConversationId?: (id: string) => void;
}

export async function* streamChatFromApi(opts: SendOpts): AsyncIterable<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    credentials: "include",
    signal: opts.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: opts.messages,
      conversationId: opts.conversationId,
      projectId: opts.projectId,
      model: opts.model ?? "anthropic/claude-sonnet-4.6",
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`chat request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | null = null;
  let dataLines: string[] = [];

  function dispatch() {
    if (dataLines.length === 0) {
      event = null;
      return;
    }
    const payload = dataLines.join("\n");
    dataLines = [];
    if (event === "conversation") {
      try {
        const parsed = JSON.parse(payload) as { id?: string };
        if (parsed.id) opts.onConversationId?.(parsed.id);
      } catch {
        // ignore malformed control frame
      }
    }
    event = null;
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) break;
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);

      if (line === "") {
        // end of event — for `event: conversation` we dispatch via control
        // frame; for plain `data:` we already yielded each line as a delta.
        dispatch();
        continue;
      }

      if (line.startsWith(":")) continue;

      if (line.startsWith("event: ")) {
        event = line.slice("event: ".length).trim();
        continue;
      }

      if (line.startsWith("data: ")) {
        const data = line.slice("data: ".length);
        if (data === "[DONE]") return;
        if (event) {
          dataLines.push(data);
          continue;
        }
        // Plain delta — yield immediately.
        yield data;
      }
    }
  }
}
