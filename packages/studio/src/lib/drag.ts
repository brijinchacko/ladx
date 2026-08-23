import type { LadderNode } from "./tree";
import { isBranch, nid } from "./tree";
import type { Element, ElementType, Rung } from "./types";

/**
 * What is currently being dragged, and what is on the clipboard.
 *
 * The payload is held in a module variable rather than in `dataTransfer`. That
 * is not the textbook approach and it is deliberate: a custom MIME type set on
 * a `draggable` element does not survive the round trip in every browser, so
 * the drop fired, read an empty string and silently did nothing, which is
 * exactly what "I can drag but it will not drop" looks like. The dataTransfer
 * payload is still set, because it is what makes the cursor show an
 * affordance, but the drop reads this, which cannot be lost.
 */

export type DragPayload =
  /** A new instruction, from the palette. */
  | { kind: "new"; type: ElementType }
  /**
   * Something already on a rung. `isOutput` matters because contacts live in
   * the condition tree and coils live in rung.outputs, two different arrays,
   * so a move between them is not the same operation as a move within one.
   */
  | { kind: "element"; rungId: string; elementId: string; type: ElementType; isOutput: boolean }
  /** A whole network, being reordered. */
  | { kind: "rung"; rungId: string };

let payload: DragPayload | null = null;

export function setDrag(p: DragPayload | null) {
  payload = p;
}
export function takeDrag(): DragPayload | null {
  return payload;
}
export function clearDrag() {
  payload = null;
}

/** Kept for the palette's existing call sites. */
export function setDraggedInstruction(t: ElementType | null) {
  payload = t ? { kind: "new", type: t } : null;
}
export function takeDraggedInstruction(): ElementType | null {
  return payload?.kind === "new" ? payload.type : null;
}
export function clearDraggedInstruction() {
  payload = null;
}

/* ------------------------------------------------------------------ *
 * Clipboard
 * ------------------------------------------------------------------ */

export type Clip =
  | { kind: "rung"; rung: Rung }
  | { kind: "element"; element: Element; isOutput: boolean };

let clip: Clip | null = null;

export function setClipboard(c: Clip | null) {
  clip = c;
}
export function getClipboard(): Clip | null {
  return clip;
}

/**
 * A copy with every id replaced.
 *
 * Pasting a network that kept its ids puts two nodes with the same id in one
 * program. React then reuses the wrong DOM between them, the engine's
 * rising-edge memory, which is keyed by element id, becomes shared between
 * two different one-shots, and selecting one selects both. None of that looks
 * like a paste bug when it happens, so the ids are minted here and cannot be
 * forgotten at a call site.
 */
export function cloneNode(node: LadderNode): LadderNode {
  if (!isBranch(node)) return { ...node, id: nid("e") };
  return { ...node, id: nid(node.kind[0]), children: node.children.map(cloneNode) };
}

export function cloneElement(el: Element): Element {
  return { ...el, id: nid("e") };
}

export function cloneRung(rung: Rung): Rung {
  return {
    ...rung,
    id: nid("r"),
    logic: rung.logic ? (cloneNode(rung.logic as unknown as LadderNode) as never) : rung.logic,
    branches: (rung.branches ?? []).map((leg) => leg.map(cloneElement)),
    outputs: (rung.outputs ?? []).map(cloneElement),
  };
}
