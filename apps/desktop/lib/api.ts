// Surface-aware API client, desktop edition. Same exports as the web
// version, but calls Tauri commands instead of HTTP. Forbidden to use
// `fetch()` here per ADR-005.

import type { Project } from "@ladx/types";
import { invoke } from "@tauri-apps/api/core";

/**
 * A stored design: a ladder program or an HMI application.
 *
 * `doc` is JSON as a string. The Rust side never parses it, because the shape
 * belongs to @ladx/studio and @ladx/hmi and duplicating it there would mean
 * maintaining it twice and drifting the day one changes.
 */
export interface DesignRow {
  id: string;
  projectId: string | null;
  name: string;
  doc: string;
  updatedAt: string;
}

export const api = {
  async listProjects(): Promise<Project[]> {
    return invoke<Project[]>("list_projects");
  },

  /* ── ladder ── */

  async loadLadder(projectId: string | null): Promise<DesignRow | null> {
    return invoke<DesignRow | null>("ladder_load", { projectId });
  },

  async saveLadder(projectId: string | null, name: string, doc: unknown): Promise<DesignRow> {
    return invoke<DesignRow>("ladder_save", { projectId, name, doc: JSON.stringify(doc) });
  },

  async listLadder(): Promise<DesignRow[]> {
    return invoke<DesignRow[]>("ladder_list");
  },

  /* ── HMI ── */

  async listHmi(): Promise<DesignRow[]> {
    return invoke<DesignRow[]>("hmi_list");
  },

  async getHmi(id: string): Promise<DesignRow | null> {
    return invoke<DesignRow | null>("hmi_get", { id });
  },

  async createHmi(projectId: string | null, name: string, doc: unknown): Promise<DesignRow> {
    return invoke<DesignRow>("hmi_create", { projectId, name, doc: JSON.stringify(doc) });
  },

  async saveHmi(id: string, name: string, doc: unknown): Promise<boolean> {
    return invoke<boolean>("hmi_save", { id, name, doc: JSON.stringify(doc) });
  },

  async deleteHmi(id: string): Promise<void> {
    return invoke<void>("hmi_delete", { id });
  },

  /* ── inference ── */

  /**
   * One completion, gathered rather than streamed.
   *
   * Generating a screen produces a JSON object that means nothing until it is
   * whole, so there is nothing to show while it arrives. What comes back is
   * raw text: the checking belongs to @ladx/hmi, and is the same checking the
   * cloud build applies, because it is the same function.
   */
  async aiComplete(opts: {
    system: string;
    prompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<{ text: string; model: string }> {
    return invoke<{ text: string; model: string }>("ai_complete", {
      system: opts.system,
      prompt: opts.prompt,
      model: opts.model,
      maxTokens: opts.maxTokens,
    });
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
