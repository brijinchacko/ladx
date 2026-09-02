"use client";

import { Check, FileText, Lock, Minus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Step {
  kind: string;
  action: string;
  expect: string;
  from: string;
}
interface Plan {
  groups: { subject: string; steps: Step[] }[];
  not_covered?: string[];
}
type Verdict = "pass" | "fail" | "na";
interface Result {
  result?: Verdict;
  note?: string;
  at?: string;
}

export interface RunView {
  id: string;
  title: string;
  kind: string;
  plan: Plan;
  results: Record<string, Result>;
  notes: string;
  signedBy: string | null;
  signedRole: string | null;
  signedAt: string | null;
  documentId: string | null;
}

/**
 * The checklist.
 *
 * Every step is one card: the action, the expectation, three buttons and a
 * note. Results go to the server as they are ticked, one step per request,
 * so two people on two phones can share a run and a dropped connection costs
 * one tick rather than an afternoon. Sign off closes it; the record document
 * can be written before or after, and says which.
 */
export function TestRunClient({ run, defaultSigner }: { run: RunView; defaultSigner: string }) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, Result>>(run.results);
  const [notes, setNotes] = useState(run.notes);
  const [signed, setSigned] = useState(Boolean(run.signedAt));
  const [signer, setSigner] = useState(run.signedBy ?? defaultSigner);
  const [role, setRole] = useState(run.signedRole ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const total = run.plan.groups.reduce((n, g) => n + g.steps.length, 0);
  const done = Object.values(results).filter((r) => r.result).length;
  const failed = Object.values(results).filter((r) => r.result === "fail").length;

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/test-runs/${run.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setProblem(d.error ?? "Could not save that.");
        return false;
      }
      return true;
    } catch {
      setProblem("Could not reach the server. The last tick was not saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function setVerdict(key: string, verdict: Verdict) {
    if (signed) return;
    const next = { ...(results[key] ?? {}), result: verdict, at: new Date().toISOString() };
    setResults((r) => ({ ...r, [key]: next }));
    void patch({ results: { [key]: next } });
  }

  function setNote(key: string, note: string) {
    if (signed) return;
    const next = { ...(results[key] ?? {}), note };
    setResults((r) => ({ ...r, [key]: next }));
    // A note is typed, not ticked; send it once the typing pauses.
    clearTimeout(noteTimers.current[key]);
    noteTimers.current[key] = setTimeout(() => void patch({ results: { [key]: next } }), 600);
  }

  // The run's own notes, the same way.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function editNotes(next: string) {
    setNotes(next);
    if (signed) return;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => void patch({ notes: next }), 800);
  }

  async function signOff() {
    if (!signer.trim()) return;
    if (
      done < total &&
      !window.confirm(
        `${total - done} step${total - done === 1 ? "" : "s"} not done. Sign off anyway?`,
      )
    ) {
      return;
    }
    const ok = await patch({ signedBy: signer.trim(), signedRole: role.trim() });
    if (ok) {
      setSigned(true);
      router.refresh();
    }
  }

  async function reopen() {
    if (!window.confirm("Reopen this run? The signature is removed and the audit log says so."))
      return;
    const ok = await patch({ reopen: true });
    if (ok) {
      setSigned(false);
      router.refresh();
    }
  }

  async function writeRecord() {
    const res = await fetch(`/api/test-runs/${run.id}/record`, { method: "POST" });
    if (!res.ok) {
      setProblem("Could not write the record.");
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/studio/documents/${id}`);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        {/* progress */}
        <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-ink-100 bg-white px-4 py-2.5 sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-ink-700">
              <span className="font-semibold text-ink-900">{done}</span> of {total} done
              {failed > 0 && <span className="ml-2 text-danger">{failed} failed</span>}
            </span>
            <span className="font-mono text-[11.5px] text-ink-400">
              {saving ? "saving" : problem ? "" : "saved"}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded bg-ink-100">
            <div
              className={`h-full transition-[width] duration-200 ${failed > 0 ? "bg-danger" : "bg-teal-700"}`}
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
          {problem && <p className="mt-1.5 text-[12.5px] text-danger">{problem}</p>}
          {signed && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-success">
              <Lock className="h-3 w-3" />
              Signed off by {run.signedBy ?? signer}
              {(run.signedRole ?? role) ? `, ${run.signedRole ?? role}` : ""}. Read only.
            </p>
          )}
        </div>

        {run.plan.groups.map((g, gi) => (
          <section key={g.subject} className="mb-6">
            <h2 className="mb-2 text-[14px] font-semibold text-ink-900">{g.subject}</h2>
            <ol className="space-y-2">
              {g.steps.map((s, si) => {
                const key = `${gi}.${si}`;
                const r = results[key] ?? {};
                return (
                  <li
                    key={key}
                    className={`rounded-md border p-3 ${
                      r.result === "fail"
                        ? "border-danger-border bg-danger-bg"
                        : r.result === "pass"
                          ? "border-success-border bg-white"
                          : "border-ink-200 bg-white"
                    }`}
                  >
                    <p className="text-[13.5px] text-ink-900">
                      <span className="mr-1.5 font-mono text-[11.5px] text-ink-400">{si + 1}</span>
                      {s.kind === "safety" && (
                        <span className="mr-1.5 rounded bg-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-warning">
                          SAFETY
                        </span>
                      )}
                      {s.action}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-600">{s.expect}</p>
                    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { v: "pass", label: "Pass", icon: Check, on: "bg-success text-white" },
                          { v: "fail", label: "Fail", icon: X, on: "bg-danger text-white" },
                          { v: "na", label: "N/A", icon: Minus, on: "bg-ink-700 text-white" },
                        ] as const
                      ).map((b) => {
                        const Icon = b.icon;
                        const on = r.result === b.v;
                        return (
                          <button
                            key={b.v}
                            type="button"
                            disabled={signed}
                            onClick={() => setVerdict(key, b.v)}
                            className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium transition-colors disabled:opacity-70 ${
                              on
                                ? `${b.on} border-transparent`
                                : "border-ink-200 bg-white text-ink-700 hover:border-ink-400"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                    {(r.result === "fail" || r.note) && (
                      <input
                        value={r.note ?? ""}
                        onChange={(e) => setNote(key, e.target.value)}
                        readOnly={signed}
                        placeholder="What was seen"
                        aria-label="What was seen"
                        className="mt-2 h-9 w-full rounded-md border border-ink-200 bg-white px-2.5 text-[13px] text-ink-900 outline-none focus:border-ink-500"
                      />
                    )}
                    {!r.note && r.result !== "fail" && !signed && (
                      <button
                        type="button"
                        onClick={() => setNote(key, " ")}
                        className="mt-1.5 text-[12px] text-ink-400 hover:text-ink-700"
                      >
                        Add a note
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        {run.plan.not_covered && run.plan.not_covered.length > 0 && (
          <section className="mb-6 rounded-md border border-ink-200 bg-ink-50 p-3">
            <p className="text-[12.5px] font-medium text-ink-700">Not covered by these steps</p>
            <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink-600">
              {run.plan.not_covered.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-6">
          <label htmlFor="run-notes" className="mb-1 block text-[13px] font-medium text-ink-900">
            Notes for the record
          </label>
          <textarea
            id="run-notes"
            value={notes}
            onChange={(e) => editNotes(e.target.value)}
            readOnly={signed}
            rows={3}
            placeholder="Anything the steps do not say: who was present, what was changed on the day, what is still open."
            className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13.5px] text-ink-900 outline-none focus:border-ink-500"
          />
        </section>

        <section className="rounded-md border border-ink-200 bg-white p-4">
          <h2 className="text-[14px] font-semibold text-ink-900">Sign off</h2>
          {signed ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-ink-600">
                Signed by {run.signedBy ?? signer}
                {(run.signedRole ?? role) ? `, ${run.signedRole ?? role}` : ""}
                {run.signedAt ? ` on ${new Date(run.signedAt).toLocaleDateString()}` : ""}.
              </p>
              <button
                type="button"
                onClick={reopen}
                className="text-[12.5px] text-ink-500 underline-offset-2 hover:underline"
              >
                Reopen
              </button>
            </div>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={signer}
                onChange={(e) => setSigner(e.target.value)}
                placeholder="Name"
                aria-label="Signed by"
                className="h-10 rounded-md border border-ink-200 bg-white px-3 text-[13.5px] outline-none focus:border-ink-500"
              />
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Role, for example commissioning engineer"
                aria-label="Role"
                className="h-10 rounded-md border border-ink-200 bg-white px-3 text-[13.5px] outline-none focus:border-ink-500"
              />
              <button
                type="button"
                onClick={signOff}
                disabled={!signer.trim() || saving}
                className="h-10 rounded-md bg-ink-900 px-4 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Sign off
              </button>
            </div>
          )}
          <p className="mt-2 text-[12px] text-ink-500">
            Signing closes the run. The signature and the time go into the audit log.
          </p>

          <div className="mt-4 border-t border-ink-100 pt-3">
            {run.documentId ? (
              <Link
                href={`/studio/documents/${run.documentId}`}
                className="flex items-center gap-1.5 text-[13px] text-teal-700 hover:underline"
              >
                <FileText className="h-3.5 w-3.5" />
                Open the record document
              </Link>
            ) : (
              <button
                type="button"
                onClick={writeRecord}
                className="flex items-center gap-1.5 rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
              >
                <FileText className="h-3.5 w-3.5" />
                Write the record as a document
              </button>
            )}
            <p className="mt-1 text-[12px] text-ink-500">
              A document of this project, with the letterhead, that can be shared and exported.
              {signed ? " It opens as approved." : " Sign off first and it opens as approved."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
