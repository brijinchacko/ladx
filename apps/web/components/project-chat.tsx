"use client";

import { streamChatFromApi } from "@/lib/chat-stream";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { Mail } from "lucide-react";
import { useRef, useState } from "react";

export function ProjectChat({
  projectId,
  initialMessages,
  initialConversationId,
}: {
  projectId: string;
  initialMessages: ChatTurn[];
  initialConversationId?: string;
}) {
  // Persist the conversation id across turns. Server hands it back on the
  // first send via `event: conversation` SSE frame; we thread it onto every
  // subsequent request so the messages chain up under the same row.
  const conversationIdRef = useRef<string | undefined>(initialConversationId);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);

  const [emailing, setEmailing] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);

  async function emailTranscript() {
    if (!conversationId || emailing) return;
    setEmailing(true);
    setEmailNote(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/email`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setEmailNote(`Failed: ${data.error ?? res.status}`);
      } else {
        setEmailNote("Sent, check your inbox.");
      }
    } catch (err) {
      setEmailNote(`Failed: ${err instanceof Error ? err.message : "network error"}`);
    } finally {
      setEmailing(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {conversationId && (
        <div className="border-b border-ink-100 px-4 py-2 flex items-center justify-end gap-3 text-xs">
          {emailNote && <span className="text-ink-500">{emailNote}</span>}
          <button
            type="button"
            onClick={emailTranscript}
            disabled={emailing}
            className="flex items-center gap-1.5 text-ink-500 hover:text-ink-900 disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5" />
            {emailing ? "Sending…" : "Email transcript"}
          </button>
        </div>
      )}
      <ChatWindow
        className="flex-1 min-h-0"
        projectId={projectId}
        initialMessages={initialMessages}
        onSend={async (turns: ChatTurn[], signal) => {
          return streamChatFromApi({
            messages: turns.map(({ role, content }) => ({ role, content })),
            conversationId: conversationIdRef.current,
            projectId,
            signal,
            onConversationId: (id) => {
              conversationIdRef.current = id;
              setConversationId(id);
            },
          });
        }}
        onAcceptCode={async ({ language, source, report }) => {
          await fetch("/api/generated-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              language,
              source,
              validatorReport: report,
            }),
          });
        }}
      />
    </div>
  );
}
