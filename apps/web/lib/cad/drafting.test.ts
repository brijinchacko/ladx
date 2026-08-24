import { describe, expect, it } from "vitest";
import { readDxf, writeDxf } from "./dxf";
import { hitTestBox, translateEntity } from "./render";
import { findSnap } from "./snap";
import { SYMBOLS, getSymbol } from "./symbols";
import { SHEETS, buildTitleBlock, getSheet } from "./titleblock";
import { type Drawing, type Entity, dimensionGeometry, emptyDrawing } from "./types";

const layerVisible = () => true;

function drawingWith(entities: Entity[]): Drawing {
  return { ...emptyDrawing(), entities };
}

describe("dimensions", () => {
  const dim: Entity = {
    id: "d1",
    type: "dimension",
    layer: "DIMENSIONS",
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    offset: 20,
    height: 3.5,
  };

  it("measures its own geometry rather than carrying a typed number", () => {
    expect(dimensionGeometry(dim).text.value).toBe("100");
    // Move one end and the measurement follows. This is the whole reason a
    // dimension is an entity and not a line with a label next to it.
    const longer = { ...dim, b: { x: 250.5, y: 0 } } as Entity;
    expect(dimensionGeometry(longer as typeof dim).text.value).toBe("250.5");
  });

  it("stays correct when the whole drawing is moved", () => {
    const moved = translateEntity(dim, 500, -300) as typeof dim;
    expect(dimensionGeometry(moved).text.value).toBe("100");
  });

  it("exports to DXF as lines and text, which every package reads the same", () => {
    const dxf = writeDxf(drawingWith([dim]));
    // Witness lines, the dimension line, four arrow strokes.
    expect((dxf.match(/\nLINE\n/g) ?? []).length).toBe(7);
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("\n100\n");
    // No DIMENSION entity, deliberately: readers disagree about DIMSTYLE.
    expect(dxf).not.toContain("\nDIMENSION\n");
  });

  it("never writes text upside down", () => {
    const backwards = { ...dim, a: { x: 100, y: 0 }, b: { x: 0, y: 0 } } as typeof dim;
    const angle = dimensionGeometry(backwards).text.angle;
    expect(angle).toBeGreaterThanOrEqual(-90);
    expect(angle).toBeLessThanOrEqual(90);
  });
});

describe("object snap", () => {
  const line: Entity = {
    id: "l1",
    type: "line",
    layer: "0",
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
  };
  const circle: Entity = { id: "c1", type: "circle", layer: "0", c: { x: 200, y: 0 }, r: 25 };
  const d = drawingWith([line, circle]);

  it("prefers an endpoint to a midpoint when both are in range", () => {
    // Standing near the end of a short line, both are within tolerance. Picking
    // the nearer one would make the snap flicker as the pointer moves.
    const short = drawingWith([
      { id: "s", type: "line", layer: "0", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
    ]);
    const hit = findSnap(short, { x: 1, y: 1 }, 8, { layerVisible });
    expect(hit?.kind).toBe("endpoint");
    expect(hit?.point).toEqual({ x: 0, y: 0 });
  });

  it("finds midpoints, centres and quadrants", () => {
    expect(findSnap(d, { x: 50, y: 1 }, 5, { layerVisible })?.kind).toBe("midpoint");
    expect(findSnap(d, { x: 200, y: 1 }, 5, { layerVisible })?.kind).toBe("centre");
    expect(findSnap(d, { x: 225, y: 1 }, 5, { layerVisible })?.point).toEqual({ x: 225, y: 0 });
  });

  it("ignores what is being dragged, so a selection cannot pin itself", () => {
    expect(
      findSnap(d, { x: 0, y: 0 }, 5, { layerVisible, exclude: new Set(["l1"]) })?.kind,
    ).not.toBe("endpoint");
  });

  it("returns nothing when there is nothing near", () => {
    expect(findSnap(d, { x: 900, y: 900 }, 5, { layerVisible })).toBeNull();
  });
});

describe("marquee selection", () => {
  const inside: Entity = {
    id: "in",
    type: "rect",
    layer: "0",
    a: { x: 10, y: 10 },
    b: { x: 40, y: 40 },
  };
  const straddling: Entity = {
    id: "out",
    type: "line",
    layer: "0",
    a: { x: 30, y: 30 },
    b: { x: 500, y: 30 },
  };

  it("takes what is fully enclosed and leaves what merely passes through", () => {
    const ids = hitTestBox(
      drawingWith([inside, straddling]),
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      () => ({ visible: true, locked: false }),
    );
    expect(ids).toEqual(["in"]);
  });

  it("skips locked layers", () => {
    const ids = hitTestBox(drawingWith([inside]), { x: 0, y: 0 }, { x: 100, y: 100 }, () => ({
      visible: true,
      locked: true,
    }));
    expect(ids).toEqual([]);
  });
});

describe("the symbol library", () => {
  it("builds every symbol at the point it is asked for", () => {
    for (const s of SYMBOLS) {
      const parts = s.build({ x: 1000, y: 500 });
      expect(parts.length).toBeGreaterThan(0);
      // Nothing may land back at the origin: a symbol that ignores its
      // insertion point looks fine on an empty sheet and is unusable on a
      // busy one.
      const anywhereNearOrigin = parts.some((p) => {
        const pt = "a" in p ? p.a : "c" in p ? p.c : "at" in p ? p.at : p.points[0];
        return pt !== undefined && Math.abs(pt.x) < 100 && Math.abs(pt.y) < 100;
      });
      expect(anywhereNearOrigin, `${s.id} ignores its insertion point`).toBe(false);
    }
  });

  it("gives the NC contact the slash the NO contact does not have", () => {
    // The difference between these two symbols on a stop button is the most
    // consequential drawing error in this field.
    const no = getSymbol("contact-no")?.build({ x: 0, y: 0 }) ?? [];
    const nc = getSymbol("contact-nc")?.build({ x: 0, y: 0 }) ?? [];
    expect(nc.length).toBe(no.length + 1);
  });

  it("draws panel parts at their real millimetre sizes", () => {
    // A panel layout exists to find out that the parts do not fit.
    const mcb = getSymbol("mcb")?.build({ x: 0, y: 0 })?.[0];
    expect(mcb?.type).toBe("rect");
    if (mcb?.type === "rect") {
      expect(mcb.b.x - mcb.a.x).toBeCloseTo(17.5);
      expect(mcb.b.y - mcb.a.y).toBeCloseTo(80);
    }
  });
});

describe("DXF import reporting", () => {
  it("does not report layers as skipped geometry", () => {
    // The layer table is read into the drawing, so counting it as dropped told
    // the user six layers were lost on an import that kept all six.
    const dxf = writeDxf(
      drawingWith([
        { id: "l", type: "line", layer: "PANEL", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      ]),
    );
    const { drawing, skipped } = readDxf(dxf);
    expect(drawing.layers.length).toBeGreaterThan(0);
    expect(skipped.map((s) => s.type)).not.toContain("LAYER");
  });

  it("still reports geometry it genuinely cannot read", () => {
    const dxf = writeDxf(emptyDrawing()).replace(
      "\n0\nENDSEC\n0\nEOF",
      "\n0\nSPLINE\n8\n0\n0\nENDSEC\n0\nEOF",
    );
    expect(readDxf(dxf).skipped.map((s) => s.type)).toContain("SPLINE");
  });
});

describe("the title block", () => {
  it("carries the project's own details", () => {
    const sheet = getSheet("A3");
    expect(sheet).toBeDefined();
    const parts = buildTitleBlock(sheet as (typeof SHEETS)[number], {
      drawingTitle: "Panel general arrangement",
      projectName: "Line 4 filler upgrade",
      projectNumber: "LX-2601",
      client: "Northfield Beverages",
      company: "Wartens Controls",
      drawnBy: "J Chacko",
      date: "2026-08-24",
    });
    const text = parts
      .filter((p) => p.type === "text")
      .map((p) => (p.type === "text" ? p.text : ""));
    for (const expected of [
      "Wartens Controls",
      "Line 4 filler upgrade",
      "Panel general arrangement",
      "Northfield Beverages",
      "LX-2601",
      "2026-08-24",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("fits inside the sheet it was asked for", () => {
    for (const sheet of SHEETS) {
      const parts = buildTitleBlock(sheet, { drawingTitle: "x" });
      for (const p of parts) {
        const pts =
          p.type === "rect" || p.type === "line" ? [p.a, p.b] : p.type === "text" ? [p.at] : [];
        for (const pt of pts) {
          expect(pt.x).toBeGreaterThanOrEqual(0);
          expect(pt.x).toBeLessThanOrEqual(sheet.w);
          expect(pt.y).toBeGreaterThanOrEqual(0);
          expect(pt.y).toBeLessThanOrEqual(sheet.h);
        }
      }
    }
  });
});
