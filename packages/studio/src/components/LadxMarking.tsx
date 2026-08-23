"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Hand,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LadxProgram } from "../lib/types";
import LadderPreview from "./LadderPreview";

/**
 * Marking ladder exercises.
 *
 * The marker sees three things side by side: the brief the student was given,
 * their own guidance on what a correct answer looks like, and the actual
 * ladder. Marking without the first two is guesswork, and two trainers marking
 * the same script would land in different places.
 */

const LIVE = "#35B6BB";

type QueueRow = {
  id: string;
  submittedAt: string;
  exerciseTitle: string;
  marks: number;
  studentName: string;
  batchName: string | null;
  admissionNumber: string | null;
  evaluatorName: string | null;
  mine: boolean;
  unclaimed: boolean;
  waitingDays: number;
};

type Answer = {
  id: string;
  status: string;
  submittedAt: string;
  program: LadxProgram;
  marksAwarded: number | null;
  feedback: string | null;
  studentName: string;
  batchName: string | null;
  exercise: {
    title: string;
    brief: string;
    guidance: string | null;
    marks: number;
    passPercent: number;
  };
};

export default function LadxMarking() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ladx-marking");
      if (!res.ok) return;
      const d = await res.json();
      setQueue(d.queue ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function open(id: string) {
    setError(null);
    setMsg(null);
    const res = await fetch(`/api/admin/ladx-marking/${id}`);
    if (!res.ok) return;
    const d: Answer = await res.json();
    setAnswer(d);
    setMarks(d.marksAwarded != null ? String(d.marksAwarded) : "");
    setFeedback(d.feedback ?? "");
  }

  async function claim(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/admin/ladx-marking/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      await loadQueue();
    } finally {
      setBusy(null);
    }
  }

  async function submitMark() {
    if (!answer) return;
    setBusy("mark");
    setError(null);
    try {
      const res = await fetch(`/api/admin/ladx-marking/${answer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marksAwarded: Number(marks), feedback }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Could not save that mark.");
        return;
      }
      setMsg(
        j.passed
          ? "Marked as a pass. The student has been notified."
          : "Marked. The student has been notified with your feedback.",
      );
      setAnswer(null);
      await loadQueue();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading the queue…
      </p>
    );
  }

  // ── Marking one answer ────────────────────────────────────────────────
  if (answer) {
    const pct =
      answer.exercise.marks > 0 && marks !== ""
        ? Math.round((Number(marks) / answer.exercise.marks) * 100)
        : null;
    const wouldPass = pct != null && pct >= answer.exercise.passPercent;

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setAnswer(null);
            loadQueue();
          }}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={15} /> Back to the queue
        </button>

        <div className="rounded-xl border border-white/[0.08] bg-surface px-4 py-3">
          <p className="text-[14px] font-bold text-text-primary">{answer.studentName}</p>
          <p className="text-[11.5px] text-text-muted">
            {answer.exercise.title}
            {answer.batchName && ` · ${answer.batchName}`}
            {" · submitted "}
            {new Date(answer.submittedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.08] bg-surface p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
              The brief they were given
            </p>
            <p className="text-[12.5px] text-text-secondary whitespace-pre-wrap leading-relaxed">
              {answer.exercise.brief}
            </p>
          </div>

          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "rgba(53,182,187,0.25)", background: "rgba(53,182,187,0.05)" }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
              style={{ color: LIVE }}
            >
              What a correct answer looks like
            </p>
            <p className="text-[12.5px] text-text-secondary whitespace-pre-wrap leading-relaxed">
              {answer.exercise.guidance || "No guidance was written for this exercise."}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">
            Their program
          </p>
          <LadderPreview program={answer.program} />
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-surface p-4 space-y-3">
          {error && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-red-300">
              <AlertTriangle size={13} /> {error}
            </p>
          )}

          <div className="flex items-end gap-3 flex-wrap">
            <label className="w-32">
              <span className="block text-[11px] font-semibold text-text-muted mb-1">
                Marks (0–{answer.exercise.marks})
              </span>
              <input
                type="number"
                min={0}
                max={answer.exercise.marks}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                className="w-full h-9 px-2.5 rounded-lg bg-dark-primary border border-white/10 text-[13px] text-text-primary"
              />
            </label>
            {pct != null && (
              <span
                className={`text-[12.5px] font-semibold pb-2 ${
                  wouldPass ? "text-neon-green" : "text-amber-300"
                }`}
              >
                {pct}% —{" "}
                {wouldPass ? "pass" : `below the ${answer.exercise.passPercent}% pass mark`}
              </span>
            )}
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold text-text-muted mb-1">
              Feedback for the student
            </span>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="What was right, what was missing, and what to try next."
              className="w-full px-3 py-2 rounded-lg bg-dark-primary border border-white/10 text-[13px] text-text-primary placeholder:text-text-muted resize-none"
            />
          </label>

          <button
            type="button"
            onClick={submitMark}
            disabled={busy !== null || marks === "" || !feedback.trim()}
            className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13px] font-bold text-[#08201f] disabled:opacity-40"
            style={{ background: LIVE }}
          >
            {busy === "mark" && <Loader2 size={13} className="animate-spin" />}
            Save mark & notify
          </button>
        </div>
      </div>
    );
  }

  // ── Queue ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {msg && (
        <p className="flex items-center gap-1.5 text-[13px] text-neon-green">
          <CheckCircle2 size={13} /> {msg}
        </p>
      )}

      {queue.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-surface px-5 py-10 text-center">
          <ClipboardCheck size={22} className="mx-auto mb-2 text-text-muted/50" />
          <p className="text-[13px] text-text-secondary">Nothing waiting to be marked.</p>
          <p className="text-[11.5px] text-text-muted mt-1">
            You are notified as soon as a student submits an exercise.
          </p>
        </div>
      ) : (
        queue.map((r) => (
          <div
            key={r.id}
            className={`rounded-xl border bg-surface p-4 ${
              r.waitingDays >= 3 ? "border-amber-500/30" : "border-white/[0.08]"
            }`}
          >
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-text-primary">
                  {r.studentName}
                  {r.mine && (
                    <span
                      className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(53,182,187,0.15)", color: LIVE }}
                    >
                      Yours
                    </span>
                  )}
                  {r.unclaimed && (
                    <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                      Unclaimed
                    </span>
                  )}
                </p>
                <p className="text-[11.5px] text-text-muted mt-0.5">
                  {r.exerciseTitle} · {r.marks} marks
                  {r.batchName && ` · ${r.batchName}`}
                </p>
                <p
                  className={`mt-1 flex items-center gap-1 text-[11.5px] ${
                    r.waitingDays >= 3 ? "text-amber-300" : "text-text-muted"
                  }`}
                >
                  <Clock size={11} />
                  {r.waitingDays === 0
                    ? "Submitted today"
                    : `Waiting ${r.waitingDays} day${r.waitingDays === 1 ? "" : "s"}`}
                  {r.evaluatorName && !r.mine && ` · with ${r.evaluatorName}`}
                </p>
              </div>

              <div className="flex gap-1.5 shrink-0">
                {r.unclaimed && (
                  <button
                    type="button"
                    onClick={() => claim(r.id)}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-white/[0.12] text-[12px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
                  >
                    <Hand size={12} /> Claim
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => open(r.id)}
                  className="px-3.5 h-8 rounded-lg text-[12.5px] font-bold text-[#08201f]"
                  style={{ background: LIVE }}
                >
                  Mark it
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
