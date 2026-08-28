"use client";

import { api } from "@/lib/api";
import { askModelLocally, localModels } from "@/lib/ask-model";
import {
  type ConvertSource,
  ConvertWorkbench,
  type LadxProgram,
  partitionRunnableLike,
} from "@/lib/designs";
import { useProjectFolder } from "@/lib/project-folder";
import { useEffect, useState } from "react";

/**
 * Convert, on the desktop.
 *
 * The conversion itself already ran entirely in the browser on the cloud
 * build, which is what made it the easiest tool to bring here: nothing about
 * it needed a server. Only the source list changes.
 */
export default function ConvertPage() {
  const [sources, setSources] = useState<ConvertSource[] | null>(null);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { project, fileInto } = useProjectFolder();

  useEffect(() => {
    (async () => {
      try {
        const [rows, projects] = await Promise.all([api.listLadder(), api.listProjects()]);
        const nameOf = new Map(projects.map((p) => [p.id, p.name]));
        const parsed = rows.map((r) => ({
          projectId: r.projectId,
          projectName: r.projectId ? (nameOf.get(r.projectId) ?? null) : null,
          name: r.name,
          program: safeParse(r.doc) as LadxProgram,
          updatedAt: r.updatedAt,
        }));
        const { runnable, broken } = partitionRunnableLike(parsed);
        setSources(runnable);
        setUnreadable(broken.map((b) => b.name));
      } catch (err) {
        // Said rather than waited on. Without this the page shows "Loading…"
        // for as long as somebody is willing to look at it, which is the worst
        // possible answer to "the store could not be read".
        setError(err instanceof Error ? err.message : "The saved programs could not be read.");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-red-700">{error}</p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Programs are stored on this machine. If this keeps happening, reopen the app.
        </p>
      </div>
    );
  }
  if (!sources) return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;

  return (
    <ConvertWorkbench
      /* Ollama on this machine, never an API route: a static export has none. */
      askModel={askModelLocally}
      modelsUrl={localModels}
      sources={sources}
      companyName={null}
      author=""
      unreadable={unreadable}
      ladderHref="/ladder"
      /*
       * A converted program belongs with the job, not in the downloads folder.
       * With no project open there is nowhere better, so it downloads as it
       * always has rather than vanishing.
       */
      onExport={
        project
          ? {
              label: "Save to project",
              save: async (text, filename) =>
                (await fileInto(kindOf(filename), filename, text)) ?? filename,
            }
          : undefined
      }
    />
  );
}

/**
 * Which folder an export belongs in, from what it is.
 *
 * Everything Convert produces is a program in some other dialect, so it all
 * files under Programs; the extension only decides whether it is the program
 * or an export of it.
 */
function kindOf(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xml") return "plcopen";
  if (ext === "l5x" || ext === "l5k") return "neutral";
  return "export";
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
