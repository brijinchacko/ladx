"use client";

import { api } from "@/lib/api";
import {
  type ConvertSource,
  ConvertWorkbench,
  type LadxProgram,
  partitionRunnableLike,
} from "@/lib/designs";
import { useEffect, useState } from "react";

/**
 * Convert, on the desktop.
 *
 * The conversion itself already ran entirely in the browser on the cloud
 * build, which is what made it the easiest tool to bring here: nothing about
 * it needed a server. Only the source list changes.
 */
export default function ConvertPage() {
  const [sources, setSources] = useState<ConvertSource[] | null>(null);
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
      const { runnable, broken } = partitionRunnableLike(parsed);
      setSources(runnable);
      setUnreadable(broken.map((b) => b.name));
    })();
  }, []);

  if (!sources) return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;

  return (
    <ConvertWorkbench
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
