import { describe, expect, it } from "vitest";
import { resetTags, scan, seedPresets } from "./engine";
import type { Element, LadxProgram, Rung, Tag } from "./types";

/**
 * Characterisation tests for the scan engine.
 *
 * Written at migration time (see docs/adr/0001) to pin the behaviour that was
 * running in front of students, so the strictness debt recorded in that ADR can
 * be paid down later without silently changing what the simulator does.
 *
 * These are not exhaustive. They cover the three things the engine's own header
 * calls out as the fidelity that matters — the things students actually get
 * wrong — because those are what a careless refactor would break first.
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
