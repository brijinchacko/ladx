"use client";

import { ChevronDown, ChevronUp, Loader2, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface AiTurn {
  id: string;
  role: "you" | "ladx";
  text: string;
  /** Present on a reply that produced something, so it can be taken back. */
  undoable?: boolean;
}

/**
 * The AI box, docked to the bottom of a tool.
 *
 * Small, and at the bottom, on purpose. This is not the assistant: it is a
 * command line that happens to take English, and what it produces lands on the
 * drawing or in the program where the person can see it. Giving it half the
 * screen would say it was the main event, which it is not; the drawing is.
 *
 * Collapsible to a single bar, because most of a session does not involve it
 * and a permanent panel taking eighty pixels off the canvas would be resented
 * within a day.
 *
 * The disclaimer is not boilerplate and does not get dismissed. What comes back
 * is a proposal on a document that ends up in a panel, and the quality genuinely
 * does vary by model: the shared free tier is a rotating cast of whatever is
 * healthy, and the difference between the best and worst of them on a drawing
 * task is large. Saying so once, permanently, in the place where the work
 * appears is more honest than a one-time modal nobody reads.
 */
export default function AiDock({
  title,
  placeholder,
  suggestions = [],
  turns,
  busy,
  error,
  onSend,
  onUndo,
  modelNote,
}: {
  title: string;
  placeholder: string;
  suggestions?: string[];
  turns: AiTurn[];
  busy: boolean;
  error: string | null;
  onSend: (prompt: string) => void;
  /** Takes back the last thing it produced. */
  onUndo?: () => void;
  /** Which model answered, when one has. */
  modelNote?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every new turn
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns.length, busy]);

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    onSend(text);
  };

  if (!open) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-ink-100 bg-ink-50/60 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-[12.5px] text-ink-600 transition-colors hover:text-ink-900"
        >
          <Sparkles className="h-3.5 w-3.5 text-teal-600" />
          {title}
          <ChevronUp className="h-3 w-3 opacity-60" />
        </button>
        {turns.length > 0 && (
          <span className="font-mono text-[10.5px] text-ink-400">
            {turns.filter((t) => t.role === "you").length} asked
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-56 shrink-0 flex-col border-t border-ink-100 bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-teal-600" />
        <span className="text-[12.5px] font-medium text-ink-900">{title}</span>
        {modelNote && <span className="font-mono text-[10.5px] text-ink-400">{modelNote}</span>}
        <div className="ml-auto flex items-center gap-2">
          {onUndo && turns.some((t) => t.undoable) && (
            <button
              type="button"
              onClick={onUndo}
              className="flex items-center gap-1 text-[11.5px] text-ink-500 transition-colors hover:text-ink-900"
            >
              <Undo2 className="h-3 w-3" />
              Undo that
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Hide"
            className="flex h-5 w-5 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div ref={logRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {turns.length === 0 && (
          <div>
            <p className="text-[12.5px] leading-relaxed text-ink-500">
              Describe what you want and it will be added to what is already here. Everything it
              produces is an ordinary edit, so undo takes it straight back out.
            </p>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {turns.map((t) => (
          <div key={t.id} className={t.role === "you" ? "flex justify-end" : ""}>
            <p
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-relaxed ${
                t.role === "you"
                  ? "bg-ink-900 text-white"
                  : "border border-ink-200 bg-ink-50 text-ink-700"
              }`}
            >
              {t.text}
            </p>
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-2 text-[12px] text-ink-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Working. On the free tier this takes a moment.
          </p>
        )}
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] text-red-800">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 px-3 pb-2">
        <div className="flex items-end gap-2 rounded-xl border border-ink-200 bg-white p-1.5 focus-within:border-ink-400">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              // The tools underneath bind almost every single key to a command.
              e.stopPropagation();
            }}
            placeholder={placeholder}
            rows={1}
            disabled={busy}
            className="max-h-24 min-h-[26px] flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-[13px] outline-none placeholder:text-ink-400 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || busy}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-ink-900 px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <Sparkles className="h-3 w-3" />
            Draw
          </button>
        </div>
        <p className="mt-1 text-center text-[10.5px] leading-snug text-ink-400">
          LADX can make mistakes, and how good the result is depends heavily on the model. Check
          everything before it reaches a panel.
        </p>
      </div>
    </div>
  );
}
