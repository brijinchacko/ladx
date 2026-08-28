"use client";

import type { CadStore, GenerateDrawing } from "@ladx/cad";

/**
 * How the web stores and generates drawings: its own API routes, which hold
 * the database and the provider keys.
 *
 * A client module so a server rendered page can hand it to the editor, the
 * same arrangement save-record and ask-model use. The desktop has its own,
 * talking to SQLite and a local Ollama, and neither knows about the other's.
 */
export const cadStoreViaApi: CadStore = {
  async create({ name, projectId, data }) {
    const res = await fetch("/api/cad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, projectId, data }),
    });
    if (!res.ok) throw new Error("The sheet could not be created.");
    return (await res.json()) as { id: string };
  },

  async save({ id, name, data }) {
    const res = await fetch(`/api/cad/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data }),
    });
    return res.ok;
  },

  async rename(id, name) {
    await fetch(`/api/cad/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },

  async remove(id) {
    await fetch(`/api/cad/${id}`, { method: "DELETE" });
  },

  async setProject(id, projectId) {
    const res = await fetch(`/api/cad/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) throw new Error("The project could not be changed.");
  },
};

export const generateDrawingViaApi: GenerateDrawing = async ({
  prompt,
  layers,
  context,
  model,
  signal,
}) => {
  const res = await fetch("/api/cad/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, layers, context, model }),
    signal,
  });
  const body = (await res.json()) as {
    entities?: { type: string; symbol?: string; at?: { x: number; y: number }; layer?: string }[];
    summary?: string;
    model?: string;
    dropped?: number;
    error?: string;
  };
  if (!res.ok || !body.entities) {
    throw new Error(body.error ?? "The model did not return any geometry.");
  }
  return {
    entities: body.entities,
    summary: body.summary,
    model: body.model ?? null,
    dropped: body.dropped,
  };
};
