"use client";

/**
 * CAD, on the desktop.
 *
 * The same editor the cloud build runs. It could come across at all because
 * the drafting was always client side: the drawing model, the snapping, the
 * DXF and PDF writers and the renderer never needed a server. What differs is
 * where a drawing is kept and how one is generated, and both are injected.
 *
 * One route rather than a list page and an editor page, because the desktop is
 * a static export with no dynamic segments, and because the editor already
 * carries its own sheet list: the thing an engineer does constantly is move
 * between sheets in a set, not go back to an index.
 */

import { api } from "@/lib/api";
import { localModels } from "@/lib/ask-model";
import { desktopAssistantStore } from "@/lib/assistant-store";
import { cadStoreLocally, generateDrawingLocally } from "@/lib/cad-host";
import { useProjectFolder } from "@/lib/project-folder";
import { CadEditor, type Drawing, emptyDrawing } from "@ladx/cad";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

interface Sheet {
  id: string;
  name: string;
  updatedAt: string;
  projectId: string | null;
  doc: string;
}

export default function CadPage() {
  return (
    <Suspense fallback={<p className="p-6 text-[13px] text-ink-500">Loading…</p>}>
      <Cad />
    </Suspense>
  );
}

function Cad() {
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params.get("id");
  const { project } = useProjectFolder();

  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const read = useCallback(async () => {
    const [rows, imported] = await Promise.all([api.listCad(), api.listProjects()]);
    setSheets(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        updatedAt: r.updatedAt,
        projectId: r.projectId,
        doc: r.doc,
      })),
    );
    setProjects(imported.map((p) => ({ id: p.id, name: p.name })));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await read();
      } catch (err) {
        // Said rather than waited on: without this the page shows "Loading…"
        // for as long as somebody is willing to look at it.
        setError(err instanceof Error ? err.message : "The saved drawings could not be read.");
      }
    })();
  }, [read]);

  /*
   * The first drawing is made rather than asked for.
   *
   * A drawing board with nothing on it is the tool; an empty list with a
   * "create your first drawing" button in front of it is a form standing
   * between somebody and the thing they came to use.
   */
  useEffect(() => {
    if (!sheets || sheets.length > 0 || error) return;
    (async () => {
      try {
        const made = await api.createCad(null, "Untitled drawing", JSON.stringify(emptyDrawing()));
        setSheets([
          {
            id: made.id,
            name: made.name,
            updatedAt: made.updatedAt,
            projectId: made.projectId,
            doc: made.doc,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "A drawing could not be created.");
      }
    })();
  }, [sheets, error]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-red-700">{error}</p>
        <p className="mt-1 text-[12.5px] text-ink-500">
          Drawings are stored on this machine. If this keeps happening, reopen the app.
        </p>
      </div>
    );
  }
  if (!sheets || sheets.length === 0) {
    return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;
  }

  const open = sheets.find((s) => s.id === wanted) ?? sheets[0];
  if (!open) return <p className="p-6 text-[13px] text-ink-500">Loading…</p>;

  return (
    <CadEditor
      // Keyed on the sheet so opening another one remounts the editor with
      // that drawing rather than leaving the previous one on the canvas.
      key={open.id}
      drawingId={open.id}
      initial={safeDrawing(open.doc)}
      name={open.name}
      projectId={open.projectId}
      projects={projects}
      sheets={sheets.map((s) => ({ id: s.id, name: s.name, updatedAt: s.updatedAt }))}
      titleFields={{
        // The open project folder, which is what a title block on this machine
        // should name: the job somebody chose, not a row in a database.
        projectName: project?.name,
        projectNumber: project?.code ?? undefined,
        client: project?.client ?? undefined,
      }}
      store={cadStoreLocally}
      generate={generateDrawingLocally}
      models={localModels}
      assistantStore={desktopAssistantStore}
      routes={{ list: "/cad", sheet: (id) => `/cad?id=${encodeURIComponent(id)}` }}
      onChanged={() => {
        void read();
        router.refresh();
      }}
    />
  );
}

/**
 * A stored drawing, made safe to open.
 *
 * The store holds whatever was written to it, and a drawing that fails to
 * parse must not take the editor down: an empty board somebody can draw on
 * beats a blank page with an exception behind it.
 */
function safeDrawing(json: string): Drawing {
  try {
    const parsed = JSON.parse(json) as Drawing | null;
    return parsed && Array.isArray(parsed.entities) && Array.isArray(parsed.layers)
      ? parsed
      : emptyDrawing();
  } catch {
    return emptyDrawing();
  }
}
