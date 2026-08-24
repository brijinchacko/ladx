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
   * Forwarded to <ChatMessage/>, invoked when the user clicks "Accept"
   * on a code block. The host persists.
   */
  onAcceptCode?: ChatMessageProps["onAcceptCode"];
  /** Optional project id forwarded to <CodeBlock/> for auto-fix grounding. */
  projectId?: string;
  /** Optional validate transport, forwarded to <CodeBlock/>. */
  validate?: ChatMessageProps["validate"];
  /** Optional auto-fix transport, forwarded to <CodeBlock/>. */
  autoFix?: ChatMessageProps["autoFix"];
  placeholder?: string;
  /** Headline for the empty state. */
  emptyTitle?: string;
  /** Starter prompts. Clicking one fills the composer rather than sending it,
   *  so the person can edit it before committing. */
  suggestions?: string[];
  className?: string;
}

export function ChatWindow({
  initialMessages = [],
  onSend,
  onAcceptCode,
  projectId,
  validate,
  autoFix,
  placeholder = "Ask ladX to generate ladder, ST, or explain a routine…",
  emptyTitle = "What are you working on?",
  suggestions = [],
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
    <div className={cn("flex h-full flex-col bg-white", className)}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* A centred column, because a line of prose running the full width of
            a desktop window is genuinely harder to read. */}
        <div className="mx-auto w-full max-w-3xl px-2 py-4">
          {messages.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-[15px] text-ink-600">{emptyTitle}</p>
              {suggestions.length > 0 && (
                <div className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="rounded-full border border-ink-200 px-3 py-1.5 text-[12.5px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
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
              autoFix={autoFix}
              onAcceptCode={onAcceptCode}
            />
          ))}
          {error && (
            <div className="mx-4 my-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* The composer. One rounded field with the send control inside it, which
          is the shape every assistant has converged on: it reads as one object
          rather than as a form with a button beside it. */}
      <div className="shrink-0 px-3 pb-3">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-ink-200 bg-white p-2 shadow-sm transition-colors focus-within:border-ink-400">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={1}
              // Grows with the content up to a ceiling, then scrolls, so a long
              // paste does not push the conversation off the screen.
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
              }}
              className="max-h-[200px] min-h-[24px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-[14.5px] text-ink-900 outline-none placeholder:text-ink-400"
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              disabled={!input.trim() || streaming}
              aria-label="Send"
              className="shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-ink-400">
            Enter to send, Shift and Enter for a new line. Check generated logic before it reaches a
            machine.
          </p>
        </form>
      </div>
    </div>
  );
}
