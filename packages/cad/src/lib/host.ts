/**
 * What the CAD editor needs from whichever app is hosting it.
 *
 * Everything else in this package is pure: geometry, snapping, the DXF and PDF
 * writers, the renderer. These are the four things that are not, and each one
 * was previously a `fetch` to a web API route written directly into a
 * component.
 *
 * That is the shape of bug this repository has now hit four times: a shared
 * component reaching for HTTP that is correct on the web and cannot work on
 * the desktop, where there is no server and an outbound call is the one thing
 * the product promises not to make. So the store is required. A surface has to
 * say where its drawings live rather than inheriting an answer that happens to
 * be right for one of them.
 */

import type { Drawing, Entity, Point } from "./types";

export interface CadStore {
  /** A new sheet. Returns its id so the editor can open it. */
  create(input: { name: string; projectId: string | null; data: Drawing }): Promise<{ id: string }>;
  save(input: { id: string; name: string; data: Drawing }): Promise<boolean>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** File a sheet under a project, or under none. */
  setProject(id: string, projectId: string | null): Promise<void>;
}

/**
 * One thing a model asked for, before the editor turns it into geometry.
 *
 * Deliberately loose: `type` and `symbol` are whatever the model said, and the
 * editor resolves a symbol name against the library rather than trusting the
 * model's idea of what a contact looks like. Anything it cannot resolve is
 * counted in `dropped` rather than drawn wrong.
 */
export interface GeneratedEntity {
  type: string;
  symbol?: string;
  at?: Point;
  layer?: string;
}

/** What a generated drawing comes back as, before symbols are resolved. */
export interface GeneratedGeometry {
  entities: GeneratedEntity[];
  summary?: string;
  model?: string | null;
  /** How much the host refused to build, so the editor can say so. */
  dropped?: number;
}

export type GenerateDrawing = (req: {
  prompt: string;
  layers: string[];
  context: string;
  model: string | null;
  signal: AbortSignal;
}) => Promise<GeneratedGeometry>;

/**
 * Where this surface mounts its own pages.
 *
 * Paths rather than components, the same arrangement the ladder editor's
 * crossLinks use: the host knows where it mounted its drawing list and this
 * package does not. They were hardcoded to /studio/..., which is a route the
 * desktop does not have.
 */
export interface CadRoutes {
  /** The list of drawings. */
  list: string;
  /** One drawing. */
  sheet: (id: string) => string;
  /** A project's page, when the surface has one. */
  project?: (id: string) => string;
}

export const STUDIO_ROUTES: CadRoutes = {
  list: "/studio/cad",
  sheet: (id) => `/studio/cad/${id}`,
  project: (id) => `/studio/projects/${id}`,
};

/** Convenience for a host that has no way to build geometry from a description. */
export type MaybeGenerate = GenerateDrawing | undefined;

export type { Entity };
