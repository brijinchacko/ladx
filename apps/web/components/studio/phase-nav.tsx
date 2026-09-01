"use client";

import { Check, Circle } from "lucide-react";
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
 * The lifecycle, pinned to the top of the project.
 *
 * It is navigation, not a wizard. Real projects overlap and double back, so
 * every phase is reachable at any time and looking at one is separate from the
 * project being in it: peeking at what the FAT needs must not move the project
 * into factory test.
 *
 * Sticky, and deliberately small. It is the thing you steer with, so it has to
 * be there after scrolling past the design basis; and it is not the content, so
 * it has to cost one line. A single row of names with a rule under the one you
 * are reading, a filled dot on the phase the project is actually in, and a tick
 * where every deliverable has been started. Nothing else earns the height.
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
    <div className="sticky top-0 z-20 -mx-8 border-b border-ink-100 bg-white/95 px-8 backdrop-blur">
      <nav className="flex items-stretch gap-0.5 overflow-x-auto">
        {phases.map((p) => {
          const isViewing = p.id === viewing;
          const isCurrent = p.id === current;
          const done = (p.step ?? 0) < currentStep;
          const complete = p.deliverableCount > 0 && p.startedCount >= p.deliverableCount;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/studio/projects/${projectId}?phase=${p.id}`)}
              aria-current={isViewing ? "step" : undefined}
              title={p.purpose}
              className={`group flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-[12.5px] transition-colors ${
                isViewing
                  ? "border-teal-600 text-ink-900"
                  : "border-transparent text-ink-400 hover:border-ink-200 hover:text-ink-700"
              }`}
            >
              {isCurrent ? (
                <Circle
                  className="h-2 w-2 shrink-0 text-teal-600"
                  fill="currentColor"
                  aria-label="the project is here"
                />
              ) : complete ? (
                <Check className="h-2.5 w-2.5 shrink-0 text-teal-600" />
              ) : (
                <span
                  className={`font-mono text-[9.5px] tabular-nums ${
                    done ? "text-ink-400" : "text-ink-400"
                  }`}
                >
                  {p.step === 0 ? "·" : p.step}
                </span>
              )}
              <span className={isViewing || isCurrent ? "font-medium" : ""}>{p.name}</span>
              {p.deliverableCount > 0 && (
                <span className="font-mono text-[9.5px] tabular-nums text-ink-400">
                  {p.startedCount}/{p.deliverableCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Looking at a phase the project is not in: offer to move it, rather
            than moving it silently because somebody clicked to look. Inline in
            the bar, so the row still costs one line. */}
        {viewing !== current && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setProjectPhase(viewing)}
            className="my-1 ml-auto shrink-0 self-center rounded-md border border-ink-200 px-2.5 py-1 font-mono text-[10.5px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900 disabled:opacity-50"
          >
            {busy ? "Moving…" : "Move project here"}
          </button>
        )}
      </nav>
    </div>
  );
}
