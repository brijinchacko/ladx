"use client";

/**
 * Where the work lives.
 *
 * A control project has always been a folder of paperwork, and this is that
 * folder, made correctly. Somebody picks where projects go, names one, and
 * gets the structure: specification, drawings, programs, HMI, testing,
 * commissioning, handover. Everything the tools produce then files itself into
 * the right one, so the pack that leaves with the machine is arranged before
 * anybody thinks about arranging it.
 */

import { DesktopShell } from "@/components/desktop-shell";
import {
  type FolderEntry,
  type ProjectFolder,
  createProjectFolder,
  listProjectFiles,
  listProjectFolders,
  openProjectFolder,
  pickWorkspace,
  revealProject,
} from "@/lib/invoke";
import { useProjectFolder } from "@/lib/project-folder";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export default function WorkspacePage() {
  const { project, workspace, loading, open, setWorkspace } = useProjectFolder();
  const [projects, setProjects] = useState<ProjectFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (dir: string) => {
    try {
      setProjects(await listProjectFolders(dir));
      setError(null);
    } catch (err) {
      setProjects([]);
      setError(message(err));
    }
  }, []);

  useEffect(() => {
    if (workspace) void refresh(workspace);
  }, [workspace, refresh]);

  const choose = async () => {
    setBusy(true);
    try {
      const dir = await pickWorkspace();
      if (dir) setWorkspace(dir);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const openElsewhere = async () => {
    setBusy(true);
    try {
      const found = await openProjectFolder();
      if (found) open(found);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DesktopShell>
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="mb-1 text-3xl font-semibold tracking-tight">Workspace</h1>
            <p className="text-sm text-ink-500">
              Every project is a folder on this machine. Back it up, put it on a stick, hand it
              over.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={openElsewhere}
              disabled={busy}
              className="flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 disabled:opacity-50"
            >
              <FolderOpen className="h-4 w-4" />
              Open
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={!workspace}
              title={workspace ? undefined : "Choose where projects live first"}
              className="flex items-center gap-2 rounded-md bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-40"
            >
              <FolderPlus className="h-4 w-4" />
              New project
            </button>
          </div>
        </header>

        {error && (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <section className="rounded-lg border border-ink-100 p-5">
          <p className="mb-1 font-medium text-ink-900">Projects folder</p>
          {workspace ? (
            <div className="flex items-center gap-3">
              <code className="min-w-0 flex-1 truncate rounded bg-ink-50 px-2 py-1 text-[12.5px] text-ink-700">
                {workspace}
              </code>
              <button
                type="button"
                onClick={choose}
                className="shrink-0 text-xs text-teal-500 hover:text-teal-600"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => void refresh(workspace)}
                className="shrink-0 text-ink-400 hover:text-ink-700"
                title="Look again"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-ink-500">
                Not chosen yet. Pick a folder you already back up, such as the one your job files
                are in.
              </p>
              <button
                type="button"
                onClick={choose}
                disabled={busy}
                className="shrink-0 rounded-md border border-ink-200 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Choose folder"}
              </button>
            </div>
          )}
        </section>

        {creating && workspace && (
          <NewProject
            parent={workspace}
            onCancel={() => setCreating(false)}
            onCreated={(made) => {
              setCreating(false);
              open(made);
              void refresh(workspace);
            }}
          />
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">
            {projects
              ? `${projects.length} project${projects.length === 1 ? "" : "s"}`
              : "Projects"}
          </h2>
          {loading || (workspace && projects === null) ? (
            <p className="text-[13px] text-ink-500">Looking…</p>
          ) : !workspace ? (
            <p className="text-[13px] text-ink-500">Choose a folder above to see what is in it.</p>
          ) : projects && projects.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              Nothing here yet. New project builds the folder structure for one.
            </p>
          ) : (
            <ul className="space-y-2">
              {projects?.map((p) => (
                <ProjectRow
                  key={p.path}
                  project={p}
                  active={p.path === project?.path}
                  onOpen={() => open(p)}
                />
              ))}
            </ul>
          )}
        </section>

        {project && <Contents project={project} />}
      </div>
    </DesktopShell>
  );
}

function ProjectRow({
  project,
  active,
  onOpen,
}: {
  project: ProjectFolder;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
        active ? "border-teal-500/50 bg-teal-500/5" : "border-ink-100"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium text-ink-900">
          {project.name}
          {active && (
            <span className="flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-600">
              <Check className="h-3 w-3" />
              Open
            </span>
          )}
        </p>
        <p className="truncate text-xs text-ink-500">
          {[project.client, project.code].filter(Boolean).join(" · ") || project.path}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void revealProject(project.path)}
        className="shrink-0 rounded-md border border-ink-200 px-2 py-1 text-xs text-ink-600 hover:bg-ink-50"
      >
        Show in folder
      </button>
      {!active && (
        <button
          type="button"
          onClick={onOpen}
          className="flex shrink-0 items-center gap-1 rounded-md bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-700"
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}

function NewProject({
  parent,
  onCancel,
  onCreated,
}: {
  parent: string;
  onCancel: () => void;
  onCreated: (project: ProjectFolder) => void;
}) {
  // Defaults to the workspace folder and can be overridden for this one
  // project. Most jobs belong together; the one that has to live on the
  // customer's own share should not force everything else to move.
  const [where, setWhere] = useState(parent);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      onCreated(
        await createProjectFolder({
          parent: where,
          name: name.trim(),
          client: client.trim() || null,
          code: code.trim() || null,
        }),
      );
    } catch (err) {
      setError(message(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-ink-200 bg-ink-50/40 p-5">
      <p className="font-medium text-ink-900">New project</p>
      <div className="grid grid-cols-3 gap-3">
        <Field id="np-name" label="Name" value={name} onChange={setName} autoFocus />
        <Field id="np-client" label="Client" value={client} onChange={setClient} optional />
        <Field id="np-code" label="Job number" value={code} onChange={setCode} optional />
      </div>
      <div className="space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-500">
          <span>Creates the folder in</span>
          <code className="rounded bg-white px-1 py-0.5 text-[11.5px] text-ink-700">{where}</code>
          <button
            type="button"
            onClick={async () => {
              const picked = await pickWorkspace().catch(() => null);
              if (picked) setWhere(picked);
            }}
            className="text-teal-500 hover:text-teal-600"
          >
            Somewhere else
          </button>
          {where !== parent && (
            <button
              type="button"
              onClick={() => setWhere(parent)}
              className="text-ink-400 hover:text-ink-700"
            >
              Reset
            </button>
          )}
        </p>
        <p className="text-xs text-ink-500">
          With Specification, Drawings, Programs, HMI, Testing, Commissioning and Handover inside
          it.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="flex items-center gap-2 rounded-md bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  optional,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink-700">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-400">optional</span>}
      </label>
      <input
        id={id}
        value={value}
        // biome-ignore lint/a11y/noAutofocus: the form opens on a deliberate button press and has one obvious first field, so landing anywhere else is a wasted click
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-ink-500"
      />
    </div>
  );
}

/** What is actually in the open project, grouped by the folder it is filed in. */
function Contents({ project }: { project: ProjectFolder }) {
  const [files, setFiles] = useState<FolderEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listProjectFiles(project.path)
      .then((rows) => live && setFiles(rows))
      .catch((err) => live && setError(message(err)));
    return () => {
      live = false;
    };
  }, [project.path]);

  const groups = new Map<string, FolderEntry[]>();
  for (const f of files ?? []) {
    const list = groups.get(f.folder);
    if (list) list.push(f);
    else groups.set(f.folder, [f]);
  }

  return (
    <section className="rounded-lg border border-ink-100 p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-ink-900">In {project.name}</h2>
          <p className="truncate text-xs text-ink-500">{project.path}</p>
        </div>
        <button
          type="button"
          onClick={() => void revealProject(project.path)}
          className="flex shrink-0 items-center gap-1 text-xs text-teal-500 hover:text-teal-600"
        >
          Open the folder
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {files === null && !error && <p className="text-[13px] text-ink-500">Reading…</p>}
      {files && files.length === 0 && (
        <p className="text-[13px] text-ink-500">
          Empty so far. Anything Convert, Ladder or the HMI builder produces is filed in here.
        </p>
      )}

      <div className="space-y-3">
        {[...groups].map(([folder, rows]) => (
          <div key={folder}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
              {folder}
            </p>
            <ul className="space-y-1">
              {rows.map((f) => (
                <li key={f.path} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate text-ink-700">{f.name}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-ink-400">
                    {size(f.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
