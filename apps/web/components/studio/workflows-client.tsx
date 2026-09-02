"use client";

import type { WorkflowDef } from "@/lib/parsers/spawn";
import { Bot, ClipboardCheck, Play, UserRound, Workflow as WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RunRow {
  id: string;
  projectId: string | null;
  workflow: string;
  request: string;
  status: string;
  updatedAt: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: "running", cls: "text-ink-500" },
  waiting_person: { label: "needs you", cls: "bg-warning-bg text-warning" },
  finished: { label: "finished", cls: "bg-success-bg text-success" },
  stopped: { label: "stopped at a gate", cls: "bg-danger-bg text-danger" },
  failed: { label: "failed", cls: "bg-danger-bg text-danger" },
};

const TITLES: Record<string, string> = {
  "modify-program": "Change a running program",
  "assess-program": "Take on somebody else's program",
  "prepare-handover": "Get a job out of the door",
};

/**
 * Pick a workflow, a project and say what you want; then the runs.
 *
 * The three workflows are shown with their steps, because the steps are the
 * point: somebody choosing one should see where the checks sit and where a
 * person is asked before anything is written.
 */
export function WorkflowsClient({
  projects,
  initialProjectId,
}: {
  projects: { id: string; name: string; hasProgram: boolean }[];
  initialProjectId: string | null;
}) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowDef[] | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [chosen, setChosen] = useState<string>("modify-program");
  const [projectId, setProjectId] = useState<string>(
    initialProjectId ?? projects.find((p) => p.hasProgram)?.id ?? "",
  );
  const [request, setRequest] = useState("");
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workflows${projectId ? `?projectId=${projectId}` : ""}`)
      .then((r) => r.json())
      .then((d: { workflows: WorkflowDef[]; runs: RunRow[]; engineError: string | null }) => {
        if (cancelled) return;
        setWorkflows(d.workflows ?? []);
        setRuns(d.runs ?? []);
        setEngineError(d.engineError);
      })
      .catch(() => {
        if (!cancelled) setEngineError("Could not reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const project = projects.find((p) => p.id === projectId);
  const canStart = Boolean(project?.hasProgram) && request.trim().length > 0 && !starting;

  async function start() {
    setStarting(true);
    setProblem(null);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, workflow: chosen, request: request.trim() }),
      });
      const d = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !d.id) {
        setProblem(d.error ?? "Could not start the run.");
        return;
      }
      router.push(`/studio/workflows/${d.id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {engineError && (
          <p className="mb-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
            The workflow engine is not available on this server: {engineError}
          </p>
        )}

        {/* the three, with their steps */}
        <div className="grid gap-3 md:grid-cols-3">
          {(workflows ?? []).map((w) => {
            const on = w.name === chosen;
            return (
              <button
                key={w.name}
                type="button"
                onClick={() => setChosen(w.name)}
                className={`rounded-md border p-4 text-left transition-colors ${
                  on ? "border-ink-900 bg-white" : "border-ink-200 bg-white hover:border-ink-400"
                }`}
              >
                <p className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                  <WorkflowIcon className="h-4 w-4 text-ink-400" />
                  {TITLES[w.name] ?? w.name}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{w.about}</p>
                <ol className="mt-3 space-y-1">
                  {w.steps.map((s) => {
                    const Icon =
                      s.kind.kind === "model"
                        ? Bot
                        : s.kind.kind === "person"
                          ? UserRound
                          : ClipboardCheck;
                    return (
                      <li key={s.id} className="flex items-center gap-2 text-[12px] text-ink-700">
                        <Icon
                          className={`h-3 w-3 shrink-0 ${
                            s.kind.kind === "check"
                              ? s.blocking
                                ? "text-danger"
                                : "text-ink-400"
                              : s.kind.kind === "person"
                                ? "text-warning"
                                : "text-teal-700"
                          }`}
                        />
                        <span className="truncate">{s.about}</span>
                      </li>
                    );
                  })}
                </ol>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-ink-500">
          <span className="text-teal-700">Model</span> proposes,{" "}
          <span className="text-danger">check</span> decides and can stop the run,{" "}
          <span className="text-warning">person</span> is asked and nothing goes on until they
          answer.
        </p>

        {/* start */}
        <div className="mt-6 rounded-md border border-ink-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <label className="block">
              <span className="text-[12px] font-medium text-ink-700">Project</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-ink-200 bg-white px-2 text-[13px] outline-none focus:border-ink-500"
              >
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.hasProgram ? "" : " (no program yet)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-ink-700">What do you want done</span>
              <input
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder={
                  chosen === "assess-program"
                    ? "What is this program and what is wrong with it?"
                    : chosen === "prepare-handover"
                      ? "Handover for the line 2 CIP skid"
                      : "Add a second pump on duty/standby with a changeover every 8 hours"
                }
                className="mt-1 h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-[13px] outline-none focus:border-ink-500"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={start}
              disabled={!canStart}
              className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              {starting ? "Running the first steps…" : "Start"}
            </button>
            {project && !project.hasProgram && (
              <span className="text-[12.5px] text-ink-500">
                This project has no program yet.{" "}
                <Link href={`/studio/ladder?project=${project.id}`} className="text-teal-700">
                  Write or import one
                </Link>
                .
              </span>
            )}
            {problem && <span className="text-[12.5px] text-danger">{problem}</span>}
          </div>
        </div>

        {/* runs */}
        <h2 className="mt-8 text-[14px] font-semibold text-ink-900">Runs</h2>
        {runs.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-500">
            None yet{project ? ` for ${project.name}` : ""}.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-200 bg-white">
            {runs.map((r) => {
              const st = STATUS[r.status] ?? STATUS.running;
              return (
                <li key={r.id}>
                  <Link
                    href={`/studio/workflows/${r.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink-900">
                        {r.request}
                      </span>
                      <span className="block truncate text-[12px] text-ink-500">
                        {TITLES[r.workflow] ?? r.workflow} ·{" "}
                        {new Date(r.updatedAt).toLocaleString()}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] ${st?.cls}`}
                    >
                      {st?.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
