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

export type EntityType = "line" | "circle" | "arc" | "rect" | "polyline" | "text" | "dimension";

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

/**
 * A linear dimension.
 *
 * Kept as one entity rather than as the lines and text it looks like, so the
 * measurement stays live: move the drawing and the number is still right,
 * because it is computed from `a` and `b` rather than typed in. That is the
 * whole difference between a dimension and a label, and getting a panel cut
 * from a drawing whose dimension text no longer matches its geometry is the
 * mistake it exists to prevent.
 *
 * `offset` is the perpendicular distance from the measured line to the
 * dimension line, signed, so the annotation can sit on either side.
 *
 * DXF has a DIMENSION entity, but it carries a block reference and a dimension
 * style table that every reader interprets slightly differently. Export writes
 * the exploded lines and text instead, which every package reads identically.
 */
export interface DimensionEntity extends Base {
  type: "dimension";
  a: Point;
  b: Point;
  offset: number;
  /** Cap height of the measurement text, in drawing units. */
  height: number;
  /** Overrides the measured value, for a dimension marked "typ." or similar. */
  label?: string;
}

export type Entity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | RectEntity
  | PolylineEntity
  | TextEntity
  | DimensionEntity;

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
    case "dimension": {
      const pts = [e.a, e.b, ...dimensionGeometry(e).witness.flat()];
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return {
        min: { x: Math.min(...xs), y: Math.min(...ys) },
        max: { x: Math.max(...xs), y: Math.max(...ys) },
      };
    }
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

/**
 * The lines a dimension is drawn from.
 *
 * One function, used by the canvas renderer, the DXF exporter and the bounds
 * calculation, so what you see on screen, what lands in the file and what the
 * view frames itself around cannot disagree.
 *
 *   witness   the two thin lines running from the measured points out past the
 *             dimension line, so the dimension can stand clear of the geometry
 *   line      the dimension line itself, with the arrows at its ends
 *   text      where the measurement sits, and the angle it reads at
 */
export function dimensionGeometry(e: DimensionEntity): {
  witness: [Point, Point][];
  line: [Point, Point];
  text: { at: Point; angle: number; value: string };
  arrows: [Point, Point][];
} {
  const dx = e.b.x - e.a.x;
  const dy = e.b.y - e.a.y;
  const len = Math.hypot(dx, dy) || 1;

  // Unit vector along the measurement, and its left-hand normal.
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const off = (p: Point, d: number): Point => ({ x: p.x + nx * d, y: p.y + ny * d });

  const a2 = off(e.a, e.offset);
  const b2 = off(e.b, e.offset);
  // Witness lines overshoot the dimension line slightly, per drawing convention.
  const over = Math.sign(e.offset || 1) * e.height * 0.8;

  const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };

  // Text never reads upside down. Normalised into (-180, 180] first, flipped if
  // it would read backwards, then normalised again: a dimension measured right
  // to left is exactly 180 degrees, and flipping that without the second pass
  // gives 360, which draws correctly and is a wrong number to put in a file.
  let angle = normaliseDeg((Math.atan2(dy, dx) * 180) / Math.PI);
  if (angle > 90 || angle <= -90) angle = normaliseDeg(angle + 180);

  const head = e.height * 1.2;
  const wing = e.height * 0.4;
  const arrow = (tip: Point, dir: number): [Point, Point][] => [
    [tip, { x: tip.x + ux * head * dir + nx * wing, y: tip.y + uy * head * dir + ny * wing }],
    [tip, { x: tip.x + ux * head * dir - nx * wing, y: tip.y + uy * head * dir - ny * wing }],
  ];

  return {
    witness: [
      [off(e.a, e.offset > 0 ? e.height * 0.4 : -e.height * 0.4), off(e.a, e.offset + over)],
      [off(e.b, e.offset > 0 ? e.height * 0.4 : -e.height * 0.4), off(e.b, e.offset + over)],
    ],
    line: [a2, b2],
    arrows: [...arrow(a2, 1), ...arrow(b2, -1)],
    text: {
      // Lifted clear of the dimension line, which is where a draughtsman puts it.
      at: { x: mid.x + nx * e.height * 0.5, y: mid.y + ny * e.height * 0.5 },
      angle,
      value: e.label ?? formatLength(len),
    },
  };
}

/** Into (-180, 180], the range a drawing angle is read in. */
function normaliseDeg(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Millimetres, to the tenth, without a trailing ".0" on a whole number. */
export function formatLength(mm: number): string {
  const rounded = Math.round(mm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
