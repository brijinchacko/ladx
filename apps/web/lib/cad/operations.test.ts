import { describe, expect, it } from "vitest";
import {
  arrayPolar,
  arrayRectangular,
  constrainAngle,
  extendLine,
  filletLines,
  hatchLines,
  offsetEntity,
  trimLine,
} from "./operations";
import { rotateAbout, transformEntity, translateEntity } from "./render";
import type { Entity } from "./types";

const line = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  id = "l",
): Extract<Entity, { type: "line" }> => ({
  id,
  type: "line",
  layer: "0",
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

describe("offset", () => {
  it("goes to the side the pointer is on", () => {
    // Which side is the whole question. Signing the distance instead would make
    // the caller compute a normal it has no business knowing about, and getting
    // it backwards puts a rail on the wrong side of the plate edge.
    const horizontal = line(0, 0, 100, 0);

    const above = offsetEntity(horizontal, 10, { x: 50, y: 40 });
    expect(above?.type).toBe("line");
    if (above?.type === "line") {
      expect(above.a.y).toBeCloseTo(10);
      expect(above.b.y).toBeCloseTo(10);
    }

    const below = offsetEntity(horizontal, 10, { x: 50, y: -40 });
    if (below?.type === "line") {
      expect(below.a.y).toBeCloseTo(-10);
      expect(below.b.y).toBeCloseTo(-10);
    }
  });

  it("keeps the offset line parallel and the same length", () => {
    const diagonal = line(0, 0, 30, 40);
    const off = offsetEntity(diagonal, 5, { x: -20, y: 20 });
    if (off?.type !== "line") throw new Error("not a line");
    expect(Math.hypot(off.b.x - off.a.x, off.b.y - off.a.y)).toBeCloseTo(50);
    // Perpendicular distance from the original is exactly the offset.
    const d = Math.abs((40 * off.a.x - 30 * off.a.y) / 50);
    expect(d).toBeCloseTo(5);
  });

  it("grows a circle outwards and shrinks it inwards", () => {
    const circle: Entity = { id: "c", type: "circle", layer: "0", c: { x: 0, y: 0 }, r: 20 };
    expect((offsetEntity(circle, 5, { x: 100, y: 0 }) as { r: number }).r).toBe(25);
    expect((offsetEntity(circle, 5, { x: 1, y: 0 }) as { r: number }).r).toBe(15);
  });

  it("refuses an offset that would collapse the shape", () => {
    const circle: Entity = { id: "c", type: "circle", layer: "0", c: { x: 0, y: 0 }, r: 4 };
    expect(offsetEntity(circle, 10, { x: 0, y: 0 })).toBeNull();
  });

  it("gives back a new entity rather than mutating the original", () => {
    const original = line(0, 0, 100, 0);
    const off = offsetEntity(original, 10, { x: 50, y: 40 });
    expect(off?.id).not.toBe(original.id);
    expect(original.a.y).toBe(0);
  });
});

describe("fillet", () => {
  it("closes a corner when the radius is zero", () => {
    /*
     * Radius zero is not a no-op. It is the other half of what fillet is for:
     * trimming or extending two lines until they actually meet. A corner left
     * 0.3 mm open looks closed and breaks every downstream operation that
     * needs a closed region.
     */
    const a = line(0, 0, 40, 0, "a");
    const b = line(50, 10, 50, 60, "b");
    const r = filletLines(a, b, 0);
    if (!r) throw new Error("no fillet");

    expect(r.arc).toBeNull();
    const [l1, l2] = r.lines;
    if (l1.type !== "line" || l2.type !== "line") throw new Error("wrong type");
    // Both now end at the intersection, 50,0.
    expect(l1.b).toEqual({ x: 50, y: 0 });
    expect(l2.b).toEqual({ x: 50, y: 0 });
  });

  it("rounds a right angle and leaves the arc tangent to both legs", () => {
    const a = line(0, 0, 100, 0, "a");
    const b = line(100, 0, 100, 100, "b");
    const r = filletLines(a, b, 10);
    if (!r?.arc || r.arc.type !== "arc") throw new Error("no arc");

    // For a right angle the centre sits one radius in from each leg.
    expect(r.arc.c.x).toBeCloseTo(90);
    expect(r.arc.c.y).toBeCloseTo(10);
    expect(r.arc.r).toBe(10);

    const [l1, l2] = r.lines;
    if (l1.type !== "line" || l2.type !== "line") throw new Error("wrong type");
    // Each line stops exactly at its tangent point.
    expect(l1.b.x).toBeCloseTo(90);
    expect(l2.b.y).toBeCloseTo(10);
  });

  it("takes the minor arc, which is what a fillet always means", () => {
    const r = filletLines(line(0, 0, 100, 0, "a"), line(100, 0, 100, 100, "b"), 10);
    if (!r?.arc || r.arc.type !== "arc") throw new Error("no arc");
    const sweep = (((r.arc.end - r.arc.start) % 360) + 360) % 360;
    expect(sweep).toBeLessThanOrEqual(180);
  });

  it("refuses parallel lines and a radius that will not fit", () => {
    expect(filletLines(line(0, 0, 100, 0, "a"), line(0, 20, 100, 20, "b"), 5)).toBeNull();
    // Legs are 10 long; a 50 radius cannot sit in that corner.
    expect(filletLines(line(0, 0, 10, 0, "a"), line(10, 0, 10, 10, "b"), 50)).toBeNull();
  });

  it("works whichever direction the lines were drawn in", () => {
    // The end nearer the corner is the one that moves, so a line drawn
    // backwards must give the same corner.
    const forward = filletLines(line(0, 0, 100, 0, "a"), line(100, 0, 100, 100, "b"), 10);
    const backward = filletLines(line(100, 0, 0, 0, "a"), line(100, 100, 100, 0, "b"), 10);
    if (!forward?.arc || !backward?.arc) throw new Error("no arc");
    if (forward.arc.type !== "arc" || backward.arc.type !== "arc") throw new Error("wrong type");
    expect(backward.arc.c.x).toBeCloseTo(forward.arc.c.x);
    expect(backward.arc.c.y).toBeCloseTo(forward.arc.c.y);
  });
});

describe("array", () => {
  it("lays terminals along a rail without duplicating the original", () => {
    // The single most useful command on a panel drawing: forty terminals at
    // 6 mm pitch is one operation, not an afternoon.
    const terminal: Entity = {
      id: "t",
      type: "rect",
      layer: "PANEL",
      a: { x: 0, y: 0 },
      b: { x: 6, y: 50 },
    };
    const copies = arrayRectangular([terminal], 40, 1, 6, 0, translateEntity);

    // Thirty-nine, because index zero is the original and is left alone.
    expect(copies).toHaveLength(39);
    expect(new Set(copies.map((c) => c.id)).size).toBe(39);
    const last = copies[copies.length - 1];
    if (last?.type !== "rect") throw new Error("wrong type");
    expect(last.a.x).toBe(39 * 6);
  });

  it("fills rows and columns", () => {
    const dot: Entity = { id: "p", type: "point", layer: "0", at: { x: 0, y: 0 } };
    expect(arrayRectangular([dot], 3, 4, 10, 20, translateEntity)).toHaveLength(11);
  });

  it("spaces a full circle by count, not by count minus one", () => {
    // Six holes round a flange are 60 degrees apart. Dividing 360 by five
    // would put the last one on top of the first.
    const hole: Entity = { id: "h", type: "circle", layer: "PANEL", c: { x: 0, y: 100 }, r: 5 };
    const copies = arrayPolar([hole], { x: 0, y: 0 }, 6, 360, false, transformEntity, rotateAbout);
    expect(copies).toHaveLength(5);
    const first = copies[0];
    if (first?.type !== "circle") throw new Error("wrong type");
    // 60 degrees round from 0,100.
    expect(first.c.x).toBeCloseTo(-100 * Math.sin(Math.PI / 3));
    expect(first.c.y).toBeCloseTo(100 * Math.cos(Math.PI / 3));
  });

  it("spreads a partial sweep across the ends", () => {
    const hole: Entity = { id: "h", type: "circle", layer: "0", c: { x: 100, y: 0 }, r: 2 };
    const copies = arrayPolar([hole], { x: 0, y: 0 }, 3, 90, false, transformEntity, rotateAbout);
    expect(copies).toHaveLength(2);
    const last = copies[copies.length - 1];
    if (last?.type !== "circle") throw new Error("wrong type");
    // The last one lands exactly on 90 degrees, not short of it.
    expect(last.c.x).toBeCloseTo(0);
    expect(last.c.y).toBeCloseTo(100);
  });
});

describe("ortho", () => {
  it("snaps a nearly horizontal drag to exactly horizontal", () => {
    // Without this every horizontal line is a fraction of a degree off, which
    // looks fine and produces a DXF full of geometry that does not close.
    const p = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 3 }, 90);
    expect(p.y).toBeCloseTo(0);
    expect(p.x).toBeCloseTo(Math.hypot(100, 3));
  });

  it("keeps the distance the pointer travelled", () => {
    const from = { x: 10, y: 10 };
    const to = { x: 60, y: 55 };
    const p = constrainAngle(from, to, 45);
    expect(Math.hypot(p.x - from.x, p.y - from.y)).toBeCloseTo(
      Math.hypot(to.x - from.x, to.y - from.y),
    );
  });

  it("honours a finer increment", () => {
    // 100,20 is 11.3 degrees, so a 15 degree step lands it on 15. Comparing
    // with a modulo would fail on floating point: 14.999... % 15 is 14.999...,
    // not zero, which says nothing about whether the snap worked.
    const p = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 20 }, 15);
    const angle = (Math.atan2(p.y, p.x) * 180) / Math.PI;
    expect(angle).toBeCloseTo(15, 6);

    // And a drag past the halfway point rounds to the next step up.
    const q = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 45 }, 15);
    expect((Math.atan2(q.y, q.x) * 180) / Math.PI).toBeCloseTo(30, 6);
  });

  it("leaves a zero length drag alone", () => {
    const p = constrainAngle({ x: 5, y: 5 }, { x: 5, y: 5 }, 90);
    expect(p).toEqual({ x: 5, y: 5 });
  });
});

describe("trim", () => {
  // A horizontal line crossed by two verticals, which is the shape every trim
  // on a real drawing is: lines drawn long and cleaned at the intersections.
  const target = line(0, 0, 100, 0, "t");
  const left = line(20, -20, 20, 20, "L");
  const right = line(80, -20, 80, 20, "R");

  it("removes the stub before the first crossing", () => {
    const r = trimLine(target, [left, right], { x: 5, y: 0 });
    if (r?.type !== "line") throw new Error("no trim");
    expect(r.a.x).toBeCloseTo(20);
    expect(r.b.x).toBeCloseTo(100);
  });

  it("removes the stub after the last crossing", () => {
    const r = trimLine(target, [left, right], { x: 95, y: 0 });
    if (r?.type !== "line") throw new Error("no trim");
    expect(r.a.x).toBeCloseTo(0);
    expect(r.b.x).toBeCloseTo(80);
  });

  it("keeps the longer remainder when the pick is between two crossings", () => {
    // Removing the middle would split one line into two. One entity in, one
    // out, and the longer piece is the one worth keeping.
    const r = trimLine(target, [left, right], { x: 50, y: 0 });
    if (r?.type !== "line") throw new Error("no trim");
    const length = Math.abs(r.b.x - r.a.x);
    expect(length).toBeGreaterThanOrEqual(20);
  });

  it("does nothing when nothing crosses it", () => {
    expect(trimLine(target, [line(200, -20, 200, 20, "far")], { x: 50, y: 0 })).toBeNull();
  });

  it("trims against a rectangle's edges, not just against lines", () => {
    const box: Entity = {
      id: "b",
      type: "rect",
      layer: "0",
      a: { x: 40, y: -10 },
      b: { x: 60, y: 10 },
    };
    const r = trimLine(target, [box], { x: 5, y: 0 });
    if (r?.type !== "line") throw new Error("no trim");
    expect(r.a.x).toBeCloseTo(40);
  });

  it("never trims a line against itself", () => {
    expect(trimLine(target, [target], { x: 50, y: 0 })).toBeNull();
  });
});

describe("extend", () => {
  const short = line(0, 0, 50, 0, "s");
  const wall = line(100, -30, 100, 30, "w");

  it("stretches the end nearer the pick until it meets the boundary", () => {
    const r = extendLine(short, [wall], { x: 48, y: 0 });
    if (r?.type !== "line") throw new Error("no extend");
    expect(r.b.x).toBeCloseTo(100);
    expect(r.a.x).toBeCloseTo(0);
  });

  it("stretches the other end when that is the one picked", () => {
    const behind = line(-100, -30, -100, 30, "b");
    const r = extendLine(short, [behind], { x: 2, y: 0 });
    if (r?.type !== "line") throw new Error("no extend");
    expect(r.a.x).toBeCloseTo(-100);
    expect(r.b.x).toBeCloseTo(50);
  });

  it("takes the nearest boundary, not the first one found", () => {
    const far = line(300, -30, 300, 30, "f");
    const r = extendLine(short, [far, wall], { x: 48, y: 0 });
    if (r?.type !== "line") throw new Error("no extend");
    expect(r.b.x).toBeCloseTo(100);
  });

  it("refuses to extend backwards through its own body", () => {
    // A boundary crossing the line itself is trim's job, not extend's.
    const crossing = line(25, -30, 25, 30, "c");
    expect(extendLine(short, [crossing], { x: 48, y: 0 })).toBeNull();
  });
});

describe("hatch", () => {
  const square: { x: number; y: number }[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it("fills a square with lines that stay inside it", () => {
    const lines = hatchLines(square, 10, 0);
    expect(lines.length).toBeGreaterThan(5);
    for (const [a, b] of lines) {
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(-0.001);
        expect(p.x).toBeLessThanOrEqual(100.001);
        expect(p.y).toBeGreaterThanOrEqual(-0.001);
        expect(p.y).toBeLessThanOrEqual(100.001);
      }
    }
  });

  it("shades at the angle asked for", () => {
    for (const asked of [0, 45, 90, 135]) {
      const lines = hatchLines(square, 20, asked);
      expect(lines.length, `no shading at ${asked} degrees`).toBeGreaterThan(0);
      for (const [a, b] of lines) {
        const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        expect(((deg % 180) + 180) % 180).toBeCloseTo(((asked % 180) + 180) % 180, 1);
      }
    }
  });

  it("emits no zero length spans", () => {
    // A scanline clipping a corner produces one, and it becomes a stray dot on
    // the print and a degenerate line in the DXF.
    for (const angle of [0, 30, 45, 60, 90]) {
      for (const [a, b] of hatchLines(square, 7, angle)) {
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(1e-6);
      }
    }
  });

  it("leaves a hole unshaded", () => {
    // Even-odd is what makes a cutout come out as a cutout rather than being
    // shaded straight over.
    const withHole = [
      ...square,
      { x: 0, y: 0 },
      // A square hole, traced back into the outline.
      { x: 30, y: 30 },
      { x: 30, y: 70 },
      { x: 70, y: 70 },
      { x: 70, y: 30 },
      { x: 30, y: 30 },
    ];
    const lines = hatchLines(withHole, 5, 0);
    // No shading line may run straight across the middle of the hole.
    const throughHole = lines.filter(
      ([a, b]) => a.y > 35 && a.y < 65 && Math.min(a.x, b.x) < 35 && Math.max(a.x, b.x) > 65,
    );
    expect(throughHole).toHaveLength(0);
  });

  it("refuses a spacing that would produce millions of lines", () => {
    expect(hatchLines(square, 0.0001, 0)).toHaveLength(0);
    expect(hatchLines(square, 0, 0)).toHaveLength(0);
    expect(hatchLines([{ x: 0, y: 0 }], 10, 0)).toHaveLength(0);
  });
});
