"use client";

import type { WorkflowDef, WorkflowRun, WorkflowStepRecord } from "@/lib/parsers/spawn";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
  Clock,
  UserRound,
  XCircle,
} from "lucide-react";
import { useState } from "react";

const OUTCOME: Record<
  WorkflowStepRecord["outcome"],
  { label: string; icon: typeof Check; cls: string }
> = {
  passed: { label: "passed", icon: Check, cls: "text-success" },
  noted: { label: "noted", icon: AlertTriangle, cls: "text-warning" },
  stopped: { label: "stopped the run", icon: XCircle, cls: "text-danger" },
  waiting: { label: "waiting", icon: Clock, cls: "text-warning" },
  notReached: { label: "not reached", icon: CircleDashed, cls: "text-ink-400" },
};

/**
 * The run, step by step.
 *
 * Every step in the order the workflow has them, with what it was given and
 * what it said, so the run reads back the way it happened. A step waiting on
 * a person gets the question and a box; a stopped run says which gate and
 * what it found. Model output is folded, because a survey is long and the
 * shape of the run matters more than any one answer.
 */
export function WorkflowRunClient({
  id,
  definition,
  initialRun,
  initialStatus,
  initialError,
}: {
  id: string;
  definition: WorkflowDef | null;
  initialRun: WorkflowRun | null;
  initialStatus: string;
  initialError: string | null;
}) {
  const [run, setRun] = useState<WorkflowRun | null>(initialRun);
  const [status, setStatus] = useState(initialStatus);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(initialError);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/workflows/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json()) as { run?: WorkflowRun; error?: string };
      if (!res.ok || !d.run) {
        setProblem(d.error ?? "The run could not continue.");
        setStatus("failed");
        return;
      }
      setRun(d.run);
      setStatus(
        d.run.finished
          ? "finished"
          : d.run.stoppedBecause?.startsWith("waiting on a person")
            ? "waiting_person"
            : "stopped",
      );
      setAnswer("");
    } finally {
      setBusy(false);
    }
  }

  const waiting = run?.steps.find((s) => s.outcome === "waiting");
  const waitingDef = definition?.steps.find((s) => s.id === waiting?.id);
  const personWaiting = waiting && waitingDef?.kind.kind === "person";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* where it stands */}
        <div
          className={`mb-5 rounded-md border px-4 py-3 text-[13px] ${
            status === "finished"
              ? "border-success-border bg-success-bg text-success"
              : status === "waiting_person"
                ? "border-warning-border bg-warning-bg text-warning"
                : status === "running"
                  ? "border-ink-200 bg-ink-50 text-ink-700"
                  : "border-danger-border bg-danger-bg text-danger"
          }`}
        >
          {status === "finished" &&
            "Every step ran. Nothing here claims more than the Iec level; see the last step."}
          {status === "waiting_person" && `Waiting on you: ${waiting?.input ?? "a question"}`}
          {status === "running" && "Running the model steps…"}
          {status === "stopped" && `Stopped. ${run?.stoppedBecause ?? ""}`}
          {status === "failed" && `The run could not continue. ${problem ?? ""}`}
        </div>

        {problem && status !== "failed" && (
          <p className="mb-4 text-[12.5px] text-danger">{problem}</p>
        )}

        {status === "failed" && (
          <button
            type="button"
            onClick={() => send({ retry: true })}
            disabled={busy}
            className="mb-5 rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50"
          >
            {busy ? "Trying…" : "Try again"}
          </button>
        )}

        {/* the steps */}
        <ol className="space-y-2">
          {(
            definition?.steps ??
            run?.steps.map((s) => ({
              id: s.id,
              about: s.id,
              kind: { kind: "check" as const, check: "" },
              blocking: false,
            })) ??
            []
          ).map((def) => {
            const rec = run?.steps.find((s) => s.id === def.id);
            const o = rec ? OUTCOME[rec.outcome] : null;
            const Icon = o?.icon ?? CircleDashed;
            const KindIcon =
              def.kind.kind === "model"
                ? Bot
                : def.kind.kind === "person"
                  ? UserRound
                  : ClipboardCheck;
            const isOpen = open[def.id] ?? rec?.outcome === "stopped";
            const hasBody = Boolean(rec && (rec.output || rec.findings.length > 0 || rec.input));
            return (
              <li key={def.id} className="rounded-md border border-ink-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [def.id]: !isOpen }))}
                  disabled={!hasBody}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:cursor-default"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${o?.cls ?? "text-ink-300"}`} />
                  <KindIcon className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink-900">{def.about}</span>
                    <span className="block truncate font-mono text-[11px] text-ink-400">
                      {def.id}
                      {def.kind.kind === "model" ? ` · ${def.kind.role}` : ""}
                      {def.kind.kind === "check"
                        ? ` · ${def.kind.check}${def.blocking ? " · can stop the run" : ""}`
                        : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 font-mono text-[11px] ${o?.cls ?? "text-ink-400"}`}>
                    {o?.label ?? "not run"}
                  </span>
                  {hasBody &&
                    (isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
                    ))}
                </button>

                {rec && isOpen && (
                  <div className="border-t border-ink-100 px-4 py-3">
                    {rec.findings.length > 0 && (
                      <ul className="mb-2 space-y-1">
                        {rec.findings.map((f) => (
                          <li key={f} className="flex gap-2 text-[12.5px] text-ink-800">
                            <span className="text-ink-400">·</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    {rec.output && def.kind.kind !== "check" && (
                      <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink-800">
                        {rec.output}
                      </pre>
                    )}
                    {rec.input && def.kind.kind === "model" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[12px] text-ink-500">
                          What it was asked
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-ink-600">
                          {rec.input}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {personWaiting && waiting?.id === def.id && (
                  <div className="border-t border-warning-border bg-warning-bg px-4 py-3">
                    <p className="text-[13px] font-medium text-warning">{waiting.input}</p>
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={3}
                      placeholder="Your answer. It goes into the run and the audit log."
                      className="mt-2 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13.5px] text-ink-900 outline-none focus:border-ink-500"
                    />
                    <button
                      type="button"
                      onClick={() => send({ stepId: waiting.id, answer: answer.trim() })}
                      disabled={!answer.trim() || busy}
                      className="mt-2 rounded-md bg-ink-900 px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Going on…" : "Answer and go on"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
