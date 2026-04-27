"use client";

import { DesktopShell } from "@/components/desktop-shell";
import { Button } from "@ladx/ui";
import Link from "next/link";

export default function ChatPage() {
  return (
    <DesktopShell>
      <div className="p-8 max-w-3xl mx-auto space-y-4">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight mb-1">Chat</h1>
          <p className="text-ink-500 text-sm">
            Local chat against Ollama. Streaming inference + project-scoped grounding land in the
            next Phase 2 sub-task.
          </p>
        </header>
        <div className="border border-dashed border-ink-200 rounded-lg p-12 text-center text-ink-500">
          Chat UI coming next. The Tauri command surface for streaming is wired (
          <code>ollama_status</code>, <code>ollama_models</code>); a project-scoped
          <code>ollama_chat_stream</code> Tauri command + reuse of <code>@ladx/ui</code>
          ChatWindow lands soon.
        </div>
        <Link href="/">
          <Button variant="outline">Back to home</Button>
        </Link>
      </div>
    </DesktopShell>
  );
}
