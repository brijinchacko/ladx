"use client";

import { AlertTriangle, Check, Info, Pencil, Plus, Ruler, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Scope = "user" | "company" | "project";
type Kind = "convention" | "approved" | "forbidden" | "note";

interface Row {
  id: string;
  scope: Scope;
  kind: Kind;
  projectId: string | null;
  content: string;
  reason: string | null;
  author: string;
  createdAt: string;
}

/**
 * The kinds, in the order they matter.
 *
 * Forbidden first, because it is the one that stops something and the one
 * somebody scanning the list needs to see. It is not the opposite end of a
 * scale from approved: the two are never weighed against each other.
 */
const KINDS: { id: Kind; label: string; help: string }[] = [
  {
    id: "forbidden",
    label: "Never do this",
    help: "A veto. LADX will not suggest it, whatever else applies.",
  },
  { id: "approved", label: "Use this", help: "The block, pattern or approach to reach for." },
  { id: "convention", label: "How things are named", help: "Naming, numbering, arrangement." },
  { id: "note", label: "Worth knowing", help: "A fact to carry, not a rule." },
];

const SCOPES: { id: Scope; label: string; help: string }[] = [
  { id: "project", label: "This project", help: "Beats the company rule where they disagree." },
  { id: "company", label: "Every project", help: "Your standard across all work." },
  { id: "user", label: "Just me", help: "A personal preference." },
];

const KIND_STYLE: Record<Kind, string> = {
  forbidden: "border-danger-border bg-danger-bg text-danger",
  approved: "border-teal-300 bg-teal-50 text-teal-800",
  convention: "border-ink-200 bg-ink-50 text-ink-600",
  note: "border-ink-200 bg-white text-ink-500",
};

export function StandardsClient({ projects }: { projects: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not read your standards.");
      setRows(
        (body.memories as Record<string, unknown>[]).map((m) => ({
          id: String(m.id),
          scope: m.scope as Scope,
          kind: m.kind as Kind,
          projectId: (m.projectId as string | null) ?? null,
          content: String(m.content),
          reason: (m.reason as string | null) ?? null,
          author: String(m.author),
          createdAt: String(m.createdAt),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read your standards.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("That could not be removed.");
      return;
    }
    await load();
  };

  const nameOf = (id: string | null) =>
    id ? (projects.find((p) => p.id === id)?.name ?? "a project that is gone") : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-6">
      {error && (
        <p className="mb-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="mb-5 flex items-center justify-between">
        <p className="text-[13px] text-ink-500">
          {rows === null
            ? "Loading…"
            : rows.length === 0
              ? "Nothing written down yet."
              : `${rows.length} written down`}
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className="flex h-8 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Write one down
        </button>
      </div>

      {(adding || editing) && (
        <Editor
          projects={projects}
          existing={editing}
          onDone={async () => {
            setAdding(false);
            setEditing(null);
            await load();
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}

      {rows !== null && rows.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-ink-200 px-6 py-10 text-center">
          <Ruler className="mx-auto mb-3 h-5 w-5 text-ink-400" />
          <p className="text-[13.5px] text-ink-600">
            Tell LADX how work is done here and it will follow it.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-ink-500">
            Which motor block to use, that nobody writes SET/RESET for a motor command, how
            conveyors are numbered on this site. Anything you would otherwise have to say again on
            the next job.
          </p>
        </div>
      )}

      <ul className="space-y-2.5">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="rounded-lg border border-ink-100 p-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[r.kind]}`}
              >
                {KINDS.find((k) => k.id === r.kind)?.label ?? r.kind}
              </span>
              <span className="text-[11.5px] text-ink-400">
                {r.scope === "project"
                  ? (nameOf(r.projectId) ?? "this project")
                  : r.scope === "company"
                    ? "every project"
                    : "just you"}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditing(r);
                  }}
                  aria-label="Reword this"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  aria-label="Remove this"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink-900">{r.content}</p>
            {r.reason && (
              <p className="mt-1 flex gap-1.5 text-[12.5px] leading-relaxed text-ink-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                {r.reason}
              </p>
            )}
            <p className="mt-2 text-[11px] text-ink-400">
              {r.author} · {new Date(r.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Writing one down, or rewording one.
 *
 * Rewording does not offer the scope, because an edit inherits it. Letting
 * somebody change "this project" to "every project" through an edit would
 * quietly widen a rule without it reading like a new decision.
 */
function Editor({
  projects,
  existing,
  onDone,
  onCancel,
}: {
  projects: { id: string; name: string }[];
  existing: Row | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "approved");
  const [scope, setScope] = useState<Scope>(existing?.scope ?? "company");
  const [projectId, setProjectId] = useState<string>(existing?.projectId ?? projects[0]?.id ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [reason, setReason] = useState(existing?.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      const res = existing
        ? await fetch(`/api/memories/${existing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ content, reason: reason || null, kind }),
          })
        : await fetch("/api/memories", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              scope,
              kind,
              projectId: scope === "project" ? projectId : null,
              content,
              reason: reason || null,
            }),
          });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "That could not be saved.");
      await onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const noProjects = scope === "project" && projects.length === 0;

  return (
    <div className="mb-5 rounded-lg border border-ink-200 bg-ink-50/40 p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            title={k.help}
            className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
              kind === k.id
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-400"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={2}
        placeholder={
          kind === "forbidden"
            ? "Never use SET/RESET for a motor command."
            : "Use FB_MotorStandard for every DOL motor."
        }
        className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-ink-500"
      />

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why, so it survives you (optional)"
        className="mt-2 w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink-500"
      />

      {!existing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              title={s.help}
              className={`rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
                scope === s.id
                  ? "border-teal-500 bg-teal-50 text-teal-800"
                  : "border-ink-200 bg-white text-ink-600 hover:border-ink-400"
              }`}
            >
              {s.label}
            </button>
          ))}
          {scope === "project" && projects.length > 0 && (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {existing && (
        <p className="mt-2 text-[11.5px] text-ink-500">
          Rewording keeps the original, so anything LADX suggested from it can still be explained.
          It stays on{" "}
          {existing.scope === "project"
            ? "this project"
            : existing.scope === "company"
              ? "every project"
              : "just you"}
          .
        </p>
      )}

      {noProjects && (
        <p className="mt-2 text-[12px] text-warning">
          You have no projects yet, so there is nothing to attach this to.
        </p>
      )}
      {problem && <p className="mt-2 text-[12.5px] text-danger">{problem}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || content.trim().length < 3 || noProjects}
          className="flex h-8 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? "Saving…" : existing ? "Reword it" : "Write it down"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-8 items-center gap-1.5 rounded-md border border-ink-200 px-3 text-[13px] text-ink-700 hover:bg-ink-50"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
        {kind === "forbidden" && (
          <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-danger">
            <AlertTriangle className="h-3.5 w-3.5" />A veto. Never weighed against anything.
          </span>
        )}
      </div>
    </div>
  );
}
