"use client";

import { type ProjectRow, listProjects } from "@/lib/invoke";
import { Folder } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function ProjectsList() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then((r) => setRows(r))
      .catch((err) => setError(err instanceof Error ? err.message : "failed"));
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!rows) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-ink-200 rounded-lg p-8 text-center text-ink-500 text-sm">
        No projects yet. Click <strong>Open project</strong> to import an L5X or PLCopen TC6 .xml
        file.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-ink-100 border border-ink-100 rounded-lg overflow-hidden">
      {rows.map((p) => (
        <li key={p.id}>
          <Link
            href={`/project?id=${p.id}`}
            className="block px-4 py-3 hover:bg-ink-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Folder className="h-4 w-4 text-ink-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900 truncate">{p.name}</p>
                <p className="text-xs text-ink-500">
                  {p.vendor} · {p.routineCount} routines · {p.tagCount} tags
                </p>
              </div>
              <p className="text-xs text-ink-400 shrink-0">{formatDate(p.parsedAt)}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
