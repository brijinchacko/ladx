import { describe, expect, it } from "vitest";
import { buildProjectPdf } from "./pdf";
import { elNode, parallel, series } from "./tree";
import type { LadxProgram, Tag } from "./types";

/**
 * The export is a drawing, so there is no useful assertion about what it looks
 * like here, only that it is produced. That is worth having anyway: every
 * rung shape goes through drawNode, and the failure mode being guarded against
 * is one bad shape throwing and taking the whole export with it, which is the
 * student's work not coming out.
 */

const tags = [
  {
    name: "Start",
    type: "BOOL",
    value: 0,
    isInput: true,
    address: "I0.0",
    comment: "a comment long enough that it has to be split to fit its column",
  },
  { name: "Motor", type: "BOOL", value: 0, isOutput: true, address: "Q0.0" },
  { name: "T1", type: "TIMER", value: 0, preset: 5000 },
] as unknown as Tag[];

const build = (program: LadxProgram) =>
  buildProjectPdf({
    projectName: program.name,
    program,
    student: { name: "A Student", email: "a@b.c" },
    generatedAt: new Date(0),
  });

describe("project export", () => {
  it("draws every rung shape without failing", () => {
    const buf = build({
      name: "Shapes",
      scanMs: 20,
      tags,
      rungs: [
        {
          id: "r1",
          // A branch that opens and closes mid-rung.
          logic: series([
            elNode("XIC", "Start"),
            parallel([series([elNode("XIC", "B")]), series([elNode("XIC", "D")])]),
            elNode("XIO", "Stop"),
          ]),
          branches: [],
          outputs: [{ id: "o1", type: "OTE", tag: "Motor" }],
        },
        // An empty condition side, a wire straight to the coil.
        {
          id: "r2",
          logic: series([]),
          branches: [],
          outputs: [{ id: "o2", type: "TON", tag: "T1", preset: 5000 }],
        },
        // A half-built branch, with the empty leg the student is about to fill.
        {
          id: "r3",
          logic: series([parallel([series([elNode("XIC", "Start")]), series([])])]),
          branches: [],
          outputs: [{ id: "o3", type: "OTE", tag: "Motor" }],
        },
        // A branch with no legs at all. normalise() collapses these, so this
        // only arrives from a stored tree that never went through it, and it
        // used to throw, which failed the export rather than the rung.
        {
          id: "r4",
          logic: series([elNode("XIC", "Start"), parallel([])]),
          branches: [],
          outputs: [],
        },
        // A rung still in the pre-tree flat shape.
        {
          id: "r5",
          branches: [
            [{ id: "c1", type: "XIC", tag: "Start" }],
            [{ id: "c2", type: "XIC", tag: "Motor" }],
          ],
          outputs: [{ id: "o5", type: "OTE", tag: "Motor" }],
        },
      ],
    });

    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("exports a project with nothing in it", () => {
    expect(
      build({ name: "Empty", scanMs: 20, tags: [], rungs: [] }).subarray(0, 5).toString(),
    ).toBe("%PDF-");
  });
});
