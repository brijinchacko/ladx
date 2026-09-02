"use client";

import { FolderConnect } from "@/components/studio/folder-connect";
import ScopePicker from "@/components/studio/scope-picker";
import { type ConnectedFolder, prepareFolder, rememberFolder } from "@/lib/fs/project-folder";
import { SCOPE_PRESETS } from "@/lib/platform/scope";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

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
export function NewProjectForm({
  clients,
  defaultClientId,
}: { clients: ClientOption[]; defaultClientId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [site, setSite] = useState("");
  // Defaults to the full lifecycle, which is what the plan produced before
  // scope existed, so nobody who ignores this field gets less than they used to.
  const [deliverables, setDeliverables] = useState<string[]>(
    SCOPE_PRESETS.find((p) => p.id === "full")?.slugs ?? [],
  );
  const [description, setDescription] = useState("");
  /** A folder on this computer, if one was chosen. Optional throughout. */
  const [folder, setFolder] = useState<ConnectedFolder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The sidebar's New button links here with ?new=1 rather than duplicating the
  // form, so there is one place a project is created from.
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
  }, [params]);

  /*
   * Escape closes it.
   *
   * The dialog has always had a button labelled "Esc" in its corner and
   * nothing listening for the key, which is a promise printed on the screen
   * and not kept. Ignored while a field has focus only for the textarea's
   * sake; every other control here is happy to lose focus to a close.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

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
          deliverables,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        setError("Could not create the project. Try again.");
        return;
      }
      const { id } = (await res.json()) as { id: string };

      // The project exists either way. A folder that cannot be written to is
      // worth saying out loud, but it must not read as the project having
      // failed, because it has not.
      if (folder) {
        try {
          await rememberFolder(id, folder);
          await prepareFolder(folder, name.trim(), new Date().toISOString().slice(0, 10));
        } catch {
          setError(
            `The project was created. The folder "${folder.name}" could not be written to, so files will download instead.`,
          );
        }
      }

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
    /*
      The dialog is taller than a laptop window once the scope picker is open,
      and it had no height cap and nothing that scrolled. Everything past the
      fold, including the button that creates the project, was simply
      unreachable: the form could be filled in and not submitted.

      Three parts now. The header and the footer are fixed, so the Create
      button is on screen whatever the scope, and only the fields between them
      scroll. That is better than making the whole panel scroll, because
      scrolling to the bottom of a seventeen deliverable list to find the
      submit button is the same problem in a milder form.

      `dvh` rather than `vh`: on a phone, `vh` is the window with the browser
      chrome hidden, which is not the space actually available, and the footer
      ends up under the toolbar.
    */
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <form
        onSubmit={create}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-sm border border-ink-200 bg-white"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="font-display text-lg font-bold text-ink-900">New project</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Close without creating anything"
            className="font-mono text-[12px] text-ink-400 hover:text-ink-900"
          >
            Esc
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              Project name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
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
                {!defaultClientId && <option value="">No client yet</option>}
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

          <div>
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              Scope of work
            </span>
            <p className="mb-2 text-[12.5px] leading-snug text-ink-500">
              What this project owes. The plan is built from it, so a job scoped to programming does
              not arrive with a bill of materials to delete. Changeable at any time from the
              project.
            </p>
            <ScopePicker value={deliverables} onChange={setDeliverables} />
          </div>

          {/* Last, because it is the only optional field that touches the
              user's own machine, and because it is the one decision that is
              easier to make once the job has a name. */}
          <div>
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-400">
              Folder on this computer
            </span>
            <FolderConnect folder={folder} onChange={setFolder} />
          </div>

          {clients.length === 0 && (
            <p className="text-[12.5px] text-ink-400">
              No clients yet. You can create the project now and add a client later.
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-ink-100 px-6 py-4">
          {/* The error sits with the button that produced it, where somebody
              who just clicked is already looking. */}
          {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}
          <div className="flex items-center gap-3">
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
            {!name.trim() && touched && (
              // The button is disabled until there is a name, and a disabled
              // button with no explanation reads as a broken one. Only once
              // they have been in the field, though: telling somebody the
              // name is missing before they have had a chance to type it is
              // nagging, not help.
              <span className="text-[12.5px] text-ink-400">A project name is needed.</span>
            )}
          </div>
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
