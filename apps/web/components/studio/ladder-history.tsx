"use client";

import { PROGRAM_SAVED } from "@ladx/studio";
import { History, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface Snapshot {
  id: string;
  name: string;
  author: string | null;
  rungs: number;
  savedAt: string;
}

interface Change {
  risk: string;
  summary: string;
  detail?: string;
}
interface Diff {
  changes: Change[];
  notCompared?: string[];
  worst?: string | null;
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Every save, and what changed between any of them and now.
 *
 * A validated site has to keep this anyway; here it costs nothing. The list
 * is the saves, newest first. Compare shows what would differ if that version
 * were put back, ranked by how much it would matter, using the same comparison
 * Commissioning runs against a controller. Restore is a save of its own, so
 * it leaves a snapshot too and nothing is lost by restoring the wrong one.
 */
export function LadderHistory({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [diff, setDiff] = useState<{ id: string; out: Diff | null; error?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ladder/${projectId}/history`);
    if (!res.ok) {
      setSnapshots([]);
      return;
    }
    const d = (await res.json()) as { snapshots: Snapshot[] };
    setSnapshots(d.snapshots);
  }, [projectId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // A save while the panel is open adds a row.
  useEffect(() => {
    const onSaved = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId === projectId && open) void load();
    };
    window.addEventListener(PROGRAM_SAVED, onSaved);
    return () => window.removeEventListener(PROGRAM_SAVED, onSaved);
  }, [projectId, open, load]);

  async function compare(id: string) {
    setBusy(id);
    setDiff({ id, out: null });
    try {
      const res = await fetch(`/api/ladder/${projectId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diff: { from: id, to: "current" } }),
      });
      const d = await res.json();
      if (!res.ok) setDiff({ id, out: null, error: d.error ?? "Could not compare." });
      else setDiff({ id, out: d as Diff });
    } catch {
      setDiff({ id, out: null, error: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  async function restore(snap: Snapshot) {
    if (
      !window.confirm(
        `Put back the version saved ${ago(snap.savedAt)}? What is open now is saved first, so it can be put back too.`,
      )
    ) {
      return;
    }
    setBusy(snap.id);
    try {
      const res = await fetch(`/api/ladder/${projectId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: snap.id }),
      });
      if (res.ok) window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-ink-500 transition-colors hover:bg-ink-200 hover:text-ink-900"
      >
        <History className="h-3 w-3" />
        History
      </button>

      {open && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-[26rem] max-w-full animate-fade-in flex-col border-l border-ink-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold text-ink-900">History</p>
              <p className="text-[12px] text-ink-500">Every save. The last sixty are kept.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {snapshots === null && <p className="p-4 text-[13px] text-ink-500">Loading…</p>}
            {snapshots?.length === 0 && (
              <p className="p-4 text-[13px] text-ink-500">
                Nothing yet. Every save from now on appears here.
              </p>
            )}
            <ul className="divide-y divide-ink-100">
              {snapshots?.map((s, i) => (
                <li key={s.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-[13px] text-ink-900">
                      {ago(s.savedAt)}
                      {i === 0 && <span className="ml-1.5 text-[11px] text-ink-400">latest</span>}
                    </p>
                    <p className="shrink-0 font-mono text-[11px] text-ink-400">
                      {s.rungs} rung{s.rungs === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="truncate text-[11.5px] text-ink-500">
                    {s.name}
                    {s.author ? ` · ${s.author}` : ""}
                  </p>
                  <div className="mt-1.5 flex gap-3">
                    <button
                      type="button"
                      onClick={() => compare(s.id)}
                      disabled={busy !== null}
                      className="text-[12px] text-teal-700 hover:underline disabled:opacity-50"
                    >
                      {busy === s.id && diff?.id === s.id ? "Comparing…" : "Compare with now"}
                    </button>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => restore(s)}
                        disabled={busy !== null}
                        className="flex items-center gap-1 text-[12px] text-ink-500 hover:text-ink-900 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </button>
                    )}
                  </div>

                  {diff?.id === s.id && (
                    <div className="mt-2 rounded-md border border-ink-200 bg-ink-50 p-2.5">
                      {diff.error && <p className="text-[12px] text-danger">{diff.error}</p>}
                      {diff.out && diff.out.changes.length === 0 && (
                        <p className="text-[12px] text-ink-600">
                          Nothing differs from what is open now.
                        </p>
                      )}
                      {diff.out && diff.out.changes.length > 0 && (
                        <>
                          <p className="mb-1.5 text-[12px] text-ink-600">
                            {diff.out.changes.length} difference
                            {diff.out.changes.length === 1 ? "" : "s"} from now
                            {diff.out.worst ? `, the most serious ranked ${diff.out.worst}` : ""}.
                          </p>
                          <ul className="space-y-1">
                            {diff.out.changes.slice(0, 20).map((c) => (
                              <li key={c.summary} className="flex gap-2 text-[12px]">
                                <span
                                  className={`shrink-0 font-mono text-[10.5px] uppercase ${
                                    c.risk === "safety"
                                      ? "text-danger"
                                      : c.risk === "high"
                                        ? "text-warning"
                                        : "text-ink-400"
                                  }`}
                                >
                                  {c.risk}
                                </span>
                                <span className="text-ink-800">{c.summary}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
