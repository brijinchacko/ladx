// Surface-aware API client. Web hits `/api/...` over fetch; desktop will
// hit Tauri `invoke()` from its own copy of this file. The shared shape
// keeps `packages/ui` components portable across both surfaces.

import type { Project } from "@ladx/types";

export const api = {
  async listProjects(): Promise<Project[]> {
    const res = await fetch("/api/projects", { credentials: "include" });
    if (!res.ok) throw new Error(`listProjects ${res.status}`);
    const body = (await res.json()) as { projects: Project[] };
    return body.projects;
  },

  async streamChat(opts: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    model?: string;
    signal?: AbortSignal;
  }): Promise<Response> {
    const res = await fetch("/api/chat", {
      method: "POST",
      credentials: "include",
      signal: opts.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: opts.messages,
        model: opts.model ?? "anthropic/claude-sonnet-4.6",
      }),
    });
    if (!res.ok) throw new Error(`streamChat ${res.status}`);
    return res;
  },
};
