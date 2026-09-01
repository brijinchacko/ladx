import { describe, expect, it } from "vitest";
import { ladderContext } from "./generate-ladder";
import type { LadxProgram } from "./types";

describe("what the model is told about an existing program", () => {
  const manyTags = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Tag_${i}`,
      type: "BOOL" as const,
      value: 0,
    }));

  const withTags = (tags: ReturnType<typeof manyTags>): LadxProgram => ({
    name: "P",
    rungs: [{ id: "r1", branches: [], outputs: [] }],
    tags,
    scanMs: 100,
  });

  /**
   * The scaling problem this exists to prevent.
   *
   * Listing every tag is fine on a teaching program and wrong on a plant
   * project: ten thousand names push the actual request to the far end of the
   * window and cost real money on every call.
   */
  it("does not list ten thousand tags", () => {
    const context = ladderContext(withTags(manyTags(10_000)), "extend", "add a conveyor");
    const listed = (context.match(/\n {2}Tag_/g) ?? []).length;
    expect(listed).toBeLessThanOrEqual(60);
    expect(context.length).toBeLessThan(4000);
  });

  /** And says so, rather than presenting a partial list as the whole table. */
  it("says how many it left out", () => {
    const context = ladderContext(withTags(manyTags(500)), "extend", "add a conveyor");
    expect(context).toContain("500 tags");
    expect(context).toContain("not listed");
    expect(context).toContain("say so rather than inventing it");
  });

  /**
   * A model told only part of the table must not conclude the rest is free.
   * Inventing a name that already exists elsewhere is how two rungs end up
   * driving the same bit.
   */
  it("warns against assuming an unlisted name is unused", () => {
    const context = ladderContext(withTags(manyTags(500)), "extend", "x");
    expect(context).toContain("Do not assume a name is unused");
  });

  it("puts the tags the request names first", () => {
    const tags = [...manyTags(200), { name: "Conveyor_Run", type: "BOOL" as const, value: 0 }];
    const context = ladderContext(withTags(tags), "extend", "stop Conveyor_Run on a jam");
    expect(context).toContain("Conveyor_Run");

    // And it is near the top, not buried at the cut-off.
    const lines = context.split("\n").filter((l) => l.startsWith("  "));
    expect(lines[0]).toContain("Conveyor_Run");
  });

  it("still lists everything when a program is small", () => {
    const context = ladderContext(withTags(manyTags(5)), "extend", "add a rung");
    expect(context).toContain("already contains these tags");
    expect(context).not.toContain("not listed");
    for (let i = 0; i < 5; i++) expect(context).toContain(`Tag_${i}`);
  });

  it("says nothing about tags when the program is empty", () => {
    expect(ladderContext(null, "replace", "anything")).toContain("empty");
  });
});
