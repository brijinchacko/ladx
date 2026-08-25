import { describe, expect, it } from "vitest";
import {
  MAX_DEPTH,
  canRedo,
  canUndo,
  current,
  depth,
  emptyHistory,
  push,
  redo,
  undo,
} from "./history";

describe("the undo stack", () => {
  it("starts with nothing to undo", () => {
    const h = emptyHistory("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(current(h)).toBe("a");
  });

  it("goes back and forward", () => {
    let h = push(push(emptyHistory("a"), "b"), "c");
    expect(current(h)).toBe("c");
    h = undo(h);
    expect(current(h)).toBe("b");
    h = undo(h);
    expect(current(h)).toBe("a");
    h = redo(h);
    expect(current(h)).toBe("b");
  });

  it("cannot undo past the beginning", () => {
    let h = push(emptyHistory("a"), "b");
    h = undo(undo(undo(h)));
    expect(current(h)).toBe("a");
    expect(canUndo(h)).toBe(false);
  });

  it("cannot redo past the end", () => {
    let h = undo(push(emptyHistory("a"), "b"));
    h = redo(redo(h));
    expect(current(h)).toBe("b");
    expect(canRedo(h)).toBe(false);
  });

  it("discards redo once you act after undoing", () => {
    // Standard behaviour, and the right one: after branching, the states you
    // undid past are unreachable, and keeping them would let redo produce a
    // document that never existed.
    let h = push(push(emptyHistory("a"), "b"), "c");
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = push(h, "d");
    expect(canRedo(h)).toBe(false);
    expect(current(h)).toBe("d");
  });

  it("caps its depth rather than holding a whole session", () => {
    let h = emptyHistory(0);
    for (let i = 1; i <= MAX_DEPTH * 2; i++) h = push(h, i);
    expect(h.past.length).toBe(MAX_DEPTH);
    expect(current(h)).toBe(MAX_DEPTH * 2);
  });

  it("keeps the newest states when it trims, not the oldest", () => {
    let h = emptyHistory(0);
    for (let i = 1; i <= MAX_DEPTH + 5; i++) h = push(h, i);
    expect(h.past[h.past.length - 1]).toBe(MAX_DEPTH + 5);
    expect(h.past[0]).toBeGreaterThan(0);
  });

  it("reports how far back it can go, for a menu label", () => {
    expect(depth(emptyHistory("a"))).toBe(0);
    expect(depth(push(emptyHistory("a"), "b"))).toBe(1);
  });

  it("never mutates the history it was given", () => {
    const h = push(emptyHistory("a"), "b");
    const before = h.past.length;
    undo(h);
    redo(h);
    push(h, "c");
    expect(h.past.length).toBe(before);
  });

  it("holds whole documents, so a state cannot drift from its inverse", () => {
    const a = { screens: [{ id: "s1", widgets: [] as string[] }] };
    const b = { screens: [{ id: "s1", widgets: ["w1"] }] };
    const h = undo(push(emptyHistory(a), b));
    expect(current(h).screens[0]?.widgets).toEqual([]);
  });
});
