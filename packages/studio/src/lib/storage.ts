import type { LadxProgram } from "./types";

/**
 * Where Studio keeps projects.
 *
 * Studio was built inside a CRM and talked to that CRM's endpoints directly.
 * That made it un-mountable anywhere else: the same component that draws a rung
 * also decided, three thousand lines down, that projects live at
 * `/api/student/ladx/:id`. Persistence is a policy, not a drawing concern, so it
 * comes in as a parameter.
 *
 * Three implementations matter:
 *   - [`localStorage`], the default. No server, no account, works offline, and
 *     is what makes the studio demo-able on a landing page.
 *   - an HTTP one the LADX web app supplies, backed by Postgres.
 *   - a Tauri one the desktop app supplies, backed by the local filesystem,
 *     which must never make a network call.
 *
 * All three are the same three methods, so Studio never learns which it has.
 */
export type StudioProject = {
  name: string;
  program: LadxProgram;
};

export type StudioStorage = {
  /** `null` means "no such project", the caller decides whether that's an error. */
  load(projectId: string): Promise<StudioProject | null>;
  save(projectId: string, project: StudioProject): Promise<void>;
  /**
   * What to tell someone after a successful save about how long this lasts.
   *
   * Retention is a property of where the project went, so the store is the only
   * thing that can say it truthfully. The CRM's three-month policy was baked
   * into the save message; on browser storage that sentence is simply false, * nothing expires, but clearing site data destroys everything. Telling
   * somebody the wrong thing about whether their work is safe is worse than
   * telling them nothing, so each store speaks for itself.
   */
  retentionNote?: string;
};

const KEY_PREFIX = "ladx.project.";

/**
 * Browser-local storage.
 *
 * Deliberately the default. A studio that needs a backend before it can draw a
 * single contact cannot be put in front of somebody in under a minute, and that
 * first minute is the whole product.
 *
 * Fails soft in every direction: no `window` (SSR), a disabled quota, or a
 * corrupted entry all return `null` rather than throwing, because losing a
 * saved project should degrade to an empty canvas, not a stack trace.
 */
export function localStorageStorage(): StudioStorage {
  return {
    retentionNote:
      "Saved in this browser only, clearing site data will remove it. " +
      "Use File → Export project to keep a copy.",

    async load(projectId) {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(KEY_PREFIX + projectId);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StudioProject;
        if (!parsed?.program) return null;
        return parsed;
      } catch {
        return null;
      }
    },

    async save(projectId, project) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(KEY_PREFIX + projectId, JSON.stringify(project));
      } catch (err) {
        // Quota exceeded, or storage disabled. The caller surfaces this; we do
        // not swallow it, because a save that silently did nothing is the one
        // failure a person must be told about.
        throw new Error(
          err instanceof Error && err.name === "QuotaExceededError"
            ? "Out of browser storage. Export the project to keep it."
            : "Could not save to this browser.",
        );
      }
    },
  };
}

/**
 * Talks to a REST backend.
 *
 * `base` is the collection URL; the project id is appended. GET returns
 * `{ name, program }`, PATCH accepts the same. This is what the CRM was doing
 * all along, now it is a choice the host makes rather than a fact of the
 * component.
 */
export function httpStorage(base: string, retentionNote?: string): StudioStorage {
  const url = (projectId: string) => `${base.replace(/\/$/, "")}/${projectId}`;

  return {
    retentionNote,

    async load(projectId) {
      const res = await fetch(url(projectId));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Could not open that project.");
      const d = await res.json();
      return { name: d.name, program: d.program };
    },

    async save(projectId, project) {
      const res = await fetch(url(projectId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(j.error ?? "Could not save.");
      }
    },
  };
}
