"use client";

import { api } from "@/lib/api";
import { localModels } from "@/lib/ask-model";
import { desktopAssistantStore } from "@/lib/assistant-store";
import { settingsLoad } from "@/lib/invoke";
import { useProjectFolder } from "@/lib/project-folder";
import {
  type GenerateScreen,
  type HmiDoc,
  HmiEditor,
  HmiHome,
  type HmiRow,
  emptyDoc,
  firstJsonObject,
  normaliseScreen,
  readDoc,
  screenSystemPrompt,
  screenUserPrompt,
} from "@ladx/hmi";
import type { LadxProgram } from "@ladx/studio";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

/**
 * HMI, on the desktop.
 *
 * One route rather than a list page and an /hmi/[id] page, because the desktop
 * build is a static export: a dynamic segment would need every id known at
 * build time, and these are created by the person using it. The id travels as
 * a query instead.
 *
 * Everything is loaded through Tauri commands. There is no fetch in this file
 * and there must not be: the desktop makes no outbound calls at all, which is
 * the whole reason it exists for sites that will not allow a cloud tool.
 */
export default function HmiPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Hmi />
    </Suspense>
  );
}

function Loading() {
  return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;
}

function Hmi() {
  const router = useRouter();
  const folder = useProjectFolder();
  const params = useSearchParams();
  const id = params.get("id");
  /**
   * A project named in the URL, from the HMI button in the ladder editor.
   *
   * Resolved here rather than by a route, because there is no server to
   * resolve it: one application for that project opens straight into it, and
   * anything else lands on the list with the project already chosen. The web
   * does the same thing at /studio/hmi/open.
   */
  const wantedProject = params.get("project");

  const [rows, setRows] = useState<HmiRow[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState<{
    id: string;
    name: string;
    doc: HmiDoc;
    program: LadxProgram | null;
    projectName: string | null;
    projectId: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The list. Reloaded whenever we come back to it. */
  const loadList = useCallback(async () => {
    try {
      const [apps, projs] = await Promise.all([api.listHmi(), api.listProjects()]);
      const nameOf = new Map(projs.map((p) => [p.id, p.name]));
      setProjects(projs.map((p) => ({ id: p.id, name: p.name })));
      setRows(
        apps.map((a) => ({
          id: a.id,
          name: a.name,
          projectId: a.projectId,
          projectName: a.projectId ? (nameOf.get(a.projectId) ?? null) : null,
          // Counted defensively: the column holds whatever was written, and a
          // list that throws is worse than one that says zero.
          screens: countScreens(a.doc),
          updatedAt: a.updatedAt,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the local store.");
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setOpen(null);
      void loadList();
    }
  }, [id, loadList]);

  useEffect(() => {
    if (id || !wantedProject || !rows) return;
    const mine = rows.filter((r) => r.projectId === wantedProject);
    // Exactly one, go in. Several is a choice and none is a creation, and
    // neither should happen because somebody followed a link.
    if (mine.length === 1 && mine[0]) router.replace(`/hmi?id=${mine[0].id}`);
  }, [id, wantedProject, rows, router]);

  // Open one, with its project's ladder program so the screens have tags.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await api.getHmi(id);
        if (!row) {
          setError("That application is not in this install.");
          return;
        }
        const doc = parseDoc(row.doc, row.name);
        // An application filed against no project reads the scratch program,
        // the same unattached one the ladder editor opens when no project is
        // chosen. Without it, coming here from a scratch program landed on an
        // editor with an empty tag table and nothing to explain why.
        const [prog, projs] = await Promise.all([
          api.loadLadder(row.projectId),
          api.listProjects(),
        ]);
        const program = prog ? (safeParse(prog.doc) as LadxProgram | null) : null;
        const projectName = row.projectId
          ? (projs.find((p) => p.id === row.projectId)?.name ?? null)
          : null;
        if (!cancelled)
          setOpen({
            id: row.id,
            name: row.name,
            doc,
            program,
            projectName,
            projectId: row.projectId,
          });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open it.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /**
   * Draw a screen, through Ollama and nothing else.
   *
   * The prompt and the checking both come from @ladx/hmi, so a screen drawn
   * here goes through exactly the same repairs and refusals as one drawn in
   * the cloud build. What differs is the two lines in the middle, and they go
   * over IPC to a model on this machine: no HTTP, no key, no telemetry.
   */
  const generate: GenerateScreen = useCallback(async ({ prompt, ctx }) => {
    const settings = await settingsLoad().catch(() => ({ defaultModel: null }));
    const result = await api.aiComplete({
      system: screenSystemPrompt(),
      prompt: screenUserPrompt(ctx, prompt),
      model: settings.defaultModel ?? undefined,
    });
    return { ...normaliseScreen(firstJsonObject(result.text), ctx), model: result.model };
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            router.push("/hmi");
          }}
          className="mt-2 text-[13px] text-ink-600 underline"
        >
          Back to the list
        </button>
      </div>
    );
  }

  if (id) {
    if (!open) return <Loading />;
    return (
      <HmiEditor
        id={open.id}
        initialDoc={open.doc}
        initialName={open.name}
        program={open.program}
        projectName={open.projectName}
        closeHref="/hmi"
        ladderHref={
          open.projectId ? `/ladder?project=${encodeURIComponent(open.projectId)}` : "/ladder"
        }
        onSave={async ({ id: appId, name, doc }) => api.saveHmi(appId, name, doc)}
        onGenerate={generate}
        /* What Ollama has installed on this machine. The default is an HTTP
           route, which a static export does not have. */
        models={localModels}
        assistantStore={desktopAssistantStore}
        /*
         * A panel is a deliverable, so it belongs in the job folder under HMI
         * rather than in Downloads with everything else. With no project open
         * there is nowhere better and it downloads as it always has.
         */
        onExport={
          folder.project
            ? {
                label: "Save to project",
                save: async (html, filename) =>
                  (await folder.fileInto("panel", filename, html)) ?? filename,
              }
            : undefined
        }
      />
    );
  }

  if (!rows) return <Loading />;

  return (
    <HmiHome
      applications={rows}
      projects={projects}
      defaultProjectId={wantedProject}
      hrefFor={(appId) => `/hmi?id=${appId}`}
      onCreate={async ({ name, projectId, width, height }) => {
        const row = await api.createHmi(projectId, name, emptyDoc(name, { width, height }));
        return row.id;
      }}
    />
  );
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseDoc(json: string, name: string): HmiDoc {
  // readDoc repairs rather than validates. The old check here was that
  // `screens` was a non-empty array, which a document with a screen missing
  // its size passes on the way to throwing inside the first render.
  return readDoc(safeParse(json), name);
}

function countScreens(json: string): number {
  const d = safeParse(json) as { screens?: unknown } | null;
  return Array.isArray(d?.screens) ? d.screens.length : 0;
}
