import { hatchLines } from "./operations";
import { type Drawing, type Entity, type Point, dimensionGeometry, entityBounds } from "./types";

/**
 * Drawing entities onto a canvas, and working out what the pointer is over.
 *
 * Split out of the editor because both jobs are pure geometry with no React in
 * them, and because the renderer and the hit tester must agree: an entity you
 * can see and cannot click, or the reverse, is a bug that only shows up as
 * "the select tool feels broken".
 */

export interface Screen {
  toScreen: (p: Point) => Point;
  /** Drawing units per screen pixel. */
  scale: number;
}

export function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, s: Screen): void {
  const { toScreen, scale } = s;
  ctx.beginPath();

  switch (e.type) {
    case "line": {
      const a = toScreen(e.a);
      const b = toScreen(e.b);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    }
    case "rect": {
      const a = toScreen(e.a);
      const b = toScreen(e.b);
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.stroke();
      break;
    }
    case "circle": {
      const c = toScreen(e.c);
      ctx.arc(c.x, c.y, Math.max(e.r / scale, 0.5), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "arc": {
      const c = toScreen(e.c);
      // Canvas angles run clockwise with Y down; DXF runs counter-clockwise with
      // Y up, so both angles are negated to land in the same place.
      ctx.arc(
        c.x,
        c.y,
        Math.max(e.r / scale, 0.5),
        (-e.end * Math.PI) / 180,
        (-e.start * Math.PI) / 180,
      );
      ctx.stroke();
      break;
    }
    case "polyline": {
      e.points.forEach((p, i) => {
        const q = toScreen(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      if (e.closed) ctx.closePath();
      ctx.stroke();
      break;
    }
    case "text": {
      const q = toScreen(e.at);
      const px = e.height / scale;
      if (px < 3) break; // unreadable at this zoom, and expensive to draw
      ctx.font = `${px}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(e.text, q.x, q.y);
      break;
    }
    case "hatch": {
      const poly = e.points.map(toScreen);
      if (poly.length < 3) break;
      // The outline always, so an empty region still reads as a region.
      poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();

      if (e.pattern === "solid") {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fill();
        ctx.restore();
        break;
      }

      const angles = e.pattern === "cross" ? [e.angle, e.angle + 90] : [e.angle];
      ctx.beginPath();
      for (const a of angles) {
        for (const [p, q] of hatchLines(e.points, e.spacing, a)) {
          const sp = toScreen(p);
          const sq = toScreen(q);
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(sq.x, sq.y);
        }
      }
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "ellipse": {
      const c = toScreen(e.c);
      ctx.ellipse(
        c.x,
        c.y,
        Math.max(e.rx / scale, 0.5),
        Math.max(e.ry / scale, 0.5),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    }
    case "point": {
      // A cross at a fixed screen size, because a point marks a position and
      // has no size of its own; scaling it with the zoom would make it a blob.
      const q = toScreen(e.at);
      ctx.moveTo(q.x - 4, q.y);
      ctx.lineTo(q.x + 4, q.y);
      ctx.moveTo(q.x, q.y - 4);
      ctx.lineTo(q.x, q.y + 4);
      ctx.stroke();
      break;
    }
    case "leader": {
      const a = toScreen(e.from);
      const b = toScreen(e.to);
      // Arrow, slope, then a short horizontal shoulder the text sits on.
      const shoulder = b.x >= a.x ? 14 : -14;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x + shoulder, b.y);
      ctx.stroke();

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + ux * 9 - uy * 3, a.y + uy * 9 + ux * 3);
      ctx.lineTo(a.x + ux * 9 + uy * 3, a.y + uy * 9 - ux * 3);
      ctx.closePath();
      ctx.fill();

      const px = e.height / scale;
      if (px >= 3) {
        ctx.font = `${px}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = shoulder > 0 ? "left" : "right";
        ctx.fillText(e.text, b.x + shoulder + (shoulder > 0 ? 2 : -2), b.y - 2);
        ctx.textAlign = "start";
      }
      break;
    }
    case "dimension": {
      const g = dimensionGeometry(e);
      for (const [a, b] of [...g.witness, g.line, ...g.arrows]) {
        const p = toScreen(a);
        const q = toScreen(b);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();

      const px = e.height / scale;
      if (px >= 3) {
        const t = toScreen(g.text.at);
        ctx.save();
        ctx.translate(t.x, t.y);
        // Screen Y runs the other way, so the world angle is negated.
        ctx.rotate((-g.text.angle * Math.PI) / 180);
        ctx.font = `${px}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.fillText(g.text.value, 0, 0);
        ctx.restore();
        ctx.textAlign = "start";
      }
      break;
    }
  }
}

/* ── hit testing ───────────────────────────────────────────────────────── */

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance from a point to an entity's drawn geometry. */
export function distToEntity(p: Point, e: Entity): number {
  switch (e.type) {
    case "line":
      return distToSegment(p, e.a, e.b);
    case "rect": {
      const c: Point[] = [
        { x: e.a.x, y: e.a.y },
        { x: e.b.x, y: e.a.y },
        { x: e.b.x, y: e.b.y },
        { x: e.a.x, y: e.b.y },
      ];
      let d = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 4; i++) {
        d = Math.min(d, distToSegment(p, c[i] as Point, c[(i + 1) % 4] as Point));
      }
      return d;
    }
    case "circle":
      return Math.abs(Math.hypot(p.x - e.c.x, p.y - e.c.y) - e.r);
    case "arc": {
      // Only the drawn sweep counts, so the empty side of an arc is not
      // clickable, which is what makes overlapping arcs selectable at all.
      let a = (Math.atan2(p.y - e.c.y, p.x - e.c.x) * 180) / Math.PI;
      if (a < 0) a += 360;
      const start = ((e.start % 360) + 360) % 360;
      const span = (((e.end - e.start) % 360) + 360) % 360 || 360;
      const rel = (a - start + 360) % 360;
      if (rel > span) {
        // Outside the sweep: fall back to the nearer endpoint.
        const p1 = {
          x: e.c.x + Math.cos((e.start * Math.PI) / 180) * e.r,
          y: e.c.y + Math.sin((e.start * Math.PI) / 180) * e.r,
        };
        const p2 = {
          x: e.c.x + Math.cos((e.end * Math.PI) / 180) * e.r,
          y: e.c.y + Math.sin((e.end * Math.PI) / 180) * e.r,
        };
        return Math.min(Math.hypot(p.x - p1.x, p.y - p1.y), Math.hypot(p.x - p2.x, p.y - p2.y));
      }
      return Math.abs(Math.hypot(p.x - e.c.x, p.y - e.c.y) - e.r);
    }
    case "polyline": {
      let d = Number.POSITIVE_INFINITY;
      for (let i = 0; i < e.points.length - 1; i++) {
        d = Math.min(d, distToSegment(p, e.points[i] as Point, e.points[i + 1] as Point));
      }
      if (e.closed && e.points.length > 2) {
        d = Math.min(
          d,
          distToSegment(p, e.points[e.points.length - 1] as Point, e.points[0] as Point),
        );
      }
      return d;
    }
    case "text":
      return Math.hypot(p.x - e.at.x, p.y - e.at.y);
    case "point":
      return Math.hypot(p.x - e.at.x, p.y - e.at.y);
    case "ellipse": {
      // Distance to the ellipse's outline, approximated by the radial scale.
      // Exact would need an iterative solve for no gain on a hit test.
      const dx = (p.x - e.c.x) / (e.rx || 1);
      const dy = (p.y - e.c.y) / (e.ry || 1);
      const k = Math.hypot(dx, dy);
      if (k === 0) return Math.min(e.rx, e.ry);
      const nearest = { x: e.c.x + (p.x - e.c.x) / k, y: e.c.y + (p.y - e.c.y) / k };
      return Math.hypot(p.x - nearest.x, p.y - nearest.y);
    }
    case "hatch": {
      let d = Number.POSITIVE_INFINITY;
      for (let i = 0; i < e.points.length; i++) {
        d = Math.min(
          d,
          distToSegment(p, e.points[i] as Point, e.points[(i + 1) % e.points.length] as Point),
        );
      }
      return d;
    }
    case "leader":
      return Math.min(distToSegment(p, e.from, e.to), Math.hypot(p.x - e.to.x, p.y - e.to.y));
    case "dimension": {
      const g = dimensionGeometry(e);
      let d = distToSegment(p, g.line[0], g.line[1]);
      for (const [a, b] of g.witness) d = Math.min(d, distToSegment(p, a, b));
      return Math.min(d, Math.hypot(p.x - g.text.at.x, p.y - g.text.at.y));
    }
  }
}

export interface LayerState {
  visible: boolean;
  locked: boolean;
}

/** Nearest selectable entity within `tol` drawing units, or null. */
export function hitTest(
  drawing: Drawing,
  p: Point,
  tol: number,
  layerOf: (n: string) => LayerState | undefined,
): string | null {
  let best: { id: string; d: number } | null = null;
  for (const e of drawing.entities) {
    const l = layerOf(e.layer);
    if (l && (!l.visible || l.locked)) continue;
    const d = distToEntity(p, e);
    if (d <= tol && (!best || d < best.d)) best = { id: e.id, d };
  }
  return best?.id ?? null;
}

/**
 * Everything inside a marquee.
 *
 * Fully enclosed only, which is the stricter of the two CAD conventions and the
 * one that does not surprise: dragging a box across a dense panel layout and
 * catching every wire that merely passes through it is how people accidentally
 * move half a drawing.
 */
export function hitTestBox(
  drawing: Drawing,
  a: Point,
  b: Point,
  layerOf: (n: string) => LayerState | undefined,
): string[] {
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const out: string[] = [];
  for (const e of drawing.entities) {
    const l = layerOf(e.layer);
    if (l && (!l.visible || l.locked)) continue;
    const eb = entityBounds(e);
    if (eb.min.x >= min.x && eb.min.y >= min.y && eb.max.x <= max.x && eb.max.y <= max.y) {
      out.push(e.id);
    }
  }
  return out;
}

/* ── transforms ────────────────────────────────────────────────────────── */

/** An entity moved by a delta. Returns a new object; the input is untouched. */
export function translateEntity(e: Entity, dx: number, dy: number): Entity {
  const m = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  switch (e.type) {
    case "line":
    case "rect":
      return { ...e, a: m(e.a), b: m(e.b) };
    case "dimension":
      return { ...e, a: m(e.a), b: m(e.b) };
    case "circle":
    case "arc":
      return { ...e, c: m(e.c) };
    case "polyline":
      return { ...e, points: e.points.map(m) };
    case "text":
    case "point":
      return { ...e, at: m(e.at) };
    case "ellipse":
      return { ...e, c: m(e.c) };
    case "leader":
      return { ...e, from: m(e.from), to: m(e.to) };
    case "hatch":
      return { ...e, points: e.points.map(m) };
  }
}

/* ── transforms about a point ──────────────────────────────────────────── */

/**
 * Rotate, mirror and scale, all about a base point.
 *
 * The base point is what makes these usable. Rotating a symbol about the
 * drawing origin flings it off the sheet; rotating it about its own centre, or
 * about the terminal it connects to, is the operation an engineer means. The
 * editor passes the centre of the selection unless the user has snapped to
 * something, in which case it passes that.
 *
 * Text and dimensions rotate by moving their anchors only. A dimension already
 * derives its own angle from the points it measures, and text that follows an
 * arbitrary rotation is unreadable on a drawing; both are conventions a
 * draughtsman would recognise rather than shortcuts.
 */
export function transformEntity(
  e: Entity,
  base: Point,
  fn: (p: Point) => Point,
  opts: { angleDelta?: number; scale?: number; mirrorX?: boolean } = {},
): Entity {
  const m = fn;
  switch (e.type) {
    case "line":
      return { ...e, a: m(e.a), b: m(e.b) };
    case "rect":
      return { ...e, a: m(e.a), b: m(e.b) };
    case "dimension":
      return {
        ...e,
        a: m(e.a),
        b: m(e.b),
        // A mirrored dimension would otherwise flip to the wrong side of the
        // line it measures.
        offset: opts.mirrorX ? -e.offset : e.offset * (opts.scale ?? 1),
      };
    case "circle":
      return { ...e, c: m(e.c), r: e.r * (opts.scale ?? 1) };
    case "arc": {
      const rotated = (opts.angleDelta ?? 0) % 360;
      if (opts.mirrorX) {
        // Mirroring reverses the sweep direction as well as reflecting the
        // angles, or the arc comes out as its own complement.
        return {
          ...e,
          c: m(e.c),
          start: 180 - e.end,
          end: 180 - e.start,
          r: e.r * (opts.scale ?? 1),
        };
      }
      return {
        ...e,
        c: m(e.c),
        r: e.r * (opts.scale ?? 1),
        start: e.start + rotated,
        end: e.end + rotated,
      };
    }
    case "polyline":
      return { ...e, points: e.points.map(m) };
    case "text":
      return { ...e, at: m(e.at), height: e.height * (opts.scale ?? 1) };
    case "point":
      return { ...e, at: m(e.at) };
    case "ellipse": {
      const k = opts.scale ?? 1;
      // A quarter turn swaps the axes; anything else would need a rotated
      // ellipse, which this model does not carry, so it is left axis aligned.
      const quarter = Math.abs(((opts.angleDelta ?? 0) / 90) % 2) === 1;
      return {
        ...e,
        c: m(e.c),
        rx: (quarter ? e.ry : e.rx) * k,
        ry: (quarter ? e.rx : e.ry) * k,
      };
    }
    case "leader":
      return {
        ...e,
        from: m(e.from),
        to: m(e.to),
        height: e.height * (opts.scale ?? 1),
      };
    case "hatch":
      return {
        ...e,
        points: e.points.map(m),
        // The shading follows the shape: scaling a region without scaling its
        // spacing turns a hatch into a solid or into an outline.
        spacing: e.spacing * (opts.scale ?? 1),
        angle: e.angle + (opts.angleDelta ?? 0),
      };
  }
}

export function rotateAbout(base: Point, degrees: number): (p: Point) => Point {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return (p) => {
    const dx = p.x - base.x;
    const dy = p.y - base.y;
    return { x: base.x + dx * cos - dy * sin, y: base.y + dx * sin + dy * cos };
  };
}

export function mirrorAbout(base: Point, axis: "x" | "y"): (p: Point) => Point {
  return (p) =>
    axis === "x" ? { x: base.x - (p.x - base.x), y: p.y } : { x: p.x, y: base.y - (p.y - base.y) };
}

export function scaleAbout(base: Point, factor: number): (p: Point) => Point {
  return (p) => ({
    x: base.x + (p.x - base.x) * factor,
    y: base.y + (p.y - base.y) * factor,
  });
}

/** The centre of a set of entities, which is the natural base point. */
export function centreOf(entities: Entity[]): Point {
  if (entities.length === 0) return { x: 0, y: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const e of entities) {
    const b = entityBounds(e);
    minX = Math.min(minX, b.min.x);
    minY = Math.min(minY, b.min.y);
    maxX = Math.max(maxX, b.max.x);
    maxY = Math.max(maxY, b.max.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
