"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ClientOption {
  id: string;
  name: string;
}

/**
 * Create a project.
 *
 * The client picker is the important field: a project is a job for someone, and
 * choosing them here is what makes every document that project generates come
 * out addressed to the right client with no further typing.
 */
export function NewProjectForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [site, setSite] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || null,
          clientId: clientId || null,
          site: site.trim() || null,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        setError("Could not create the project. Try again.");
        return;
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/studio/projects/${id}`);
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
        className="shrink-0 rounded-sm bg-ink-900 px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
      >
        New project
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 p-4 sm:items-center">
      <form
        onSubmit={create}
        className="w-full max-w-lg space-y-4 rounded-sm border border-ink-200 bg-white p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink-900">New project</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="font-mono text-[12px] text-ink-400 hover:text-ink-900"
          >
            Esc
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
            Project name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Line 4 filler upgrade"
            className="w-full rounded-sm border border-ink-200 px-3 py-2 text-[15px] outline-none focus:border-ink-500"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              Project number
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
              placeholder="LX-2601"
              className="w-full rounded-sm border border-ink-200 px-2.5 py-1.5 text-[14px] outline-none focus:border-ink-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              Client
            </span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-sm border border-ink-200 bg-white px-2.5 py-1.5 text-[14px] outline-none focus:border-ink-500"
            >
              <option value="">No client yet</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
            Site / location
          </span>
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            maxLength={200}
            className="w-full rounded-sm border border-ink-200 px-2.5 py-1.5 text-[14px] outline-none focus:border-ink-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-sm border border-ink-200 px-2.5 py-2 text-[14px] outline-none focus:border-ink-500"
          />
        </label>

        {clients.length === 0 && (
          <p className="text-[12.5px] text-ink-400">
            No clients yet. You can create the project now and add a client later.
          </p>
        )}
        {error && <p className="text-[13px] text-red-700">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="rounded-sm bg-ink-900 px-5 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create project"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13.5px] text-ink-500 hover:text-ink-900"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Move a project to another phase.
 *
 * A plain select rather than a locked stepper: real projects overlap and double
 * back, so forcing strict forward-only progress would fight how the work
 * actually runs. The order is still shown, it just is not enforced.
 */
export function PhaseSelect({
  projectId,
  phase,
  phases,
}: {
  projectId: string;
  phase: string;
  phases: { id: string; name: string; step: number | null }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(next: string) {
    setBusy(true);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: next }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <select
      value={phase}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      className="rounded-sm border border-ink-200 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-ink-500 disabled:opacity-50"
    >
      {phases.map((p) => (
        <option key={p.id} value={p.id}>
          {p.step ? `${p.step}. ${p.name}` : p.name}
        </option>
      ))}
    </select>
  );
}

/** Delete, split out so the workspace stays a server component. */
export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this project? This cannot be undone.")) return;
    setBusy(true);
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    router.push("/studio/projects");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="font-mono text-[12px] text-ink-400 transition-colors hover:text-red-700 disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
