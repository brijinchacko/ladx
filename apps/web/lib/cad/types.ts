/**
 * The CAD drawing model.
 *
 * Scope, stated plainly, because CAD is a word that promises a great deal.
 * This is a 2D drafting tool for the drawings an automation project actually
 * produces: panel layouts, wiring schematics, general arrangements, terminal
 * plans. It is not a parametric 3D modeller and does not pretend to be.
 *
 * The interchange format is DXF, which is the open, text-based format every CAD
 * package on the market can read and write. DWG is Autodesk's proprietary
 * binary format; reading it correctly requires a licensed SDK, so a drawing in
 * DWG has to be exported to DXF first. That limit is stated in the UI rather
 * than discovered by a user whose file silently fails to open.
 *
 * Coordinates are millimetres in a Y-up world, matching DXF and every drawing
 * convention in this field. The screen transform flips Y once, at the edge.
 */

export type EntityType = "line" | "circle" | "arc" | "rect" | "polyline" | "text";

export interface Point {
  x: number;
  y: number;
}

interface Base {
  id: string;
  layer: string;
}

export interface LineEntity extends Base {
  type: "line";
  a: Point;
  b: Point;
}

export interface CircleEntity extends Base {
  type: "circle";
  c: Point;
  r: number;
}

export interface ArcEntity extends Base {
  type: "arc";
  c: Point;
  r: number;
  /** Degrees, counter-clockwise from east, per DXF. */
  start: number;
  end: number;
}

export interface RectEntity extends Base {
  type: "rect";
  /** Opposite corners; normalised on read so width and height are positive. */
  a: Point;
  b: Point;
}

export interface PolylineEntity extends Base {
  type: "polyline";
  points: Point[];
  closed: boolean;
}

export interface TextEntity extends Base {
  type: "text";
  at: Point;
  text: string;
  /** Cap height in drawing units. */
  height: number;
}

export type Entity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | RectEntity
  | PolylineEntity
  | TextEntity;

export interface Layer {
  name: string;
  /** Hex, without the hash. DXF colour indices are mapped to these on import. */
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface Drawing {
  version: 1;
  layers: Layer[];
  entities: Entity[];
}

export const DEFAULT_LAYERS: Layer[] = [
  { name: "0", color: "0F1A24", visible: true, locked: false },
  { name: "PANEL", color: "2C9A9E", visible: true, locked: false },
  { name: "WIRING", color: "B4531A", visible: true, locked: false },
  { name: "TEXT", color: "4A5A68", visible: true, locked: false },
  { name: "DIMENSIONS", color: "7A8894", visible: true, locked: false },
];

export function emptyDrawing(): Drawing {
  return { version: 1, layers: DEFAULT_LAYERS.map((l) => ({ ...l })), entities: [] };
}

/** Axis-aligned bounds of an entity, used for fit-to-view and hit testing. */
export function entityBounds(e: Entity): { min: Point; max: Point } {
  switch (e.type) {
    case "line":
      return {
        min: { x: Math.min(e.a.x, e.b.x), y: Math.min(e.a.y, e.b.y) },
        max: { x: Math.max(e.a.x, e.b.x), y: Math.max(e.a.y, e.b.y) },
      };
    case "rect":
      return {
        min: { x: Math.min(e.a.x, e.b.x), y: Math.min(e.a.y, e.b.y) },
        max: { x: Math.max(e.a.x, e.b.x), y: Math.max(e.a.y, e.b.y) },
      };
    case "circle":
    case "arc":
      // The arc's true bounds are tighter, but the circle's bounds are a safe
      // superset and cost nothing to compute.
      return {
        min: { x: e.c.x - e.r, y: e.c.y - e.r },
        max: { x: e.c.x + e.r, y: e.c.y + e.r },
      };
    case "polyline": {
      const xs = e.points.map((p) => p.x);
      const ys = e.points.map((p) => p.y);
      return {
        min: { x: Math.min(...xs), y: Math.min(...ys) },
        max: { x: Math.max(...xs), y: Math.max(...ys) },
      };
    }
    case "text":
      // Width is estimated: measuring needs a canvas, and this is only used for
      // framing the view.
      return {
        min: { x: e.at.x, y: e.at.y },
        max: { x: e.at.x + e.text.length * e.height * 0.6, y: e.at.y + e.height },
      };
  }
}

export function drawingBounds(d: Drawing): { min: Point; max: Point } | null {
  if (d.entities.length === 0) return null;
  let min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
  let max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
  for (const e of d.entities) {
    const b = entityBounds(e);
    min = { x: Math.min(min.x, b.min.x), y: Math.min(min.y, b.min.y) };
    max = { x: Math.max(max.x, b.max.x), y: Math.max(max.y, b.max.y) };
  }
  return { min, max };
}

let counter = 0;
export function newId(prefix = "e"): string {
  counter += 1;
  return `${prefix}${counter}_${Math.random().toString(36).slice(2, 7)}`;
}
