import type { LadxProgram } from "@ladx/studio";

/**
 * Whether a stored program is one the scan engine can actually run.
 *
 * The save route takes `program: z.unknown()` on purpose: the shape belongs to
 * @ladx/studio and duplicating it in a route handler means maintaining it
 * twice. The cost of that decision lands here. A row written by an older build,
 * a partial write, or anything posted straight at the API can be missing the
 * fields the engine iterates, and `for (const o of rung.outputs)` on an
 * undefined throws.
 *
 * That throw used to happen inside the server render of Monitor and Convert,
 * which turned one odd row into a 500 for the whole tool: every other program
 * the user owned became unreachable because of a single bad one. Checking here
 * lets both pages list what they can run and say plainly that they could not
 * read the rest.
 *
 * Deliberately shallow. This answers "will the engine throw on the shape",
 * not "is the logic any good", and it does not repair anything: a rung silently
 * coerced to no outputs would display as a rung that does nothing, which is a
 * worse lie than admitting the program could not be read.
 */
export function isRunnableProgram(program: unknown): program is LadxProgram {
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

  // programRoutines() falls back to the flat list, so that is what gets run.
  return Array.isArray(p.rungs) && p.rungs.every(isRunnableRung);
}

/**
 * The two arrays the engine iterates unconditionally.
 *
 * `logic` is optional because rungLogic() builds a tree from `branches` when it
 * is absent, so only `branches` and `outputs` have to be there.
 */
function isRunnableRung(rung: unknown): boolean {
  if (!rung || typeof rung !== "object") return false;
  const r = rung as { branches?: unknown; outputs?: unknown };
  if (!Array.isArray(r.outputs)) return false;
  if (!Array.isArray(r.branches)) return false;
  return r.branches.every((b) => Array.isArray(b));
}

/** Split a list of stored programs into the ones that run and the ones that do not. */
export function partitionRunnable<T extends { program: unknown }>(
  rows: T[],
): {
  runnable: T[];
  broken: T[];
} {
  const runnable: T[] = [];
  const broken: T[] = [];
  for (const row of rows) (isRunnableProgram(row.program) ? runnable : broken).push(row);
  return { runnable, broken };
}
