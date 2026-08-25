/**
 * The arithmetic behind the Gantt, kept out of the component.
 *
 * Dates in a schedule are a source of quiet, expensive bugs: a bar one day
 * short, a task that looks finished because the clock crossed midnight in the
 * wrong timezone, a "today" line drawn in the wrong column. All of it is pure
 * given a task list and a window, so all of it is testable, and the component
 * is left doing nothing but drawing.
 *
 * Everything works in whole days at local midnight. A plan is scheduled in
 * days, not instants: an 09:00 start and a 17:00 finish are the same working
 * day, and treating them as different is how a one-day task renders as two.
 */

export const DAY_MS = 86_400_000;

export interface GanttTask {
  id: string;
  title: string;
  phase: string;
  status: "todo" | "doing" | "blocked" | "done";
  startsOn: string | null;
  dueOn: string | null;
  dependsOn: string | null;
  owner: string | null;
  projectId?: string;
  projectName?: string | null;
}

/** A task placed on the timeline. Absent when it has no dates to place. */
export interface Bar {
  id: string;
  /** Whole days from the window start. */
  offset: number;
  /** Whole days long, never less than one: a same-day task is still a day wide. */
  span: number;
  /** A single date rather than a range reads as a milestone, and is drawn as one. */
  milestone: boolean;
}

/** Midnight local, for a date or an ISO string. */
export function startOfDay(d: Date | string): Date {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole days between two dates.
 *
 * Computed from local midnights rather than by dividing the millisecond
 * difference, because a DST boundary makes one of those days 23 or 25 hours
 * long and the division then rounds a plan off by a day twice a year.
 */
export function daysBetween(from: Date | string, to: Date | string): number {
  const a = startOfDay(from);
  const b = startOfDay(to);
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * A Date as yyyy-mm-dd in local time.
 *
 * Not toISOString(): that converts to UTC first, so local midnight in BST
 * comes out as the previous day. This is the only way a calendar date should
 * ever leave a Date object in this codebase.
 */
export function toISODate(d: Date | string): string {
  const s = startOfDay(d);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date | string, n: number): Date {
  const s = startOfDay(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + n);
}

/**
 * The dates a task actually occupies.
 *
 * A task with only one of the two dates is not an error; it is the normal
 * state of a plan somebody is still filling in. One date is a milestone, both
 * are a bar, and a due date earlier than the start is treated as a same-day
 * task rather than a negative-width bar, because somebody typing dates into
 * two fields will occasionally do it in the wrong order.
 */
export function taskDates(t: GanttTask): { start: Date; end: Date; milestone: boolean } | null {
  const s = t.startsOn ? startOfDay(t.startsOn) : null;
  const e = t.dueOn ? startOfDay(t.dueOn) : null;
  if (!s && !e) return null;
  if (s && !e) return { start: s, end: s, milestone: true };
  if (!s && e) return { start: e, end: e, milestone: true };
  const start = s as Date;
  const end = e as Date;
  if (end.getTime() < start.getTime()) return { start, end: start, milestone: false };
  return { start, end, milestone: false };
}

/**
 * The window the chart covers.
 *
 * Padded by a few days either side so the first bar does not start flush
 * against the axis, and widened to include today so the marker is always on
 * screen: a plan whose work is all in the past should still show you where now
 * is, otherwise the chart looks like it failed to load.
 */
export function ganttWindow(
  tasks: GanttTask[],
  today: Date = new Date(),
  padDays = 3,
): { from: Date; to: Date; days: number } {
  const dated = tasks.map(taskDates).filter((d): d is NonNullable<typeof d> => d !== null);
  const now = startOfDay(today);

  if (dated.length === 0) {
    // Nothing is scheduled yet. Show the fortnight around today rather than a
    // blank axis, so the empty chart still says what it is.
    return { from: addDays(now, -3), to: addDays(now, 10), days: 14 };
  }

  let min = dated[0]?.start as Date;
  let max = dated[0]?.end as Date;
  for (const d of dated) {
    if (d.start.getTime() < min.getTime()) min = d.start;
    if (d.end.getTime() > max.getTime()) max = d.end;
  }
  if (now.getTime() < min.getTime()) min = now;
  if (now.getTime() > max.getTime()) max = now;

  const from = addDays(min, -padDays);
  const to = addDays(max, padDays);
  return { from, to, days: daysBetween(from, to) + 1 };
}

/** Place one task in the window, or null when it has no dates. */
export function barFor(t: GanttTask, from: Date): Bar | null {
  const d = taskDates(t);
  if (!d) return null;
  return {
    id: t.id,
    offset: daysBetween(from, d.start),
    span: Math.max(1, daysBetween(d.start, d.end) + 1),
    milestone: d.milestone,
  };
}

/**
 * Dependency links that can actually be drawn.
 *
 * A link needs both ends placed, so one pointing at an undated task is
 * dropped rather than drawn to the axis. Links to a task outside the list are
 * dropped too, which is what happens when a plan is filtered to one project
 * and the predecessor lives in another.
 */
export function linksFor(tasks: GanttTask[]): { from: string; to: string }[] {
  const placed = new Set(tasks.filter((t) => taskDates(t) !== null).map((t) => t.id));
  const out: { from: string; to: string }[] = [];
  for (const t of tasks) {
    if (!t.dependsOn) continue;
    if (t.dependsOn === t.id) continue; // a task cannot wait for itself
    if (!placed.has(t.id) || !placed.has(t.dependsOn)) continue;
    out.push({ from: t.dependsOn, to: t.id });
  }
  return out;
}

/**
 * Dependencies a plan cannot satisfy, so they can be shown rather than hidden.
 *
 * Two kinds. A cycle, where a chain of predecessors leads back to where it
 * started and nothing in it can ever begin. And a link that runs backwards,
 * where the successor is scheduled to start before the thing it waits for has
 * finished, which is the ordinary way a plan goes wrong after somebody drags
 * one bar.
 */
export function scheduleProblems(tasks: GanttTask[]): {
  cycles: string[];
  backwards: { from: string; to: string }[];
} {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const cycles: string[] = [];

  // Walk each chain with its own seen-set. A shared "visited" would mark the
  // whole component as bad once one cycle is found in it.
  for (const t of tasks) {
    const seen = new Set<string>([t.id]);
    let at = t.dependsOn;
    while (at) {
      if (seen.has(at)) {
        cycles.push(t.id);
        break;
      }
      seen.add(at);
      at = byId.get(at)?.dependsOn ?? null;
    }
  }

  const backwards: { from: string; to: string }[] = [];
  for (const t of tasks) {
    if (!t.dependsOn || cycles.includes(t.id)) continue;
    const pred = byId.get(t.dependsOn);
    if (!pred) continue;
    const a = taskDates(pred);
    const b = taskDates(t);
    if (!a || !b) continue;
    if (b.start.getTime() < a.end.getTime()) backwards.push({ from: pred.id, to: t.id });
  }

  return { cycles, backwards };
}

/** Month bands across the window, for the header. */
export function monthBands(
  from: Date,
  days: number,
): { label: string; start: number; span: number }[] {
  const out: { label: string; start: number; span: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    const last = out[out.length - 1];
    if (last && last.label === label) last.span += 1;
    else out.push({ label, start: i, span: 1 });
  }
  return out;
}

/** Saturday and Sunday, so the chart reads as working time. */
export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/* ─────────────────────────── drafting a schedule ─────────────────────────── */

/** Move to the next working day, or stay put if this one already is. */
export function nextWorkingDay(d: Date | string): Date {
  let out = startOfDay(d);
  while (isWeekend(out)) out = addDays(out, 1);
  return out;
}

/**
 * Add working days, counting the start day as the first.
 *
 * `addWorkingDays(friday, 1)` is that Friday: a one-day task starting Friday
 * finishes Friday. Two days lands on Monday, not Saturday. Getting this wrong
 * is how a plan quietly promises delivery on a weekend.
 */
export function addWorkingDays(start: Date | string, days: number): Date {
  let at = nextWorkingDay(start);
  let remaining = Math.max(1, Math.floor(days)) - 1;
  while (remaining > 0) {
    at = addDays(at, 1);
    if (!isWeekend(at)) remaining--;
  }
  return at;
}

/**
 * How long a deliverable takes, in working days.
 *
 * Rough by design. These are the numbers an estimator would put on a first
 * pass before anybody has looked at the machine, and the whole point of the
 * draft is that it is dragged into shape afterwards. A specification takes
 * longer than a register; a test protocol is written faster than it is run.
 */
const DEFAULT_DAYS: Record<string, number> = {
  "urs-user-requirement-specification": 5,
  "fds-functional-design-specification": 8,
  "control-narrative": 5,
  "software-design-specification": 5,
  "io-list": 3,
  "bom-bill-of-materials": 3,
  "cable-schedule": 3,
  "cause-and-effect-matrix": 4,
  "rats-range-alarm-trip-schedule": 2,
  "alarm-rationalisation": 3,
  "machinery-risk-assessment": 5,
  "fat-factory-acceptance-test": 5,
  "commissioning-checklist": 4,
  "sat-site-acceptance-test": 4,
  "handover-pack": 3,
  "om-manual": 5,
  "change-control-record": 2,
};

export const DEFAULT_TASK_DAYS = 3;

export function durationFor(templateSlug: string | null | undefined): number {
  return (templateSlug && DEFAULT_DAYS[templateSlug]) || DEFAULT_TASK_DAYS;
}

export interface DraftInput {
  id?: string;
  phase: string;
  templateSlug?: string | null;
  /** Declaration order within the phase, which is the order they get written in. */
  position?: number;
}

export interface DraftDates {
  startsOn: Date;
  dueOn: Date;
}

/**
 * Lay a seeded plan out on the calendar.
 *
 * Phases run one after another, because a project does not commission before
 * it is designed. Deliverables inside a phase run one after another too: they
 * are usually written by the same person, and a first-pass plan that assumes
 * eight documents in parallel is a plan that was never going to hold.
 *
 * Working days throughout, so nothing is scheduled to finish on a Sunday. The
 * result is a draft to argue with, not a commitment: every date is draggable
 * the moment it lands.
 */
export function draftSchedule<T extends DraftInput>(
  tasks: T[],
  phaseOrder: string[],
  startOn: Date | string = new Date(),
): Map<T, DraftDates> {
  const out = new Map<T, DraftDates>();
  let cursor = nextWorkingDay(startOn);

  for (const phase of phaseOrder) {
    const inPhase = tasks
      .filter((t) => t.phase === phase)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    for (const t of inPhase) {
      const startsOn = nextWorkingDay(cursor);
      const dueOn = addWorkingDays(startsOn, durationFor(t.templateSlug));
      out.set(t, { startsOn, dueOn });
      cursor = addDays(dueOn, 1);
    }
  }

  return out;
}
