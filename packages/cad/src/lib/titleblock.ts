import { type Entity, type Point, newId } from "./types";

/**
 * Sheet borders and title blocks.
 *
 * A drawing without a title block is not a drawing, it is a sketch: nobody can
 * tell which project it belongs to, which revision they are holding, or who to
 * argue with about it. Every deliverable drawing on a real job carries one, and
 * the fields on it are the same fields the platform already holds against the
 * project, the client and the company profile.
 *
 * So it is generated rather than drawn. The engineer picks a sheet size and the
 * block arrives filled in, on its own layer, with the same project number that
 * is on the FDS and the same company name that is on the letterhead. Nothing is
 * typed twice, and nothing can disagree.
 *
 * Sizes are the ISO A series in landscape, which is what technical drawings use
 * everywhere outside North America. The 10 mm border and the 20 mm binding edge
 * on the left follow ISO 5457.
 */

export interface SheetSize {
  id: string;
  name: string;
  w: number;
  h: number;
}

export const SHEETS: SheetSize[] = [
  { id: "A4", name: "A4 landscape", w: 297, h: 210 },
  { id: "A3", name: "A3 landscape", w: 420, h: 297 },
  { id: "A2", name: "A2 landscape", w: 594, h: 420 },
  { id: "A1", name: "A1 landscape", w: 841, h: 594 },
  { id: "A0", name: "A0 landscape", w: 1189, h: 841 },
];

export function getSheet(id: string): SheetSize | undefined {
  return SHEETS.find((s) => s.id === id);
}

export interface TitleBlockFields {
  drawingTitle: string;
  projectName?: string;
  projectNumber?: string;
  client?: string;
  company?: string;
  drawnBy?: string;
  date?: string;
  drawingNumber?: string;
  revision?: string;
  scale?: string;
}

export const BORDER_LAYER = "SHEET";

const L = (a: Point, b: Point): Entity => ({
  id: newId("tb"),
  type: "line",
  layer: BORDER_LAYER,
  a,
  b,
});

const T = (at: Point, text: string, height: number): Entity => ({
  id: newId("tb"),
  type: "text",
  layer: BORDER_LAYER,
  at,
  text,
  height,
});

/**
 * The sheet frame and its title block, placed with its bottom left at 0,0.
 *
 * The block sits in the bottom right corner, which is where a drawing is read
 * from when it is folded to A4 in a document pack.
 */
export function buildTitleBlock(sheet: SheetSize, f: TitleBlockFields): Entity[] {
  const out: Entity[] = [];

  // Trimmed sheet edge.
  out.push(
    {
      id: newId("tb"),
      type: "rect",
      layer: BORDER_LAYER,
      a: { x: 0, y: 0 },
      b: { x: sheet.w, y: sheet.h },
    },
    // Drawing frame: 20 mm binding edge on the left, 10 mm elsewhere.
    {
      id: newId("tb"),
      type: "rect",
      layer: BORDER_LAYER,
      a: { x: 20, y: 10 },
      b: { x: sheet.w - 10, y: sheet.h - 10 },
    },
  );

  // Title block, 180 x 60, bottom right inside the frame.
  const bw = 180;
  const bh = 60;
  const x0 = sheet.w - 10 - bw;
  const y0 = 10;

  out.push({
    id: newId("tb"),
    type: "rect",
    layer: BORDER_LAYER,
    a: { x: x0, y: y0 },
    b: { x: x0 + bw, y: y0 + bh },
  });

  // Rows, from the bottom up.
  const rows = [12, 24, 36, 48];
  for (const r of rows) out.push(L({ x: x0, y: y0 + r }, { x: x0 + bw, y: y0 + r }));

  // The bottom two rows are split into the four small fields.
  const col = [60, 110, 145];
  for (const c of col) out.push(L({ x: x0 + c, y: y0 }, { x: x0 + c, y: y0 + 24 }));

  const label = (at: Point, text: string) => out.push(T(at, text, 2));
  const value = (at: Point, text: string, h = 3.2) => out.push(T(at, text, h));

  // Top band: the company, which is the loudest thing on a drawing sheet.
  value({ x: x0 + 4, y: y0 + 51 }, f.company ?? "", 5);

  // Then the project, then this drawing's own title.
  label({ x: x0 + 4, y: y0 + 44.5 }, "PROJECT");
  value({ x: x0 + 30, y: y0 + 44 }, truncate(f.projectName ?? "", 44));

  label({ x: x0 + 4, y: y0 + 32.5 }, "TITLE");
  value({ x: x0 + 30, y: y0 + 32 }, truncate(f.drawingTitle, 44), 3.6);

  label({ x: x0 + 4, y: y0 + 26.5 }, "CLIENT");
  value({ x: x0 + 30, y: y0 + 26 }, truncate(f.client ?? "", 44));

  // Bottom band: the four fields a print is checked against.
  label({ x: x0 + 3, y: y0 + 18 }, "DRAWING No.");
  value({ x: x0 + 3, y: y0 + 4 }, truncate(f.drawingNumber ?? f.projectNumber ?? "", 16));

  label({ x: x0 + (col[0] as number) + 3, y: y0 + 18 }, "REV");
  value({ x: x0 + (col[0] as number) + 3, y: y0 + 4 }, f.revision ?? "0");

  label({ x: x0 + (col[1] as number) + 3, y: y0 + 18 }, "SCALE");
  value({ x: x0 + (col[1] as number) + 3, y: y0 + 4 }, f.scale ?? "1:1");

  label({ x: x0 + (col[2] as number) + 3, y: y0 + 18 }, "DATE");
  value({ x: x0 + (col[2] as number) + 3, y: y0 + 4 }, f.date ?? "");

  // Drawn by sits above the fold, next to the client.
  label({ x: x0 + 120, y: y0 + 26.5 }, "DRAWN");
  value({ x: x0 + 140, y: y0 + 26 }, truncate(f.drawnBy ?? "", 14));

  return out;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
