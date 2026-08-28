import { describe, expect, it } from "vitest";
import {
  DRAWING_TEMPLATES,
  TEMPLATE_SECTIONS,
  buildDrawingFromTemplate,
  isPaperSpace,
} from "./drawing-templates";
import { writeDxf } from "./dxf";
import { drawingToPdf } from "./pdf";
import { getSheet } from "./titleblock";
import { type Drawing, type Point, emptyDrawing, entityBounds } from "./types";

const FIELDS = {
  drawingTitle: "",
  projectName: "Line 4 filler upgrade",
  projectNumber: "LX-2601",
  client: "Northfield Beverages",
  company: "Wartens Controls",
  drawnBy: "J Chacko",
  date: "2026-08-24",
};

function asDrawing(id: string): Drawing {
  const template = DRAWING_TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`no template ${id}`);
  const entities = buildDrawingFromTemplate(template, FIELDS);
  const layers = [...new Set(entities.map((e) => e.layer))].map((name) => ({
    name,
    color: "0F1A24",
    visible: true,
    locked: false,
  }));
  return { ...emptyDrawing(), layers, entities };
}

describe("the drawing set", () => {
  it("is numbered the way a control panel package is read", () => {
    // The numbering is not decoration. A technician holding a print looks for
    // the circuit by sheet number, and the blocks are conventional: front
    // matter, power, control, safety, layouts, schedules.
    const numbers = DRAWING_TEMPLATES.map((t) => Number(t.sheet));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

    const bySheet = (n: number) => DRAWING_TEMPLATES.find((t) => Number(t.sheet) === n);
    expect(bySheet(0)?.section).toBe("Front matter");
    expect(bySheet(10)?.section).toBe("Power");
    expect(bySheet(50)?.section).toBe("Control and I/O");
    expect(bySheet(70)?.section).toBe("Safety");
    expect(bySheet(300)?.section).toBe("Layout");
    expect(bySheet(600)?.section).toBe("Schedules");
  });

  it("has every template in a section the picker shows", () => {
    for (const t of DRAWING_TEMPLATES) {
      expect(TEMPLATE_SECTIONS).toContain(t.section);
      expect(getSheet(t.sheetSize), `${t.id} names an unknown sheet size`).toBeDefined();
    }
  });

  it("draws something on every sheet, not a frame and a title", () => {
    for (const t of DRAWING_TEMPLATES) {
      const entities = buildDrawingFromTemplate(t, FIELDS);
      // A title block alone is about 40 entities. A sheet that is only a title
      // block is a frame pretending to be a drawing.
      expect(entities.length, `${t.id} is nearly empty`).toBeGreaterThan(55);
    }
  });

  it("keeps every composed sheet inside its own paper", () => {
    for (const t of DRAWING_TEMPLATES.filter(isPaperSpace)) {
      const sheet = getSheet(t.sheetSize);
      if (!sheet) throw new Error(`no sheet for ${t.id}`);
      const entities = buildDrawingFromTemplate(t, FIELDS);
      for (const e of entities) {
        const b = entityBounds(e);
        const inside = (p: Point) =>
          p.x >= -1 && p.y >= -1 && p.x <= sheet.w + 1 && p.y <= sheet.h + 1;
        expect(inside(b.min) && inside(b.max), `${t.id} draws off the ${t.sheetSize} sheet`).toBe(
          true,
        );
      }
    }
  });

  it("draws the panel layout at full size rather than shrunk to fit", () => {
    // The whole value of a panel layout is that it measures true. A 1200 mm
    // back plate squeezed onto A2 tells you nothing about whether the parts
    // fit, which is the only question it exists to answer.
    const ga = DRAWING_TEMPLATES.find((t) => t.id === "panel-ga");
    if (!ga) throw new Error("no panel-ga");
    expect(isPaperSpace(ga)).toBe(false);

    const plate = buildDrawingFromTemplate(ga, FIELDS).find(
      (e) => e.type === "rect" && e.layer === "PANEL",
    );
    expect(plate?.type).toBe("rect");
    if (plate?.type === "rect") {
      expect(Math.abs(plate.b.x - plate.a.x)).toBe(1200);
      expect(Math.abs(plate.b.y - plate.a.y)).toBe(800);
    }
  });

  it("carries the project on every sheet's title block", () => {
    for (const t of DRAWING_TEMPLATES.filter(isPaperSpace)) {
      const text = buildDrawingFromTemplate(t, FIELDS)
        .filter((e) => e.type === "text")
        .map((e) => (e.type === "text" ? e.text : ""));
      expect(text, `${t.id} lost the project`).toContain("Line 4 filler upgrade");
      expect(text, `${t.id} lost the company`).toContain("Wartens Controls");
      // The sheet number goes in the drawing number field, so a print can be
      // matched back to the index.
      expect(text, `${t.id} lost its sheet number`).toContain(t.sheet);
    }
  });

  it("puts the conventions on the cover sheet", () => {
    // The sheet whose absence is the documented cause of field errors: a
    // technician who cannot tell what blue means is guessing at 400 volts.
    const text = asDrawing("cover")
      .entities.filter((e) => e.type === "text")
      .map((e) => (e.type === "text" ? e.text : ""))
      .join(" | ");
    expect(text).toContain("WIRE COLOURS");
    expect(text).toContain("WIRE NUMBERING");
    expect(text).toContain("GREEN/YELLOW");
    expect(text).toContain("Protective earth");
  });

  it("draws the safety circuit with both channels and the feedback loop", () => {
    // A single channel E-stop drawn on a sheet claiming category 3 is the
    // error this template exists to stop somebody making.
    const text = asDrawing("safety")
      .entities.filter((e) => e.type === "text")
      .map((e) => (e.type === "text" ? e.text : ""))
      .join(" | ");
    expect(text).toContain("E-STOP  ch1");
    expect(text).toContain("E-STOP  ch2");
    expect(text).toContain("feedback");
    expect(text).toMatch(/PLd cat 3/);
  });

  it("exports every sheet to DXF and PDF", () => {
    for (const t of DRAWING_TEMPLATES) {
      const drawing = asDrawing(t.id);
      const dxf = writeDxf(drawing);
      expect(dxf.trimEnd().endsWith("EOF"), `${t.id} produced a broken DXF`).toBe(true);
      const pdf = drawingToPdf(drawing, { title: t.name });
      expect(pdf.size, `${t.id} produced an empty PDF`).toBeGreaterThan(1000);
    }
  });
});
