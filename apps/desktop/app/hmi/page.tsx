"use client";

import { api } from "@/lib/api";
import { type HmiDoc, HmiEditor, HmiHome, type HmiRow, emptyDoc } from "@ladx/hmi";
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
  const params = useSearchParams();
  const id = params.get("id");

  const [rows, setRows] = useState<HmiRow[] | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState<{
    id: string;
    name: string;
    doc: HmiDoc;
    program: LadxProgram | null;
    projectName: string | null;
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
        let program: LadxProgram | null = null;
        let projectName: string | null = null;
        if (row.projectId) {
          const [prog, projs] = await Promise.all([
            api.loadLadder(row.projectId),
            api.listProjects(),
          ]);
          program = prog ? (safeParse(prog.doc) as LadxProgram | null) : null;
          projectName = projs.find((p) => p.id === row.projectId)?.name ?? null;
        }
        if (!cancelled) setOpen({ id: row.id, name: row.name, doc, program, projectName });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not open it.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
        onSave={async ({ id: appId, name, doc }) => api.saveHmi(appId, name, doc)}
      />
    );
  }

  if (!rows) return <Loading />;

  return (
    <HmiHome
      applications={rows}
      projects={projects}
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
  const parsed = safeParse(json) as HmiDoc | null;
  // A document written by an older build, or a partial write, must not take
  // the editor down: fall back to an empty application rather than nothing.
  return parsed && Array.isArray(parsed.screens) && parsed.screens.length > 0
    ? parsed
    : emptyDoc(name);
}

function countScreens(json: string): number {
  const d = safeParse(json) as { screens?: unknown } | null;
  return Array.isArray(d?.screens) ? d.screens.length : 0;
}
