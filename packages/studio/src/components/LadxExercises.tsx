"use client";

import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * Writing ladder exercises.
 *
 * The guidance field is the one that matters. A brief tells the student what to
 * build; the guidance tells whoever marks it what a correct answer contains,
 * which is what stops two trainers grading the same work differently.
 */

const LIVE = "rgb(var(--teal-500))";

type Row = {
  id: string;
  title: string;
  platform: string | null;
  phaseNumber: number | null;
  marks: number;
  isPublished: boolean;
  submissionCount: number;
};

type Draft = {
  id?: string;
  title: string;
  brief: string;
  guidance: string;
  platform: string;
  phaseNumber: string;
  marks: string;
  isPublished: boolean;
};

const BLANK: Draft = {
  title: "",
  brief: "",
  guidance: "",
  platform: "",
  phaseNumber: "",
  marks: "20",
  isPublished: false,
};

export default function LadxExercises({
  /**
   * Where "answers waiting to be marked" goes. A prop rather than a hardcoded
   * route, because Studio ships to more than one host and only one of them
   * happens to keep marking at /admin/ladx-marking.
   */
  markingHref = "/admin/ladx-marking",
}: {
  markingHref?: string;
} = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [platforms, setPlatforms] = useState<{ key: string; label: string }[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ladx-exercises");
      if (!res.ok) return;
      const d = await res.json();
      setRows(d.exercises ?? []);
      setPlatforms(d.platforms ?? []);
      setWaiting(d.waiting ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openEdit(id: string) {
    const res = await fetch(`/api/admin/ladx-exercises/${id}`);
    if (!res.ok) return;
    const d = await res.json();
    setDraft({
      id: d.id,
      title: d.title,
      brief: d.brief,
      guidance: d.guidance ?? "",
      platform: d.platform ?? "",
      phaseNumber: d.phaseNumber?.toString() ?? "",
      marks: String(d.marks),
      isPublished: d.isPublished,
    });
  }

  async function save(publish?: boolean) {
    if (!draft) return;
    setBusy("save");
    setError(null);
    try {
      const payload = {
        title: draft.title,
        brief: draft.brief,
        guidance: draft.guidance,
        platform: draft.platform || null,
        phaseNumber: draft.phaseNumber === "" ? null : Number(draft.phaseNumber),
        marks: Number(draft.marks),
        ...(publish !== undefined ? { isPublished: publish } : {}),
      };
      const res = draft.id
        ? await fetch(`/api/admin/ladx-exercises/${draft.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/ladx-exercises", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Could not save.");
        return;
      }
      setMsg(publish ? "Published, students can see it now." : "Saved.");
      setDraft(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function togglePublish(r: Row) {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/admin/ladx-exercises/${r.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !r.isPublished }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Could not change that.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: Row) {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/admin/ladx-exercises/${r.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Could not delete that.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </p>
    );
  }

  const field =
    "w-full h-9 px-2.5 rounded-lg bg-dark-primary border border-white text-[13px] text-text-primary placeholder:text-text-muted";

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-danger">
          <AlertTriangle size={13} /> {error}
        </p>
      )}
      {msg && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-neon-green">
          <CheckCircle2 size={13} /> {msg}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setDraft({ ...BLANK })}
          className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12.5px] font-bold text-on-accent"
          style={{ background: LIVE }}
        >
          <Plus size={12} /> New exercise
        </button>
        {waiting > 0 && (
          <a
            href={markingHref}
            className="text-[12.5px] font-semibold text-warning hover:underline"
          >
            {waiting} answer{waiting === 1 ? "" : "s"} waiting to be marked →
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-white/[0.08] bg-surface px-5 py-8 text-center">
          <p className="text-[13px] text-text-secondary">No exercises yet.</p>
          <p className="text-[11.5px] text-text-muted mt-1">
            Write one and publish it, students see it in LADX Mini.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-surface px-4 py-3 flex-wrap"
            >
              <button
                type="button"
                onClick={() => openEdit(r.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block text-[13.5px] font-semibold text-text-primary truncate">
                  {r.title}
                </span>
                <span className="block text-[11px] text-text-muted">
                  {r.marks} marks
                  {r.phaseNumber != null && ` · Phase ${r.phaseNumber}`}
                  {r.platform &&
                    ` · ${platforms.find((p) => p.key === r.platform)?.label ?? r.platform}`}
                  {r.submissionCount > 0 && ` · ${r.submissionCount} answered`}
                </span>
              </button>

              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                  r.isPublished ? "bg-success-bg text-success" : "bg-white/[0.06] text-text-muted"
                }`}
              >
                {r.isPublished ? "Live" : "Draft"}
              </span>

              <button
                type="button"
                onClick={() => togglePublish(r)}
                disabled={busy !== null}
                className="flex items-center gap-1 px-2.5 h-8 rounded-lg border border-white/[0.12] text-[11.5px] font-semibold text-text-secondary hover:text-text-primary shrink-0 disabled:opacity-50"
              >
                {r.isPublished ? <EyeOff size={11} /> : <Eye size={11} />}
                {r.isPublished ? "Unpublish" : "Publish"}
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
                disabled={busy !== null}
                className="text-text-muted hover:text-danger shrink-0"
                aria-label="Delete"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/[0.12] bg-dark-secondary p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-bold text-text-primary">
                {draft.id ? "Edit exercise" : "New exercise"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-text-muted mb-1">Title</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Motor start/stop with seal-in and E-Stop"
                  className={field}
                />
              </label>

              <div className="grid sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="block text-[11px] font-semibold text-text-muted mb-1">
                    Platform
                  </span>
                  <select
                    value={draft.platform}
                    onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                    className={field}
                  >
                    <option value="" className="bg-dark-secondary">
                      Any
                    </option>
                    {platforms.map((p) => (
                      <option key={p.key} value={p.key} className="bg-dark-secondary">
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-text-muted mb-1">
                    Phase
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={draft.phaseNumber}
                    onChange={(e) => setDraft({ ...draft, phaseNumber: e.target.value })}
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] font-semibold text-text-muted mb-1">
                    Marks
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={draft.marks}
                    onChange={(e) => setDraft({ ...draft, marks: e.target.value })}
                    className={field}
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-[11px] font-semibold text-text-muted mb-1">
                  The brief, what the student has to build
                </span>
                <textarea
                  value={draft.brief}
                  onChange={(e) => setDraft({ ...draft, brief: e.target.value })}
                  rows={4}
                  placeholder="Build a motor start/stop circuit. Start_PB is momentary. Stop_PB and EStop_OK are wired normally closed. The motor must stay running when Start is released."
                  className="w-full px-3 py-2 rounded-lg bg-dark-primary border border-white text-[13px] text-text-primary placeholder:text-text-muted resize-y"
                />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold mb-1" style={{ color: LIVE }}>
                  Marking guidance, what a correct answer contains
                </span>
                <textarea
                  value={draft.guidance}
                  onChange={(e) => setDraft({ ...draft, guidance: e.target.value })}
                  rows={4}
                  placeholder="Expect one rung: Start OR Motor (the seal-in branch), then Stop AND EStop in series, driving an OTE on Motor. Full marks need the seal-in as a parallel branch, not a second rung. Half marks if the stops are examined with XIO, that would mean the motor runs when the wire breaks."
                  className="w-full px-3 py-2 rounded-lg bg-dark-primary border border-white text-[13px] text-text-primary placeholder:text-text-muted resize-y"
                />
                <span className="block text-[10.5px] text-text-muted mt-1">
                  Only the marker sees this, never the student.
                </span>
              </label>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => save()}
                disabled={busy !== null}
                className="px-4 h-9 rounded-lg border border-white/[0.12] text-[13px] font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : "Save as draft"}
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13px] font-bold text-on-accent disabled:opacity-50"
                style={{ background: LIVE }}
              >
                {busy === "save" && <Loader2 size={13} className="animate-spin" />}
                Save & publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
