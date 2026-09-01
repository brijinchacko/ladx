"use client";

// Local chat. Free-form when accessed as /chat; project-grounded when
// accessed as /chat?project=<uuid>. Tauri's output:'export' rules out
// dynamic route segments, hence the query-string approach.

import { desktopChatStream } from "@/lib/desktop-chat-stream";
import {
  type ProjectRow,
  autoFixSt,
  ensureConversation,
  getProject,
  listMessages,
  ollamaModels,
  settingsLoad,
  validateSt,
} from "@/lib/invoke";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-500">Loading…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const params = useSearchParams();
  const projectId = params.get("project");

  const [model, setModel] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectRow | null | undefined>(
    projectId ? undefined : null,
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      /*
       * Two reads, two catches, because they fail for different reasons.
       *
       * These were one Promise.all under one catch that ended every message
       * with "Is Ollama running on localhost:11434?". A database that could
       * not be opened, or a project that had been deleted, then sent the
       * person to check a service that was working perfectly.
       */
      try {
        const [p, convo] = await Promise.all([
          projectId ? getProject(projectId) : Promise.resolve(null),
          ensureConversation(projectId ?? null),
        ]);
        if (!live) return;
        if (projectId) setProject(p);
        if (!convo?.id) throw new Error("This conversation could not be opened.");
        setConversationId(convo.id);

        // Prior turns, so somebody picks up where they left off.
        const msgs = await listMessages(convo.id);
        if (!live) return;
        setInitialMessages(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content })));
      } catch (err) {
        if (!live) return;
        setError(
          err instanceof Error
            ? `${err.message} Conversations are stored on this machine; reopen the app if this keeps happening.`
            : "The conversation could not be opened.",
        );
        return;
      }

      /*
       * The model, which is a separate service and the one thing here that is
       * genuinely often not running. Failing to read it does not hide the
       * conversation that was just loaded: history is worth having without a
       * model, and the message says what to do about the model.
       */
      try {
        const [settings, models] = await Promise.all([settingsLoad(), ollamaModels()]);
        if (!live) return;
        const chosen = settings.defaultModel ?? models.suggested ?? models.models[0]?.name ?? null;
        if (!chosen) {
          setError("No Ollama models installed. Run `ollama pull qwen2.5-coder:14b` then reload.");
        } else {
          setModel(chosen);
        }
      } catch (err) {
        if (!live) return;
        setError(
          err instanceof Error
            ? `${err.message} Is Ollama running on localhost:11434?`
            : "Ollama could not be reached on localhost:11434.",
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [projectId]);

  if (projectId && project === undefined) {
    return (
      <div className="p-8 flex items-center gap-2 text-ink-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-ink-100 px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          {project ? (
            <>
              <p className="text-xs text-ink-500">
                <Link href="/" className="hover:text-ink-900">
                  Projects
                </Link>
                {" / "}
                <Link href={`/project?id=${project.id}`} className="hover:text-ink-900">
                  {project.name}
                </Link>
              </p>
              <h1 className="font-semibold text-ink-900 truncate">{project.name} · Chat</h1>
            </>
          ) : (
            <>
              <h1 className="font-semibold text-ink-900">Chat</h1>
              <p className="text-xs text-ink-500">
                Free-form. Open a project for grounded answers.
              </p>
            </>
          )}
        </div>
        <p className="text-xs text-ink-500 shrink-0">
          {project ? (
            <>
              {project.vendor} · {project.routineCount} routines · {project.tagCount} tags ·
            </>
          ) : (
            "Local · "
          )}
          {model ? `${model}` : "no model"}
        </p>
      </header>

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-warning bg-warning px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-sm text-ink-900">{error}</div>
        </div>
      )}

      {model && (
        <ChatWindow
          className="flex-1 min-h-0"
          initialMessages={initialMessages}
          projectId={project?.id}
          validate={validateSt}
          autoFix={async ({ source, report }) =>
            autoFixSt({
              source,
              initialReport: report,
              projectId: project?.id,
              model,
            })
          }
          placeholder={
            project
              ? "Ask about MainRoutine, generate ST, explain a tag…"
              : "Ask ladX Studio (running entirely on your machine)…"
          }
          onSend={async (turns: ChatTurn[], signal) =>
            desktopChatStream({
              messages: turns.map(({ role, content }) => ({ role, content })),
              model,
              projectId: project?.id,
              conversationId: conversationId ?? undefined,
              signal,
            })
          }
        />
      )}
    </div>
  );
}
