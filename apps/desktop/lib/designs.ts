/**
 * The shared studio pieces, re-exported for the desktop.
 *
 * Also the runnable guard, which the cloud build learned it needed: a stored
 * program can be any shape, and `for (const o of rung.outputs)` on an
 * undefined throws inside a render and takes the whole tool down. The cloud
 * version lives in apps/web; this is the same check, kept here because the
 * desktop reads its programs from a different store and must defend itself
 * just as hard.
 */

export { ConvertWorkbench, Monitor, ladxProgramFromIr, reportToNotes } from "@ladx/studio";
export type { ConvertSource, LadxProgram, ProgramSource, Tag } from "@ladx/studio";

function isRunnableRung(rung: unknown): boolean {
  if (!rung || typeof rung !== "object") return false;
  const r = rung as { branches?: unknown; outputs?: unknown };
  if (!Array.isArray(r.outputs)) return false;
  if (!Array.isArray(r.branches)) return false;
  return r.branches.every((b) => Array.isArray(b));
}

export function isRunnableProgram(program: unknown): boolean {
  if (!program || typeof program !== "object" || Array.isArray(program)) return false;
  const p = program as { rungs?: unknown; routines?: unknown; tags?: unknown };
  if (p.tags !== undefined && !Array.isArray(p.tags)) return false;

  const routines = p.routines;
  if (Array.isArray(routines) && routines.length > 0) {
    return routines.every((r) => {
      if (!r || typeof r !== "object") return false;
      const rungs = (r as { rungs?: unknown }).rungs;
      return Array.isArray(rungs) && rungs.every(isRunnableRung);
    });
  }
  return Array.isArray(p.rungs) && p.rungs.every(isRunnableRung);
}

/** Split stored programs into the ones that run and the ones that do not. */
export function partitionRunnableLike<T extends { program: unknown }>(
  rows: T[],
): { runnable: T[]; broken: T[] } {
  const runnable: T[] = [];
  const broken: T[] = [];
  for (const row of rows) (isRunnableProgram(row.program) ? runnable : broken).push(row);
  return { runnable, broken };
}
