"use client";

import { ClipboardCheck, Lock, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RunRow {
  id: string;
  kind: string;
  title: string;
  total: number;
  done: number;
  failed: number;
  startedAt: string;
  signedBy: string | null;
  signedAt: string | null;
  documentId: string | null;
}

interface Plan {
  groups: {
    subject: string;
    steps: { kind: string; action: string; expect: string; from: string }[];
  }[];
  not_covered?: string[];
}

/**
 * Carrying the tests out, rather than only printing them.
 *
 * The plan above is generated from the program. A run is that plan copied at
 * the moment somebody starts, with a tick, a note and a signature added on the
 * bench or on site. This lists the runs for the project and starts a new one.
 */
export function TestRunsPanel({
  projectId,
  projectName,
  plan,
}: {
  projectId: string | null;
  projectName: string;
  plan: Plan;
}) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [starting, setStarting] = useState<"fat" | "sat" | null>(null);

  useEffect(() => {
    if (!projectId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/test-runs?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d: { runs: RunRow[] }) => {
        if (!cancelled) setRuns(d.runs);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function start(kind: "fat" | "sat") {
    setStarting(kind);
    try {
      const count = (runs ?? []).filter((r) => r.kind === kind).length + 1;
      const res = await fetch("/api/test-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          kind,
          title: `${projectName} ${kind.toUpperCase()} ${count}`,
          plan,
        }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      router.push(`/studio/commission/runs/${id}`);
    } finally {
      setStarting(null);
    }
  }

  if (!projectId) {
    return (
      <p className="mb-4 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[12.5px] text-ink-500">
        File this program against a project to carry the tests out and keep the record.
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-md border border-ink-200 bg-ink-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[13px] font-medium text-ink-900">Carry these out</p>
        {(["fat", "sat"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => start(k)}
            disabled={starting !== null}
            className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            {starting === k ? "Starting…" : `Start a ${k.toUpperCase()}`}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[12px] text-ink-500">
        Each step gets a pass, a fail or a note, on a phone if that is where you are, and the run is
        signed at the end. The record is written as a document of the project.
      </p>

      {runs && runs.length > 0 && (
        <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-200 bg-white">
          {runs.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2">
              <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-ink-400" />
              <Link
                href={`/studio/commission/runs/${r.id}`}
                className="min-w-0 flex-1 text-[13px] text-ink-900 hover:underline"
              >
                <span className="block truncate font-medium">{r.title}</span>
                <span className="block truncate text-[11.5px] text-ink-500">
                  {new Date(r.startedAt).toLocaleDateString()} · {r.done} of {r.total} done
                  {r.failed > 0 ? ` · ${r.failed} failed` : ""}
                </span>
              </Link>
              {r.signedAt ? (
                <span className="flex shrink-0 items-center gap-1 rounded bg-success-bg px-1.5 py-0.5 font-mono text-[10.5px] text-success">
                  <Lock className="h-3 w-3" />
                  signed
                </span>
              ) : (
                <span className="shrink-0 font-mono text-[10.5px] text-ink-400">open</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
