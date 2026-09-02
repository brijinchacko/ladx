"use client";

import {
  BRIEF_GROUPS,
  type BriefField,
  type BriefKey,
  type ProjectBrief,
  briefField,
  briefProgress,
} from "@ladx/documents";
import { Check, ChevronDown, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

/* ───────────────────────────── shared input ───────────────────────────── */

function Field({
  field,
  value,
  onChange,
  autoFocus,
}: {
  field: BriefField;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const id = `${useId()}${field.key}`;
  const shared =
    "w-full rounded-md border border-ink-200 px-2.5 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-ink-400 focus:border-ink-500";
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500"
      >
        {field.label}
      </label>
      <p className="mb-1.5 text-[12px] leading-snug text-ink-400">{field.hint}</p>
      {field.long ? (
        <textarea
          id={id}
          ref={autoFocus ? (el) => el?.focus() : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={field.placeholder}
          className={shared}
        />
      ) : (
        <input
          id={id}
          ref={autoFocus ? (el) => el?.focus() : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
          placeholder={field.placeholder}
          className={shared}
        />
      )}
    </div>
  );
}

async function saveBrief(projectId: string, patch: ProjectBrief): Promise<boolean> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief: patch }),
  });
  return res.ok;
}

/* ──────────────────────────── the main panel ──────────────────────────── */

/**
 * The design basis, on the project's own page.
 *
 * This is the project's main page in the sense that matters: it is the record
 * the whole job is written from. Every deliverable pulls its hardware summary,
 * its safety functions and its acceptance criteria from here, so the questions
 * are asked once, in one place, instead of being answered slightly differently
 * in each document.
 *
 * Grouped and edited a group at a time. Twenty-two fields presented as one long
 * form is a wall nobody fills in; seven short sections, each of which can be
 * finished in a minute between other work, is a thing that actually gets done.
 * Unanswered fields still show their prompt, so the page reads as a set of
 * questions rather than as a page of blanks.
 */
export default function ProjectBriefPanel({
  projectId,
  brief,
}: {
  projectId: string;
  brief: ProjectBrief;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectBrief>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Set<string>>(
    // Groups with nothing in them start open: they are the questions still to
    // be answered, and collapsing them would hide the whole point of the page.
    () =>
      new Set(BRIEF_GROUPS.filter((g) => g.fields.every((f) => !brief[f.key])).map((g) => g.id)),
  );

  const { filled, total } = briefProgress(brief);

  function startEdit(groupId: string) {
    const group = BRIEF_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const seed: ProjectBrief = {};
    for (const f of group.fields) seed[f.key] = brief[f.key] ?? "";
    setDraft(seed);
    setEditing(groupId);
    setOpen((s) => new Set(s).add(groupId));
  }

  async function commit() {
    setBusy(true);
    try {
      if (await saveBrief(projectId, draft)) {
        setEditing(null);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const firstGap = BRIEF_GROUPS.find((g) => g.fields.some((f) => !brief[f.key]));

  return (
    <section className="rounded-md border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-4 border-b border-ink-100 bg-ink-50 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-bold text-ink-900">Design basis</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">
            Answered once here, and read by every document this project produces.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-[11px] tabular-nums text-ink-500">
              {filled} of {total}
            </p>
            <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-ink-200">
              <div
                className="h-full rounded-full bg-teal-600 transition-all"
                style={{ width: `${Math.round((filled / total) * 100)}%` }}
              />
            </div>
          </div>
          {firstGap && !editing && (
            <button
              type="button"
              onClick={() => startEdit(firstGap.id)}
              className="rounded-md bg-ink-900 px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              {filled === 0 ? "Start" : "Fill the gaps"}
            </button>
          )}
        </div>
      </header>

      <div className="divide-y divide-ink-100">
        {BRIEF_GROUPS.map((group) => {
          const answered = group.fields.filter((f) => brief[f.key]?.trim()).length;
          const isEditing = editing === group.id;
          const isOpen = isEditing || open.has(group.id);

          return (
            <div key={group.id}>
              <div className="flex items-center gap-3 px-5 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setOpen((s) => {
                      const next = new Set(s);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${
                      isOpen ? "" : "-rotate-90"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block font-display text-[13.5px] font-bold text-ink-900">
                      {group.title}
                    </span>
                    <span className="block truncate text-[12px] text-ink-400">{group.blurb}</span>
                  </span>
                </button>

                <span
                  className={`shrink-0 font-mono text-[10.5px] tabular-nums ${
                    answered === group.fields.length ? "text-teal-700" : "text-ink-400"
                  }`}
                >
                  {answered === group.fields.length ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    `${answered}/${group.fields.length}`
                  )}
                </span>

                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => startEdit(group.id)}
                    aria-label={`Edit ${group.title}`}
                    className="shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="px-5 pb-5">
                  {isEditing ? (
                    <div className="space-y-4">
                      {group.fields.map((f, i) => (
                        <Field
                          key={f.key}
                          field={f}
                          value={draft[f.key] ?? ""}
                          onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                          autoFocus={i === 0}
                        />
                      ))}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={commit}
                          disabled={busy}
                          className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="text-[13px] text-ink-500 transition-colors hover:text-ink-900"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <dl className="space-y-3">
                      {group.fields.map((f) => {
                        const value = brief[f.key]?.trim();
                        return (
                          <div key={f.key}>
                            <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                              {f.label}
                            </dt>
                            <dd
                              className={`mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed ${
                                value ? "text-ink-800" : "text-ink-400"
                              }`}
                            >
                              {value ?? f.hint}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────── asked at the point of generating ───────────────────── */

/**
 * The questions a specific document needs answered.
 *
 * Shown when somebody creates a deliverable whose brief fields are still empty.
 * Asking here rather than on the project page is the difference between a form
 * and a conversation: the reason the question is being asked is on screen, it is
 * three fields rather than twenty-two, and the answer goes straight into the
 * document that needed it.
 *
 * Skippable, because sometimes you genuinely do want the empty structure to
 * start writing into, and a wizard that will not let you past is worse than a
 * document with a gap in it.
 */
export function BriefPrompt({
  documentTitle,
  keys,
  onCancel,
  onSubmit,
  busy,
}: {
  documentTitle: string;
  keys: BriefKey[];
  onCancel: () => void;
  onSubmit: (values: ProjectBrief) => void;
  busy: boolean;
}) {
  const fields = keys.map(briefField).filter((f): f is BriefField => Boolean(f));
  const [draft, setDraft] = useState<ProjectBrief>({});

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-md border border-ink-200 bg-white">
        <header className="border-b border-ink-100 bg-ink-50 px-5 py-3.5">
          <h2 className="font-display text-[15px] font-bold text-ink-900">
            Before we write the {documentTitle}
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">
            {fields.length === 1 ? "One detail" : `${fields.length} details`} this document is
            written from. Saved to the project, so nothing asks again.
          </p>
        </header>

        <div className="space-y-4 px-5 py-4">
          {fields.map((f, i) => (
            <Field
              key={f.key}
              field={f}
              value={draft[f.key] ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
              autoFocus={i === 0}
            />
          ))}
        </div>

        <footer className="flex items-center gap-3 border-t border-ink-100 px-5 py-3.5">
          <button
            type="button"
            onClick={() => onSubmit(draft)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "Creating…" : "Save and create"}
          </button>
          <button
            type="button"
            onClick={() => onSubmit({})}
            disabled={busy}
            className="text-[13px] text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="ml-auto text-[13px] text-ink-400 transition-colors hover:text-ink-900 disabled:opacity-50"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
