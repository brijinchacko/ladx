"use client";

import { streamChatFromApi } from "@/lib/chat-stream";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { Maximize2, MessageSquare, Minimize2, Minus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "closed" | "docked" | "expanded";

const MODE_KEY = "ladx.projectChat.mode";

/**
 * The project assistant, docked to the workspace.
 *
 * Always within reach while you are working on a project, because the questions
 * that come up are about *this* project: what does the FAT still need, what did
 * we say the guard does, what is left before handover. Walking to a separate
 * chat page and re-explaining the project every time is the friction this
 * removes.
 *
 * Every message carries the project id, so the server grounds the conversation
 * in the project's own record and its documents. The thread is scoped to the
 * project too, so it is there when you come back tomorrow.
 *
 * Three states, remembered: closed to a small launcher, docked as a panel
 * beside the work, or expanded when the answer needs room.
 */
export default function ProjectChatDock({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  const [ready, setReady] = useState(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === "docked" || saved === "expanded") setMode(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(MODE_KEY, mode);
  }, [mode, ready]);

  // Escape collapses the expanded panel, which is what a person expects from
  // something covering the page.
  useEffect(() => {
    if (mode !== "expanded") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("docked");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  const send = useCallback(
    async (turns: ChatTurn[], signal: AbortSignal) =>
      streamChatFromApi({
        messages: turns.map(({ role, content }) => ({ role, content })),
        conversationId: conversationIdRef.current,
        // This is what grounds the thread in the project.
        projectId,
        signal,
        onConversationId: (id) => {
          conversationIdRef.current = id;
        },
        onNotice: (n) => setNotice(n.message),
      }),
    [projectId],
  );

  if (!ready) return null;

  if (mode === "closed") {
    return (
      <button
        type="button"
        onClick={() => setMode("docked")}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-[13.5px] font-medium text-white shadow-lg transition-opacity hover:opacity-90"
      >
        <MessageSquare className="h-4 w-4" />
        Ask about this project
      </button>
    );
  }

  const expanded = mode === "expanded";

  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 p-4 sm:p-8"
          : "fixed bottom-0 right-5 z-40 w-[min(26rem,calc(100vw-2.5rem))]"
      }
      onClick={expanded ? (e) => e.target === e.currentTarget && setMode("docked") : undefined}
      onKeyDown={undefined}
    >
      <div
        className={`flex flex-col overflow-hidden border border-ink-200 bg-white shadow-xl ${
          expanded ? "h-full w-full max-w-3xl rounded-lg" : "h-[30rem] rounded-t-lg"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50/70 px-3 py-2">
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-teal-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-ink-900">Project assistant</p>
            <p className="truncate font-mono text-[10.5px] text-ink-400">{projectName}</p>
          </div>
          <button
            type="button"
            onClick={() => setMode(expanded ? "docked" : "expanded")}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode("closed")}
            aria-label="Minimise"
            className="flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
          >
            {expanded ? <X className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
          </button>
        </div>

        {notice && (
          <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] leading-snug text-amber-900">
            {notice}
          </p>
        )}

        <ChatWindow
          className="min-h-0 flex-1"
          projectId={projectId}
          emptyTitle={`Ask about ${projectName}`}
          suggestions={[
            "What is left before handover?",
            "Summarise this project",
            "What should the FAT cover?",
          ]}
          placeholder="Ask about this project…"
          onSend={send}
        />
      </div>
    </div>
  );
}
