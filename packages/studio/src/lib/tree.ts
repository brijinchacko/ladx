import type { Element, ElementType, Rung } from "./types";

/**
 * LADX Mini — the rung as a tree.
 *
 * The old model stored a rung's condition side as `Element[][]`: a list of
 * parallel branches, each a series chain. That is an OR of ANDs, and it can
 * only express a branch that spans the WHOLE rung. It cannot express
 *
 *     ──[A]──┬──[B]──┬──[C]──( )
 *            └──[D]──┘
 *
 * which is a branch around the middle of a chain — and that is the shape a
 * student needs the moment they want a branch between two contacts, or want to
 * close a branch before the end of the rung.
 *
 * So a rung is now a tree of three node kinds:
 *
 *   el        one instruction
 *   series    children in a row, power flows through each in turn   (AND)
 *   parallel  children stacked, power flows if ANY leg passes       (OR)
 *
 * Series and parallel nest arbitrarily, which is exactly what real editors do
 * and what makes "branch from here to there" a single operation rather than a
 * special case. Evaluation falls out of the shape: fold for series, some() for
 * parallel.
 *
 * Every edit is expressed as a PATH — the child indices from the root down to a
 * node. Paths make insert, delete and wrap one small function each, and they
 * survive being handed to a React key or a drag payload.
 */

export type ElNode = {
  kind: "el";
  id: string;
  type: ElementType;
  tag: string;
  preset?: number;
  operand?: string;
  dest?: string;
};

export type SeriesNode = { kind: "series"; id: string; children: LadderNode[] };
export type ParallelNode = { kind: "parallel"; id: string; children: LadderNode[] };
export type LadderNode = ElNode | SeriesNode | ParallelNode;

/** Child indices from the root. [] is the root itself. */
export type Path = number[];

let seq = 0;
/**
 * Ids are generated, never random — Math.random() during render is banned by
 * the lint rules here and would break any snapshot comparison.
 */
export function nid(prefix = "n"): string {
  seq += 1;
  return `${prefix}${seq.toString(36)}${(seq * 2654435761) % 100000}`;
}

export const series = (children: LadderNode[] = []): SeriesNode => ({
  kind: "series",
  id: nid("s"),
  children,
});

export const parallel = (children: LadderNode[] = []): ParallelNode => ({
  kind: "parallel",
  id: nid("p"),
  children,
});

export const elNode = (
  type: ElementType,
  tag = "",
  extra: Partial<Omit<ElNode, "kind" | "id" | "type" | "tag">> = {},
): ElNode => ({ kind: "el", id: nid("e"), type, tag, ...extra });

export const isBranch = (n: LadderNode): n is SeriesNode | ParallelNode =>
  n.kind === "series" || n.kind === "parallel";

// ── Reading ───────────────────────────────────────────────────────────────

export function nodeAt(root: LadderNode, path: Path): LadderNode | null {
  let cur: LadderNode = root;
  for (const i of path) {
    if (!isBranch(cur)) return null;
    const next = cur.children[i];
    if (!next) return null;
    cur = next;
  }
  return cur;
}

/** The path to the node with this id, or null. */
export function pathOfId(root: LadderNode, id: string, base: Path = []): Path | null {
  if (root.id === id) return base;
  if (!isBranch(root)) return null;
  for (let i = 0; i < root.children.length; i++) {
    const hit = pathOfId(root.children[i], id, [...base, i]);
    if (hit) return hit;
  }
  return null;
}

export function everyElement(root: LadderNode): ElNode[] {
  if (root.kind === "el") return [root];
  return root.children.flatMap(everyElement);
}

export function countElements(root: LadderNode): number {
  return everyElement(root).length;
}

// ── Writing ───────────────────────────────────────────────────────────────
// All of these return a new tree. Nothing mutates in place, so undo is a
// matter of keeping the previous root.

function replaceChildren(node: LadderNode, children: LadderNode[]): LadderNode {
  if (!isBranch(node)) return node;
  return { ...node, children } as LadderNode;
}

function mapAt(root: LadderNode, path: Path, fn: (n: LadderNode) => LadderNode): LadderNode {
  if (path.length === 0) return fn(root);
  if (!isBranch(root)) return root;
  const [head, ...rest] = path;
  const child = root.children[head];
  if (!child) return root;
  const next = [...root.children];
  next[head] = mapAt(child, rest, fn);
  return replaceChildren(root, next);
}

/**
 * Insert `node` into the container at `parentPath`, at child index `index`.
 * Index equal to the child count appends, which is what dropping on the last
 * gap of a rung means.
 */
export function insertAt(
  root: LadderNode,
  parentPath: Path,
  index: number,
  node: LadderNode,
): LadderNode {
  return normalise(
    mapAt(root, parentPath, (parent) => {
      if (!isBranch(parent)) return parent;
      const children = [...parent.children];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
      return replaceChildren(parent, children);
    }),
  );
}

/** Remove the node at `path`. */
export function removeAt(root: LadderNode, path: Path): LadderNode {
  if (path.length === 0) return series([]);
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return normalise(
    mapAt(root, parentPath, (parent) => {
      if (!isBranch(parent)) return parent;
      const children = parent.children.filter((_, i) => i !== index);
      return replaceChildren(parent, children);
    }),
  );
}

export function removeById(root: LadderNode, id: string): LadderNode {
  const path = pathOfId(root, id);
  return path?.length ? removeAt(root, path) : root;
}

/** Swap one node for another, keeping its position. Used when retyping. */
export function replaceAt(root: LadderNode, path: Path, node: LadderNode): LadderNode {
  return normalise(mapAt(root, path, () => node));
}

/**
 * Wrap a contiguous span of one series in a parallel, and add an empty second
 * leg for the student to fill.
 *
 * This single operation is every branch the user asked for:
 *
 *   span of the whole chain  -> a branch across the rung (the classic seal-in)
 *   span of one contact      -> a branch around just that contact
 *   span of contacts 2..3    -> a branch that opens and closes mid-rung
 *
 * `from` and `to` are child indices in the series at `seriesPath`, inclusive.
 */
export function branchSpan(
  root: LadderNode,
  seriesPath: Path,
  from: number,
  to: number,
): LadderNode {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);

  return normalise(
    mapAt(root, seriesPath, (node) => {
      if (node.kind !== "series") return node;
      const children = [...node.children];
      const span = children.slice(lo, hi + 1);
      if (span.length === 0) return node;

      // The existing span becomes the first leg; the second leg starts empty
      // and shows as a drop target, which is how a student sees where the
      // parallel path goes before they have put anything in it.
      const legA = span.length === 1 && span[0].kind !== "el" ? span[0] : series(span);
      const branch = parallel([legA, series([])]);

      children.splice(lo, hi - lo + 1, branch);
      return replaceChildren(node, children);
    }),
  );
}

/** Add another leg to an existing parallel node. */
export function addLeg(root: LadderNode, parallelPath: Path): LadderNode {
  return normalise(
    mapAt(root, parallelPath, (node) => {
      if (node.kind !== "parallel") return node;
      return replaceChildren(node, [...node.children, series([])]);
    }),
  );
}

/**
 * Tidy the tree after an edit.
 *
 * Editing naturally produces degenerate shapes — a parallel with one leg left
 * after a delete, a series nested directly inside a series, an empty leg
 * hanging off a branch that has been emptied. Left alone they accumulate and
 * the rendering slowly drifts away from the logic. Normalising after every
 * edit keeps exactly one representation of any given circuit.
 *
 * The one thing it must NOT do is delete an empty leg of a live parallel while
 * the student is still filling it in, so an empty leg only collapses when its
 * parallel would otherwise be trivial.
 */
export function normalise(node: LadderNode): LadderNode {
  if (node.kind === "el") return node;

  let children = node.children.map(normalise);

  if (node.kind === "series") {
    // Flatten nested series: (a (b c) d) -> (a b c d)
    children = children.flatMap((c) => (c.kind === "series" ? c.children : [c]));
    // A parallel with a single leg is not a parallel.
    children = children.flatMap((c) =>
      c.kind === "parallel" && c.children.length === 1
        ? c.children[0].kind === "series"
          ? c.children[0].children
          : [c.children[0]]
        : [c],
    );
    return replaceChildren(node, children);
  }

  // parallel
  children = children.flatMap((c) => (c.kind === "parallel" ? c.children : [c]));
  const nonEmpty = children.filter((c) => c.kind !== "series" || c.children.length > 0);

  // Every leg emptied: the branch has no meaning left.
  if (nonEmpty.length === 0) return series([]);
  // One real leg and nothing else: unwrap.
  if (children.length === 1) {
    return children[0].kind === "series" && children[0].children.length === 1
      ? children[0].children[0]
      : children[0];
  }
  return replaceChildren(node, children);
}

// ── Migration ─────────────────────────────────────────────────────────────

/**
 * Read the old `Element[][]` shape into a tree.
 *
 * Saved projects, the starter programs and every exercise answer already in the
 * database use the flat form. They are all valid trees — a list of parallel
 * series — so the conversion is exact and nothing needs re-authoring.
 */
export function fromBranches(branches: Element[][] | undefined): SeriesNode {
  const legs = (branches ?? []).filter((b) => b.length > 0);
  const toEl = (e: Element): ElNode => ({
    kind: "el",
    id: e.id || nid("e"),
    type: e.type,
    tag: e.tag,
    ...(e.preset !== undefined ? { preset: e.preset } : {}),
    ...(e.operand !== undefined ? { operand: e.operand } : {}),
    ...(e.dest !== undefined ? { dest: e.dest } : {}),
  });

  if (legs.length === 0) return series([]);
  if (legs.length === 1) return series(legs[0].map(toEl));
  return series([parallel(legs.map((leg) => series(leg.map(toEl))))]);
}

/** The tree back out as the flat shape, for anything still reading it. */
export function toBranches(root: LadderNode): Element[][] {
  const asElement = (n: ElNode): Element => ({
    id: n.id,
    type: n.type,
    tag: n.tag,
    ...(n.preset !== undefined ? { preset: n.preset } : {}),
    ...(n.operand !== undefined ? { operand: n.operand } : {}),
    ...(n.dest !== undefined ? { dest: n.dest } : {}),
  });

  // Only exact for trees that ARE an OR of ANDs. Anything with a mid-rung
  // branch cannot be represented, so we flatten to the elements in order and
  // accept that the old format loses the shape — which is precisely why the
  // tree is now the stored form and this is only a compatibility shim.
  if (root.kind === "el") return [[asElement(root)]];
  if (root.kind === "parallel") {
    return root.children.map((leg) => everyElement(leg).map(asElement));
  }
  const top = root.children;
  const par = top.find((c) => c.kind === "parallel") as ParallelNode | undefined;
  if (top.length === 1 && par) {
    return par.children.map((leg) => everyElement(leg).map(asElement));
  }
  return [everyElement(root).map(asElement)];
}

/**
 * The tree for a rung.
 *
 * Saved programs predate the tree and carry `branches`. Rather than run a
 * migration over every stored project and exercise answer, a rung without
 * `logic` is converted on read. Anything the student then edits is saved back
 * with `logic` set, so the old shape drains away on its own.
 */
export function rungLogic(rung: Rung): SeriesNode {
  if (rung.logic) return rung.logic;
  return fromBranches(rung.branches);
}

/**
 * Edit one element in place, keeping its position in the rung.
 *
 * Retyping or retagging must not move an instruction — a student who changes a
 * contact from NO to NC expects it to stay exactly where it was, not jump to
 * the end of the rung.
 */
export function updateElementById(
  root: LadderNode,
  id: string,
  patch: Partial<Omit<ElNode, "kind" | "id">>,
): LadderNode {
  const path = pathOfId(root, id);
  if (!path) return root;
  const node = nodeAt(root, path);
  if (!node || node.kind !== "el") return root;
  return replaceAt(root, path, { ...node, ...patch });
}

// ── Moving a branch's edges ───────────────────────────────────────────────
//
// A branch is created around a span, but the span is rarely right first time —
// you draw the branch, then realise the contact just outside it should have
// been inside. Real editors let you drag the branch edge over its neighbours,
// and these are the four moves that make that possible.
//
// EXTENDING pulls the neighbouring element INTO the branch's first leg, so the
// other legs bypass it. That is what a branch edge moving outwards means
// electrically, and it is why extending changes behaviour: the element is now
// on one path instead of all of them.
//
// SHRINKING pushes the outermost element of the first leg back OUT into
// series, where it applies to every leg again.

/** The parent series of a node, and the node's index within it. */
function parentSeriesOf(root: LadderNode, path: Path) {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(root, parentPath);
  if (!parent || parent.kind !== "series") return null;
  return { parentPath, parent, index: path[path.length - 1] };
}

/** Take the sibling on one side of the branch and put it inside the first leg. */
export function extendBranch(
  root: LadderNode,
  parallelPath: Path,
  side: "left" | "right",
): LadderNode {
  const loc = parentSeriesOf(root, parallelPath);
  if (!loc) return root;
  const { parentPath, parent, index } = loc;

  const neighbourIndex = side === "left" ? index - 1 : index + 1;
  const neighbour = parent.children[neighbourIndex];
  const par = parent.children[index];
  if (!neighbour || !par || par.kind !== "parallel") return root;

  const legs = [...par.children];
  const firstLeg = legs[0];
  const legChildren = firstLeg.kind === "series" ? [...firstLeg.children] : [firstLeg];
  const nextLeg = series(
    side === "left" ? [neighbour, ...legChildren] : [...legChildren, neighbour],
  );
  legs[0] = nextLeg;

  const children = parent.children.filter((_, i) => i !== neighbourIndex);
  const parIndex = side === "left" ? index - 1 : index;
  children[parIndex] = { ...par, children: legs };

  return normalise(mapAt(root, parentPath, (n) => replaceChildren(n, children)));
}

/** Push the outermost element of the first leg back out into series. */
export function shrinkBranch(
  root: LadderNode,
  parallelPath: Path,
  side: "left" | "right",
): LadderNode {
  const loc = parentSeriesOf(root, parallelPath);
  if (!loc) return root;
  const { parentPath, parent, index } = loc;

  const par = parent.children[index];
  if (!par || par.kind !== "parallel") return root;

  const legs = [...par.children];
  const firstLeg = legs[0];
  const legChildren = firstLeg.kind === "series" ? [...firstLeg.children] : [firstLeg];
  if (legChildren.length === 0) return root;

  const moved = side === "left" ? legChildren.shift()! : legChildren.pop()!;
  legs[0] = series(legChildren);

  const children = [...parent.children];
  children[index] = { ...par, children: legs };
  children.splice(side === "left" ? index : index + 1, 0, moved);

  return normalise(mapAt(root, parentPath, (n) => replaceChildren(n, children)));
}

/** Which edge moves are available, for enabling the handles. */
export function branchEdgeOptions(root: LadderNode, parallelPath: Path) {
  const loc = parentSeriesOf(root, parallelPath);
  if (!loc) return { extendLeft: false, extendRight: false, shrinkLeft: false, shrinkRight: false };
  const { parent, index } = loc;
  const par = parent.children[index];
  const firstLeg = par && par.kind === "parallel" ? par.children[0] : null;
  const legLen = firstLeg ? (firstLeg.kind === "series" ? firstLeg.children.length : 1) : 0;
  return {
    extendLeft: index > 0,
    extendRight: index < parent.children.length - 1,
    shrinkLeft: legLen > 0,
    shrinkRight: legLen > 0,
  };
}

/* ------------------------------------------------------------------ *
 * Moving a node that is already in the tree
 * ------------------------------------------------------------------ */

/** Is `ancestor` the same path as, or a prefix of, `path`? */
export function isAncestorPath(ancestor: Path, path: Path): boolean {
  if (ancestor.length > path.length) return false;
  return ancestor.every((v, i) => path[i] === v);
}

/**
 * Move the node at `fromPath` to `toIndex` inside the container at `toParent`.
 *
 * The whole difficulty is one line of arithmetic. Removing a node shifts every
 * later sibling down by one, so an index captured before the removal points at
 * the wrong slot afterwards — drag a contact two places to the right and it
 * lands one place short, every time, which reads as the drag being sloppy
 * rather than as an off-by-one.
 *
 * Refuses to drop a branch inside itself. Dragging a parallel into one of its
 * own legs would detach the whole subtree from the tree and lose it, and the
 * only honest answer to that gesture is to decline it.
 */
export function moveNode(
  root: LadderNode,
  fromPath: Path,
  toParent: Path,
  toIndex: number,
): LadderNode {
  if (fromPath.length === 0) return root;

  // Dropping a container into its own subtree would delete it.
  if (isAncestorPath(fromPath, toParent)) return root;

  const node = nodeAt(root, fromPath);
  if (!node) return root;

  const fromParent = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];

  // Same container, same slot, or the slot immediately after itself — both
  // mean "leave it where it is", and doing the remove/insert anyway would
  // renumber siblings for no reason.
  const sameParent =
    fromParent.length === toParent.length && fromParent.every((v, i) => toParent[i] === v);
  if (sameParent && (toIndex === fromIndex || toIndex === fromIndex + 1)) return root;

  const without = removeAt(root, fromPath);

  /*
   * normalise() runs inside removeAt and can collapse a container that is left
   * with one child or none, so a path captured before the removal may no
   * longer point anywhere. Re-finding the destination by id is the only thing
   * that survives that.
   */
  const parentNode = nodeAt(root, toParent);
  const parentId = parentNode && isBranch(parentNode) ? parentNode.id : null;
  const livePath = parentId ? pathOfId(without, parentId) : null;
  const destination = livePath ?? [];

  const adjusted = sameParent && fromIndex < toIndex ? toIndex - 1 : toIndex;

  return insertAt(without, destination, Math.max(0, adjusted), node);
}

/**
 * Remove a branch but keep what was inside it, laid out in series.
 *
 * "Delete the branch" means two different things and only one of them is
 * usually wanted. Removing the parallel node takes every contact in every leg
 * with it, which is right when the branch was a mistake and wrong when the
 * branch was drawn around the correct contacts in the wrong place — and that
 * second case is the common one, because a branch is normally the last thing
 * added.
 *
 * The legs are concatenated left to right in the order they were drawn. Any
 * other order would be a guess, and this one matches what the person sees.
 */
export function unwrapBranch(root: LadderNode, parallelPath: Path): LadderNode {
  const node = nodeAt(root, parallelPath);
  if (!node || node.kind !== "parallel") return root;

  const contents: LadderNode[] = [];
  for (const leg of node.children) {
    if (leg.kind === "series") contents.push(...leg.children);
    else contents.push(leg);
  }

  // A branch with nothing in it just goes.
  if (contents.length === 0) return removeAt(root, parallelPath);

  return normalise(replaceAt(root, parallelPath, series(contents)));
}
