"use client";

import {
  DRAWING_TEMPLATES,
  type DrawingTemplate,
  TEMPLATE_SECTIONS,
  buildDrawingFromTemplate,
} from "@/lib/cad/drawing-templates";
import { readDxf } from "@/lib/cad/dxf";
import { DEFAULT_LAYERS, type Entity, emptyDrawing } from "@/lib/cad/types";
import { Clock, FilePlus2, Loader2, PencilRuler, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

export interface CadRow {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  updatedAt: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

/**
 * The CAD home screen.
 *
 * A blank sheet is the worst thing to open a drafting tool onto. What somebody
 * wants at the start is the sheet they were going to draw anyway, and the whole
 * set exists already: cover, index, legend, power, I/O, safety, panel layout,
 * termination schedule, numbered the way a control package is read.
 *
 * So the templates lead and the blank sheet is the small button at the end,
 * which is the honest ordering of how often each is the right answer. What is
 * already open comes first of all, because the commonest reason to be here is
 * to get back to yesterday's work.
 */
export default function CadHome({
  drawings,
  projects,
  company,
}: {
  drawings: CadRow[];
  projects: ProjectOption[];
  company: { name?: string } | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const recent = useMemo(() => drawings.slice(0, 6), [drawings]);

  async function create(name: string, entities: Entity[], layers = DEFAULT_LAYERS) {
    setError(null);
    try {
      const res = await fetch("/api/cad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          projectId: projectId || null,
          data: { version: 1, layers: layers.map((l) => ({ ...l })), entities },
        }),
      });
      if (!res.ok) {
        setError("Could not create the drawing.");
        return;
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/studio/cad/${id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function startTemplate(t: DrawingTemplate) {
    setBusy(t.id);
    // Built here rather than on open, so what lands is a finished sheet with
    // the project already on its title block rather than a promise of one.
    const entities = buildDrawingFromTemplate(t, {
      drawingTitle: t.name,
      projectName: project?.name,
      company: company?.name,
      date: new Date().toISOString().slice(0, 10),
    });
    const layers = [
      ...DEFAULT_LAYERS,
      { name: "SHEET", color: "4A5A68", visible: true, locked: false },
      { name: "NOTES", color: "7A8894", visible: true, locked: false },
    ];
    await create(`${t.sheet} ${t.name}`, entities, layers);
  }

  async function importDxf(file: File) {
    setBusy("import");
    setError(null);
    try {
      const { drawing, skipped } = readDxf(await file.text());
      if (drawing.entities.length === 0) {
        setError(
          skipped.length
            ? `Nothing importable in that file. It holds ${skipped.map((s) => s.type).join(", ")}, which this editor does not model.`
            : "No entities found. If that is a DWG renamed to .dxf, export a real DXF from your CAD package first.",
        );
        setBusy(null);
        return;
      }
      await create(file.name.replace(/\.[^.]+$/, ""), drawing.entities, drawing.layers);
    } catch {
      setError("Could not read that file.");
      setBusy(null);
    }
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* where it goes, decided once, before anything is created */}
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-ink-50/50 px-4 py-3">
          <PencilRuler className="h-4 w-4 shrink-0 text-teal-600" />
          <span className="text-[13.5px] text-ink-700">New drawings go to</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
          >
            <option value="">no project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-[12.5px] text-ink-400">
            {project
              ? "Its title block fills from the project and the client."
              : "A loose drawing has an empty title block. You can file it later."}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={Boolean(busy)}
              className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50"
            >
              {busy === "import" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Import DXF
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".dxf,application/dxf,text/plain"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importDxf(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                setBusy("blank");
                void create("Untitled drawing", emptyDrawing().entities);
              }}
              disabled={Boolean(busy)}
              className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
              Blank sheet
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            {error}
          </p>
        )}

        {recent.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
              <Clock className="h-3 w-3" />
              Carry on with
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/studio/cad/${d.id}`}
                    className="group flex h-full flex-col rounded-md border border-ink-200 bg-white p-3 transition-colors hover:border-ink-400"
                  >
                    <span className="truncate text-[13.5px] font-medium text-ink-900 group-hover:text-teal-700">
                      {d.name}
                    </span>
                    <span className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">
                      {d.projectName ?? "No project"} ·{" "}
                      {new Date(d.updatedAt).toLocaleDateString("en-GB")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-display text-[16px] font-bold text-ink-900">Start from a sheet</h2>
          <p className="mb-4 mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            The drawing set a control panel ships with, numbered the way a package is read. Each one
            is a working sheet with the rails, the conventions and the layout already on it, drawn
            to be corrected rather than admired.
          </p>

          {TEMPLATE_SECTIONS.map((section) => {
            const items = DRAWING_TEMPLATES.filter((t) => t.section === section);
            if (!items.length) return null;
            return (
              <div key={section} className="mb-5">
                <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                  {section}
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => startTemplate(t)}
                        disabled={Boolean(busy)}
                        className="flex h-full w-full flex-col rounded-md border border-ink-200 bg-white p-3 text-left transition-colors hover:border-teal-500 hover:bg-teal-50/30 disabled:opacity-50"
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="shrink-0 rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-white">
                            {t.sheet}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-display text-[13.5px] font-bold text-ink-900">
                            {t.name}
                          </span>
                          <span className="shrink-0 font-mono text-[9.5px] text-ink-400">
                            {t.sheetSize}
                          </span>
                          {busy === t.id && (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-teal-600" />
                          )}
                        </span>
                        <span className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
                          {t.note}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        {drawings.length > recent.length && (
          <section className="mt-6">
            <h2 className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
              Everything else
            </h2>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-100">
              {drawings.slice(recent.length).map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2 hover:bg-ink-50">
                  <PencilRuler className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                  <Link href={`/studio/cad/${d.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink-900">{d.name}</span>
                    <span className="block truncate font-mono text-[10.5px] text-ink-400">
                      {d.projectName ?? "No project"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
                      await fetch(`/api/cad/${d.id}`, { method: "DELETE" });
                      router.refresh();
                    }}
                    aria-label={`Delete ${d.name}`}
                    className="shrink-0 text-ink-300 transition-colors hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
