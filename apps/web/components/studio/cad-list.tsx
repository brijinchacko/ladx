"use client";

import { readDxf } from "@ladx/cad";
import { emptyDrawing } from "@ladx/cad";
import { PencilRuler, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
 * Every drawing, from the CAD tool.
 *
 * Reachable without going through a project, because a panel layout often
 * starts as a sketch before anybody has decided which job it belongs to. A
 * drawing can be attached to a project here, or later from the project itself.
 */
export default function CadList({
  drawings,
  projects,
}: {
  drawings: CadRow[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(name: string, data: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data, projectId: projectId || null }),
      });
      if (!res.ok) {
        setError("Could not create the drawing.");
        return;
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/studio/cad/${id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function importDxf(file: File) {
    const text = await file.text();
    const { drawing, skipped } = readDxf(text);
    if (drawing.entities.length === 0) {
      setError(
        skipped.length
          ? `Nothing importable in that file. It contains ${skipped
              .map((s) => s.type)
              .join(", ")}, which this editor does not model.`
          : "No entities found. If that is a DWG renamed to .dxf, export a real DXF from your CAD package first.",
      );
      return;
    }
    await create(file.name.replace(/\.[^.]+$/, ""), drawing);
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete the drawing "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/cad/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <section className="mb-6 rounded-md border border-ink-200 bg-ink-50/50 p-4">
        <h2 className="font-display text-[14px] font-bold text-ink-900">New drawing</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
          2D drafting for panel layouts, wiring schematics and general arrangements. DXF is the
          interchange format; export DWG to DXF from your CAD package first, since DWG is
          proprietary and cannot be read reliably in a browser.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => create("Untitled drawing", emptyDrawing())}
            className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Blank sheet
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[13px] text-ink-700 transition-colors hover:border-ink-400 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
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

          {projects.length > 0 && (
            <label className="flex items-center gap-2 text-[12.5px] text-ink-500">
              for
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
              >
                <option value="">no project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && <p className="mt-2 text-[13px] text-red-700">{error}</p>}
      </section>

      {drawings.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-200 px-4 py-10 text-center text-[13.5px] text-ink-500">
          No drawings yet.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-100">
          {drawings.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
              <PencilRuler className="h-3.5 w-3.5 shrink-0 text-teal-600" />
              <Link href={`/studio/cad/${d.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink-900">
                  {d.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-ink-400">
                  {d.projectName ?? "No project"} · edited{" "}
                  {new Date(d.updatedAt).toLocaleDateString("en-GB")}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(d.id, d.name)}
                aria-label={`Delete ${d.name}`}
                className="shrink-0 text-ink-300 transition-colors hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
