"use client";

import ScopePicker from "@/components/studio/scope-picker";
import { ALL_SLUGS, presetFor } from "@/lib/platform/scope";
import type { ProjectBrief } from "@ladx/documents";
import { briefProgress } from "@ladx/documents";
import { Check, FileText, Loader2, PencilRuler, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface SummaryFields {
  deliverables: string[] | null;
  name: string;
  code: string | null;
  site: string | null;
  description: string | null;
  clientId: string | null;
}

/**
 * The project's own details, editable in place.
 *
 * Every other phase produces documents. This one is the project: the fields
 * every document is written from, and the client every one of them is
 * addressed to. Before this existed a project's name and number were set once
 * in the creation dialog and then unreachable, which is not how a real job goes:
 * the client renames it, the number changes when it is booked properly, the
 * site turns out to be the other plant.
 *
 * Saved explicitly rather than on every keystroke. A project number is on
 * document letterheads that have been sent to a client, and a half-typed one
 * autosaving into them is worse than the extra click.
 */
export default function ProjectSummary({
  projectId,
  fields,
  clients,
  brief,
  counts,
}: {
  projectId: string;
  fields: SummaryFields;
  clients: { id: string; name: string }[];
  brief: ProjectBrief;
  /** What this project already holds, so the summary is a way in to all of it. */
  counts: { documents: number; drawings: number; programs: number };
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<SummaryFields>(fields);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [scope, setScope] = useState<string[]>(fields.deliverables ?? ALL_SLUGS);
  const [savingScope, setSavingScope] = useState(false);
  const [scopeSaved, setScopeSaved] = useState<string | null>(null);

  const scopeCount = scope.length;
  const scopePreset = presetFor(scope);
  const original = fields.deliverables ?? ALL_SLUGS;
  const scopeDirty = scope.length !== original.length || scope.some((sl) => !original.includes(sl));

  /**
   * Save the scope, then bring the plan in line with it.
   *
   * Two calls rather than one, because they are two different things: the
   * project's scope is a fact about the engagement, and the plan is work
   * derived from it. Syncing is additive, so widening the scope adds the
   * deliverables it now owes and narrowing it deletes nothing.
   */
  async function saveScope() {
    setSavingScope(true);
    setScopeSaved(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverables: scope }),
      });
      if (!res.ok) return;
      const sync = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true }),
      });
      const added = sync.ok ? ((await sync.json()) as { added: number }).added : 0;
      setScopeSaved(added === 0 ? "none" : `${added} task${added === 1 ? "" : "s"}`);
      router.refresh();
      setTimeout(() => setScopeSaved(null), 6000);
    } finally {
      setSavingScope(false);
    }
  }

  const dirty =
    draft.name !== fields.name ||
    (draft.code ?? "") !== (fields.code ?? "") ||
    (draft.site ?? "") !== (fields.site ?? "") ||
    (draft.description ?? "") !== (fields.description ?? "") ||
    (draft.clientId ?? "") !== (fields.clientId ?? "");

  async function save() {
    if (!draft.name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          code: draft.code?.trim() ?? "",
          site: draft.site?.trim() ?? "",
          description: draft.description ?? "",
          clientId: draft.clientId || null,
        }),
      });
      if (res.ok) {
        setSaved(true);
        // Everything downstream reads these: the sidebar, the title blocks, the
        // letterheads on every generated document.
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  const { filled, total } = briefProgress(brief);

  return (
    <section className="rounded-md border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-ink-50/60 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-bold text-ink-900">Project details</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-500">
            What goes on every letterhead, every title block and every document number.
          </p>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-[12.5px] text-teal-700">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || !draft.name.trim()}
          className="flex items-center gap-1.5 rounded-md bg-ink-900 px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save changes
        </button>
      </header>

      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <Field label="Project name" required>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            maxLength={200}
            className={input}
          />
        </Field>
        <Field label="Project number" hint="The stem of every document number.">
          <input
            value={draft.code ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            maxLength={40}
            placeholder="LX-2601"
            className={input}
          />
        </Field>
        <Field label="Client" hint="Who every document is addressed to.">
          <div className="flex gap-1.5">
            <select
              value={draft.clientId ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, clientId: e.target.value || null }))}
              className={`${input} bg-white`}
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Link
              href="/studio/clients/new"
              title="Add a client"
              className="flex shrink-0 items-center rounded-md border border-ink-200 px-2.5 text-[12.5px] text-ink-600 transition-colors hover:border-ink-400"
            >
              <Users className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Field>
        <Field label="Site" hint="Printed under the client on documents.">
          <input
            value={draft.site ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, site: e.target.value }))}
            maxLength={200}
            placeholder="Wakefield, packing hall"
            className={input}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description" hint="One or two lines, for anybody opening this cold.">
            <textarea
              value={draft.description ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={2}
              className={input}
            />
          </Field>
        </div>
      </div>

      {/* Scope. Its own section with its own action, because changing it can
          add work to the plan and that should be a deliberate press rather
          than a side effect of saving a project number. */}
      <section className="border-t border-ink-100 px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-[13.5px] font-bold text-ink-900">Scope of work</h3>
          <p className="text-[12.5px] text-ink-500">
            What this project owes. The plan is built from it.
          </p>
          <span className="ml-auto font-mono text-[11px] text-ink-400">
            {scopeCount} of {ALL_SLUGS.length}
            {scopePreset ? ` · ${scopePreset.name}` : " · custom"}
          </span>
        </div>

        <div className="mt-3">
          <ScopePicker value={scope} onChange={setScope} />
        </div>

        {scopeDirty && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveScope}
              disabled={savingScope}
              className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {savingScope && <Loader2 className="h-3 w-3 animate-spin" />}
              Save scope
            </button>
            <span className="text-[12px] text-ink-500">
              Deliverables you add are put into the plan. Nothing is removed from it: work already
              under way is not deleted by a checkbox.
            </span>
          </div>
        )}
        {scopeSaved && (
          <p className="mt-2 text-[12.5px] text-teal-700">
            {scopeSaved === "none"
              ? "Scope saved. The plan already had everything it owes."
              : `Scope saved, and ${scopeSaved} added to the plan.`}
          </p>
        )}
      </section>

      {/* Everything this project already holds, as a way in. */}
      <div className="grid gap-px border-t border-ink-100 bg-ink-100 sm:grid-cols-4">
        <Stat
          href={`/studio/projects/${projectId}?phase=requirements`}
          icon={Check}
          value={`${filled} of ${total}`}
          label="Design basis answered"
        />
        <Stat
          href={`/studio/projects/${projectId}#documents`}
          icon={FileText}
          value={String(counts.documents)}
          label={counts.documents === 1 ? "document" : "documents"}
        />
        <Stat
          href="/studio/cad"
          icon={PencilRuler}
          value={String(counts.drawings)}
          label={counts.drawings === 1 ? "drawing" : "drawings"}
        />
        <Stat
          href="/studio/ladder"
          icon={Check}
          value={String(counts.programs)}
          label={counts.programs === 1 ? "program" : "programs"}
        />
      </div>
    </section>
  );
}

const input =
  "w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[13.5px] outline-none placeholder:text-ink-300 focus:border-ink-500";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  // A div rather than a label wrapping the control: one of these holds a select
  // and a link side by side, and a label that wraps two focusable things sends
  // a click to whichever the browser decides.
  return (
    <div>
      <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>
      {hint && <span className="mb-1 block text-[11.5px] leading-snug text-ink-400">{hint}</span>}
      <span className={hint ? "" : "mt-1 block"}>{children}</span>
    </div>
  );
}

function Stat({
  href,
  icon: Icon,
  value,
  label,
}: {
  href: string;
  icon: typeof Check;
  value: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 bg-white px-4 py-2.5 transition-colors hover:bg-ink-50"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-300" />
      <span className="min-w-0">
        <span className="block font-mono text-[13px] tabular-nums text-ink-900">{value}</span>
        <span className="block truncate text-[11px] text-ink-400">{label}</span>
      </span>
    </Link>
  );
}
