"use client";

import { api } from "@/lib/api";
import { tauriStorage } from "@/lib/ladder-storage";
import { LadxStudio } from "@ladx/studio";
import { useEffect, useState } from "react";

/**
 * Ladder, on the desktop.
 *
 * The same editor and the same scan engine as the cloud build. Only the store
 * differs, and that is injected rather than branched on, so there is one
 * editor to fix rather than two that drift.
 */
export default function LadderPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState<string>("scratch");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await api.listProjects();
        setProjects(rows.map((p) => ({ id: p.id, name: p.name })));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        <span className="text-[13px] text-ink-700">Program for</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
        >
          <option value="scratch">No project (scratch)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] text-ink-400">
          Saved on this machine. Monitor runs it and Convert reads it.
        </span>
      </div>

      {/* Keyed on the project so switching remounts the editor with the other
          program rather than leaving the previous one on screen. */}
      <LadxStudio key={projectId} projectId={projectId} storage={tauriStorage()} />
    </div>
  );
}
