"use client";

// Project detail. Tauri's output:'export' rules out dynamic route
// segments, so we use a query string: /project?id=<uuid>.

import { DeleteProjectButton } from "@/components/delete-project-button";
import { type ProjectRow, getProject } from "@/lib/invoke";
import { Button } from "@ladx/ui";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function ProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-8 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      }
    >
      <ProjectDetail />
    </Suspense>
  );
}

function ProjectDetail() {
  const params = useSearchParams();
  const id = params.get("id");
  const [row, setRow] = useState<ProjectRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setRow(null);
      return;
    }
    getProject(id)
      .then((r) => setRow(r))
      .catch((e) => setError(e instanceof Error ? e.message : "fetch failed"));
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="rounded-md border border-danger bg-danger px-4 py-3 text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }
  if (row === undefined) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-ink-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (row === null) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-ink-500">Project not found.</p>
        <Link href="/" className="text-sm text-teal-500">
          ← Back
        </Link>
      </div>
    );
  }

  const stats = [
    { label: "Routines", value: row.routineCount },
    { label: "Tags", value: row.tagCount },
    { label: "UDTs", value: row.udtCount },
    { label: "AOIs", value: row.aoiCount },
  ];

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-ink-500">
              <Link href="/" className="hover:text-ink-900">
                Projects
              </Link>
              {" / "}
              <span className="text-ink-900">{row.name}</span>
            </p>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">{row.name}</h1>
            <p className="text-sm text-ink-500">
              {row.vendor} · {row.sourceFilename} · {(row.sizeBytes / 1024).toFixed(1)} KB · parsed{" "}
              {formatDate(row.parsedAt)}
            </p>
          </div>
          <DeleteProjectButton projectId={row.id} />
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-ink-100 p-4">
              <p className="text-xs text-ink-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-semibold mt-1">{s.value}</p>
            </div>
          ))}
        </section>

        <section className="border border-ink-100 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-2">Chat about this project</h2>
          <p className="text-sm text-ink-500 mb-4">
            Local chat against your Ollama, grounded in this project's routines and tags. Air-
            gapped, nothing leaves the machine.
          </p>
          <Link href={`/chat?project=${row.id}`}>
            <Button variant="primary">Open chat</Button>
          </Link>
        </section>

        <section className="border border-ink-100 rounded-lg p-6 space-y-3">
          <h2 className="text-lg font-semibold">Manifest preview</h2>
          {row.manifest.routines.length > 0 && (
            <p className="text-sm text-ink-700">
              <span className="text-ink-500">Routines:</span>{" "}
              {row.manifest.routines.map((r) => `${r.name} (${r.language})`).join(", ")}
            </p>
          )}
          {row.manifest.tags.length > 0 && (
            <p className="text-sm text-ink-700">
              <span className="text-ink-500">Tags:</span>{" "}
              {row.manifest.tags
                .map((t) => t.name)
                .slice(0, 50)
                .join(", ")}
              {row.manifest.tags.length > 50 ? ` … (+${row.manifest.tags.length - 50} more)` : ""}
            </p>
          )}
          {row.manifest.udts.length > 0 && (
            <p className="text-sm text-ink-700">
              <span className="text-ink-500">UDTs:</span> {row.manifest.udts.join(", ")}
            </p>
          )}
          {row.manifest.aois.length > 0 && (
            <p className="text-sm text-ink-700">
              <span className="text-ink-500">AOIs:</span> {row.manifest.aois.join(", ")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
