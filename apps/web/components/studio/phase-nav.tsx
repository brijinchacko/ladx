"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface PhaseTab {
  id: string;
  step: number | null;
  name: string;
  purpose: string;
  deliverableCount: number;
  startedCount: number;
}

/**
 * The lifecycle, as navigation.
 *
 * The workspace previously showed only the phase the project was recorded as
 * being in, so looking ahead at what the FAT will need, or back at whether the
 * URS was ever finished, meant changing the project's phase to peek and then
 * changing it back. Every phase is reachable now, and viewing one is separate
 * from the project actually being in it.
 *
 * Real projects overlap and double back, so this is a view selector rather than
 * a wizard. The phase the project is *in* is marked, and moving it there is a
 * deliberate second action.
 */
export default function PhaseNav({
  projectId,
  phases,
  viewing,
  current,
}: {
  projectId: string;
  phases: PhaseTab[];
  /** The phase being looked at. */
  viewing: string;
  /** The phase the project is recorded as being in. */
  current: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const currentStep = phases.find((p) => p.id === current)?.step ?? 0;

  async function setProjectPhase(id: string) {
    setBusy(true);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: id }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <div>
      <ol className="flex flex-wrap gap-1">
        {phases.map((p) => {
          const isViewing = p.id === viewing;
          const isCurrent = p.id === current;
          const done = (p.step ?? 0) < currentStep;
          const complete = p.deliverableCount > 0 && p.startedCount >= p.deliverableCount;

          return (
            <li key={p.id} className="min-w-[7rem] flex-1">
              <button
                type="button"
                onClick={() => router.push(`/studio/projects/${projectId}?phase=${p.id}`)}
                aria-current={isViewing ? "step" : undefined}
                className={`w-full border-t-2 pb-1 pt-2 text-left transition-colors ${
                  isViewing
                    ? "border-teal-600"
                    : isCurrent
                      ? "border-ink-900"
                      : done
                        ? "border-ink-300"
                        : "border-ink-150 hover:border-ink-300"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`font-mono text-[10px] ${isViewing ? "text-teal-700" : "text-ink-400"}`}
                  >
                    {p.step}
                  </span>
                  {complete && <Check className="h-2.5 w-2.5 text-teal-600" />}
                  {isCurrent && (
                    <span className="ml-auto rounded-sm bg-ink-900 px-1 py-px font-mono text-[8.5px] uppercase tracking-[0.08em] text-white">
                      now
                    </span>
                  )}
                </span>
                <span
                  className={`mt-0.5 block text-[12.5px] font-medium ${
                    isViewing ? "text-ink-900" : done ? "text-ink-600" : "text-ink-400"
                  }`}
                >
                  {p.name}
                </span>
                {p.deliverableCount > 0 && (
                  <span className="mt-0.5 block font-mono text-[10px] text-ink-300">
                    {p.startedCount}/{p.deliverableCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {/* Looking at a phase the project is not in: offer to move it, rather
          than moving it silently because somebody clicked to look. */}
      {viewing !== current && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2">
          <p className="text-[12.5px] text-ink-600">
            You are viewing a phase this project is not in.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setProjectPhase(viewing)}
            className="rounded-md bg-ink-900 px-2.5 py-1 font-mono text-[11px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Moving…" : "Move project here"}
          </button>
        </div>
      )}
    </div>
  );
}
