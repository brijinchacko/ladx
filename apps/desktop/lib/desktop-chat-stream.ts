// Bridges the Tauri event-bus chat protocol into the
// `AsyncIterable<string>` shape that @ladx/ui ChatWindow expects.
//
// Wire protocol — for a given mint-once channelId:
//   chat-stream:<id>        — payload = string delta
//   chat-stream-error:<id>  — payload = string error message (terminates)
//   chat-stream-end:<id>    — payload = (), emitted exactly once at end
//
// We attach all three listeners *before* invoking the command so we
// don't miss the first deltas in flight.

import { invoke } from "@tauri-apps/api/core";
import { type UnlistenFn, listen } from "@tauri-apps/api/event";

export interface DesktopChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DesktopChatStreamOpts {
  messages: DesktopChatMessage[];
  model: string;
  projectId?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

interface QueueItem {
  kind: "delta" | "end" | "error";
  value: string;
}

export async function* desktopChatStream(opts: DesktopChatStreamOpts): AsyncIterable<string> {
  const channelId = crypto.randomUUID();

  // Tiny async queue. The listeners push, the consumer awaits via the
  // resolver chain; each push wakes the awaiting next() exactly once.
  const pending: QueueItem[] = [];
  let resolveNext: ((item: QueueItem) => void) | null = null;
  function push(item: QueueItem) {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(item);
    } else {
      pending.push(item);
    }
  }
  function take(): Promise<QueueItem> {
    if (pending.length > 0) {
      const item = pending.shift() as QueueItem;
      return Promise.resolve(item);
    }
    return new Promise<QueueItem>((res) => {
      resolveNext = res;
    });
  }

  const unlisteners: UnlistenFn[] = [];
  unlisteners.push(
    await listen<string>(`chat-stream:${channelId}`, (e) =>
      push({ kind: "delta", value: e.payload }),
    ),
  );
  unlisteners.push(
    await listen<string>(`chat-stream-error:${channelId}`, (e) =>
      push({ kind: "error", value: e.payload }),
    ),
  );
  unlisteners.push(
    await listen<unknown>(`chat-stream-end:${channelId}`, () => push({ kind: "end", value: "" })),
  );

  // AbortSignal → end the stream early. The Rust side keeps running
  // until Ollama finishes; we just stop yielding.
  const onAbort = () => push({ kind: "end", value: "" });
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  // Fire-and-forget the command. Returns when the Rust task ends.
  invoke("ollama_chat_stream", {
    channelId,
    messages: opts.messages,
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    projectId: opts.projectId,
  }).catch((err) => {
    // Surface the invocation error through the queue so the consumer
    // sees it instead of getting stuck on the first take().
    push({ kind: "error", value: err instanceof Error ? err.message : String(err) });
  });

  try {
    while (true) {
      const item = await take();
      if (item.kind === "delta") {
        if (item.value.length > 0) yield item.value;
      } else if (item.kind === "end") {
        return;
      } else if (item.kind === "error") {
        throw new Error(item.value);
      }
    }
  } finally {
    for (const u of unlisteners) {
      try {
        u();
      } catch {
        /* listener already gone */
      }
    }
  }
}
