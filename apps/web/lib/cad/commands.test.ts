import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  findCommand,
  parseCoordinate,
  resolveCoordinate,
  suggestCommands,
} from "./commands";

describe("the command line", () => {
  it("knows the aliases people actually type", () => {
    // Trim, copy and offset are around forty percent of typed commands in real
    // 2D work, so their short forms are the ones that must not be wrong.
    expect(findCommand("tr")?.id).toBe("trim");
    expect(findCommand("co")?.id).toBe("copy");
    expect(findCommand("o")?.id).toBe("offset");
    expect(findCommand("L")?.id).toBe("line");
    expect(findCommand("  rec  ")?.id).toBe("rect");
  });

  it("has no alias meaning two different things", () => {
    const seen = new Map<string, string>();
    for (const c of COMMANDS) {
      for (const word of [c.name, ...c.aliases]) {
        expect(seen.has(word), `${word} is claimed by ${seen.get(word)} and ${c.id}`).toBe(false);
        seen.set(word, c.id);
      }
    }
  });

  it("suggests as you type", () => {
    expect(suggestCommands("tr").map((c) => c.id)).toContain("trim");
    expect(suggestCommands("").length).toBe(0);
  });
});

describe("coordinate entry", () => {
  const last = { x: 100, y: 50 };
  const pointer = { x: 200, y: 50 };

  it("reads an absolute point, with or without the hash", () => {
    expect(parseCoordinate("40,25")).toEqual({ kind: "absolute", point: { x: 40, y: 25 } });
    expect(parseCoordinate("#40,25")).toEqual({ kind: "absolute", point: { x: 40, y: 25 } });
    expect(resolveCoordinate(parseCoordinate("40,25") as never, last, pointer)).toEqual({
      x: 40,
      y: 25,
    });
  });

  it("reads a relative offset from the last point", () => {
    const parsed = parseCoordinate("@30,-10");
    expect(parsed).toEqual({ kind: "relative", delta: { x: 30, y: -10 } });
    expect(resolveCoordinate(parsed as never, last, pointer)).toEqual({ x: 130, y: 40 });
  });

  it("reads polar as distance and angle from the last point", () => {
    const parsed = parseCoordinate("50<90");
    expect(parsed).toEqual({ kind: "polar", distance: 50, angle: 90 });
    const p = resolveCoordinate(parsed as never, last, pointer) as { x: number; y: number };
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100);
  });

  it("reads a bare number as a distance in the direction the pointer is", () => {
    // This is how a wall of exactly 35 mm gets drawn: aim, type the number.
    const parsed = parseCoordinate("35");
    expect(parsed).toEqual({ kind: "distance", distance: 35 });
    expect(resolveCoordinate(parsed as never, last, pointer)).toEqual({ x: 135, y: 50 });
  });

  it("refuses a relative or polar entry with nothing to measure from", () => {
    expect(resolveCoordinate(parseCoordinate("@10,10") as never, null, pointer)).toBeNull();
    expect(resolveCoordinate(parseCoordinate("20<45") as never, null, pointer)).toBeNull();
    // And a distance with no direction, which would otherwise land arbitrarily.
    expect(resolveCoordinate(parseCoordinate("20") as never, last, last)).toBeNull();
  });

  it("does not mistake a command for a coordinate", () => {
    expect(parseCoordinate("line")).toBeNull();
    expect(parseCoordinate("tr")).toBeNull();
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("40,")).toBeNull();
  });
});
