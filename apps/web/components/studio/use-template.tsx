"use client";

import { FilePlus2, FolderPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProjectOption {
  id: string;
  name: string;
  clientName: string | null;
}

/**
 * Turning a template into a document you can work on.
 *
 * Two routes in, because both are real. Usually the job already exists, so you
 * pick it and the document arrives filled with that project's details. But a
 * template is also a perfectly good way to start: somebody writing a URS for
 * work that has only just been discussed has no project yet, and making them
 * leave, create one, and come back is friction for no reason. So a project can
 * be created from here in the same action.
 *
 * A document is never created without a project. Every template is filled from
 * the project, the client and the company, and an unattached document would
 * generate with the placeholders still in it, which is the thing the platform
 * exists to avoid.
 */
export default function UseTemplate({
  slug,
  title,
  projects,
}: {
  slug: string;
  title: string;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">(projects.length > 0 ? "existing" : "new");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      let targetId = projectId;

      if (mode === "new") {
        if (!newName.trim()) {
          setError("Give the project a name.");
          return;
        }
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), code: newCode.trim() || null }),
        });
        if (!res.ok) {
          setError("Could not create the project.");
          return;
        }
        targetId = ((await res.json()) as { id: string }).id;
      }

      if (!targetId) {
        setError("Choose a project, or create one.");
        return;
      }

      const docRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          projectId: targetId,
          templateSlug: slug,
          kind: "generated",
        }),
      });
      if (!docRes.ok) {
        setError("Could not create the document.");
        return;
      }
      const { id } = (await docRes.json()) as { id: string };
      router.push(`/studio/documents/${id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-ink-200 bg-white">
      <div className="border-b border-ink-100 bg-ink-50 px-4 py-2.5">
        <h2 className="font-display text-[14px] font-bold text-ink-900">Start working on this</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          It opens in the editor, filled from the project you choose.
        </p>
      </div>

      <div className="space-y-4 p-4">
        {projects.length > 0 && (
          <div className="flex gap-1 rounded-md border border-ink-200 p-0.5">
            {(
              [
                { id: "existing", label: "Existing project", icon: FilePlus2 },
                { id: "new", label: "New project", icon: FolderPlus },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMode(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[12.5px] transition-colors ${
                    mode === t.id ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {mode === "existing" ? (
          <label className="block">
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              Project
            </span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-2 text-[14px] outline-none focus:border-ink-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.clientName ? `, ${p.clientName}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                Project name
              </span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={200}
                placeholder="Line 4 filler upgrade"
                className="w-full rounded-md border border-ink-200 px-2.5 py-2 text-[14px] outline-none placeholder:text-ink-400 focus:border-ink-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                Project number
              </span>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                maxLength={40}
                placeholder="LX-2601"
                className="w-full rounded-md border border-ink-200 px-2.5 py-2 text-[14px] outline-none placeholder:text-ink-400 focus:border-ink-500"
              />
            </label>
            <p className="text-[12px] leading-relaxed text-ink-400">
              You can add the client and the rest of the details from the project afterwards.
            </p>
          </div>
        )}

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-4 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Creating…" : mode === "new" ? "Create project and open" : "Open in editor"}
        </button>
      </div>
    </div>
  );
}
