"use client";

import { STARTER_PROGRAMS } from "@ladx/studio";
import { Clock, FileCode2, FolderKanban, Grid2x2Check, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface LadderProgramRow {
  projectId: string | null;
  projectName: string | null;
  name: string;
  rungs: number;
  updatedAt: string;
}

/**
 * Ladder, before a program is open.
 *
 * Two things belong here and nothing else. What you were working on, because
 * that is why most people arrive; and something to start from, because a blank
 * grid teaches nothing and an engineer evaluating this needs to see a working
 * rung inside a minute.
 *
 * The starters are complete running programs rather than outlines. Each one is
 * copied on open, so taking one apart to see how it works cannot spoil it for
 * the next person.
 */
export default function LadderHome({
  programs,
  projects,
  onOpen,
}: {
  programs: LadderProgramRow[];
  projects: { id: string; name: string }[];
  /** Open a program: scratch, or a project's. */
  onOpen: (projectId: string, seed?: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState("scratch");

  /**
   * Put a starter into the chosen slot, then open it.
   *
   * Written through the same endpoint the editor saves with, so a starter is
   * indistinguishable from something typed by hand the moment it lands.
   */
  async function start(key: string, name: string) {
    const starter = STARTER_PROGRAMS.find((s) => s.key === key);
    if (!starter) return;
    setBusy(key);
    try {
      const res = await fetch(`/api/ladder/${target}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, program: starter.program }),
      });
      if (!res.ok) return;
      onOpen(target);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-4 py-3">
          <Grid2x2Check className="h-4 w-4 shrink-0 text-teal-600" />
          <span className="text-[13.5px] text-ink-700">Work on the program for</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
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
            A program filed against a project is the one Monitor runs and Convert reads.
          </span>
          <button
            type="button"
            onClick={() => onOpen(target)}
            className="ml-auto flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5" />
            Open the editor
          </button>
        </div>

        {programs.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
              <Clock className="h-3 w-3" />
              Carry on with
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {programs.map((p) => (
                <li key={p.projectId ?? "scratch"}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.projectId ?? "scratch")}
                    className="group flex w-full flex-col rounded-md border border-ink-200 bg-white p-3 text-left transition-colors hover:border-ink-400"
                  >
                    <span className="flex items-baseline gap-2">
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink-900 group-hover:text-teal-700">
                        {p.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-400">
                        {p.rungs} rung{p.rungs === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 truncate pl-5 font-mono text-[10.5px] text-ink-400">
                      {p.projectName ? (
                        <>
                          <FolderKanban className="h-2.5 w-2.5" />
                          {p.projectName}
                        </>
                      ) : (
                        "scratch"
                      )}
                      {"  ·  "}
                      {new Date(p.updatedAt).toLocaleDateString("en-GB")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-display text-[16px] font-bold text-ink-900">Start from a program</h2>
          <p className="mb-4 mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            Complete, running programs rather than outlines. Open one, press Simulate, then take it
            apart. Each is copied when you open it, so the original stays intact.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {STARTER_PROGRAMS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => start(s.key, s.name)}
                  disabled={Boolean(busy)}
                  className="flex h-full w-full flex-col rounded-md border border-ink-200 bg-white p-3.5 text-left transition-colors hover:border-teal-500 hover:bg-teal-50 disabled:opacity-50"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 font-display text-[13.5px] font-bold text-ink-900">
                      {s.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-400">
                      {s.program.rungs.length} rung{s.program.rungs.length === 1 ? "" : "s"}
                    </span>
                    {busy === s.key && (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-teal-600" />
                    )}
                  </span>
                  <span className="mt-1 text-[12px] leading-relaxed text-ink-500">
                    {s.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
