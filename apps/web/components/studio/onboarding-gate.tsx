"use client";

import ProjectOnboarding from "@/components/studio/project-onboarding";
import type { ProjectBrief } from "@ladx/documents";
import { Wand2 } from "lucide-react";
import { useState } from "react";

/**
 * When the setup wizard appears, and how to get it back.
 *
 * Once, unasked, on a project that has never been set up. After that only when
 * somebody asks for it, from the button this also renders. The distinction is
 * the whole point: a wizard that reappears because the fields are still blank
 * is nagging, and the answer to "have you set this up" is a decision the user
 * made, not a property of the data.
 */
export default function OnboardingGate({
  projectId,
  projectName,
  brief,
  onboarded,
}: {
  projectId: string;
  projectName: string;
  brief: ProjectBrief;
  /** Whether the wizard has ever been closed, however it was closed. */
  onboarded: boolean;
}) {
  const [open, setOpen] = useState(!onboarded);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900"
      >
        <Wand2 className="h-3.5 w-3.5" />
        Setup
      </button>

      {open && (
        <ProjectOnboarding
          projectId={projectId}
          projectName={projectName}
          brief={brief}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
