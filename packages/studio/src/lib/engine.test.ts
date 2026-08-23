import { describe, expect, it } from "vitest";
import { resetTags, scan, seedPresets, validate } from "./engine";
import { type SeriesNode, elNode, parallel, series } from "./tree";
import type { Element, LadxProgram, Rung, Tag } from "./types";

/**
 * Characterisation tests for the scan engine.
 *
 * Written at migration time (see docs/adr/0001) to pin the behaviour that was
 * running in front of students, so the strictness debt recorded in that ADR can
 * be paid down later without silently changing what the simulator does.
 *
 * These are not exhaustive. They cover the three things the engine's own header
 * calls out as the fidelity that matters, the things students actually get
 * wrong, because those are what a careless refactor would break first.
 */

const tag = (name: string, type: Tag["type"] = "BOOL", value = 0): Tag =>
  ({ name, type, value }) as Tag;

/** One contact driving one coil. */
const rung = (id: string, contact: string, coil: string, type: Element["type"] = "XIC"): Rung => ({
  id,
  branches: [[{ id: `${id}c`, type, tag: contact }]],
  outputs: [{ id: `${id}o`, type: "OTE", tag: coil }],
});

const program = (rungs: Rung[], tags: Tag[]): LadxProgram => ({
  name: "test",
  rungs,
  tags,
  scanMs: 20,
});

const start = (p: LadxProgram, set: Record<string, number> = {}) => {
  const seeded = resetTags(seedPresets(p, p.tags));
  return seeded.map((t) => (t.name in set ? { ...t, value: set[t.name] as number } : t));
};

const val = (tags: Tag[], name: string) => tags.find((t) => t.name === name)?.value;

describe("output image", () => {
  it("does not let a later rung's coil reach an earlier rung's contact until the next scan", () => {
    // Rung 1 reads Late; rung 2 writes it. Rung 1 has already run by then, so
    // it must not see the new value until the following sweep.
    const p = program(
      [rung("g1", "Late", "Early"), rung("g2", "Start", "Late")],
      [tag("Start"), tag("Late"), tag("Early")],
    );

    const s1 = scan(p, start(p, { Start: 1 }), {}, 20);
    expect(val(s1.tags, "Late")).toBe(1);
    expect(val(s1.tags, "Early")).toBe(0); // the one-scan lag

    const s2 = scan(p, s1.tags, s1.edges, 20);
    expect(val(s2.tags, "Early")).toBe(1);
  });

  it("does let an earlier rung's coil reach a later rung's contact in the same scan", () => {
    // The other direction is not a lag and must not become one: rung 2 runs
    // after rung 1, so it sees what rung 1 just wrote.
    const p = program(
      [rung("g1", "Start", "Motor"), rung("g2", "Motor", "Copy")],
      [tag("Start"), tag("Motor"), tag("Copy")],
    );

    const s1 = scan(p, start(p, { Start: 1 }), {}, 20);
    expect(val(s1.tags, "Motor")).toBe(1);
    expect(val(s1.tags, "Copy")).toBe(1);
  });
});

describe("edge memory", () => {
  it("counts a held input once, not once per scan", () => {
    // Per-instruction edge memory. A button held down for many scans is one
    // false-to-true transition, so a CTU must land on 1 and stay there.
    const p: LadxProgram = {
      name: "test",
      rungs: [
        {
          id: "g1",
          branches: [[{ id: "c1", type: "XIC", tag: "Button" }]],
          outputs: [{ id: "o1", type: "CTU", tag: "Count", preset: 10 }],
        },
      ],
      tags: [tag("Button"), tag("Count", "COUNTER")],
      scanMs: 20,
    };

    let tags = start(p, { Button: 1 });
    let edges: Record<string, boolean> = {};
    for (let i = 0; i < 5; i++) {
      const s = scan(p, tags, edges, 20);
      tags = s.tags;
      edges = s.edges;
    }

    const counter = tags.find((t) => t.name === "Count");
    expect(counter?.acc ?? counter?.value).toBe(1);
  });
});

describe("timers", () => {
  it("advances by elapsed time, not by scan count", () => {
    // A 1000 ms timer must take 1000 ms whether that is 5 slow scans or 50 fast
    // ones. Ten scans of 20 ms is 200 ms and must not finish it.
    const p: LadxProgram = {
      name: "test",
      rungs: [
        {
          id: "g1",
          branches: [[{ id: "c1", type: "XIC", tag: "Run" }]],
          outputs: [{ id: "o1", type: "TON", tag: "Delay", preset: 1000 }],
        },
      ],
      tags: [tag("Run"), tag("Delay", "TIMER")],
      scanMs: 20,
    };

    let tags = start(p, { Run: 1 });
    let edges: Record<string, boolean> = {};

    for (let i = 0; i < 10; i++) {
      const s = scan(p, tags, edges, 20); // 200 ms total
      tags = s.tags;
      edges = s.edges;
    }
    expect(tags.find((t) => t.name === "Delay")?.dn).toBeFalsy();

    // One long scan carries it past the preset.
    const done = scan(p, tags, edges, 900);
    expect(done.tags.find((t) => t.name === "Delay")?.dn).toBeTruthy();
  });
});

/*
 * The condition side, solved through the tree.
 *
 * Added alongside the tree's own characterisation tests (see tree.test.ts)
 * before paying down the ADR-0001 strictness debt. tree.ts decides the SHAPE of
 * a rung and the engine only folds over it, so a shape that changes by one
 * `children[0]` shows up here as logic that changes — which is the failure
 * worth catching.
 */
describe("series and parallel", () => {
  const drive = (logic: SeriesNode, tags: Tag[], set: Record<string, number> = {}) => {
    const p: LadxProgram = {
      name: "test",
      rungs: [{ id: "r1", logic, branches: [], outputs: [{ id: "o1", type: "OTE", tag: "Out" }] }],
      tags: [...tags, tag("Out")],
      scanMs: 20,
    };
    return scan(p, start(p, set), {}, 20);
  };

  const xic = (t: string) => elNode("XIC", t);

  it("ANDs a series", () => {
    const logic = series([xic("A"), xic("B")]);
    const tags = [tag("A"), tag("B")];
    expect(val(drive(logic, tags, { A: 1, B: 1 }).tags, "Out")).toBe(1);
    expect(val(drive(logic, tags, { A: 1 }).tags, "Out")).toBe(0);
    expect(val(drive(logic, tags, {}).tags, "Out")).toBe(0);
  });

  it("ORs a parallel", () => {
    const logic = series([parallel([series([xic("A")]), series([xic("B")])])]);
    const tags = [tag("A"), tag("B")];
    expect(val(drive(logic, tags, { A: 1 }).tags, "Out")).toBe(1);
    expect(val(drive(logic, tags, { B: 1 }).tags, "Out")).toBe(1);
    expect(val(drive(logic, tags, {}).tags, "Out")).toBe(0);
  });

  it("solves a branch that opens and closes mid-rung", () => {
    // ──[A]──┬──[B]──┬──[C]──( )   which is A AND (B OR D) AND C
    //        └──[D]──┘
    const logic = series([xic("A"), parallel([series([xic("B")]), series([xic("D")])]), xic("C")]);
    const tags = [tag("A"), tag("B"), tag("C"), tag("D")];
    expect(val(drive(logic, tags, { A: 1, B: 1, C: 1 }).tags, "Out")).toBe(1);
    expect(val(drive(logic, tags, { A: 1, D: 1, C: 1 }).tags, "Out")).toBe(1);
    expect(val(drive(logic, tags, { A: 1, B: 1 }).tags, "Out")).toBe(0); // C open
    expect(val(drive(logic, tags, { B: 1, C: 1 }).tags, "Out")).toBe(0); // A open
  });

  it("treats an empty leg as the wire it is", () => {
    // The half-built branch: an empty leg bypasses the branch entirely, which
    // is what a student sees on the screen while they are still filling it in.
    const logic = series([xic("A"), parallel([series([xic("B")]), series([])])]);
    const tags = [tag("A"), tag("B")];
    expect(val(drive(logic, tags, { A: 1 }).tags, "Out")).toBe(1);
    expect(val(drive(logic, tags, {}).tags, "Out")).toBe(0);
  });

  it("an empty rung passes power", () => {
    expect(val(drive(series([]), []).tags, "Out")).toBe(1);
  });

  it("powers every leg, not just the one that answered the question", () => {
    // Short-circuiting would leave the unvisited elements without a power
    // value and the live green highlight would go dark on a branch that is
    // genuinely energised.
    const b = xic("B");
    const d = xic("D");
    const logic = series([parallel([series([b]), series([d])])]);
    const res = drive(logic, [tag("B"), tag("D")], { B: 1, D: 1 });
    expect(res.elementPower[b.id]).toBe(true);
    expect(res.elementPower[d.id]).toBe(true);
  });

  it("seals in", () => {
    // The first thing anybody learns: a momentary Start, sealed by the coil's
    // own contact, dropped by a normally-closed Stop.
    const p: LadxProgram = {
      name: "test",
      rungs: [
        {
          id: "r1",
          logic: series([
            parallel([series([elNode("XIC", "Start")]), series([elNode("XIC", "Motor")])]),
            elNode("XIO", "Stop"),
          ]),
          branches: [],
          outputs: [{ id: "o1", type: "OTE", tag: "Motor" }],
        },
      ],
      tags: [tag("Start"), tag("Stop"), tag("Motor")],
      scanMs: 20,
    };

    const pressed = scan(p, start(p, { Start: 1 }), {}, 20);
    expect(val(pressed.tags, "Motor")).toBe(1);

    // Let go of Start — the seal-in leg holds it.
    const released = scan(
      p,
      pressed.tags.map((t) => (t.name === "Start" ? { ...t, value: 0 } : t)),
      pressed.edges,
      20,
    );
    expect(val(released.tags, "Motor")).toBe(1);

    // Stop breaks it, and it stays broken once Stop springs back.
    const stopped = scan(
      p,
      released.tags.map((t) => (t.name === "Stop" ? { ...t, value: 1 } : t)),
      released.edges,
      20,
    );
    expect(val(stopped.tags, "Motor")).toBe(0);
    const after = scan(
      p,
      stopped.tags.map((t) => (t.name === "Stop" ? { ...t, value: 0 } : t)),
      stopped.edges,
      20,
    );
    expect(val(after.tags, "Motor")).toBe(0);
  });

  it("reads a rung saved in the old flat shape", () => {
    // Stored projects predate the tree; they must still solve identically.
    const p: LadxProgram = {
      name: "test",
      rungs: [
        {
          id: "r1",
          branches: [[{ id: "c1", type: "XIC", tag: "A" }], [{ id: "c2", type: "XIC", tag: "B" }]],
          outputs: [{ id: "o1", type: "OTE", tag: "Out" }],
        },
      ],
      tags: [tag("A"), tag("B"), tag("Out")],
      scanMs: 20,
    };
    expect(val(scan(p, start(p, { B: 1 }), {}, 20).tags, "Out")).toBe(1);
    expect(val(scan(p, start(p), {}, 20).tags, "Out")).toBe(0);
  });
});

describe("routines", () => {
  const jsrProgram = (): LadxProgram => ({
    name: "test",
    routines: [
      {
        id: "main",
        name: "Main",
        rungs: [
          {
            id: "m1",
            branches: [[{ id: "mc", type: "XIC", tag: "Go" }]],
            outputs: [{ id: "mo", type: "JSR", tag: "Sub" }],
          },
        ],
      },
      {
        id: "sub",
        name: "Sub",
        rungs: [{ id: "s1", branches: [], outputs: [{ id: "so", type: "OTE", tag: "Ran" }] }],
      },
    ],
    rungs: [],
    tags: [tag("Go"), tag("Ran")],
    scanMs: 20,
  });

  it("runs the called routine there and then, and only when powered", () => {
    const p = jsrProgram();
    expect(val(scan(p, start(p, { Go: 1 }), {}, 20).tags, "Ran")).toBe(1);
    expect(val(scan(p, start(p), {}, 20).tags, "Ran")).toBe(0);
  });

  it("reports a routine that calls itself rather than hanging", () => {
    const p = jsrProgram();
    p.routines?.[1]?.rungs.push({
      id: "s2",
      branches: [],
      outputs: [{ id: "so2", type: "JSR", tag: "Sub" }],
    });
    const res = scan(p, start(p, { Go: 1 }), {}, 20);
    expect(res.errors.some((e) => e.includes("calls itself"))).toBe(true);
  });
});

describe("validate", () => {
  it("names a tag that is not in the tag table", () => {
    const p = program([rung("g1", "Ghost", "Out")], [tag("Out")]);
    expect(validate(p).some((e) => e.includes("Ghost"))).toBe(true);
  });

  it("flags a rung with no output, and two coils on one tag", () => {
    const p = program(
      [
        { id: "g1", branches: [[{ id: "c", type: "XIC", tag: "A" }]], outputs: [] },
        rung("g2", "A", "Out"),
        rung("g3", "A", "Out"),
      ],
      [tag("A"), tag("Out")],
    );
    const out = validate(p);
    expect(out.some((e) => e.includes("no output"))).toBe(true);
    expect(out.some((e) => e.includes("duplicate output"))).toBe(true);
  });

  it("refuses a destination that names a timer without saying which part", () => {
    const p: LadxProgram = {
      name: "test",
      rungs: [
        {
          id: "g1",
          branches: [],
          outputs: [{ id: "o1", type: "MOV", tag: "5000", dest: "T1" }],
        },
      ],
      tags: [tag("T1", "TIMER")],
      scanMs: 20,
    };
    expect(validate(p).some((e) => e.includes(".PRE"))).toBe(true);
  });

  it("passes a clean program", () => {
    expect(validate(program([rung("g1", "A", "Out")], [tag("A"), tag("Out")]))).toEqual([]);
  });
});

describe("reset and presets", () => {
  it("clears runtime state but leaves the switches where they are", () => {
    const before: Tag[] = [
      { name: "In", type: "BOOL", value: 1, isInput: true } as Tag,
      { name: "Out", type: "BOOL", value: 1 } as Tag,
      { name: "T1", type: "TIMER", value: 0, acc: 400, dn: true, tt: true, en: true } as Tag,
    ];
    const after = resetTags(before);
    expect(val(after, "In")).toBe(1);
    expect(val(after, "Out")).toBe(0);
    expect(after.find((t) => t.name === "T1")).toMatchObject({ acc: 0, dn: false, tt: false });
  });

  it("copies the preset typed into an instruction onto its tag", () => {
    const p: LadxProgram = {
      name: "test",
      rungs: [
        {
          id: "g1",
          branches: [],
          outputs: [{ id: "o1", type: "TON", tag: "T1", preset: 3000 }],
        },
      ],
      tags: [tag("T1", "TIMER"), tag("Plain")],
      scanMs: 20,
    };
    const seeded = seedPresets(p, p.tags);
    expect(seeded.find((t) => t.name === "T1")?.preset).toBe(3000);
    // A tag that is neither a timer nor a counter is left untouched.
    expect(seeded.find((t) => t.name === "Plain")?.preset).toBeUndefined();
  });

  it("lets a MOV into .PRE change the dwell time while running", () => {
    // The instruction box seeds the tag once; it must not re-assert itself
    // every scan, or a recipe change is silently undone.
    const p: LadxProgram = {
      name: "test",
      rungs: [
        {
          id: "g1",
          branches: [],
          outputs: [{ id: "o1", type: "MOV", tag: "9000", dest: "T1.PRE" }],
        },
        {
          id: "g2",
          branches: [[{ id: "c", type: "XIC", tag: "Run" }]],
          outputs: [{ id: "o2", type: "TON", tag: "T1", preset: 1000 }],
        },
      ],
      tags: [tag("Run"), tag("T1", "TIMER")],
      scanMs: 20,
    };

    let tags = start(p, { Run: 1 });
    let edges: Record<string, boolean> = {};
    for (let i = 0; i < 5; i++) {
      const s = scan(p, tags, edges, 400); // 2000 ms — past the box's 1000
      tags = s.tags;
      edges = s.edges;
    }
    expect(tags.find((t) => t.name === "T1")?.preset).toBe(9000);
    expect(tags.find((t) => t.name === "T1")?.dn).toBeFalsy();
  });
});
