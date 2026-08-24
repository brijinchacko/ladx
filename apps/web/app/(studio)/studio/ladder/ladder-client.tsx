"use client";

import LadderAi from "@/components/studio/ladder-ai";
import { LadxStudio, httpStorage } from "@ladx/studio";
import { FolderKanban } from "lucide-react";
import { useState } from "react";

export interface LadderProject {
  id: string;
  name: string;
}

const SCRATCH = "scratch";

/**
 * The ladder editor, inside Studio.
 *
 * The same component the public editor uses, mounted in the workspace instead
 * of in the marketing site. There is no focus or fullscreen control here: the
 * Studio shell is already the chrome, and its sidebar collapses, which is the
 * equivalent gesture in an app.
 *
 * Programs are saved against the account, and against a project when one is
 * chosen. That is what the public editor cannot do and what makes this the
 * signed-in version: the program belongs to the job, opens on any machine, and
 * is the thing the Monitor runs. Scratch is still there for trying something out
 * before there is a project to put it in.
 */
export default function LadderClient({ projects }: { projects: LadderProject[] }) {
  const [projectId, setProjectId] = useState(SCRATCH);

  const storage = httpStorage(
    "/api/ladder",
    projectId === SCRATCH
      ? "Saved to your account, not to a project. Choose a project above to file it against a job."
      : "Saved to this project. It is what the Monitor runs.",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-1.5">
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        <label htmlFor="ladder-project" className="text-[12px] text-ink-500">
          Program for
        </label>
        <select
          id="ladder-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
        >
          <option value={SCRATCH}>No project (scratch)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-[11.5px] text-ink-400">
          Save from the File menu. Run it from Monitor.
        </span>
      </div>

      {/* Remounted on change so the editor loads the chosen program. */}
      <div className="min-h-0 flex-1">
        <LadxStudio
          key={projectId}
          projectId={projectId}
          storage={storage}
          bottomDock={({ program, load }) => (
            <LadderAi
              projectId={projectId}
              getProgram={() => program}
              onProgram={(next) => load(next)}
            />
          )}
        />
      </div>
    </div>
  );
}
