"use client";

import { streamChatFromApi } from "@/lib/chat-stream";
import { useComposer } from "@/lib/chat/use-composer";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { Info, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

/**
 * The chat workspace.
 *
 * Two things it does that the previous version did not.
 *
 * It no longer names a model. The old client sent a hardcoded Anthropic model
 * id on every request, which an OpenRouter key cannot reach, so chat failed for
 * exactly the users the free tier exists to serve. Now the server picks: the
 * user's chosen model if they have one, otherwise the best free model on their
 * key, and it says so.
 *
 * And it explains itself when it cannot run. A bare "428" helps nobody; the
 * empty state says what is missing and links to the one page that fixes it.
 */
export default function StudioChat({
  conversationId,
  initialMessages,
  projectId,
  hasProvider,
}: {
  conversationId?: string;
  initialMessages?: ChatTurn[];
  projectId?: string;
  hasProvider: boolean;
}) {
  const conversationIdRef = useRef<string | undefined>(conversationId);
  const [notice, setNotice] = useState<{ message: string; model: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const composer = useComposer();

  if (!hasProvider) {
    return <NoProvider />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {notice && !dismissed && (
        <div className="flex items-start gap-2.5 border-b border-warning-border bg-warning-bg px-5 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="flex-1 text-[12.5px] leading-relaxed text-warning">
            {notice.message}
            {notice.model && (
              <span className="ml-1.5 font-mono text-[11px] text-warning">({notice.model})</span>
            )}{" "}
            <Link href="/studio/settings" className="font-medium underline underline-offset-2">
              Open Settings
            </Link>
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-warning transition-colors hover:text-warning"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {composer.attachError && (
        <div className="flex items-start gap-2.5 border-b border-danger-border bg-danger-bg px-5 py-2.5">
          <p className="flex-1 text-[12.5px] leading-relaxed text-danger">{composer.attachError}</p>
          <button
            type="button"
            onClick={composer.dismissAttachError}
            aria-label="Dismiss"
            className="shrink-0 text-danger transition-colors hover:text-danger"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ChatWindow
        className="min-h-0 flex-1"
        emptyTitle="What are you working on?"
        onAttach={composer.attach}
        attachments={composer.attachments}
        onRemoveAttachment={composer.removeAttachment}
        attachAccept={composer.accept}
        attaching={composer.attaching}
        models={composer.models}
        suggestions={[
          "Write a motor start/stop with seal-in",
          "Explain what a TON does when the rung goes false",
          "Convert this rung to Structured Text",
          "What documents does a small machine build need?",
        ]}
        initialMessages={initialMessages}
        onSend={async (turns: ChatTurn[], signal) => {
          // The attached text is already baked into the turn being sent, so the
          // chips can go now. Leaving them would attach the whole specification
          // again to the next message.
          composer.clearAttachments();
          return streamChatFromApi({
            messages: turns.map(({ role, content }) => ({ role, content })),
            conversationId: conversationIdRef.current,
            projectId,
            model: composer.model,
            signal,
            onConversationId: (id) => {
              conversationIdRef.current = id;
            },
            onNotice: (n) => setNotice(n),
          });
        }}
      />
    </div>
  );
}

/** Shown when no AI provider is connected, which is the one blocking case. */
function NoProvider() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="font-display text-[1.3rem] font-bold text-ink-900">
          Chat is unavailable right now
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-600">
          The shared free tier is not reachable, and no provider of your own is connected. Connect a
          key in Settings to continue.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-500">
          OpenRouter takes an email and no card, and its free models cost nothing to run.
        </p>
        <Link
          href="/studio/settings"
          className="mt-6 inline-block rounded-md bg-ink-900 px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Connect a provider
        </Link>
      </div>
    </div>
  );
}
