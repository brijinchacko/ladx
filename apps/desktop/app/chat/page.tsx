"use client";

import { DesktopShell } from "@/components/desktop-shell";
import { desktopChatStream } from "@/lib/desktop-chat-stream";
import { ollamaModels, settingsLoad } from "@/lib/invoke";
import { type ChatTurn, ChatWindow } from "@ladx/ui";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

export default function ChatPage() {
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [s, m] = await Promise.all([settingsLoad(), ollamaModels()]);
        if (!live) return;
        const chosen = s.defaultModel ?? m.suggested ?? m.models[0]?.name ?? null;
        if (!chosen) {
          setError("No Ollama models installed. Run `ollama pull qwen2.5-coder:14b` then reload.");
        } else {
          setModel(chosen);
        }
      } catch (err) {
        if (!live) return;
        setError(
          err instanceof Error
            ? `${err.message}. Is Ollama running on localhost:11434?`
            : "Ollama not reachable",
        );
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <DesktopShell>
      <div className="h-screen flex flex-col">
        <header className="border-b border-ink-100 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-ink-900">Chat</h1>
            <p className="text-xs text-ink-500">Local · Ollama {model ? `· ${model}` : ""}</p>
          </div>
          {model && (
            <a href="/settings" className="text-xs text-teal-500 hover:text-teal-600">
              Change model →
            </a>
          )}
        </header>

        {error && (
          <div className="mx-6 mt-4 rounded-md border border-warning/30 bg-warning/5 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <div className="text-sm text-ink-900">{error}</div>
          </div>
        )}

        {model && (
          <ChatWindow
            className="flex-1 min-h-0"
            placeholder="Ask ladX Studio (running entirely on your machine)…"
            onSend={async (turns: ChatTurn[], signal) =>
              desktopChatStream({
                messages: turns.map(({ role, content }) => ({ role, content })),
                model,
                signal,
              })
            }
          />
        )}
      </div>
    </DesktopShell>
  );
}
