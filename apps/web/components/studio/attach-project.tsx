"use client";

import { FolderPlus, Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProjectOption {
  id: string;
  name: string;
}

/**
 * Attaching a loose document to a project.
 *
 * Documents can end up without one: uploaded against a client, created before
 * the job was booked, or carried over from earlier work. Until a document has a
 * project it cannot be exported, because the letterhead, the client block and
 * the revision table all come from the project record. So this is not a tidying
 * feature, it is what turns a draft into something you can send.
 *
 * Creating the project from here is offered for the same reason it is offered
 * on a template: the document is often the first thing that exists.
 */
export default function AttachProject({
  documentId,
  projects,
}: {
  documentId: string;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(projects.length === 0);
  const [choice, setChoice] = useState(projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attach() {
    setBusy(true);
    setError(null);
    try {
      let projectId = choice;

      if (creating) {
        if (!name.trim()) {
          setError("Give the project a name.");
          return;
        }
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) {
          setError("Could not create the project.");
          return;
        }
        projectId = ((await res.json()) as { id: string }).id;
      }

      if (!projectId) {
        setError("Choose a project.");
        return;
      }

      const res = await fetch(`/api/documents/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        setError("Could not link the document.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
      >
        <Link2 className="h-3.5 w-3.5" />
        Connect to a project
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-30 w-72 rounded-md border border-ink-200 bg-white p-3 shadow-lg">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
          Connect this document to
        </p>

        {creating ? (
          <input
            ref={(el) => el?.focus()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="New project name"
            className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[13.5px] outline-none placeholder:text-ink-300 focus:border-ink-500"
          />
        ) : (
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[13.5px] outline-none focus:border-ink-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {projects.length > 0 && (
          <button
            type="button"
            onClick={() => setCreating(!creating)}
            className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-500 transition-colors hover:text-ink-900"
          >
            <FolderPlus className="h-3 w-3" />
            {creating ? "Pick an existing project instead" : "Create a new project instead"}
          </button>
        )}

        {error && <p className="mt-2 text-[12.5px] text-red-700">{error}</p>}

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={attach}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-ink-900 px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {creating ? "Create and connect" : "Connect"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-ink-200 px-3 py-1.5 text-[13px] text-ink-600 transition-colors hover:border-ink-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
