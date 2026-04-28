"use client";

// Project detail. Tauri's output:'export' rules out dynamic route
// segments, so we use a query string: /project?id=<uuid>.

import { DeleteProjectButton } from "@/components/delete-project-button";
import { DesktopShell } from "@/components/desktop-shell";
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
        <DesktopShell>
          <div className="p-8 flex items-center gap-2 text-ink-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </DesktopShell>
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
      <DesktopShell>
        <div className="p-8 max-w-3xl mx-auto">
          <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        </div>
      </DesktopShell>
    );
  }
  if (row === undefined) {
    return (
      <DesktopShell>
        <div className="p-8 flex items-center gap-2 text-ink-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </DesktopShell>
    );
  }
  if (row === null) {
    return (
      <DesktopShell>
        <div className="p-8 max-w-3xl mx-auto">
          <p className="text-ink-500">Project not found.</p>
          <Link href="/" className="text-teal-500 text-sm">
            ← Back
          </Link>
        </div>
      </DesktopShell>
    );
  }

  const stats = [
    { label: "Routines", value: row.routineCount },
    { label: "Tags", value: row.tagCount },
    { label: "UDTs", value: row.udtCount },
    { label: "AOIs", value: row.aoiCount },
  ];

  return (
    <DesktopShell>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
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
            gapped — nothing leaves the machine.
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
    </DesktopShell>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
