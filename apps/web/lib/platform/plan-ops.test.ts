/**
 * What a change to a plan must not be allowed to do.
 *
 * Most of these are about a model. It emits operations from this vocabulary and
 * every one is checked before anything is sent, so the tests are the list of
 * things it might reasonably produce that would quietly damage a plan people
 * are working to: a task id it invented, a status that does not exist, a date
 * that is not a date, a dependency loop.
 *
 * The rest are about dates, because a plan is calendar dates and every bug in
 * this area comes from routing one through a local Date.
 */

import { describe, expect, it } from "vitest";
import {
  type PlanOp,
  type PlanTask,
  addDays,
  applyOp,
  checkOps,
  describeOp,
  health,
  inverseOf,
  isDate,
  patchFor,
  todayIso,
} from "./plan-ops";

const task = (over: Partial<PlanTask> = {}): PlanTask => ({
  id: "t1",
  projectId: "p1",
  title: "Write the FDS",
  phase: "requirements",
  status: "todo",
  startsOn: "2026-03-02",
  dueOn: "2026-03-06",
  dependsOn: null,
  owner: null,
  ...over,
});

const projects = new Set(["p1", "p2"]);

describe("dates", () => {
  it("accepts a calendar date", () => {
    expect(isDate("2026-03-02")).toBe(true);
  });

  it("rejects what is not one", () => {
    for (const bad of ["", "2026-3-2", "02/03/2026", "2026-13-01", "2026-02-30", 20260302, null]) {
      expect(isDate(bad)).toBe(false);
    }
  });

  it("moves a date by whole days", () => {
    expect(addDays("2026-03-02", 14)).toBe("2026-03-16");
    expect(addDays("2026-03-02", -2)).toBe("2026-02-28");
  });

  it("crosses a month and a year", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap year", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("does not drift a day, whatever the timezone", () => {
    // The bug this exists to prevent: a plan is calendar dates, and running one
    // through a local Date lands it on the previous day west of Greenwich.
    expect(addDays("2026-03-01", 0)).toBe("2026-03-01");
    expect(addDays("2026-01-01", 0)).toBe("2026-01-01");
  });
});

describe("checking what a model asked for", () => {
  const tasks = [task(), task({ id: "t2", title: "Draw the panel", phase: "design" })];

  it("keeps an operation that makes sense", () => {
    const { ops, problems } = checkOps(
      [{ kind: "shift", taskId: "t1", days: 14 }],
      tasks,
      projects,
    );
    expect(ops).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it("refuses a task id it invented", () => {
    const { ops, problems } = checkOps(
      [{ kind: "shift", taskId: "made-up", days: 1 }],
      tasks,
      projects,
    );
    expect(ops).toEqual([]);
    expect(problems[0]?.why).toContain("no such task");
  });

  it("refuses a status that is not one", () => {
    const { ops, problems } = checkOps(
      [{ kind: "setStatus", taskId: "t1", status: "finished" as never }],
      tasks,
      projects,
    );
    expect(ops).toEqual([]);
    expect(problems[0]?.why).toContain("not one of");
  });

  it("refuses a date that is not a date", () => {
    const { ops, problems } = checkOps(
      [{ kind: "setDates", taskId: "t1", startsOn: "next Tuesday", dueOn: null }],
      tasks,
      projects,
    );
    expect(ops).toEqual([]);
    expect(problems[0]?.why).toContain("not a date");
  });

  it("refuses a due date before its start", () => {
    const { ops } = checkOps(
      [{ kind: "setDates", taskId: "t1", startsOn: "2026-03-10", dueOn: "2026-03-01" }],
      tasks,
      projects,
    );
    expect(ops).toEqual([]);
  });

  it("refuses to move a task that has no dates", () => {
    const undated = [task({ id: "t3", startsOn: null, dueOn: null })];
    const { ops, problems } = checkOps(
      [{ kind: "shift", taskId: "t3", days: 5 }],
      undated,
      projects,
    );
    expect(ops).toEqual([]);
    expect(problems[0]?.why).toContain("no dates yet");
  });

  it("refuses a task waiting for itself", () => {
    const { ops } = checkOps([{ kind: "link", taskId: "t1", dependsOn: "t1" }], tasks, projects);
    expect(ops).toEqual([]);
  });

  it("refuses a dependency loop", () => {
    // t1 waits for t2 already; making t2 wait for t1 closes the ring, and the
    // chart would have nothing to draw.
    const linked = [task({ id: "t1", dependsOn: "t2" }), task({ id: "t2" })];
    const { ops, problems } = checkOps(
      [{ kind: "link", taskId: "t2", dependsOn: "t1" }],
      linked,
      projects,
    );
    expect(ops).toEqual([]);
    expect(problems[0]?.why).toContain("loop");
  });

  it("refuses a longer dependency loop", () => {
    const chain = [
      task({ id: "a", dependsOn: "b" }),
      task({ id: "b", dependsOn: "c" }),
      task({ id: "c" }),
    ];
    const { ops } = checkOps([{ kind: "link", taskId: "c", dependsOn: "a" }], chain, projects);
    expect(ops).toEqual([]);
  });

  it("allows a link that does not close a loop", () => {
    const { ops } = checkOps([{ kind: "link", taskId: "t2", dependsOn: "t1" }], tasks, projects);
    expect(ops).toHaveLength(1);
  });

  it("refuses adding to a project that is not on screen", () => {
    const { ops, problems } = checkOps(
      [{ kind: "add", projectId: "somewhere-else", title: "FAT", phase: "testing" }],
      tasks,
      projects,
    );
    expect(ops).toEqual([]);
    expect(problems[0]?.why).toContain("not on screen");
  });

  it("refuses adding with a phase that does not exist", () => {
    const { ops, problems } = checkOps(
      [{ kind: "add", projectId: "p1", title: "FAT", phase: "vibes" }],
      tasks,
      projects,
    );
    expect(ops).toEqual([]);
    expect(problems[0]?.why).toContain("not a lifecycle phase");
  });

  it("keeps the good ones and reports the bad, rather than refusing everything", () => {
    // The behaviour that makes a bulk change usable: forty good operations are
    // not thrown away because the model got one wrong.
    const { ops, problems } = checkOps(
      [
        { kind: "shift", taskId: "t1", days: 7 },
        { kind: "shift", taskId: "nope", days: 7 },
        { kind: "shift", taskId: "t2", days: 7 },
      ],
      tasks,
      projects,
    );
    expect(ops).toHaveLength(2);
    expect(problems).toHaveLength(1);
  });
});

describe("applying", () => {
  it("shifts both ends of a task", () => {
    const t = task();
    const out = applyOp({ kind: "shift", taskId: "t1", days: 7 }, t);
    expect(out.startsOn).toBe("2026-03-09");
    expect(out.dueOn).toBe("2026-03-13");
  });

  it("shifts only the end that exists", () => {
    const t = task({ startsOn: null });
    const out = applyOp({ kind: "shift", taskId: "t1", days: 7 }, t);
    expect(out.startsOn).toBeNull();
    expect(out.dueOn).toBe("2026-03-13");
  });

  it("produces the same change for the screen and for the request", () => {
    // Two code paths computing the same edit is how the screen and the database
    // end up disagreeing after a drag.
    const t = task();
    const op: PlanOp = { kind: "shift", taskId: "t1", days: 3 };
    const patch = patchFor(op, t);
    expect(applyOp(op, t)).toEqual({ ...t, ...patch });
  });
});

describe("undo", () => {
  it("puts dates back where they were, from before the change", () => {
    const t = task();
    const back = inverseOf({ kind: "shift", taskId: "t1", days: 30 }, t);
    const moved = applyOp({ kind: "shift", taskId: "t1", days: 30 }, t);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(applyOp(back, moved)).toEqual(t);
  });

  it("puts a status back", () => {
    const t = task({ status: "doing" });
    const back = inverseOf({ kind: "setStatus", taskId: "t1", status: "done" }, t);
    expect(back).toEqual({ kind: "setStatus", taskId: "t1", status: "doing" });
  });

  it("puts an owner back, including to nobody", () => {
    const t = task({ owner: null });
    expect(inverseOf({ kind: "setOwner", taskId: "t1", owner: "Priya" }, t)).toEqual({
      kind: "setOwner",
      taskId: "t1",
      owner: null,
    });
  });

  it("offers nothing for a create or a delete", () => {
    // Neither is undone by an inverse operation: one needs the row back with
    // its id, the other needs it gone. Saying so beats an undo that does
    // nothing.
    expect(inverseOf({ kind: "delete", taskId: "t1" }, task())).toBeNull();
    expect(
      inverseOf({ kind: "add", projectId: "p1", title: "x", phase: "design" }, task()),
    ).toBeNull();
  });
});

describe("reading a plan", () => {
  const today = "2026-03-10";
  const tasks = [
    task({ id: "late", dueOn: "2026-03-05" }),
    task({ id: "soon", dueOn: "2026-03-12" }),
    task({ id: "far", dueOn: "2026-05-01" }),
    task({ id: "done", dueOn: "2026-01-01", status: "done" }),
    task({ id: "undated", startsOn: null, dueOn: null }),
  ];

  it("finds what is late", () => {
    expect(health(tasks, today).late.map((t) => t.id)).toEqual(["late"]);
  });

  it("does not call a finished task late", () => {
    // Overdue and done is not a problem, it is a job that took longer.
    expect(health(tasks, today).late.map((t) => t.id)).not.toContain("done");
  });

  it("finds what is due within the week", () => {
    expect(health(tasks, today).soon.map((t) => t.id)).toEqual(["soon"]);
  });

  it("does not call something a month out at risk", () => {
    expect(health(tasks, today).soon.map((t) => t.id)).not.toContain("far");
  });

  it("counts what has no dates at all", () => {
    expect(health(tasks, today).unscheduled.map((t) => t.id)).toEqual(["undated"]);
  });
});

describe("describing", () => {
  const tasks = [task(), task({ id: "t2", title: "Draw the panel" })];

  it("says what a shift did, in days and direction", () => {
    expect(describeOp({ kind: "shift", taskId: "t1", days: 14 }, tasks)).toContain("14 days later");
    expect(describeOp({ kind: "shift", taskId: "t1", days: -1 }, tasks)).toContain("1 day earlier");
  });

  it("names the task a link points at", () => {
    expect(describeOp({ kind: "link", taskId: "t1", dependsOn: "t2" }, tasks)).toContain(
      "waits for Draw the panel",
    );
  });

  it("says when something is taken off the timeline", () => {
    expect(
      describeOp({ kind: "setDates", taskId: "t1", startsOn: null, dueOn: null }, tasks),
    ).toContain("off the timeline");
  });
});

describe("today", () => {
  it("is a calendar date in the viewer's own timezone", () => {
    const d = new Date(2026, 2, 9, 23, 30);
    expect(todayIso(d)).toBe("2026-03-09");
  });
});
