"use client";

import { streamChatFromApi } from "@/lib/chat-stream";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { useRef } from "react";

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

  return (
    <ChatWindow
      className="flex-1 min-h-0"
      initialMessages={initialMessages}
      onSend={async (turns: ChatTurn[], signal) => {
        return streamChatFromApi({
          messages: turns.map(({ role, content }) => ({ role, content })),
          conversationId: conversationIdRef.current,
          projectId,
          signal,
          onConversationId: (id) => {
            conversationIdRef.current = id;
          },
        });
      }}
    />
  );
}
