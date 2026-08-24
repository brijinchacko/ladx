import { describe, expect, it } from "vitest";
import { readDxf, writeDxf } from "./dxf";
import { type Drawing, emptyDrawing, newId } from "./types";

/**
 * DXF interchange.
 *
 * The test that matters is the round trip: what this editor writes, it must be
 * able to read back with the geometry unchanged. A conversion that loses a
 * millimetre is a drawing that no longer matches the panel.
 */

function drawingWith(entities: Drawing["entities"]): Drawing {
  return { ...emptyDrawing(), entities };
}

describe("writeDxf", () => {
  it("emits a well formed R12 file", () => {
    const dxf = writeDxf(emptyDrawing());
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("$ACADVER");
    expect(dxf).toContain("AC1009"); // R12
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("declares millimetres", () => {
    expect(writeDxf(emptyDrawing())).toContain("$INSUNITS");
  });
});

describe("round trip", () => {
  it("preserves a line exactly", () => {
    const d = drawingWith([
      { id: newId(), type: "line", layer: "PANEL", a: { x: 10, y: 20 }, b: { x: 90.5, y: 40.25 } },
    ]);
    const back = readDxf(writeDxf(d)).drawing;
    const line = back.entities[0];
    expect(line?.type).toBe("line");
    expect(line).toMatchObject({ layer: "PANEL", a: { x: 10, y: 20 }, b: { x: 90.5, y: 40.25 } });
  });

  it("preserves a circle", () => {
    const d = drawingWith([
      { id: newId(), type: "circle", layer: "0", c: { x: 5, y: -7 }, r: 12.5 },
    ]);
    const back = readDxf(writeDxf(d)).drawing;
    expect(back.entities[0]).toMatchObject({ type: "circle", c: { x: 5, y: -7 }, r: 12.5 });
  });

  it("preserves an arc with its angles", () => {
    const d = drawingWith([
      { id: newId(), type: "arc", layer: "0", c: { x: 0, y: 0 }, r: 10, start: 30, end: 210 },
    ]);
    const back = readDxf(writeDxf(d)).drawing;
    expect(back.entities[0]).toMatchObject({ type: "arc", r: 10, start: 30, end: 210 });
  });

  it("preserves a polyline and its closed flag", () => {
    const d = drawingWith([
      {
        id: newId(),
        type: "polyline",
        layer: "WIRING",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
        closed: true,
      },
    ]);
    const back = readDxf(writeDxf(d)).drawing;
    const p = back.entities[0] as { type: string; points: unknown[]; closed: boolean };
    expect(p.type).toBe("polyline");
    expect(p.points).toHaveLength(3);
    expect(p.closed).toBe(true);
  });

  it("writes a rectangle as a closed polyline, which is how CAD stores one", () => {
    const d = drawingWith([
      { id: newId(), type: "rect", layer: "0", a: { x: 0, y: 0 }, b: { x: 100, y: 50 } },
    ]);
    const dxf = writeDxf(d);
    expect(dxf).toContain("LWPOLYLINE");
    const back = readDxf(dxf).drawing;
    const p = back.entities[0] as { type: string; points: { x: number; y: number }[] };
    expect(p.type).toBe("polyline");
    expect(p.points).toHaveLength(4);
    // The four corners of the rectangle, in order.
    expect(p.points[2]).toEqual({ x: 100, y: 50 });
  });

  it("preserves text and its height", () => {
    const d = drawingWith([
      { id: newId(), type: "text", layer: "TEXT", at: { x: 3, y: 4 }, text: "CP-01", height: 3.5 },
    ]);
    const back = readDxf(writeDxf(d)).drawing;
    expect(back.entities[0]).toMatchObject({ type: "text", text: "CP-01", height: 3.5 });
  });

  it("keeps layers across the trip", () => {
    const d = emptyDrawing();
    const back = readDxf(writeDxf(d)).drawing;
    expect(back.layers.map((l) => l.name)).toEqual(
      expect.arrayContaining(["0", "PANEL", "WIRING"]),
    );
  });
});

describe("readDxf", () => {
  it("reads a minimal hand written file", () => {
    const dxf = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LINE",
      "8",
      "0",
      "10",
      "0",
      "20",
      "0",
      "11",
      "50",
      "21",
      "25",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const { drawing } = readDxf(dxf);
    expect(drawing.entities).toHaveLength(1);
    expect(drawing.entities[0]).toMatchObject({ b: { x: 50, y: 25 } });
  });

  it("reports entity types it cannot model rather than dropping them silently", () => {
    const dxf = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "SPLINE",
      "8",
      "0",
      "10",
      "0",
      "20",
      "0",
      "0",
      "ELLIPSE",
      "8",
      "0",
      "10",
      "0",
      "20",
      "0",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const { drawing, skipped } = readDxf(dxf);
    expect(drawing.entities).toHaveLength(0);
    expect(skipped.map((s) => s.type).sort()).toEqual(["ELLIPSE", "SPLINE"]);
  });

  it("invents a layer for entities that reference a missing one", () => {
    const dxf = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LINE",
      "8",
      "GHOST",
      "10",
      "0",
      "20",
      "0",
      "11",
      "1",
      "21",
      "1",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const { drawing } = readDxf(dxf);
    // Otherwise the entity would be invisible and unselectable.
    expect(drawing.layers.some((l) => l.name === "GHOST")).toBe(true);
  });

  it("strips MTEXT formatting codes", () => {
    const dxf = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "MTEXT",
      "8",
      "0",
      "10",
      "0",
      "20",
      "0",
      "40",
      "2.5",
      "1",
      "{\\fArial|b0;Panel CP-01}",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const { drawing } = readDxf(dxf);
    expect((drawing.entities[0] as { text: string }).text).toBe("Panel CP-01");
  });

  it("survives an empty file without throwing", () => {
    expect(() => readDxf("")).not.toThrow();
    expect(readDxf("").drawing.entities).toHaveLength(0);
  });
});
