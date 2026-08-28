import { PHASES } from "@/lib/platform/lifecycle";

/**
 * Changes to a plan, as values.
 *
 * Everything that edits the planner goes through this list: a drag on a bar, a
 * bulk action on a selection, and anything a model proposes. Three reasons it
 * is worth the indirection.
 *
 * A model must never be given a free hand over a plan people are working to. It
 * emits operations from this vocabulary and nothing else, every one is checked
 * against the tasks that actually exist before anything is sent, and what fails
 * the check is reported rather than dropped. The model cannot invent a task id,
 * a status, or a phase, because none of those survive validation.
 *
 * Every operation carries its inverse, so undo is a real undo rather than a
 * guess. "Push commissioning back two weeks" touching forty tasks is only safe
 * to offer if one click puts all forty back exactly where they were, and that
 * needs the previous values captured at the time, not recomputed afterwards.
 *
 * And it makes the interesting part testable without a browser or a database.
 */

export type TaskStatus = "todo" | "doing" | "blocked" | "done";
const STATUSES: TaskStatus[] = ["todo", "doing", "blocked", "done"];
const PHASE_IDS = new Set<string>(PHASES.map((p) => p.id));

/** The shape the planner holds, and all an operation needs to know. */
export interface PlanTask {
  id: string;
  projectId: string;
  title: string;
  phase: string;
  /** The four the database allows. Kept narrow so the chart's type fits. */
  status: TaskStatus;
  startsOn: string | null;
  dueOn: string | null;
  dependsOn: string | null;
  owner: string | null;
  projectName?: string | null;
}

export type PlanOp =
  | { kind: "setDates"; taskId: string; startsOn: string | null; dueOn: string | null }
  | { kind: "shift"; taskId: string; days: number }
  | { kind: "setStatus"; taskId: string; status: TaskStatus }
  | { kind: "setOwner"; taskId: string; owner: string | null }
  | { kind: "setTitle"; taskId: string; title: string }
  | { kind: "link"; taskId: string; dependsOn: string | null }
  | { kind: "delete"; taskId: string }
  | {
      kind: "add";
      projectId: string;
      title: string;
      phase: string;
      startsOn?: string | null;
      dueOn?: string | null;
      owner?: string | null;
    };

export interface OpProblem {
  /** What was asked for, in the user's terms. */
  what: string;
  why: string;
}

/* ─────────────────────────────── dates ─────────────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date, kept as a string throughout. */
export function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Round trips, which rejects 2026-02-30 without a Date's timezone problems.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * Move a calendar date by whole days.
 *
 * In UTC, deliberately. A plan is calendar dates, not instants, and running
 * them through a local Date is how a task scheduled for the first of the month
 * lands on the last day of the previous one for anybody west of Greenwich.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/* ──────────────────────────── validation ──────────────────────────── */

export interface Checked {
  ops: PlanOp[];
  problems: OpProblem[];
}

/**
 * Keep the operations that can actually be carried out.
 *
 * Every one is checked against the tasks on hand. What fails is reported with
 * enough detail to be acted on, because a plan that silently ignored half of
 * what was asked is worse than one that says which half.
 */
export function checkOps(ops: PlanOp[], tasks: PlanTask[], projectIds: Set<string>): Checked {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: PlanOp[] = [];
  const problems: OpProblem[] = [];
  const name = (id: string) => byId.get(id)?.title ?? id;

  for (const op of ops) {
    if (op.kind === "add") {
      if (!projectIds.has(op.projectId)) {
        problems.push({ what: `Add "${op.title}"`, why: "that project is not on screen." });
        continue;
      }
      if (!op.title.trim()) {
        problems.push({ what: "Add a task", why: "it had no title." });
        continue;
      }
      if (!PHASE_IDS.has(op.phase)) {
        problems.push({ what: `Add "${op.title}"`, why: `${op.phase} is not a lifecycle phase.` });
        continue;
      }
      if (op.startsOn && !isDate(op.startsOn)) {
        problems.push({ what: `Add "${op.title}"`, why: `${op.startsOn} is not a date.` });
        continue;
      }
      if (op.dueOn && !isDate(op.dueOn)) {
        problems.push({ what: `Add "${op.title}"`, why: `${op.dueOn} is not a date.` });
        continue;
      }
      out.push(op);
      continue;
    }

    const task = byId.get(op.taskId);
    if (!task) {
      problems.push({ what: `Change ${op.taskId}`, why: "there is no such task here." });
      continue;
    }

    switch (op.kind) {
      case "setDates": {
        if (op.startsOn !== null && !isDate(op.startsOn)) {
          problems.push({ what: `Date ${name(op.taskId)}`, why: `${op.startsOn} is not a date.` });
          continue;
        }
        if (op.dueOn !== null && !isDate(op.dueOn)) {
          problems.push({ what: `Date ${name(op.taskId)}`, why: `${op.dueOn} is not a date.` });
          continue;
        }
        if (op.startsOn && op.dueOn && op.dueOn < op.startsOn) {
          problems.push({
            what: `Date ${name(op.taskId)}`,
            why: "the due date was before the start.",
          });
          continue;
        }
        out.push(op);
        break;
      }
      case "shift": {
        if (!Number.isInteger(op.days) || op.days === 0) {
          problems.push({ what: `Move ${name(op.taskId)}`, why: "the shift was not whole days." });
          continue;
        }
        if (!task.startsOn && !task.dueOn) {
          problems.push({
            what: `Move ${name(op.taskId)}`,
            why: "it has no dates yet, so there is nothing to move.",
          });
          continue;
        }
        out.push(op);
        break;
      }
      case "setStatus": {
        if (!STATUSES.includes(op.status)) {
          problems.push({
            what: `Set ${name(op.taskId)}`,
            why: `${op.status} is not one of to do, doing, blocked or done.`,
          });
          continue;
        }
        out.push(op);
        break;
      }
      case "link": {
        if (op.dependsOn === op.taskId) {
          problems.push({ what: `Link ${name(op.taskId)}`, why: "a task cannot wait for itself." });
          continue;
        }
        if (op.dependsOn && !byId.has(op.dependsOn)) {
          problems.push({
            what: `Link ${name(op.taskId)}`,
            why: "the task it would wait for is not here.",
          });
          continue;
        }
        // A cycle would make the chart undrawable and the plan meaningless.
        if (op.dependsOn && wouldCycle(op.taskId, op.dependsOn, byId)) {
          problems.push({
            what: `Link ${name(op.taskId)}`,
            why: "that would make a loop of tasks waiting for each other.",
          });
          continue;
        }
        out.push(op);
        break;
      }
      case "setTitle": {
        if (!op.title.trim()) {
          problems.push({ what: `Rename ${name(op.taskId)}`, why: "the new title was empty." });
          continue;
        }
        out.push(op);
        break;
      }
      default:
        out.push(op);
    }
  }

  return { ops: out, problems };
}

/** Whether making `taskId` wait for `on` closes a loop. */
function wouldCycle(taskId: string, on: string, byId: Map<string, PlanTask>): boolean {
  const seen = new Set<string>([taskId]);
  let cursor: string | null = on;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.dependsOn ?? null;
  }
  return false;
}

/* ───────────────────────────── applying ───────────────────────────── */

/**
 * What one operation does to a task, as the patch body the API takes.
 *
 * Returned rather than sent, so the same function serves the optimistic local
 * update and the request. Two code paths computing the same change is how the
 * screen and the database end up disagreeing after a drag.
 */
export function patchFor(op: PlanOp, task: PlanTask): Record<string, unknown> | null {
  switch (op.kind) {
    case "setDates":
      return { startsOn: op.startsOn, dueOn: op.dueOn };
    case "shift": {
      return {
        startsOn: task.startsOn ? addDays(task.startsOn, op.days) : null,
        dueOn: task.dueOn ? addDays(task.dueOn, op.days) : null,
      };
    }
    case "setStatus":
      return { status: op.status };
    case "setOwner":
      return { owner: op.owner };
    case "setTitle":
      return { title: op.title };
    case "link":
      return { dependsOn: op.dependsOn };
    default:
      return null;
  }
}

/** The same change, applied to a task in memory. */
export function applyOp(op: PlanOp, task: PlanTask): PlanTask {
  const patch = patchFor(op, task);
  if (!patch) return task;
  return { ...task, ...(patch as Partial<PlanTask>) };
}

/**
 * The operation that puts a task back.
 *
 * Captured from the task as it is now, before anything is applied. Recomputing
 * an inverse afterwards cannot work: once a shift has happened there is no way
 * to tell a task that moved from one that was already there.
 */
export function inverseOf(op: PlanOp, task: PlanTask): PlanOp | null {
  switch (op.kind) {
    case "setDates":
    case "shift":
      return {
        kind: "setDates",
        taskId: task.id,
        startsOn: task.startsOn,
        dueOn: task.dueOn,
      };
    case "setStatus":
      return { kind: "setStatus", taskId: task.id, status: task.status };
    case "setOwner":
      return { kind: "setOwner", taskId: task.id, owner: task.owner };
    case "setTitle":
      return { kind: "setTitle", taskId: task.id, title: task.title };
    case "link":
      return { kind: "link", taskId: task.id, dependsOn: task.dependsOn };
    default:
      // Creating and deleting are not undone by an inverse operation: one needs
      // the row back with its id, the other needs it gone. The caller handles
      // those, and says so rather than offering an undo that does nothing.
      return null;
  }
}

/* ───────────────────────────── describing ───────────────────────────── */

/** One operation in a sentence, for the reply and for the audit. */
export function describeOp(op: PlanOp, tasks: PlanTask[]): string {
  const t = "taskId" in op ? tasks.find((x) => x.id === op.taskId) : undefined;
  const who = t?.title ?? ("taskId" in op ? op.taskId : "");
  switch (op.kind) {
    case "setDates":
      return op.startsOn || op.dueOn
        ? `${who} moved to ${op.startsOn ?? "no start"} until ${op.dueOn ?? "no end"}`
        : `${who} taken off the timeline`;
    case "shift":
      return `${who} moved ${Math.abs(op.days)} day${Math.abs(op.days) === 1 ? "" : "s"} ${op.days > 0 ? "later" : "earlier"}`;
    case "setStatus":
      return `${who} set to ${op.status}`;
    case "setOwner":
      return op.owner ? `${who} assigned to ${op.owner}` : `${who} unassigned`;
    case "setTitle":
      return `${who} renamed to ${op.title}`;
    case "link": {
      const on = op.dependsOn ? tasks.find((x) => x.id === op.dependsOn)?.title : null;
      return on ? `${who} now waits for ${on}` : `${who} no longer waits for anything`;
    }
    case "delete":
      return `${who} deleted`;
    case "add":
      return `${op.title} added`;
  }
}

/* ─────────────────────────── reading a plan ─────────────────────────── */

/**
 * What is late, and what is about to be.
 *
 * The question a planner is opened to answer, and it was not on screen: you had
 * to read the bars against the today line and work it out. Late is unambiguous:
 * a due date in the past and not done. At risk is a judgement, so it is a small
 * window rather than a clever model.
 */
export function health(
  tasks: PlanTask[],
  today: string,
): { late: PlanTask[]; soon: PlanTask[]; unscheduled: PlanTask[] } {
  const soonEdge = addDays(today, 7);
  const late: PlanTask[] = [];
  const soon: PlanTask[] = [];
  const unscheduled: PlanTask[] = [];

  for (const t of tasks) {
    if (t.status === "done") continue;
    if (!t.startsOn && !t.dueOn) {
      unscheduled.push(t);
      continue;
    }
    if (t.dueOn && t.dueOn < today) late.push(t);
    else if (t.dueOn && t.dueOn <= soonEdge) soon.push(t);
  }
  return { late, soon, unscheduled };
}

/** Today as a calendar date, in the viewer's own timezone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
