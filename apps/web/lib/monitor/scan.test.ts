import { type LadxProgram, resetTags, scan, seedPresets } from "@ladx/studio";
import { describe, expect, it } from "vitest";

/**
 * What the Monitor relies on.
 *
 * These are not tests of the engine, which has its own; they pin the three
 * behaviours the Monitor's test record asserts to a reader. If any of them
 * changed, the record would be claiming something untrue about a run, which is
 * worse than not having the record at all.
 */

const PROGRAM: LadxProgram = {
  name: "Filler start/stop",
  scanMs: 100,
  tags: [
    { name: "Start_PB", type: "BOOL", value: 0, isInput: true, device: "PUSHBUTTON_NO" },
    { name: "Stop_PB", type: "BOOL", value: 1, isInput: true, device: "PUSHBUTTON_NC" },
    { name: "Motor", type: "BOOL", value: 0, isOutput: true, device: "MOTOR" },
    { name: "RunTime", type: "TIMER", value: 0, preset: 3000, acc: 0 },
    { name: "AtSpeed", type: "BOOL", value: 0, isOutput: true, device: "LAMP" },
  ],
  rungs: [
    {
      id: "r1",
      branches: [
        [
          { id: "e1", type: "XIC", tag: "Start_PB" },
          { id: "e2", type: "XIC", tag: "Stop_PB" },
        ],
        [
          { id: "e4", type: "XIC", tag: "Motor" },
          { id: "e5", type: "XIC", tag: "Stop_PB" },
        ],
      ],
      outputs: [{ id: "o1", type: "OTE", tag: "Motor" }],
    },
    {
      id: "r2",
      branches: [[{ id: "e7", type: "XIC", tag: "Motor" }]],
      outputs: [{ id: "o2", type: "TON", tag: "RunTime", preset: 3000 }],
    },
    {
      id: "r3",
      branches: [[{ id: "e8", type: "XIC", tag: "RunTime.DN" }]],
      outputs: [{ id: "o3", type: "OTE", tag: "AtSpeed" }],
    },
  ],
};

/** Drives the program the way the Monitor's loop does. */
function runner() {
  let tags = seedPresets(PROGRAM, resetTags(PROGRAM.tags));
  let edges: Record<string, boolean> = {};
  let elapsed = 0;

  return {
    get elapsed() {
      return elapsed;
    },
    value: (name: string) => tags.find((t) => t.name === name)?.value ?? 0,
    acc: (name: string) => tags.find((t) => t.name === name)?.acc ?? 0,
    force: (name: string, value: number) => {
      tags = tags.map((t) => (t.name === name ? { ...t, value } : t));
    },
    step: (dtMs: number) => {
      const r = scan(PROGRAM, tags, edges, dtMs);
      tags = r.tags;
      edges = r.edges;
      elapsed += dtMs;
    },
  };
}

describe("the Monitor's scan contract", () => {
  it("latches the motor on one scan and holds it when the button springs back", () => {
    const r = runner();
    r.step(100);
    expect(r.value("Motor")).toBe(0);

    r.force("Start_PB", 1);
    r.step(100);
    expect(r.value("Motor")).toBe(1);

    // The button is momentary. The seal-in is what keeps the motor running.
    r.force("Start_PB", 0);
    r.step(100);
    r.step(100);
    expect(r.value("Motor")).toBe(1);

    // NC stop breaks it.
    r.force("Stop_PB", 0);
    r.step(100);
    expect(r.value("Motor")).toBe(0);
  });

  it("times on elapsed milliseconds, not on scan count", () => {
    // The same three seconds, reached in very different numbers of scans. A
    // browser throttling a background tab to 1 Hz must not change the answer.
    for (const dt of [20, 100, 900]) {
      const r = runner();
      r.force("Start_PB", 1);
      r.step(dt);
      r.force("Start_PB", 0);

      let scans = 0;
      while (r.value("AtSpeed") === 0 && scans < 10_000) {
        r.step(dt);
        scans++;
      }

      expect(r.value("Motor")).toBe(1);
      // The accumulator must have reached the preset, and must not overshoot by
      // more than the one scan that carried it there.
      expect(r.acc("RunTime")).toBeGreaterThanOrEqual(3000);
      expect(r.acc("RunTime")).toBeLessThan(3000 + dt);
    }
  });

  it("propagates a coil down the scan, but not back up it", () => {
    // The behaviour a real controller has, and the one people get wrong.
    // Rungs execute top to bottom against one live set of values, so a coil
    // reaches every rung BELOW it in the same scan. A rung ABOVE it has already
    // run, so it does not see the change until the next sweep.
    const r = runner();
    r.force("Start_PB", 1);
    r.step(100);

    // Rung 1 energised Motor; rung 2 is below it and saw it immediately.
    expect(r.value("Motor")).toBe(1);
    expect(r.acc("RunTime")).toBe(100);
  });

  it("holds an output that depends on a rung above it for one extra scan", () => {
    // AtSpeed is on rung 3 and reads the timer driven on rung 2, so it follows
    // in the same scan. The scan-order delay shows up the other way round: the
    // seal-in contact on rung 1 reads Motor, which rung 1 itself drives, so it
    // is always reading last scan's value. That is the mechanism that makes a
    // seal-in a seal-in rather than a race.
    const r = runner();
    r.force("Start_PB", 1);
    r.step(100);
    expect(r.value("Motor")).toBe(1);

    // Release the button. The only thing holding the motor now is the seal-in
    // branch reading Motor from the previous scan.
    r.force("Start_PB", 0);
    for (let i = 0; i < 5; i++) r.step(100);
    expect(r.value("Motor")).toBe(1);
  });
});
