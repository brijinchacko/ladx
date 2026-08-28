"use client";

import LadderAi from "@/components/studio/ladder-ai";
import LadderHome, { type LadderProgramRow } from "@/components/studio/ladder-home";
import { LadxStudio, httpStorage } from "@ladx/studio";
import { ChevronLeft, FolderKanban, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface LadderProject {
  id: string;
  name: string;
}

const SCRATCH = "scratch";

/**
 * The ladder tool.
 *
 * Opens on a home screen rather than straight into a blank grid, because a
 * blank grid teaches nothing and the commonest reason to be here is to get back
 * to something. Choosing a project first also settles the question the editor
 * cannot answer for itself: which program is being worked on, and therefore
 * which one Monitor will run and Convert will read.
 *
 * Focus mode hides everything but the editor, including the application's own
 * sidebar. A rung is read left to right across its whole width, and on a laptop
 * the chrome either side is the difference between a readable network and a
 * scrolling one.
 */
export default function LadderClient({
  projects,
  programs,
  initialProjectId,
}: {
  projects: LadderProject[];
  programs: LadderProgramRow[];
  /**
   * A project named in the URL, from a "Open in Ladder" link on a project page.
   * Arriving with one skips the home screen: the caller has already answered
   * the only question it asks.
   */
  initialProjectId?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(initialProjectId ?? null);
  const [focus, setFocus] = useState(false);

  // Escape leaves focus mode, which is where a hand goes on a screen with
  // nothing else on it.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  if (!open) {
    return (
      <LadderHome
        programs={programs}
        projects={projects}
        onOpen={(projectId) => setOpen(projectId)}
      />
    );
  }

  const storage = httpStorage(
    "/api/ladder",
    open === SCRATCH
      ? "Saved to your account, not to a project. Choose a project to file it against a job."
      : "Saved to this project. It is what Monitor runs and Convert reads.",
  );
  const projectName = projects.find((p) => p.id === open)?.name;

  return (
    <div
      className={
        focus ? "fixed inset-0 z-50 flex flex-col bg-white" : "flex min-h-0 flex-1 flex-col"
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(null)}
          className="flex items-center gap-1 text-[12.5px] text-ink-500 transition-colors hover:text-ink-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Programs
        </button>
        <span className="text-ink-200">|</span>
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <span className="text-[12.5px] text-ink-700">{projectName ?? "No project (scratch)"}</span>
        <span className="text-[11.5px] text-ink-400">Save from the File menu.</span>
        <button
          type="button"
          onClick={() => setFocus((f) => !f)}
          title={focus ? "Leave focus mode (Esc)" : "Focus mode: hide everything but the editor"}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-200 hover:text-ink-900"
        >
          {focus ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Remounted on change so the editor loads the chosen program. */}
      <div className="min-h-0 flex-1">
        <LadxStudio
          key={open}
          projectId={open}
          storage={storage}
          /*
           * The HMI for this same program.
           *
           * Resolved on the server rather than here: whether this project has
           * an application, and which one, is a database question, and the
           * answer changes in another tab. /studio/hmi/open goes straight in
           * when there is exactly one and to the list with this project
           * already chosen when there is not.
           */
          crossLinks={[
            {
              label: "HMI/SCADA",
              href: `/studio/hmi/open?project=${encodeURIComponent(open)}`,
              hint: "Build the operator screens for this program. They bind to the tag table you are editing here, so this saves first.",
            },
          ]}
          bottomDock={({ program, load }) => (
            <LadderAi
              memoryKey={`ladder:${open}`}
              getProgram={() => program}
              onProgram={(next) => load(next)}
            />
          )}
        />
      </div>
    </div>
  );
}
