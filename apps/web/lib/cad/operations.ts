import { type Entity, type Point, newId } from "./types";

/**
 * The modify operations a drafting tool is judged on.
 *
 * Drawing geometry from scratch is the small half of drafting. The large half
 * is changing what is already there: offsetting a rail 35 mm from the plate
 * edge, filleting a corner, arraying forty terminals along a rail at 6 mm
 * pitch. Without these you can produce a drawing, but only by drawing every
 * line individually, which is what people mean when they say a tool is not
 * really CAD.
 *
 * All pure: geometry in, geometry out, no canvas and no React. That is what
 * makes them testable, and these are the operations where a sign error is
 * invisible on screen and wrong in the file.
 */

/* ────────────────────────────── offset ────────────────────────────── */

function unitNormal(a: Point, b: Point): Point | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  return { x: -dy / len, y: dx / len };
}

/**
 * A parallel copy at a distance.
 *
 * `side` is a point telling it which way: the pointer, in practice, which is
 * how every CAD package asks. Signing the distance instead would be shorter and
 * would make the caller work out a normal it has no business knowing about.
 *
 * A closed shape offsets by scaling about its own centre rather than by
 * offsetting each edge and re-intersecting them. The exact result needs a
 * proper polygon offset with mitre handling, and the honest thing on a control
 * drawing, where offsets are used on rails and cutouts, is the approximation
 * that is right for rectangles and near enough for the rest.
 */
export function offsetEntity(e: Entity, distance: number, side: Point): Entity | null {
  const d = Math.abs(distance);
  if (d === 0) return null;

  switch (e.type) {
    case "line": {
      const n = unitNormal(e.a, e.b);
      if (!n) return null;
      // Which side of the line the pointer is on decides the sign.
      const rel = (side.x - e.a.x) * n.x + (side.y - e.a.y) * n.y;
      const s = rel >= 0 ? d : -d;
      return {
        ...e,
        id: newId("o"),
        a: { x: e.a.x + n.x * s, y: e.a.y + n.y * s },
        b: { x: e.b.x + n.x * s, y: e.b.y + n.y * s },
      };
    }

    case "circle": {
      const out = Math.hypot(side.x - e.c.x, side.y - e.c.y) > e.r;
      const r = out ? e.r + d : e.r - d;
      return r <= 0 ? null : { ...e, id: newId("o"), r };
    }

    case "arc": {
      const out = Math.hypot(side.x - e.c.x, side.y - e.c.y) > e.r;
      const r = out ? e.r + d : e.r - d;
      return r <= 0 ? null : { ...e, id: newId("o"), r };
    }

    case "rect": {
      const cx = (e.a.x + e.b.x) / 2;
      const cy = (e.a.y + e.b.y) / 2;
      const out =
        Math.abs(side.x - cx) > Math.abs(e.b.x - e.a.x) / 2 ||
        Math.abs(side.y - cy) > Math.abs(e.b.y - e.a.y) / 2;
      const s = out ? d : -d;
      const w = Math.abs(e.b.x - e.a.x) / 2 + s;
      const h = Math.abs(e.b.y - e.a.y) / 2 + s;
      if (w <= 0 || h <= 0) return null;
      return {
        ...e,
        id: newId("o"),
        a: { x: cx - w, y: cy - h },
        b: { x: cx + w, y: cy + h },
      };
    }

    case "polyline": {
      // Each segment offset by the same normal. Vertices are the midpoint of
      // the two offset neighbours, which mitres well enough at shallow angles
      // and is visibly wrong at sharp ones. Stated rather than hidden.
      const pts = e.points;
      if (pts.length < 2) return null;
      const moved: Point[] = pts.map((p, i) => {
        const prev = pts[Math.max(0, i - 1)] as Point;
        const next = pts[Math.min(pts.length - 1, i + 1)] as Point;
        const n = unitNormal(prev, next) ?? { x: 0, y: 0 };
        const rel = (side.x - p.x) * n.x + (side.y - p.y) * n.y;
        const s = rel >= 0 ? d : -d;
        return { x: p.x + n.x * s, y: p.y + n.y * s };
      });
      return { ...e, id: newId("o"), points: moved };
    }

    default:
      return null;
  }
}

/* ────────────────────────────── fillet ────────────────────────────── */

/** Where two infinite lines cross, or null when they are parallel. */
function intersect(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  return { x: a1.x + d1x * t, y: a1.y + d1y * t };
}

export interface FilletResult {
  /** The two lines, shortened to meet the arc. */
  lines: [Entity, Entity];
  /** The arc between them. Absent for a zero radius, which is a plain corner. */
  arc: Entity | null;
}

/**
 * Round the corner between two lines.
 *
 * Radius zero is not a no-op: it is the other thing fillet is used for, which
 * is trimming or extending two lines until they actually meet. Half the fillets
 * on a real drawing are that, closing a corner somebody left 0.3 mm open.
 *
 * The end of each line nearer the intersection is the one that moves, which is
 * what makes it work whichever direction the lines were drawn in.
 */
export function filletLines(first: Entity, second: Entity, radius: number): FilletResult | null {
  if (first.type !== "line" || second.type !== "line") return null;

  const p = intersect(first.a, first.b, second.a, second.b);
  if (!p) return null;

  // Work with each line as: the corner, and the end that stays put.
  const farEnd = (l: typeof first): Point =>
    Math.hypot(l.a.x - p.x, l.a.y - p.y) > Math.hypot(l.b.x - p.x, l.b.y - p.y) ? l.a : l.b;

  const f1 = farEnd(first);
  const f2 = farEnd(second);

  const dir = (from: Point): Point => {
    const dx = from.x - p.x;
    const dy = from.y - p.y;
    const len = Math.hypot(dx, dy);
    return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
  };
  const u1 = dir(f1);
  const u2 = dir(f2);

  if (radius <= 0) {
    return {
      lines: [
        { ...first, a: f1, b: p },
        { ...second, a: f2, b: p },
      ],
      arc: null,
    };
  }

  // Distance back along each leg to the tangent point.
  const cosTheta = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
  const theta = Math.acos(cosTheta);
  if (theta < 1e-6 || Math.abs(Math.PI - theta) < 1e-6) return null;
  const back = radius / Math.tan(theta / 2);

  const legLen = (from: Point) => Math.hypot(from.x - p.x, from.y - p.y);
  if (back >= legLen(f1) || back >= legLen(f2)) return null;

  const t1 = { x: p.x + u1.x * back, y: p.y + u1.y * back };
  const t2 = { x: p.x + u2.x * back, y: p.y + u2.y * back };

  // The arc centre sits along the bisector, at radius / sin(theta/2).
  const bis = { x: u1.x + u2.x, y: u1.y + u2.y };
  const bisLen = Math.hypot(bis.x, bis.y);
  if (bisLen < 1e-9) return null;
  const toCentre = radius / Math.sin(theta / 2);
  const c = { x: p.x + (bis.x / bisLen) * toCentre, y: p.y + (bis.y / bisLen) * toCentre };

  const angleOf = (q: Point) => (Math.atan2(q.y - c.y, q.x - c.x) * 180) / Math.PI;
  let start = angleOf(t1);
  let end = angleOf(t2);
  // Take the minor arc, which is the one a fillet always means.
  if ((end - start + 360) % 360 > 180) [start, end] = [end, start];

  return {
    lines: [
      { ...first, a: f1, b: t1 },
      { ...second, a: f2, b: t2 },
    ],
    arc: { id: newId("f"), type: "arc", layer: first.layer, c, r: radius, start, end },
  };
}

/* ────────────────────────────── array ────────────────────────────── */

/**
 * A rectangular array.
 *
 * The single most useful command on a panel drawing. Forty terminals at 6 mm
 * pitch along a rail is one operation, and drawing them individually is the
 * afternoon this replaces. The original is not duplicated: the array is the
 * copies, and index 0,0 is skipped.
 */
export function arrayRectangular(
  entities: Entity[],
  cols: number,
  rows: number,
  dx: number,
  dy: number,
  move: (e: Entity, dx: number, dy: number) => Entity,
): Entity[] {
  const out: Entity[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 && c === 0) continue;
      for (const e of entities) {
        out.push({ ...move(e, c * dx, r * dy), id: newId("ar") });
      }
    }
  }
  return out;
}

/**
 * A polar array, about a centre.
 *
 * For anything laid out on a circle: bolt holes on a flange, lamps on a
 * beacon. `rotateItems` is off when the copies should keep their orientation,
 * which is what you want for text and for a symbol that must stay upright.
 */
export function arrayPolar(
  entities: Entity[],
  centre: Point,
  count: number,
  totalAngle: number,
  rotateItems: boolean,
  transform: (
    e: Entity,
    base: Point,
    fn: (p: Point) => Point,
    opts: { angleDelta?: number },
  ) => Entity,
  rotateAbout: (base: Point, degrees: number) => (p: Point) => Point,
): Entity[] {
  const out: Entity[] = [];
  if (count < 2) return out;
  const step = totalAngle / (Math.abs(totalAngle - 360) < 1e-6 ? count : count - 1);

  for (let i = 1; i < count; i++) {
    const angle = step * i;
    for (const e of entities) {
      const moved = transform(e, centre, rotateAbout(centre, angle), {
        angleDelta: rotateItems ? angle : 0,
      });
      out.push({ ...moved, id: newId("ap") });
    }
  }
  return out;
}

/* ────────────────────────── ortho and polar ────────────────────────── */

/**
 * Constrain a point to an angle from the last one.
 *
 * Ortho is the reason drawings come out square. Without it every horizontal
 * line is a fraction of a degree off, which looks fine and produces a DXF full
 * of geometry that does not close. `increment` of 90 is ortho; 15 is the polar
 * tracking most packages default to.
 */
export function constrainAngle(from: Point, to: Point, increment: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return to;

  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = Math.round(angle / increment) * increment;
  const rad = (snapped * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * dist, y: from.y + Math.sin(rad) * dist };
}

/* ─────────────────────────── trim and extend ─────────────────────────── */

/**
 * Every straight segment an entity presents, for use as a boundary.
 *
 * Trim and extend work against edges, and a rectangle is four of them while a
 * polyline is however many it has. Circles are handled separately because they
 * are not segments.
 */
export function edgesOf(e: Entity): [Point, Point][] {
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
    default:
      return [];
  }
}

/** Where two segments actually cross, within both of their spans. */
function segmentCross(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;

  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  // Both parameters must land inside their own segment, with a hair of
  // tolerance so a line ending exactly on a boundary still counts.
  const EPS = 1e-6;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: a1.x + d1x * t, y: a1.y + d1y * t };
}

/** Where an infinite ray from a1 through a2 meets a segment. */
function rayCross(a1: Point, a2: Point, b1: Point, b2: Point): { at: Point; t: number } | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom;
  if (u < 0 || u > 1) return null;
  return { at: { x: a1.x + d1x * t, y: a1.y + d1y * t }, t };
}

/**
 * Cut a line back to the nearest boundary, on the side that was picked.
 *
 * The most used command in 2D drafting, and the reason is a working habit
 * rather than a preference: it is faster to let lines cross and clean the
 * corners afterwards than to snap every one perfectly while laying out. So the
 * pick point is the whole interface. You point at the part you want gone, and
 * what disappears is the piece between the nearest crossing and that end.
 *
 * Returns the shortened line, or null when nothing crosses it, or when the
 * pick would remove the whole thing.
 */
export function trimLine(target: Entity, boundaries: Entity[], pick: Point): Entity | null {
  if (target.type !== "line") return null;

  const dx = target.b.x - target.a.x;
  const dy = target.b.y - target.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;

  // Every crossing, as a parameter along the line.
  const params: number[] = [];
  for (const b of boundaries) {
    if (b.id === target.id) continue;
    for (const [p1, p2] of edgesOf(b)) {
      const at = segmentCross(target.a, target.b, p1, p2);
      if (!at) continue;
      params.push(((at.x - target.a.x) * dx + (at.y - target.a.y) * dy) / len2);
    }
  }
  if (params.length === 0) return null;

  const pickT = ((pick.x - target.a.x) * dx + (pick.y - target.a.y) * dy) / len2;
  const EPS = 1e-6;

  // The crossings either side of where the user pointed.
  const before = params.filter((t) => t < pickT - EPS).sort((m, n) => n - m)[0];
  const after = params.filter((t) => t > pickT + EPS).sort((m, n) => m - n)[0];

  // Pointing between two crossings removes the middle, which would split the
  // line in two. One entity in, one out: the longer remainder is kept and the
  // caller is told nothing was lost by checking the length.
  if (before !== undefined && after !== undefined) {
    const keepStart = before >= 1 - before;
    return keepStart
      ? { ...target, b: alongLine(target.a, target.b, before) }
      : { ...target, a: alongLine(target.a, target.b, after) };
  }

  if (after !== undefined) {
    // The pick is before the first crossing, so that stub goes.
    if (after <= EPS) return null;
    return { ...target, a: alongLine(target.a, target.b, after) };
  }
  if (before !== undefined) {
    if (before >= 1 - EPS) return null;
    return { ...target, b: alongLine(target.a, target.b, before) };
  }
  return null;
}

function alongLine(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Stretch a line until it meets a boundary.
 *
 * The end nearer the pick is the one that moves, which is how every CAD
 * package asks and means a line can be extended either way without redrawing
 * it. Only forward crossings count: extending backwards through the line's own
 * body would shorten it, which is trim's job.
 */
export function extendLine(target: Entity, boundaries: Entity[], pick: Point): Entity | null {
  if (target.type !== "line") return null;

  const dA = Math.hypot(pick.x - target.a.x, pick.y - target.a.y);
  const dB = Math.hypot(pick.x - target.b.x, pick.y - target.b.y);
  const movingA = dA < dB;

  // Cast from the fixed end through the moving one, so t > 1 is beyond it.
  const from = movingA ? target.b : target.a;
  const through = movingA ? target.a : target.b;

  let best: { at: Point; t: number } | null = null;
  for (const b of boundaries) {
    if (b.id === target.id) continue;
    for (const [p1, p2] of edgesOf(b)) {
      const hit = rayCross(from, through, p1, p2);
      if (!hit || hit.t <= 1 + 1e-6) continue;
      if (!best || hit.t < best.t) best = hit;
    }
  }
  if (!best) return null;

  return movingA ? { ...target, a: best.at } : { ...target, b: best.at };
}

/* ────────────────────────────── hatch ────────────────────────────── */

/**
 * The lines that shade a region.
 *
 * Computed rather than stored, so a hatch moved or scaled re-shades itself
 * correctly instead of carrying stale geometry. Parallel lines are swept
 * across the boundary's bounding box at the pattern angle and clipped to the
 * polygon, which is the standard scanline approach and is exact for the
 * polygons a control drawing produces.
 *
 * Self-intersecting boundaries shade by the even-odd rule, which is what makes
 * a hatch with a hole in it come out right.
 */
export function hatchLines(points: Point[], spacing: number, angle: number): [Point, Point][] {
  if (points.length < 3 || spacing <= 0) return [];

  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Work in a frame where the pattern lines are horizontal, then rotate back.
  const toLocal = (p: Point) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos });
  const toWorld = (p: Point) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });

  const local = points.map(toLocal);
  const ys = local.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // A pathological spacing on a large region would produce millions of lines.
  const rows = Math.floor((maxY - minY) / spacing);
  if (rows > 2000) return [];

  const out: [Point, Point][] = [];
  for (let i = 0; i <= rows; i++) {
    const y = minY + i * spacing;
    // Every crossing of this scanline with the boundary.
    const xs: number[] = [];
    for (let j = 0; j < local.length; j++) {
      const p1 = local[j] as Point;
      const p2 = local[(j + 1) % local.length] as Point;
      if (p1.y === p2.y) continue;
      const lo = Math.min(p1.y, p2.y);
      const hi = Math.max(p1.y, p2.y);
      if (y < lo || y >= hi) continue;
      xs.push(p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x));
    }
    xs.sort((a, b) => a - b);
    // Even-odd: fill between alternate pairs, which is what gives a hole.
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = xs[k] as number;
      const to = xs[k + 1] as number;
      // A scanline that merely clips a corner produces a span of no length.
      // Emitting it puts a zero-length line in the DXF and a stray dot on the
      // print, so it is dropped here rather than by every consumer.
      if (to - from < 1e-9) continue;
      out.push([toWorld({ x: from, y }), toWorld({ x: to, y })]);
    }
  }
  return out;
}
