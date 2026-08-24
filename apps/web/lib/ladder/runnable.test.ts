import { describe, expect, it } from "vitest";
import { isRunnableProgram, partitionRunnable } from "./runnable";

const rung = (id: string) => ({ id, branches: [[]], outputs: [], comment: "" });

describe("isRunnableProgram", () => {
  it("accepts the flat shape the engine falls back to", () => {
    expect(isRunnableProgram({ name: "P", rungs: [rung("r1")], tags: [], scanMs: 100 })).toBe(true);
  });

  it("accepts the routine shape", () => {
    expect(
      isRunnableProgram({
        name: "P",
        routines: [{ name: "Main", rungs: [rung("r1")] }],
        rungs: [],
        tags: [],
      }),
    ).toBe(true);
  });

  it("rejects a rung with no outputs array", () => {
    // The exact row that took Monitor and Convert down: a rung carrying a flat
    // `elements` list, which is not a shape the engine has ever read. It made
    // `for (const o of rung.outputs)` throw during the server render, so one
    // bad program 500'd the whole tool and hid every good one.
    const bad = { name: "P", rungs: [{ id: "r1", elements: [] }], tags: [] };
    expect(isRunnableProgram(bad)).toBe(false);
  });

  it("rejects a rung with no branches array", () => {
    expect(isRunnableProgram({ name: "P", rungs: [{ id: "r1", outputs: [] }], tags: [] })).toBe(
      false,
    );
  });

  it("rejects branches that are not themselves arrays", () => {
    expect(
      isRunnableProgram({ name: "P", rungs: [{ id: "r1", branches: [null], outputs: [] }] }),
    ).toBe(false);
  });

  it("does not require logic, which rungLogic builds from branches", () => {
    expect(isRunnableProgram({ name: "P", rungs: [rung("r1")], tags: [] })).toBe(true);
  });

  it("accepts an empty program, which is what a new project has", () => {
    expect(isRunnableProgram({ name: "Untitled", rungs: [], tags: [], scanMs: 100 })).toBe(true);
  });

  it("rejects the things a jsonb column can actually hold", () => {
    for (const junk of [null, undefined, 0, "", "a string", [], { name: "P" }]) {
      expect(isRunnableProgram(junk)).toBe(false);
    }
  });

  it("rejects a bad routine among good ones rather than passing the program", () => {
    expect(
      isRunnableProgram({
        routines: [{ name: "Main", rungs: [rung("r1")] }, { name: "Fault" }],
        rungs: [],
      }),
    ).toBe(false);
  });

  it("rejects tags that are not a list, which the tag table iterates", () => {
    expect(isRunnableProgram({ name: "P", rungs: [], tags: {} })).toBe(false);
  });
});

describe("partitionRunnable", () => {
  it("keeps the good ones and sets the bad ones aside", () => {
    const rows = [
      { name: "good", program: { rungs: [rung("r1")], tags: [] } },
      { name: "bad", program: { rungs: [{ id: "r1", elements: [] }] } },
      { name: "also good", program: { rungs: [], tags: [] } },
    ];
    const { runnable, broken } = partitionRunnable(rows);
    expect(runnable.map((r) => r.name)).toEqual(["good", "also good"]);
    expect(broken.map((r) => r.name)).toEqual(["bad"]);
  });
});
