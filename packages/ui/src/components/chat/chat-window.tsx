"use client";

import { Send } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { ChatMessage, type ChatMessageProps } from "./message";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatWindowProps {
  initialMessages?: ChatTurn[];
  /**
   * Submit handler returns an async iterable of token deltas. The caller
   * picks the transport (web `fetch('/api/chat')` SSE, desktop Tauri
   * invoke). Surface-aware abstraction lives in `lib/api.ts`.
   */
  onSend: (messages: ChatTurn[], signal: AbortSignal) => Promise<AsyncIterable<string>>;
  /**
   * Forwarded to <ChatMessage/> — invoked when the user clicks "Accept"
   * on a code block. The host persists.
   */
  onAcceptCode?: ChatMessageProps["onAcceptCode"];
  /** Optional project id forwarded to <CodeBlock/> for auto-fix grounding. */
  projectId?: string;
  /** Optional validate transport — forwarded to <CodeBlock/>. */
  validate?: ChatMessageProps["validate"];
  placeholder?: string;
  className?: string;
}

export function ChatWindow({
  initialMessages = [],
  onSend,
  onAcceptCode,
  projectId,
  validate,
  placeholder = "Ask ladX to generate ladder, ST, or explain a routine…",
  className,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatTurn[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages length drives the scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const userTurn: ChatTurn = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const assistantId = `a-${Date.now()}`;
      const next: ChatTurn[] = [
        ...messages,
        userTurn,
        { id: assistantId, role: "assistant", content: "" },
      ];
      setMessages(next);
      setInput("");
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const stream = await onSend([...messages, userTurn], ctrl.signal);
        for await (const delta of stream) {
          setMessages((cur) =>
            cur.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
          );
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "stream error");
      } finally {
        setStreaming(false);
      }
    },
    [input, messages, onSend, streaming],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-white", className)}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="p-8 text-center text-ink-500">
            <p>Start a conversation about your project.</p>
            <p className="text-xs mt-2">
              Tip: ask "explain MainRoutine" or "generate motor start/stop with seal-in".
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatMessage
            key={m.id}
            role={m.role}
            content={m.content}
            pending={streaming && i === messages.length - 1 && m.role === "assistant"}
            projectId={projectId}
            validate={validate}
            onAcceptCode={onAcceptCode}
          />
        ))}
        {error && (
          <div className="px-4 py-3 text-sm text-danger bg-danger/5 border-t border-danger/20">
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-ink-100 p-3 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={2}
          className="flex-1 resize-none rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          disabled={!input.trim() || streaming}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
