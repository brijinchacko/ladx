"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { type Attachment, Composer, type ModelPicker } from "./composer";
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

  /**
   * Attaching a document.
   *
   * The host does the reading, because how a file becomes text is its business
   * and this package must not grow a PDF parser. What arrives back is text,
   * which is appended to the message as a quoted block so the model sees the
   * specification and the person can see what was sent.
   */
  onAttach?: (files: FileList) => void;
  attachments?: Attachment[];
  onRemoveAttachment?: (id: string) => void;
  attachAccept?: string;
  attaching?: boolean;
  /** Model selection. Absent hides the picker. */
  models?: ModelPicker;
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
  onAttach,
  attachments = [],
  onRemoveAttachment,
  attachAccept,
  attaching = false,
  models,
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
      if ((!trimmed && attachments.length === 0) || streaming) return;

      setError(null);
      // Attached text is fenced and labelled rather than merged into the
      // question, so the model can tell the specification from the request and
      // the person can see exactly what was sent on their behalf.
      const attached = attachments
        .map((a) => `--- attached: ${a.name} ---\n${a.text}`)
        .join("\n\n");
      const userTurn: ChatTurn = {
        id: `u-${Date.now()}`,
        role: "user",
        content: attached ? `${attached}\n\n${trimmed}`.trim() : trimmed,
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
    [input, messages, onSend, streaming, attachments],
  );

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
            <div className="mx-4 my-2 rounded-md border border-danger bg-danger px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => void handleSubmit()}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
          placeholder={placeholder}
          attachments={attachments}
          onAttach={onAttach}
          onRemoveAttachment={onRemoveAttachment}
          accept={attachAccept}
          attaching={attaching}
          models={models}
          footnote="Enter to send, Shift and Enter for a new line. Check generated logic before it reaches a machine."
        />
      </div>
    </div>
  );
}
