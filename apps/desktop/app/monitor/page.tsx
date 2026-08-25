"use client";

import { api } from "@/lib/api";
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

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  if (!sources) return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;

  return (
    <Monitor
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
