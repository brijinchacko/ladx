"use client";

/**
 * Which project folder is open, and how anything files into it.
 *
 * One place answers "where does this go", so a tool that produces a document
 * says what kind of thing it made and nothing else. The alternative is every
 * surface knowing the folder names, which is how a project ends up with
 * drawings in three places and a handover pack missing one of them.
 *
 * Held in React state rather than localStorage, which this app does not use.
 * What survives a restart is a single line in settings.json, written through
 * the Rust side like every other preference.
 */

import {
  type DocumentKind,
  type ProjectFolder,
  listProjectFolders,
  saveIntoProject,
  setLastProject,
  setSidebarCollapsed,
  setWorkspaceDir,
  settingsLoad,
} from "@/lib/invoke";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface ProjectFolderState {
  /** The open project, or null when work is not filed anywhere. */
  project: ProjectFolder | null;
  /** Everything in the workspace folder, for the sidebar and the list. */
  projects: ProjectFolder[];
  /** Re-read the workspace folder, after creating or deleting a project. */
  refresh: () => Promise<void>;
  /** Sidebar collapsed to icons. Kept here because the shell has no store. */
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  /** Where projects live. Null until somebody has chosen. */
  workspace: string | null;
  /** True until the remembered project has been looked for, so nothing flickers. */
  loading: boolean;
  open: (project: ProjectFolder | null) => void;
  setWorkspace: (dir: string) => void;
  /**
   * File a document into the open project.
   *
   * Returns the path it was written to, or null when no project is open, so a
   * caller can fall back to a download rather than losing the file silently.
   */
  fileInto: (
    kind: DocumentKind | string,
    filename: string,
    contents: string,
  ) => Promise<string | null>;
}

const Ctx = createContext<ProjectFolderState | null>(null);

export function ProjectFolderProvider({ children }: { children: React.ReactNode }) {
  const [project, setProject] = useState<ProjectFolder | null>(null);
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  const [workspace, setWorkspaceState] = useState<string | null>(null);
  const [collapsed, setCollapsedState] = useState(false);
  const [loading, setLoading] = useState(true);

  // Put somebody back where they were. Whoever spent yesterday on one job is
  // overwhelmingly likely to be on it again this morning.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // Nothing here is worth failing a screen over. Running outside Tauri,
        // or against a settings file somebody edited by hand, means no
        // remembered project, not an error on the first thing anybody sees.
        const settings = await settingsLoad().catch(
          () => ({}) as Awaited<ReturnType<typeof settingsLoad>>,
        );
        if (!live) return;
        setWorkspaceState(settings.workspaceDir ?? null);
        setCollapsedState(settings.sidebarCollapsed ?? false);
        if (settings.workspaceDir) {
          // Found by listing rather than by reading the path directly, so a
          // project that was deleted or moved since last launch simply is not
          // there instead of throwing on the first screen of the app.
          const all = await listProjectFolders(settings.workspaceDir).catch(() => []);
          if (!live) return;
          setProjects(all);
          if (settings.lastProject) {
            setProject(all.find((p) => p.path === settings.lastProject) ?? null);
          }
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const open = useCallback((next: ProjectFolder | null) => {
    setProject(next);
    // Remembered without blocking the switch: failing to write a preference
    // must not stop somebody opening a project. Written through a command that
    // touches one field, so this and setWorkspace cannot overwrite each other.
    void setLastProject(next?.path ?? null).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!workspace) {
      setProjects([]);
      return;
    }
    setProjects(await listProjectFolders(workspace).catch(() => []));
  }, [workspace]);

  const setWorkspace = useCallback((dir: string) => {
    setWorkspaceState(dir);
    void setWorkspaceDir(dir).catch(() => {});
    void listProjectFolders(dir)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    void setSidebarCollapsed(next).catch(() => {});
  }, []);

  const fileInto = useCallback(
    async (kind: DocumentKind | string, filename: string, contents: string) => {
      if (!project) return null;
      return saveIntoProject({ project: project.path, kind, filename, contents });
    },
    [project],
  );

  const value = useMemo(
    () => ({
      project,
      projects,
      workspace,
      loading,
      collapsed,
      open,
      refresh,
      setWorkspace,
      setCollapsed,
      fileInto,
    }),
    [
      project,
      projects,
      workspace,
      loading,
      collapsed,
      open,
      refresh,
      setWorkspace,
      setCollapsed,
      fileInto,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjectFolder(): ProjectFolderState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useProjectFolder outside ProjectFolderProvider");
  }
  return ctx;
}
