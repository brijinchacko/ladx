"use client";

import { PHASES } from "@/lib/platform/lifecycle";
import { ALL_SLUGS, SCOPE_PRESETS, presetFor } from "@/lib/platform/scope";
import { getTemplate } from "@ladx/documents";
import { Check } from "lucide-react";

/**
 * What the project is being paid to produce.
 *
 * Presets first, because most jobs are one of four shapes and nobody wants to
 * tick seventeen boxes to say "programming only". The full list is underneath
 * rather than behind a disclosure, so the preset is visibly a selection of real
 * documents rather than a category whose contents you have to trust.
 *
 * The same control is used when a project is created and whenever it is edited
 * afterwards, so what you agreed to at the start is the thing you change later
 * rather than a different screen that happens to write the same field.
 */
export default function ScopePicker({
  value,
  onChange,
  compact = false,
}: {
  /** Selected slugs. Null means the whole lifecycle. */
  value: string[] | null;
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  const selected = new Set(value ?? ALL_SLUGS);
  const active = presetFor(value);

  const toggle = (slug: string) => {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    // Emitted in lifecycle order, never in click order, so a stored scope is
    // comparable and reads the way the project runs.
    onChange(ALL_SLUGS.filter((s) => next.has(s)));
  };

  return (
    <div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {SCOPE_PRESETS.map((p) => {
          const on = active?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.slugs)}
              className={`rounded-md border p-2.5 text-left transition-colors ${
                on
                  ? "border-teal-500 bg-teal-50/50"
                  : "border-ink-200 bg-white hover:border-ink-400"
              }`}
            >
              <span className="flex items-baseline gap-1.5">
                {on && <Check className="h-3 w-3 shrink-0 self-center text-teal-600" />}
                <span className="text-[13px] font-medium text-ink-900">{p.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-ink-400">
                  {p.slugs.length}
                </span>
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500">
                {p.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
            {selected.size} of {ALL_SLUGS.length} deliverables
            {active ? "" : " · custom"}
          </p>
          <div className="space-y-2">
            {PHASES.filter((p) => p.deliverables.length > 0).map((phase) => (
              <div key={phase.id}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
                  {phase.name}
                </p>
                <div className="flex flex-wrap gap-1">
                  {phase.deliverables.map((slug) => {
                    const t = getTemplate(slug);
                    const on = selected.has(slug);
                    return (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => toggle(slug)}
                        title={t?.title ?? slug}
                        className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors ${
                          on
                            ? "border-teal-300 bg-teal-50 text-teal-800"
                            : "border-ink-200 bg-white text-ink-400 hover:border-ink-400"
                        }`}
                      >
                        {t?.abbr ?? slug}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
