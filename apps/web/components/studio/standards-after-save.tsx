"use client";

import { PROGRAM_SAVED } from "@ladx/studio";
import { CircleCheck, Ruler } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface SavedDetail {
  projectId?: string;
  standards?: { deviations: number; items: unknown[] } | null;
}

/**
 * What the last save found against the company's standards.
 *
 * The save route runs the deviations check on every program it stores and
 * says what it found; this is where that lands, next to the program's name,
 * so a rule written down last month catches the rung written today rather
 * than waiting for somebody to open Commissioning and ask. It says nothing
 * until a save has happened, and nothing at all when the checker could not
 * read the program, because "0 deviations" would be a lie in that case.
 */
export function StandardsAfterSave({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<{ deviations: number } | null>(null);

  useEffect(() => {
    const onSaved = (e: Event) => {
      const detail = (e as CustomEvent<SavedDetail>).detail;
      if (detail?.projectId !== projectId) return;
      setResult(detail.standards ? { deviations: detail.standards.deviations } : null);
    };
    window.addEventListener(PROGRAM_SAVED, onSaved);
    return () => window.removeEventListener(PROGRAM_SAVED, onSaved);
  }, [projectId]);

  if (!result) return null;

  if (result.deviations === 0) {
    return (
      <span className="flex items-center gap-1 text-[11.5px] text-success">
        <CircleCheck className="h-3 w-3" />
        Meets your standards
      </span>
    );
  }

  return (
    <Link
      href={`/studio/commission?project=${projectId}`}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-warning transition-colors hover:bg-warning-bg"
      title="Open Commissioning to see each one"
    >
      <Ruler className="h-3 w-3" />
      {result.deviations} deviation{result.deviations === 1 ? "" : "s"} from your standards
    </Link>
  );
}
