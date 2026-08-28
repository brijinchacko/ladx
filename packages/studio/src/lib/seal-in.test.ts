import { describe, expect, it } from "vitest";
import { sealInWarnings } from "./seal-in";
import type { LadxProgram } from "./types";

/**
 * The check that catches the commonest generated defect.
 *
 * A leg of a rung runs from the left rail to the output, so a seal-in leg
 * containing only the coil's own contact latches the output on and leaves the
 * stop conditions with nothing to break. It passes the structural validator,
 * it looks right on the canvas, and it produces a motor that will not stop.
 */
function program(branches: { type: string; tag: string }[][]): LadxProgram {
  return {
    name: "t",
    scanMs: 100,
    tags: [
      { name: "Start", type: "BOOL", value: 0, isInput: true },
      { name: "Stop", type: "BOOL", value: 1, isInput: true },
      { name: "Motor", type: "BOOL", value: 0, isOutput: true },
    ],
    rungs: [
      {
        id: "r1",
        branches: branches.map((leg, i) =>
          leg.map((el, j) => ({ id: `e${i}${j}`, ...el })),
        ) as LadxProgram["rungs"][number]["branches"],
        outputs: [{ id: "o1", type: "OTE", tag: "Motor" }],
      },
    ],
  };
}

describe("the seal-in check", () => {
  it("flags a seal-in leg that skips the stop conditions", () => {
    const bad = program([
      [
        { type: "XIC", tag: "Start" },
        { type: "XIC", tag: "Stop" },
      ],
      [{ type: "XIC", tag: "Motor" }],
    ]);
    const warnings = sealInWarnings(bad);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Motor");
    expect(warnings[0]).toContain("stop conditions cannot break it");
  });

  it("passes a seal-in that repeats them", () => {
    const good = program([
      [
        { type: "XIC", tag: "Start" },
        { type: "XIC", tag: "Stop" },
      ],
      [
        { type: "XIC", tag: "Motor" },
        { type: "XIC", tag: "Stop" },
      ],
    ]);
    expect(sealInWarnings(good)).toHaveLength(0);
  });

  it("says nothing about a rung with no seal-in at all", () => {
    const plain = program([[{ type: "XIC", tag: "Start" }]]);
    expect(sealInWarnings(plain)).toHaveLength(0);
  });
});
