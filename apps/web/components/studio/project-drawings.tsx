"use client";

import { readDxf } from "@ladx/cad";
import { emptyDrawing } from "@ladx/cad";
import { PencilRuler, Plus, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export interface DrawingRow {
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * CAD drawings belonging to a project.
 *
 * Two ways in: start an empty sheet, or import a DXF. The import is parsed in
 * the browser before it is saved, so an unreadable file fails immediately with
 * a reason rather than becoming an empty drawing the user has to open to
 * discover is empty.
 */
export default function ProjectDrawings({
  projectId,
  drawings,
}: {
  projectId: string;
  drawings: DrawingRow[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(name: string, data: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, projectId, data }),
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
          : "No entities found. If it is a DWG renamed to .dxf, export a real DXF from your CAD package first.",
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => create("Untitled drawing", emptyDrawing())}
          className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          New drawing
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
        <span className="font-mono text-[11px] text-ink-400">
          DXF only. Export DWG to DXF from your CAD package first.
        </span>
      </div>

      {error && <p className="mb-3 text-[13px] text-red-700">{error}</p>}

      {drawings.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink-200 px-4 py-6 text-center text-[13.5px] text-ink-500">
          No drawings yet. Panel layouts, wiring schematics and general arrangements live here.
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
                <span className="block font-mono text-[11px] text-ink-400">
                  Edited {new Date(d.updatedAt).toLocaleDateString("en-GB")}
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
