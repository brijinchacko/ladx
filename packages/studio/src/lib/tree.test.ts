import { describe, expect, it } from "vitest";
import {
  type LadderNode,
  addLeg,
  branchEdgeOptions,
  branchSpan,
  countElements,
  elNode,
  everyElement,
  extendBranch,
  fromBranches,
  insertAt,
  isAncestorPath,
  moveNode,
  nodeAt,
  normalise,
  parallel,
  pathOfId,
  removeAt,
  removeById,
  replaceAt,
  rungLogic,
  series,
  shrinkBranch,
  toBranches,
  unwrapBranch,
  updateElementById,
} from "./tree";
import type { Element } from "./types";

/**
 * Characterisation tests for the rung tree.
 *
 * Written before paying down the `noUncheckedIndexedAccess` debt recorded in
 * docs/adr/0001. Twenty-nine of the eighty-one errors were in this file, and
 * most of them sit on the indexed accesses that decide the SHAPE of a rung —
 * `children[0]` in normalise, `span[0]` in branchSpan, `legs[0]` in the branch
 * edge moves. Guarding an index is a one-line change that can silently pick a
 * different branch of an `if`, so the shapes are pinned here first.
 *
 * Trees are compared by shape, not by identity: ids are generated from a
 * module-level counter and carry no meaning.
 *
 *   (a b)     a series of a and b
 *   [a | b]   a parallel of legs a and b
 *   ()        an empty series — which is a wire, and passes power
 */
const shape = (n: LadderNode): string => {
  if (n.kind === "el") return n.tag || n.type;
  const inner = n.children.map(shape).join(n.kind === "series" ? " " : " | ");
  return n.kind === "series" ? `(${inner})` : `[${inner}]`;
};

const el = (tag: string) => elNode("XIC", tag);
const els = (...tags: string[]) => tags.map(el);

/** A rung's worth of elements in the pre-tree flat shape. */
const flat = (tag: string): Element => ({ id: `f-${tag}`, type: "XIC", tag });

describe("reading", () => {
  const root = series([el("A"), parallel([series(els("B", "C")), series([el("D")])]), el("E")]);

  it("walks a path to a node, and back to a path from an id", () => {
    expect(shape(nodeAt(root, []) as LadderNode)).toBe("(A [(B C) | (D)] E)");
    expect(shape(nodeAt(root, [1, 0, 1]) as LadderNode)).toBe("C");

    const c = nodeAt(root, [1, 0, 1]) as LadderNode;
    expect(pathOfId(root, c.id)).toEqual([1, 0, 1]);
    expect(pathOfId(root, root.id)).toEqual([]);
  });

  it("returns null rather than throwing for a path that leads nowhere", () => {
    expect(nodeAt(root, [9])).toBeNull();
    expect(nodeAt(root, [0, 0])).toBeNull(); // through an element
    expect(pathOfId(root, "no-such-id")).toBeNull();
  });

  it("collects every element in left-to-right order", () => {
    expect(everyElement(root).map((n) => n.tag)).toEqual(["A", "B", "C", "D", "E"]);
    expect(countElements(root)).toBe(5);
    expect(countElements(series([]))).toBe(0);
  });

  it("knows when one path contains another", () => {
    expect(isAncestorPath([1], [1, 0, 1])).toBe(true);
    expect(isAncestorPath([], [2])).toBe(true);
    expect(isAncestorPath([1, 0], [1])).toBe(false);
    expect(isAncestorPath([0], [1, 0])).toBe(false);
  });
});

describe("normalise", () => {
  it("flattens a series nested directly inside a series", () => {
    expect(shape(normalise(series([el("A"), series(els("B", "C")), el("D")])))).toBe("(A B C D)");
  });

  it("unwraps a parallel that has only one leg left", () => {
    // A single leg is not a choice, so it stops being drawn as one.
    expect(shape(normalise(series([el("A"), parallel([series(els("B", "C"))])])))).toBe("(A B C)");
    expect(shape(normalise(parallel([series([el("B")])])))).toBe("B");
    expect(shape(normalise(parallel([series(els("B", "C"))])))).toBe("(B C)");
  });

  it("keeps an empty leg while its parallel still has a real one", () => {
    // The half-built branch a student is looking at: the empty leg IS the drop
    // target, so collapsing it here would make the branch vanish mid-edit.
    expect(shape(normalise(parallel([series([el("B")]), series([])])))).toBe("[(B) | ()]");
  });

  it("collapses a parallel whose every leg has been emptied", () => {
    expect(shape(normalise(parallel([series([]), series([])])))).toBe("()");
    expect(shape(normalise(series([el("A"), parallel([series([]), series([])]), el("C")])))).toBe(
      "(A C)",
    );
  });

  it("flattens a parallel nested directly inside a parallel", () => {
    expect(
      shape(
        normalise(parallel([series([el("A")]), parallel([series([el("B")]), series([el("C")])])])),
      ),
    ).toBe("[(A) | (B) | (C)]");
  });

  it("leaves an element alone", () => {
    expect(shape(normalise(el("A")))).toBe("A");
  });
});

describe("branchSpan", () => {
  const chain = () => series(els("A", "B", "C"));

  it("branches around a single contact", () => {
    expect(shape(branchSpan(chain(), [], 1, 1))).toBe("(A [(B) | ()] C)");
  });

  it("branches across the whole chain — the classic seal-in", () => {
    expect(shape(branchSpan(chain(), [], 0, 2))).toBe("([(A B C) | ()])");
  });

  it("branches around a span that opens and closes mid-rung", () => {
    expect(shape(branchSpan(series(els("A", "B", "C", "D")), [], 1, 2))).toBe("(A [(B C) | ()] D)");
  });

  it("reads the span the same way whichever end is dragged from", () => {
    expect(shape(branchSpan(chain(), [], 2, 0))).toBe(shape(branchSpan(chain(), [], 0, 2)));
  });

  it("re-uses an existing branch as the leg instead of wrapping it again", () => {
    // span[0] is already a container, so it becomes the leg directly rather
    // than being wrapped in a series first. normalise then flattens the
    // parallel-inside-a-parallel, so branching an existing branch reads as
    // adding a leg to it — which is what it means on the rung. This is the one
    // place the resulting shape depends on what `span[0]` IS.
    const root = series([el("A"), parallel([series([el("B")]), series([el("C")])])]);
    expect(shape(branchSpan(root, [], 1, 1))).toBe("(A [(B) | (C) | ()])");
  });

  it("does nothing for an empty span or a non-series target", () => {
    expect(shape(branchSpan(series([]), [], 0, -1))).toBe("()");
    expect(shape(branchSpan(el("A"), [], 0, 0))).toBe("A");
  });

  it("adds a further leg to an existing parallel", () => {
    const root = branchSpan(chain(), [], 1, 1);
    expect(shape(addLeg(root, [1]))).toBe("(A [(B) | () | ()] C)");
    expect(shape(addLeg(root, [0]))).toBe("(A [(B) | ()] C)"); // not a parallel
  });
});

describe("insert, remove, replace", () => {
  it("inserts at an index, and appends when the index is the child count", () => {
    const root = series(els("A", "C"));
    expect(shape(insertAt(root, [], 1, el("B")))).toBe("(A B C)");
    expect(shape(insertAt(root, [], 2, el("Z")))).toBe("(A C Z)");
    expect(shape(insertAt(root, [], 99, el("Z")))).toBe("(A C Z)"); // clamped
    expect(shape(insertAt(root, [], -5, el("Z")))).toBe("(Z A C)"); // clamped
  });

  it("removes by path and by id, normalising what is left", () => {
    const root = series([el("A"), parallel([series([el("B")]), series([el("D")])]), el("C")]);
    expect(shape(removeAt(root, [0]))).toBe("([(B) | (D)] C)");

    // Removing one leg of a two-leg branch leaves no branch at all.
    expect(shape(removeAt(root, [1, 1]))).toBe("(A B C)");

    // Emptying a leg leaves the leg: the branch still has a real second leg,
    // so the empty one stays as the drop target it is.
    const b = nodeAt(root, [1, 0, 0]) as LadderNode;
    expect(shape(removeById(root, b.id))).toBe("(A [() | (D)] C)");
    expect(shape(removeById(root, "no-such-id"))).toBe(shape(root));
  });

  it("removing the root empties the rung", () => {
    expect(shape(removeAt(series(els("A", "B")), []))).toBe("()");
    // removeById refuses the root rather than blanking the rung by accident.
    const root = series(els("A", "B"));
    expect(shape(removeById(root, root.id))).toBe("(A B)");
  });

  it("replaces a node in place, keeping its position", () => {
    const root = series(els("A", "B", "C"));
    expect(shape(replaceAt(root, [1], el("Z")))).toBe("(A Z C)");
  });

  it("retypes an element without moving it", () => {
    const root = series(els("A", "B", "C"));
    const b = nodeAt(root, [1]) as LadderNode;
    const next = updateElementById(root, b.id, { type: "XIO", tag: "B2" });
    expect(shape(next)).toBe("(A B2 C)");
    expect((nodeAt(next, [1]) as { type: string }).type).toBe("XIO");
    // Unknown id, or an id that is not an element, is a no-op.
    expect(shape(updateElementById(root, "nope", { tag: "Z" }))).toBe("(A B C)");
    expect(shape(updateElementById(root, root.id, { tag: "Z" }))).toBe("(A B C)");
  });
});

describe("branch edges", () => {
  //  (A [(B) | ()] C) — a branch around B, with A outside on the left.
  const withBranch = () => branchSpan(series(els("A", "B", "C")), [], 1, 1);

  it("pulls the left neighbour into the first leg", () => {
    expect(shape(extendBranch(withBranch(), [1], "left"))).toBe("([(A B) | ()] C)");
  });

  it("pulls the right neighbour into the first leg", () => {
    expect(shape(extendBranch(withBranch(), [1], "right"))).toBe("(A [(B C) | ()])");
  });

  it("pushes the outermost element of the first leg back out", () => {
    const wide = extendBranch(withBranch(), [1], "left"); // ([(A B) | ()] C)
    expect(shape(shrinkBranch(wide, [0], "left"))).toBe("(A [(B) | ()] C)");
    expect(shape(shrinkBranch(wide, [0], "right"))).toBe("([(A) | ()] B C)");
  });

  it("extend then shrink is a round trip", () => {
    const once = extendBranch(withBranch(), [1], "left");
    expect(shape(shrinkBranch(once, [0], "left"))).toBe(shape(withBranch()));
  });

  it("declines a move with no neighbour, or on a node that is not a branch", () => {
    const root = withBranch();
    expect(shape(extendBranch(root, [0], "left"))).toBe(shape(root)); // not a parallel
    expect(shape(extendBranch(branchSpan(series(els("A", "B")), [], 0, 1), [0], "left"))).toBe(
      "([(A B) | ()])", // nothing to the left
    );
    expect(shape(shrinkBranch(root, [], "left"))).toBe(shape(root)); // root has no parent
  });

  it("reports which handles are live", () => {
    expect(branchEdgeOptions(withBranch(), [1])).toEqual({
      extendLeft: true,
      extendRight: true,
      shrinkLeft: true,
      shrinkRight: true,
    });
    // Branch across the whole rung: nothing outside it to pull in.
    const whole = branchSpan(series(els("A", "B")), [], 0, 1);
    expect(branchEdgeOptions(whole, [0])).toEqual({
      extendLeft: false,
      extendRight: false,
      shrinkLeft: true,
      shrinkRight: true,
    });
    expect(branchEdgeOptions(whole, [])).toEqual({
      extendLeft: false,
      extendRight: false,
      shrinkLeft: false,
      shrinkRight: false,
    });
  });
});

describe("moveNode", () => {
  const chain = () => series(els("A", "B", "C", "D"));

  it("accounts for the slot shifting when a node is removed from before it", () => {
    // Drag A two places right. The naive answer lands it one place short.
    expect(shape(moveNode(chain(), [0], [], 2))).toBe("(B A C D)");
    expect(shape(moveNode(chain(), [0], [], 3))).toBe("(B C A D)");
    expect(shape(moveNode(chain(), [0], [], 4))).toBe("(B C D A)");
  });

  it("does not renumber siblings for a move that changes nothing", () => {
    const root = chain();
    expect(moveNode(root, [1], [], 1)).toBe(root);
    expect(moveNode(root, [1], [], 2)).toBe(root); // the slot after itself
    expect(moveNode(root, [], [], 0)).toBe(root); // the root itself
  });

  it("moves a node leftwards without adjusting", () => {
    expect(shape(moveNode(chain(), [3], [], 1))).toBe("(A D B C)");
  });

  it("moves a node into a branch leg", () => {
    const root = series([el("A"), parallel([series([el("B")]), series([el("D")])])]);
    expect(shape(moveNode(root, [0], [1, 1], 1))).toBe("([(B) | (D A)])");
  });

  it("refuses to drop a container inside its own subtree", () => {
    const root = series([el("A"), parallel([series([el("B")]), series([el("D")])])]);
    expect(moveNode(root, [1], [1, 0], 0)).toBe(root);
    expect(moveNode(root, [1], [1], 0)).toBe(root);
  });

  it("declines a source path that leads nowhere", () => {
    const root = chain();
    expect(moveNode(root, [9], [], 0)).toBe(root);
  });
});

describe("unwrapBranch", () => {
  it("keeps the contacts and drops the branch, left to right", () => {
    const root = series([el("A"), parallel([series(els("B", "C")), series([el("D")])]), el("E")]);
    expect(shape(unwrapBranch(root, [1]))).toBe("(A B C D E)");
  });

  it("removes a branch that has nothing in it", () => {
    const root = series([el("A"), parallel([series([]), series([])])]);
    expect(shape(unwrapBranch(root, [1]))).toBe("(A)");
  });

  it("does nothing to a node that is not a branch", () => {
    const root = series(els("A", "B"));
    expect(unwrapBranch(root, [0])).toBe(root);
    expect(unwrapBranch(root, [9])).toBe(root);
  });
});

describe("the old flat shape", () => {
  it("reads one series chain", () => {
    expect(shape(fromBranches([[flat("A"), flat("B")]]))).toBe("(A B)");
  });

  it("reads parallel branches as a parallel of series", () => {
    expect(shape(fromBranches([[flat("A")], [flat("B")]]))).toBe("([(A) | (B)])");
  });

  it("reads nothing at all as an empty rung", () => {
    expect(shape(fromBranches([]))).toBe("()");
    expect(shape(fromBranches(undefined))).toBe("()");
    expect(shape(fromBranches([[], []]))).toBe("()");
  });

  it("drops empty legs on the way in", () => {
    expect(shape(fromBranches([[flat("A")], []]))).toBe("(A)");
  });

  it("carries the element's own fields across", () => {
    const t = fromBranches([[{ id: "t1", type: "TON", tag: "T1", preset: 5000 }]]);
    expect(everyElement(t)[0]).toMatchObject({ id: "t1", type: "TON", tag: "T1", preset: 5000 });
    // Absent optional fields stay absent rather than becoming undefined keys.
    expect(Object.keys(everyElement(fromBranches([[flat("A")]]))[0] as object)).toEqual([
      "kind",
      "id",
      "type",
      "tag",
    ]);
  });

  it("round-trips an OR of ANDs exactly", () => {
    const branches = [[flat("A"), flat("B")], [flat("C")]];
    expect(toBranches(fromBranches(branches))).toEqual(branches);
  });

  it("flattens a shape the old format cannot hold, and says so by doing it", () => {
    // A mid-rung branch has no flat representation. The shim keeps the
    // elements in reading order and loses the shape — which is why the tree
    // is the stored form.
    const root = series([el("A"), parallel([series([el("B")]), series([el("D")])]), el("C")]);
    expect(toBranches(root).map((b) => b.map((e) => e.tag))).toEqual([["A", "B", "D", "C"]]);
  });

  it("handles a bare element and a bare parallel at the root", () => {
    expect(toBranches(el("A")).map((b) => b.map((e) => e.tag))).toEqual([["A"]]);
    expect(
      toBranches(parallel([series([el("A")]), series([el("B")])])).map((b) => b.map((e) => e.tag)),
    ).toEqual([["A"], ["B"]]);
  });

  it("prefers a rung's tree, and converts one that has none", () => {
    const logic = series(els("X", "Y"));
    expect(shape(rungLogic({ id: "r", logic, branches: [[flat("A")]], outputs: [] }))).toBe(
      "(X Y)",
    );
    expect(shape(rungLogic({ id: "r", branches: [[flat("A")]], outputs: [] }))).toBe("(A)");
  });
});
