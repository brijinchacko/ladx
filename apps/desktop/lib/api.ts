// Surface-aware API client — desktop edition. Same exports as the web
// version, but calls Tauri commands instead of HTTP. Forbidden to use
// `fetch()` here per ADR-005.

import type { Project } from "@ladx/types";
import { invoke } from "@tauri-apps/api/core";

export const api = {
  async listProjects(): Promise<Project[]> {
    return invoke<Project[]>("list_projects");
  },

  async streamChat(_opts: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    model?: string;
    signal?: AbortSignal;
  }): Promise<Response> {
    // Phase 2 wires this to the Ollama lifecycle in src-tauri/src/commands/chat.rs.
    throw new Error("desktop streamChat not implemented yet (Phase 2)");
  },
};
