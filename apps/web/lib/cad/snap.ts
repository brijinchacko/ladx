import { type Drawing, type Entity, type Point, dimensionGeometry } from "./types";

/**
 * Object snap.
 *
 * The difference between a drawing tool and a drafting tool. Grid snap alone
 * gets you lines that look joined at any sensible zoom and are forty microns
 * apart in the file, which is fine until somebody exports the DXF to a laser
 * cutter or tries to fill a closed region and finds it is not closed. Snapping
 * to the geometry that is already there is what makes a drawing correct rather
 * than merely tidy.
 *
 * The set here is the one that earns its keep on panel layouts and schematics:
 *
 *   endpoint     the ends of lines, polyline vertices, rectangle corners
 *   midpoint     the middle of any segment, for centring a symbol on a rail
 *   centre       circle and arc centres, for a gland or a mounting hole
 *   quadrant     the four cardinal points of a circle, for tangent construction
 *   perpendicular  the foot of a perpendicular from the last point
 *
 * Priority is by kind first and distance second, because when an endpoint and a
 * midpoint are both in range the endpoint is almost always what was meant, and
 * a snap that picks the nearer one flickers between the two as the pointer
 * moves. Ordering by kind makes it stable.
 */

export type SnapKind = "endpoint" | "midpoint" | "centre" | "quadrant" | "perpendicular" | "grid";

export interface SnapHit {
  point: Point;
  kind: SnapKind;
}

/** Lower sorts first. Ties are then broken on distance. */
const RANK: Record<SnapKind, number> = {
  endpoint: 0,
  centre: 1,
  midpoint: 2,
  quadrant: 3,
  perpendicular: 4,
  grid: 5,
};

function segments(e: Entity): [Point, Point][] {
  switch (e.type) {
    case "line":
      return [[e.a, e.b]];
    case "rect": {
      const c: Point[] = [
        { x: e.a.x, y: e.a.y },
        { x: e.b.x, y: e.a.y },
        { x: e.b.x, y: e.b.y },
        { x: e.a.x, y: e.b.y },
      ];
      return [
        [c[0] as Point, c[1] as Point],
        [c[1] as Point, c[2] as Point],
        [c[2] as Point, c[3] as Point],
        [c[3] as Point, c[0] as Point],
      ];
    }
    case "polyline": {
      const out: [Point, Point][] = [];
      for (let i = 0; i < e.points.length - 1; i++) {
        out.push([e.points[i] as Point, e.points[i + 1] as Point]);
      }
      if (e.closed && e.points.length > 2) {
        out.push([e.points[e.points.length - 1] as Point, e.points[0] as Point]);
      }
      return out;
    }
    case "dimension": {
      const g = dimensionGeometry(e);
      return [...g.witness, g.line];
    }
    default:
      return [];
  }
}

/** The foot of the perpendicular from p to the segment, if it lands on it. */
function footOf(p: Point, a: Point, b: Point): Point | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < 0 || t > 1) return null;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * The best snap within `tol` drawing units, or null.
 *
 * `exclude` keeps a selection from snapping to itself while it is being
 * dragged, which would pin it in place the moment it moved.
 */
export function findSnap(
  drawing: Drawing,
  p: Point,
  tol: number,
  opts: {
    layerVisible: (name: string) => boolean;
    exclude?: Set<string>;
    /** Enables the perpendicular snap, measured from the previous click. */
    from?: Point | null;
  },
): SnapHit | null {
  let best: (SnapHit & { d: number }) | null = null;

  const consider = (point: Point, kind: SnapKind) => {
    const d = Math.hypot(point.x - p.x, point.y - p.y);
    if (d > tol) return;
    if (!best || RANK[kind] < RANK[best.kind] || (RANK[kind] === RANK[best.kind] && d < best.d)) {
      best = { point, kind, d };
    }
  };

  for (const e of drawing.entities) {
    if (opts.exclude?.has(e.id)) continue;
    if (!opts.layerVisible(e.layer)) continue;

    for (const [a, b] of segments(e)) {
      consider(a, "endpoint");
      consider(b, "endpoint");
      consider({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, "midpoint");
      if (opts.from) {
        const foot = footOf(opts.from, a, b);
        if (foot) consider(foot, "perpendicular");
      }
    }

    if (e.type === "circle" || e.type === "arc") {
      consider(e.c, "centre");
      consider({ x: e.c.x + e.r, y: e.c.y }, "quadrant");
      consider({ x: e.c.x - e.r, y: e.c.y }, "quadrant");
      consider({ x: e.c.x, y: e.c.y + e.r }, "quadrant");
      consider({ x: e.c.x, y: e.c.y - e.r }, "quadrant");
    }
    if (e.type === "text") consider(e.at, "endpoint");
  }

  return best ? { point: (best as SnapHit).point, kind: (best as SnapHit).kind } : null;
}

export const SNAP_LABEL: Record<SnapKind, string> = {
  endpoint: "endpoint",
  midpoint: "midpoint",
  centre: "centre",
  quadrant: "quadrant",
  perpendicular: "perpendicular",
  grid: "grid",
};
