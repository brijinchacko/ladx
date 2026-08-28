"use client";

import { api } from "@/lib/api";
import { askModelLocally, localModels } from "@/lib/ask-model";
import { desktopAssistantStore } from "@/lib/assistant-store";
import {
  type LadxProgram,
  Monitor,
  type ProgramSource,
  partitionRunnableLike,
} from "@/lib/designs";
import { useEffect, useState } from "react";

/**
 * Monitor, on the desktop.
 *
 * The same component and the same scan engine the cloud build runs; only where
 * the programs come from differs. Reading them through Tauri rather than an
 * API is the whole point of this surface.
 */
export default function MonitorPage() {
  const [sources, setSources] = useState<ProgramSource[] | null>(null);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rows, projects] = await Promise.all([api.listLadder(), api.listProjects()]);
        const nameOf = new Map(projects.map((p) => [p.id, p.name]));
        const parsed = rows.map((r) => ({
          projectId: r.projectId,
          projectName: r.projectId ? (nameOf.get(r.projectId) ?? null) : null,
          name: r.name,
          program: safeParse(r.doc) as LadxProgram,
          updatedAt: r.updatedAt,
        }));
        // One unreadable row must not take the tool down, the same guard the
        // cloud build needed: the store holds whatever was written to it.
        const { runnable, broken } = partitionRunnableLike(parsed);
        setSources(runnable);
        setUnreadable(broken.map((b) => b.name));
      } catch (err) {
        // Said rather than waited on. Without this the page shows "Loading…"
        // for as long as somebody is willing to look at it, which is the worst
        // possible answer to "the store could not be read".
        setError(err instanceof Error ? err.message : "The saved programs could not be read.");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-red-700">{error}</p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Programs are stored on this machine. If this keeps happening, reopen the app.
        </p>
      </div>
    );
  }
  if (!sources) return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;

  return (
    <Monitor
      /* Ollama on this machine, never an API route: a static export has none. */
      askModel={askModelLocally}
      modelsUrl={localModels}
      assistantStore={desktopAssistantStore}
      sources={sources}
      companyName={null}
      author=""
      unreadable={unreadable}
      ladderHref="/ladder"
    />
  );
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
