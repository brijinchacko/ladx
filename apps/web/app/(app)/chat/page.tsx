"use client";

import { streamChatFromApi } from "@/lib/chat-stream";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { useRef } from "react";

export default function ChatPage() {
  // Persisted conversation id so subsequent turns thread together. Updates
  // when the server tells us via the `event: conversation` SSE frame.
  const conversationIdRef = useRef<string | undefined>(undefined);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-ink-100 px-6 py-3">
        <h1 className="font-semibold text-ink-900">Chat</h1>
        <p className="text-xs text-ink-500">
          Free-form chat. Project-scoped chat lands when uploads ship.
        </p>
      </header>
      <ChatWindow
        className="flex-1 min-h-0"
        onSend={async (turns: ChatTurn[], signal) => {
          return streamChatFromApi({
            messages: turns.map(({ role, content }) => ({ role, content })),
            conversationId: conversationIdRef.current,
            signal,
            onConversationId: (id) => {
              conversationIdRef.current = id;
            },
          });
        }}
      />
    </div>
  );
}
