import { describe, expect, it } from "vitest";
import {
  type GanttTask,
  addDays,
  addWorkingDays,
  barFor,
  daysBetween,
  draftSchedule,
  ganttWindow,
  isWeekend,
  linksFor,
  monthBands,
  nextWorkingDay,
  scheduleProblems,
  startOfDay,
  taskDates,
  toISODate,
} from "./gantt";

const task = (o: Partial<GanttTask> & { id: string }): GanttTask => ({
  title: o.id,
  phase: "design",
  status: "todo",
  startsOn: null,
  dueOn: null,
  dependsOn: null,
  owner: null,
  ...o,
});

describe("day arithmetic", () => {
  it("counts whole days, not milliseconds", () => {
    expect(daysBetween("2026-03-01T09:00:00", "2026-03-04T17:00:00")).toBe(3);
  });

  it("survives the spring DST boundary", () => {
    // In Europe/London 2026-03-29 is 23 hours long. Dividing the millisecond
    // difference by 86.4e6 gives 6.96 days here, which floors to 6 and draws
    // the plan a day short. Counting local midnights gives 7.
    expect(daysBetween("2026-03-26", "2026-04-02")).toBe(7);
  });

  it("survives the autumn boundary too, where a day is 25 hours", () => {
    expect(daysBetween("2026-10-22", "2026-10-29")).toBe(7);
  });

  it("treats any time of day as the same day", () => {
    expect(daysBetween("2026-03-01T00:00:00", "2026-03-01T23:59:59")).toBe(0);
  });

  it("addDays crosses a month end", () => {
    expect(startOfDay(addDays("2026-01-30", 3)).toDateString()).toBe(
      new Date(2026, 1, 2).toDateString(),
    );
  });
});

describe("taskDates", () => {
  it("is nothing when the task has no dates", () => {
    expect(taskDates(task({ id: "a" }))).toBeNull();
  });

  it("is a milestone with only one date", () => {
    expect(taskDates(task({ id: "a", dueOn: "2026-03-04" }))?.milestone).toBe(true);
    expect(taskDates(task({ id: "b", startsOn: "2026-03-04" }))?.milestone).toBe(true);
  });

  it("is a bar with both", () => {
    const d = taskDates(task({ id: "a", startsOn: "2026-03-01", dueOn: "2026-03-05" }));
    expect(d?.milestone).toBe(false);
    expect(daysBetween(d?.start as Date, d?.end as Date)).toBe(4);
  });

  it("collapses a due date typed before the start rather than going negative", () => {
    // Two date fields, and people fill them in whichever order they think of.
    // A negative span would render as a bar drawn backwards over its neighbours.
    const d = taskDates(task({ id: "a", startsOn: "2026-03-10", dueOn: "2026-03-01" }));
    expect(d?.start.getTime()).toBe(d?.end.getTime());
  });
});

describe("barFor", () => {
  const from = startOfDay("2026-03-01");

  it("places a bar at the right offset and width", () => {
    const b = barFor(task({ id: "a", startsOn: "2026-03-04", dueOn: "2026-03-06" }), from);
    expect(b).toEqual({ id: "a", offset: 3, span: 3, milestone: false });
  });

  it("gives a same-day task a full day of width", () => {
    // A zero-width bar is invisible, and a one-day task is the commonest kind.
    const b = barFor(task({ id: "a", startsOn: "2026-03-04", dueOn: "2026-03-04" }), from);
    expect(b?.span).toBe(1);
  });

  it("is null for an undated task", () => {
    expect(barFor(task({ id: "a" }), from)).toBeNull();
  });
});

describe("ganttWindow", () => {
  const today = new Date(2026, 2, 15);

  it("shows a fortnight around today when nothing is scheduled", () => {
    const w = ganttWindow([], today);
    expect(w.days).toBe(14);
    expect(daysBetween(w.from, today)).toBe(3);
  });

  it("spans the work with padding either side", () => {
    const w = ganttWindow([task({ id: "a", startsOn: "2026-03-10", dueOn: "2026-03-20" })], today);
    expect(daysBetween(w.from, "2026-03-10")).toBe(3);
    expect(daysBetween("2026-03-20", w.to)).toBe(3);
  });

  it("stretches to include today when all the work is in the past", () => {
    // Otherwise the today marker falls outside the chart and the plan looks
    // like it failed to render.
    const w = ganttWindow([task({ id: "a", startsOn: "2026-01-05", dueOn: "2026-01-09" })], today);
    expect(w.to.getTime()).toBeGreaterThanOrEqual(startOfDay(today).getTime());
  });

  it("stretches backwards when all the work is in the future", () => {
    const w = ganttWindow([task({ id: "a", startsOn: "2026-06-01", dueOn: "2026-06-09" })], today);
    expect(w.from.getTime()).toBeLessThanOrEqual(startOfDay(today).getTime());
  });

  it("ignores undated tasks when sizing", () => {
    const w = ganttWindow(
      [task({ id: "a", startsOn: "2026-03-10", dueOn: "2026-03-12" }), task({ id: "b" })],
      today,
    );
    expect(daysBetween(w.from, "2026-03-10")).toBe(3);
  });
});

describe("linksFor", () => {
  const dated = (id: string, dep?: string) =>
    task({ id, startsOn: "2026-03-01", dueOn: "2026-03-02", dependsOn: dep ?? null });

  it("links two placed tasks", () => {
    expect(linksFor([dated("a"), dated("b", "a")])).toEqual([{ from: "a", to: "b" }]);
  });

  it("drops a link to an undated task rather than drawing it to the axis", () => {
    expect(linksFor([task({ id: "a" }), dated("b", "a")])).toEqual([]);
  });

  it("drops a link to a task that is not in the list", () => {
    // What happens when the plan is filtered to one project and the
    // predecessor belongs to another.
    expect(linksFor([dated("b", "missing")])).toEqual([]);
  });

  it("refuses a task that depends on itself", () => {
    expect(linksFor([dated("a", "a")])).toEqual([]);
  });
});

describe("scheduleProblems", () => {
  const at = (id: string, start: string, end: string, dep?: string) =>
    task({ id, startsOn: start, dueOn: end, dependsOn: dep ?? null });

  it("finds a two-task cycle", () => {
    const { cycles } = scheduleProblems([
      at("a", "2026-03-01", "2026-03-02", "b"),
      at("b", "2026-03-03", "2026-03-04", "a"),
    ]);
    expect(cycles.sort()).toEqual(["a", "b"]);
  });

  it("finds a longer cycle", () => {
    const { cycles } = scheduleProblems([
      at("a", "2026-03-01", "2026-03-02", "c"),
      at("b", "2026-03-03", "2026-03-04", "a"),
      at("c", "2026-03-05", "2026-03-06", "b"),
    ]);
    expect(cycles.length).toBe(3);
  });

  it("does not blame a healthy chain that merely shares a component with none", () => {
    const { cycles } = scheduleProblems([
      at("a", "2026-03-01", "2026-03-02"),
      at("b", "2026-03-03", "2026-03-04", "a"),
      at("c", "2026-03-05", "2026-03-06", "b"),
    ]);
    expect(cycles).toEqual([]);
  });

  it("flags a successor that starts before its predecessor finishes", () => {
    const { backwards } = scheduleProblems([
      at("a", "2026-03-05", "2026-03-10"),
      at("b", "2026-03-07", "2026-03-12", "a"),
    ]);
    expect(backwards).toEqual([{ from: "a", to: "b" }]);
  });

  it("accepts a successor that starts the day the predecessor ends", () => {
    const { backwards } = scheduleProblems([
      at("a", "2026-03-05", "2026-03-10"),
      at("b", "2026-03-10", "2026-03-12", "a"),
    ]);
    expect(backwards).toEqual([]);
  });

  it("does not report a cycle as backwards as well, which would double-count it", () => {
    const p = scheduleProblems([
      at("a", "2026-03-01", "2026-03-09", "b"),
      at("b", "2026-03-02", "2026-03-08", "a"),
    ]);
    expect(p.cycles.length).toBe(2);
    expect(p.backwards).toEqual([]);
  });
});

describe("monthBands", () => {
  it("groups the window into months with the right widths", () => {
    const bands = monthBands(startOfDay("2026-01-30"), 5); // 30, 31 Jan then 1-3 Feb
    expect(bands.map((b) => b.span)).toEqual([2, 3]);
    expect(bands[0]?.start).toBe(0);
    expect(bands[1]?.start).toBe(2);
  });

  it("is one band when the window sits inside a month", () => {
    expect(monthBands(startOfDay("2026-03-02"), 5)).toHaveLength(1);
  });
});

describe("isWeekend", () => {
  it("knows Saturday and Sunday", () => {
    expect(isWeekend(new Date(2026, 2, 7))).toBe(true);
    expect(isWeekend(new Date(2026, 2, 8))).toBe(true);
    expect(isWeekend(new Date(2026, 2, 9))).toBe(false);
  });
});

describe("working days", () => {
  it("a one-day task starting Friday finishes Friday", () => {
    // Off-by-one here is how a plan promises delivery on a Saturday.
    const fri = new Date(2026, 2, 6);
    expect(addWorkingDays(fri, 1).toDateString()).toBe(fri.toDateString());
  });

  it("two days from Friday lands on Monday", () => {
    expect(addWorkingDays(new Date(2026, 2, 6), 2).toDateString()).toBe(
      new Date(2026, 2, 9).toDateString(),
    );
  });

  it("a full working week from Monday ends on Friday", () => {
    expect(addWorkingDays(new Date(2026, 2, 2), 5).toDateString()).toBe(
      new Date(2026, 2, 6).toDateString(),
    );
  });

  it("starting on a weekend rolls forward to Monday", () => {
    expect(nextWorkingDay(new Date(2026, 2, 7)).toDateString()).toBe(
      new Date(2026, 2, 9).toDateString(),
    );
  });

  it("never finishes on a weekend", () => {
    for (let d = 1; d <= 20; d++) {
      for (let s = 2; s <= 8; s++) {
        expect(isWeekend(addWorkingDays(new Date(2026, 2, s), d))).toBe(false);
      }
    }
  });
});

describe("draftSchedule", () => {
  const phases = ["requirements", "design", "development"];
  const t = (phase: string, slug: string | null, position: number) => ({
    phase,
    templateSlug: slug,
    position,
  });

  it("runs phases in order and never overlaps them", () => {
    const tasks = [
      t("development", "io-list", 0),
      t("requirements", "urs-user-requirement-specification", 0),
      t("design", "fds-functional-design-specification", 0),
    ];
    const s = draftSchedule(tasks, phases, new Date(2026, 2, 2));
    const urs = s.get(tasks[1] as (typeof tasks)[0]);
    const fds = s.get(tasks[2] as (typeof tasks)[0]);
    const io = s.get(tasks[0] as (typeof tasks)[0]);
    expect((fds as { startsOn: Date }).startsOn.getTime()).toBeGreaterThan(
      (urs as { dueOn: Date }).dueOn.getTime(),
    );
    expect((io as { startsOn: Date }).startsOn.getTime()).toBeGreaterThan(
      (fds as { dueOn: Date }).dueOn.getTime(),
    );
  });

  it("orders deliverables inside a phase by position", () => {
    const a = t("design", "io-list", 1);
    const b = t("design", "bom-bill-of-materials", 0);
    const s = draftSchedule([a, b], phases, new Date(2026, 2, 2));
    expect((s.get(b) as { startsOn: Date }).startsOn.getTime()).toBeLessThan(
      (s.get(a) as { startsOn: Date }).startsOn.getTime(),
    );
  });

  it("gives every task dates, on working days only", () => {
    const tasks = phases.flatMap((p) => [t(p, null, 0), t(p, "io-list", 1)]);
    const s = draftSchedule(tasks, phases, new Date(2026, 2, 2));
    expect(s.size).toBe(tasks.length);
    for (const d of s.values()) {
      expect(isWeekend(d.startsOn)).toBe(false);
      expect(isWeekend(d.dueOn)).toBe(false);
      expect(d.dueOn.getTime()).toBeGreaterThanOrEqual(d.startsOn.getTime());
    }
  });

  it("rolls a weekend start forward rather than scheduling on it", () => {
    const a = t("requirements", "io-list", 0);
    const s = draftSchedule([a], phases, new Date(2026, 2, 7));
    const d = s.get(a) as { startsOn: Date };
    expect(isWeekend(d.startsOn)).toBe(false);
    // Saturday the 7th rolls to Monday the 9th, not back to Friday.
    expect(d.startsOn.toDateString()).toBe(new Date(2026, 2, 9).toDateString());
  });

  it("uses the per-deliverable duration, so an FDS outlasts a RATS", () => {
    const fds = t("design", "fds-functional-design-specification", 0);
    const rats = t("design", "rats-range-alarm-trip-schedule", 1);
    const s = draftSchedule([fds, rats], phases, new Date(2026, 2, 2));
    const span = (x: typeof fds) => {
      const d = s.get(x) as { startsOn: Date; dueOn: Date };
      return daysBetween(d.startsOn, d.dueOn);
    };
    expect(span(fds)).toBeGreaterThan(span(rats));
  });

  it("ignores a phase with no tasks rather than leaving a gap", () => {
    const only = t("development", "io-list", 0);
    const s = draftSchedule([only], phases, new Date(2026, 2, 2));
    // requirements and design hold nothing, so development starts on day one
    // rather than waiting out two empty phases.
    const d = s.get(only) as { startsOn: Date };
    expect(daysBetween(new Date(2026, 2, 2), d.startsOn)).toBe(0);
  });

  it("the whole draft is placeable on the chart", () => {
    const tasks = phases.flatMap((p) => [t(p, "io-list", 0)]);
    const s = draftSchedule(tasks, phases, new Date(2026, 2, 2));
    const gantt: GanttTask[] = tasks.map((x, i) => {
      const d = s.get(x) as { startsOn: Date; dueOn: Date };
      return task({
        id: `t${i}`,
        startsOn: d.startsOn.toISOString(),
        dueOn: d.dueOn.toISOString(),
      });
    });
    const w = ganttWindow(gantt, new Date(2026, 2, 2));
    for (const g of gantt) expect(barFor(g, w.from)).not.toBeNull();
  });
});

describe("toISODate", () => {
  it("keeps the local day rather than converting to UTC", () => {
    // The bug this replaced: schedule dates were stored as timestamptz, so
    // local midnight in BST became 23:00 the previous day in UTC. A plan
    // drafted for Tuesday 1 September read back as Monday 31 August, and two
    // tasks landed on a Sunday. toISOString() is what did it.
    const d = new Date(2026, 8, 1); // 1 Sep 2026, local
    expect(toISODate(d)).toBe("2026-09-01");
  });

  it("is stable through a whole year of local midnights, DST included", () => {
    for (let i = 0; i < 365; i++) {
      const d = new Date(2026, 0, 1 + i);
      const iso = toISODate(d);
      const [y, m, day] = iso.split("-").map(Number);
      expect(y).toBe(d.getFullYear());
      expect(m).toBe(d.getMonth() + 1);
      expect(day).toBe(d.getDate());
    }
  });

  it("round-trips a draft schedule without moving a day", () => {
    // What the seed does: draft in Dates, store as yyyy-mm-dd, read back.
    const tasks = [{ phase: "design", templateSlug: "io-list", position: 0 }];
    const draft = draftSchedule(tasks, ["design"], new Date(2026, 8, 1));
    const d = draft.get(tasks[0] as (typeof tasks)[0]) as { startsOn: Date; dueOn: Date };
    for (const value of [toISODate(d.startsOn), toISODate(d.dueOn)]) {
      const [y, m, day] = value.split("-").map(Number);
      // Parsed back as a local date, never through Date(string) which is UTC.
      expect(isWeekend(new Date(y as number, (m as number) - 1, day))).toBe(false);
    }
    expect(toISODate(d.startsOn)).toBe("2026-09-01");
  });
});
