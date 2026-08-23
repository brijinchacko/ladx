import type { LadxProgram, Rung, Tag } from "./types";

/**
 * Taking a project out of the portal, and bringing one back in.
 *
 * Projects are kept in the portal for three months. That is a deliberate
 * limit, not a technical one: a student's account fills with experiments, most
 * of which are one afternoon's work, and keeping every one of them forever
 * means the six that matter are buried among a hundred that do not. Anything
 * worth keeping past that is exported, which is also how it survives leaving
 * the course.
 *
 * The file is versioned and labelled. A bare dump of the program is fine until
 * the shape changes, at which point an old file either fails in a way nobody
 * can read or, worse, imports as something subtly wrong. The header says what
 * it is, when it left, and which version wrote it, so a file from a year ago
 * can be told what to do with itself.
 */

/** How long the portal keeps a project after it was last touched. */
export const RETENTION_MONTHS = 3;

export const RETENTION_NOTE = `Projects stay in the portal for ${RETENTION_MONTHS} months after you last open them. Export anything you want to keep for longer, File → Export project.`;

export const FORMAT = "ladx-project";
export const FORMAT_VERSION = 1;

export type PortableProject = {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  exportedBy?: string;
  /** Free text, so a file is recognisable without opening the editor. */
  note?: string;
  name: string;
  program: LadxProgram;
};

/** When the portal would drop a project last touched at this moment. */
export function expiresAt(lastTouched: Date): Date {
  const d = new Date(lastTouched);
  d.setMonth(d.getMonth() + RETENTION_MONTHS);
  return d;
}

/** "3 months" / "18 days" / "today", how long a project has left. */
export function retentionLeft(lastTouched: Date, now: Date = new Date()): string {
  const end = expiresAt(lastTouched);
  const days = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "due to be removed";
  if (days === 1) return "1 day left";
  if (days < 31) return `${days} days left`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} left`;
}

export function buildExport(opts: {
  name: string;
  program: LadxProgram;
  exportedBy?: string;
  note?: string;
}): PortableProject {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: opts.exportedBy,
    note: opts.note,
    name: opts.name || "Untitled",
    program: opts.program,
  };
}

export type ImportResult =
  | { ok: true; name: string; program: LadxProgram; exportedAt?: string; exportedBy?: string }
  | { ok: false; error: string };

/**
 * Read a file back, and say plainly why not when it cannot be read.
 *
 * Every rejection names the actual problem. "Invalid file" tells somebody
 * nothing about whether they picked the wrong file, exported from a different
 * tool, or hit a genuine bug: and they will send all three to the trainer as
 * the same complaint.
 */
export function parseImport(raw: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: "That file is not JSON. A LADX export ends in .json, check you picked the right file.",
    };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, error: "That file does not contain a project." };
  }

  const d = data as Partial<PortableProject> & { rungs?: unknown; tags?: unknown };

  /*
   * A bare program is accepted too.
   *
   * Every export written before this format existed was the program on its
   * own. Refusing those would strand exactly the people who exported their
   * work because they were told to, which is the opposite of the point.
   */
  if (!d.format && Array.isArray(d.rungs) && Array.isArray(d.tags)) {
    const program = data as unknown as LadxProgram;
    const problem = checkProgram(program);
    if (problem) return { ok: false, error: problem };
    return { ok: true, name: (program as { name?: string }).name || "Imported project", program };
  }

  if (d.format !== FORMAT) {
    return { ok: false, error: "That is not a LADX project file." };
  }
  if (typeof d.version !== "number" || d.version > FORMAT_VERSION) {
    return {
      ok: false,
      error: `That file was written by a newer version of LADX Mini (format ${d.version}). Update the page and try again.`,
    };
  }
  if (!d.program) {
    return { ok: false, error: "That file has a LADX header but no program in it." };
  }

  const problem = checkProgram(d.program);
  if (problem) return { ok: false, error: problem };

  return {
    ok: true,
    name: d.name || "Imported project",
    program: d.program,
    exportedAt: d.exportedAt,
    exportedBy: d.exportedBy,
  };
}

/** Enough of a shape check that a bad file fails here, not three screens later. */
function checkProgram(p: LadxProgram): string | null {
  if (!p || typeof p !== "object") return "The program in that file is not readable.";

  const routines = (p as { routines?: { rungs?: unknown }[] }).routines;
  const hasRoutines = Array.isArray(routines) && routines.length > 0;
  if (!hasRoutines && !Array.isArray(p.rungs)) {
    return "That file has no networks in it.";
  }
  if (!Array.isArray(p.tags)) {
    return "That file has no tag table in it.";
  }

  const badTag = (p.tags as Tag[]).find((t) => !t || typeof t.name !== "string" || !t.name);
  if (badTag) return "One of the tags in that file has no name.";

  const rungs: Rung[] = hasRoutines
    ? (routines as { rungs?: Rung[] }[]).flatMap((r) => r.rungs ?? [])
    : (p.rungs as Rung[]);

  const badRung = rungs.find((r) => !r || (!Array.isArray(r.outputs) && !r.logic && !r.branches));
  if (badRung) return "One of the networks in that file is missing its contents.";

  return null;
}
