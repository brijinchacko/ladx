import { jsPDF } from "jspdf";
import { type Drawing, type Entity, type Point, dimensionGeometry, drawingBounds } from "./types";

/**
 * A drawing as PDF.
 *
 * DXF is for the next CAD package; PDF is for the people who have to read the
 * thing. A handover pack, an RFQ to a panel builder, a print taped to the
 * enclosure during wiring: all of those are PDF, and telling somebody to
 * install a CAD viewer first is not an answer.
 *
 * Drawn in real millimetres onto a real sheet, at a stated scale, because a
 * panel drawing printed at "whatever fitted" is worse than useless: somebody
 * will measure it. The scale that was used is written on the sheet.
 *
 * Vector output, not a canvas bitmap. Lines stay sharp at any zoom, the file
 * stays small, and the text stays selectable and searchable.
 */

export interface PdfOptions {
  title: string;
  /** Sheet in millimetres. Defaults to A3 landscape. */
  sheet?: { w: number; h: number };
  /** Margin in millimetres. */
  margin?: number;
  /** Fixed scale, e.g. 0.5 for 1:2. Omitted means fit the sheet. */
  scale?: number;
  footer?: string;
}

/** The nearest scale a draughtsman would actually write on a drawing. */
const PREFERRED = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];

function niceScale(fit: number): number {
  // Never round up past what fits, or the drawing runs off the sheet.
  for (const s of PREFERRED) if (s <= fit) return s;
  return fit;
}

function scaleLabel(s: number): string {
  if (s >= 1) return `${Math.round(s)}:1`;
  const denom = Math.round(1 / s);
  return `1:${denom}`;
}

export function drawingToPdf(drawing: Drawing, opts: PdfOptions): Blob {
  const sheet = opts.sheet ?? { w: 420, h: 297 };
  const margin = opts.margin ?? 12;
  const doc = new jsPDF({ unit: "mm", format: [sheet.w, sheet.h], orientation: "landscape" });

  const bounds = drawingBounds(drawing);
  const usableW = sheet.w - margin * 2;
  // A strip at the foot carries the scale and the title.
  const usableH = sheet.h - margin * 2 - 8;

  let scale = opts.scale ?? 1;
  let ox = 0;
  let oy = 0;

  if (bounds) {
    const dw = bounds.max.x - bounds.min.x || 1;
    const dh = bounds.max.y - bounds.min.y || 1;
    if (!opts.scale) scale = niceScale(Math.min(usableW / dw, usableH / dh));
    // Centre what is drawn on the usable area.
    ox = margin + (usableW - dw * scale) / 2 - bounds.min.x * scale;
    oy = margin + (usableH + dh * scale) / 2 + bounds.min.y * scale;
  } else {
    ox = margin;
    oy = sheet.h - margin;
  }

  // World millimetres to sheet millimetres, flipping Y once.
  const P = (p: Point): [number, number] => [ox + p.x * scale, oy - p.y * scale];

  const visible = new Set(drawing.layers.filter((l) => l.visible).map((l) => l.name));
  doc.setLineWidth(0.18);
  doc.setLineJoin("round");

  for (const e of drawing.entities) {
    // An entity on a layer that no longer exists is still drawn: losing
    // geometry silently because a layer was renamed is the worse failure.
    if (drawing.layers.some((l) => l.name === e.layer) && !visible.has(e.layer)) continue;
    const layer = drawing.layers.find((l) => l.name === e.layer);
    const [r, g, b] = hexToRgb(layer?.color ?? "0F1A24");
    doc.setDrawColor(r, g, b);
    doc.setTextColor(r, g, b);
    drawOne(doc, e, P, scale);
  }

  // Footer: what this is, and at what scale, which is the one thing a printed
  // drawing must never be missing.
  doc.setDrawColor(120, 130, 140);
  doc.setTextColor(90, 100, 110);
  doc.setFontSize(8);
  doc.setLineWidth(0.2);
  doc.line(margin, sheet.h - margin - 4, sheet.w - margin, sheet.h - margin - 4);
  doc.text(opts.title, margin, sheet.h - margin);
  doc.text(`Scale ${scaleLabel(scale)}  ·  millimetres`, sheet.w / 2, sheet.h - margin, {
    align: "center",
  });
  if (opts.footer) doc.text(opts.footer, sheet.w - margin, sheet.h - margin, { align: "right" });

  return doc.output("blob");
}

function drawOne(doc: jsPDF, e: Entity, P: (p: Point) => [number, number], scale: number): void {
  switch (e.type) {
    case "line": {
      const [x1, y1] = P(e.a);
      const [x2, y2] = P(e.b);
      doc.line(x1, y1, x2, y2);
      break;
    }
    case "rect": {
      const [x1, y1] = P(e.a);
      const [x2, y2] = P(e.b);
      doc.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      break;
    }
    case "circle": {
      const [cx, cy] = P(e.c);
      doc.circle(cx, cy, e.r * scale);
      break;
    }
    case "arc": {
      // jsPDF has no arc primitive, so it is flattened. One segment per two
      // degrees is well under what a printer or a screen can resolve.
      const span = (e.end - e.start + 360) % 360 || 360;
      const steps = Math.max(8, Math.ceil(span / 2));
      let prev: [number, number] | null = null;
      for (let i = 0; i <= steps; i++) {
        const a = ((e.start + (span * i) / steps) * Math.PI) / 180;
        const pt = P({ x: e.c.x + Math.cos(a) * e.r, y: e.c.y + Math.sin(a) * e.r });
        if (prev) doc.line(prev[0], prev[1], pt[0], pt[1]);
        prev = pt;
      }
      break;
    }
    case "polyline": {
      for (let i = 0; i < e.points.length - 1; i++) {
        const [x1, y1] = P(e.points[i] as Point);
        const [x2, y2] = P(e.points[i + 1] as Point);
        doc.line(x1, y1, x2, y2);
      }
      if (e.closed && e.points.length > 2) {
        const [x1, y1] = P(e.points[e.points.length - 1] as Point);
        const [x2, y2] = P(e.points[0] as Point);
        doc.line(x1, y1, x2, y2);
      }
      break;
    }
    case "text": {
      const [x, y] = P(e.at);
      // jsPDF sizes text in points; drawing units are millimetres.
      doc.setFontSize(e.height * scale * 2.834);
      doc.text(e.text, x, y);
      break;
    }
    case "dimension": {
      const g = dimensionGeometry(e);
      for (const [a, b] of [...g.witness, g.line, ...g.arrows]) {
        const [x1, y1] = P(a);
        const [x2, y2] = P(b);
        doc.line(x1, y1, x2, y2);
      }
      const [tx, ty] = P(g.text.at);
      doc.setFontSize(e.height * scale * 2.834);
      doc.text(g.text.value, tx, ty, { angle: g.text.angle });
      break;
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
