import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { type Branding, LADX_BRANDING } from "./branding";
import { type LadderNode, everyElement, rungLogic } from "./tree";
import {
  type Element,
  INSTRUCTION_BY_TYPE,
  type LadxProgram,
  type Rung,
  programRoutines,
} from "./types";

/**
 * A LADX project as a document somebody can hand in.
 *
 * Students are asked for their work on paper — for an assessment, a portfolio,
 * an interview — and a screenshot of a browser tab is not that. This is the
 * program as a drawing office would issue it: a cover sheet that says whose
 * work it is, the I/O schedule, then the ladder network by network.
 *
 * Drawn with jsPDF vector primitives rather than rasterised from the DOM. A
 * screenshot of the editor would carry its selection outlines, its scroll
 * position and its screen colours onto paper at whatever the device pixel
 * ratio happened to be; lines drawn here stay sharp at any zoom and print
 * black on white.
 */

export type ProjectPdfInput = {
  /** Whose name goes on the cover. Defaults to LADX. */
  branding?: Branding;
  projectName: string;
  program: LadxProgram;
  student: {
    name: string;
    email: string;
    studentCode?: string | null;
    admissionNumber?: string | null;
    course?: string | null;
    batch?: string | null;
  };
  /** Set when the project answers a trainer's exercise. */
  exerciseTitle?: string | null;
  generatedAt?: Date;
};

const INK = 40;
const MUTED = 110;
const RULE = 200;

function loadPng(relPath: string): string | null {
  try {
    const file = path.join(process.cwd(), relPath);
    if (!fs.existsSync(file)) return null;
    return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  } catch {
    // A missing logo must never stop somebody exporting their work.
    return null;
  }
}

/** Generated-at stamp, in the locale and zone of whoever exported it. */
const stampedAt = (d: Date) =>
  d.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

export function buildProjectPdf(input: ProjectPdfInput): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  const when = input.generatedAt ?? new Date();
  const brand = input.branding ?? LADX_BRANDING;

  /* ── Cover ──────────────────────────────────────────────────────── */

  const logo = brand.logoPath ? loadPng(brand.logoPath) : null;
  if (logo) {
    const w = 54;
    doc.addImage(logo, "PNG", M, M, w, w / brand.logoAspect, undefined, "FAST");
  } else {
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(INK);
    doc.text(brand.tradingName, M, M + 8);
  }

  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(MUTED);
  doc.text(brand.strapline.toUpperCase(), M, M + 26);

  // A rule and a lot of air: the cover's job is to say whose work this is.
  doc.setDrawColor(RULE).setLineWidth(0.4);
  doc.line(M, M + 32, W - M, M + 32);

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MUTED);
  doc.text("LADDER LOGIC PROJECT", M, M + 52);

  doc.setFont("helvetica", "bold").setFontSize(26).setTextColor(INK);
  const title = doc.splitTextToSize(input.projectName || "Untitled", W - M * 2);
  doc.text(title, M, M + 64);

  let y = M + 64 + title.length * 11 + 6;

  if (input.exerciseTitle) {
    doc.setFont("helvetica", "italic").setFontSize(11).setTextColor(MUTED);
    doc.text(`Exercise: ${input.exerciseTitle}`, M, y);
    y += 10;
  }

  // Who made it. The reason the cover exists.
  y = Math.max(y, H - 105);
  doc.setDrawColor(RULE);
  doc.line(M, y, W - M, y);
  y += 10;

  const rows: [string, string][] = [
    ["Prepared by", input.student.name],
    ["Email", input.student.email],
    ...(input.student.studentCode
      ? ([["Student ID", input.student.studentCode]] as [string, string][])
      : []),
    ...(input.student.admissionNumber
      ? ([["Admission no.", input.student.admissionNumber]] as [string, string][])
      : []),
    ...(input.student.course ? ([["Programme", input.student.course]] as [string, string][]) : []),
    ...(input.student.batch ? ([["Batch", input.student.batch]] as [string, string][]) : []),
    ["Issued", stampedAt(when)],
  ];

  for (const [k, v] of rows) {
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(MUTED);
    doc.text(k.toUpperCase(), M, y);
    doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(INK);
    doc.text(String(v), M + 42, y);
    y += 7.5;
  }

  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(MUTED);
  doc.text(`${brand.legalName} · ${brand.addressLines.join(", ")} · ${brand.website}`, M, H - 14);

  /* ── I/O schedule ───────────────────────────────────────────────── */

  doc.addPage();
  y = pageHeader(doc, W, M, "I/O schedule", input.projectName);

  const tags = [...input.program.tags].sort((a, b) => {
    // Inputs, then outputs, then the rest — the order an I/O list is read in.
    const rank = (t: typeof a) => (t.isInput ? 0 : t.isOutput ? 1 : 2);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  const cols = [M, M + 42, M + 68, M + 96, M + 126];
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(MUTED);
  ["TAG", "TYPE", "DIRECTION", "DEVICE", "COMMENT"].forEach((h, i) => doc.text(h, cols[i], y));
  y += 3;
  doc.setDrawColor(RULE).line(M, y, W - M, y);
  y += 6;

  doc.setFontSize(9.5);
  for (const t of tags) {
    if (y > H - 22) {
      doc.addPage();
      y = pageHeader(doc, W, M, "I/O schedule (continued)", input.projectName);
    }
    doc.setFont("helvetica", "bold").setTextColor(INK);
    doc.text(t.name, cols[0], y);
    doc.setFont("helvetica", "normal").setTextColor(MUTED);
    doc.text(t.type, cols[1], y);
    doc.text(t.isInput ? "Input" : t.isOutput ? "Output" : "Internal", cols[2], y);
    doc.text(t.device ? String(t.device).replace(/_/g, " ").toLowerCase() : "—", cols[3], y);
    const comment = doc.splitTextToSize(t.comment ?? "", W - M - cols[4]);
    doc.text(comment.length ? comment[0] : "—", cols[4], y);
    y += 6.5;
  }

  if (tags.length === 0) {
    doc.setFont("helvetica", "italic").setTextColor(MUTED);
    doc.text("No tags declared.", M, y);
  }

  /* ── The program ────────────────────────────────────────────────── */

  for (const routine of programRoutines(input.program)) {
    doc.addPage();
    y = pageHeader(doc, W, M, routine.name, input.projectName);

    if (routine.rungs.length === 0) {
      doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(MUTED);
      doc.text("This routine has no networks.", M, y);
      continue;
    }

    routine.rungs.forEach((rung, i) => {
      const needed = rungHeight(rung) + 16;
      if (y + needed > H - 18) {
        doc.addPage();
        y = pageHeader(doc, W, M, `${routine.name} (continued)`, input.projectName);
      }
      y = drawRung(doc, rung, i, M, y, W - M * 2);
      y += 8;
    });
  }

  /* ── Page numbers, once every page exists ───────────────────────── */

  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(MUTED);
    doc.text(`${p - 1} / ${pages - 1}`, W - M, H - 10, { align: "right" });
    doc.text(brand.tradingName, M, H - 10);
  }

  return Buffer.from(doc.output("arraybuffer"));
}

function pageHeader(doc: jsPDF, W: number, M: number, heading: string, project: string): number {
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(INK);
  doc.text(heading, M, M);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(MUTED);
  doc.text(project, W - M, M, { align: "right" });
  doc.setDrawColor(RULE).setLineWidth(0.3);
  doc.line(M, M + 3, W - M, M + 3);
  return M + 14;
}

/* ------------------------------------------------------------------ *
 * Drawing a rung
 * ------------------------------------------------------------------ */

const CELL = 26; // mm per instruction
/*
 * A leg carries three things stacked: the tag above the symbol, the symbol,
 * and the instruction type below it. At 14mm the tag of the second leg landed
 * on the type caption of the first.
 */
const ROW = 19;

function legCount(n: LadderNode): number {
  if (n.kind === "el") return 1;
  if (n.kind === "series") return Math.max(1, ...n.children.map(legCount));
  return n.children.reduce((a, c) => a + legCount(c), 0);
}

function rungHeight(rung: Rung): number {
  const legs = legCount(rungLogic(rung));
  return Math.max(ROW, legs * ROW) + (rung.comment ? 6 : 0);
}

/** One network: title, comment, rails, contacts, coils. */
function drawRung(
  doc: jsPDF,
  rung: Rung,
  index: number,
  x: number,
  y: number,
  width: number,
): number {
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(MUTED);
  doc.text(`NETWORK ${index + 1}`, x, y);

  if (rung.comment) {
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(INK);
    const c = doc.splitTextToSize(rung.comment, width);
    doc.text(c[0], x + 26, y);
  }
  y += 5;

  const root = rungLogic(rung);
  const legs = legCount(root);
  const height = Math.max(ROW, legs * ROW);
  const top = y;
  const centre = top + ROW / 2;

  // Power rails
  doc.setDrawColor(INK).setLineWidth(0.6);
  doc.line(x, top, x, top + height);
  doc.line(x + width, top, x + width, top + height);

  // Condition side
  const rightOfLogic = drawNode(doc, root, x + 4, centre, CELL);

  // The run to the coils
  const coilX = x + width - 30;
  doc.setLineWidth(0.4);
  doc.line(rightOfLogic, centre, coilX, centre);

  // Outputs, stacked
  rung.outputs.forEach((o: Element, i: number) => {
    const cy = centre + i * ROW;
    if (i > 0) doc.line(coilX, centre, coilX, cy);
    drawCoil(doc, o, coilX, cy);
    doc.line(coilX + 12, cy, x + width, cy);
  });

  if (rung.outputs.length === 0) {
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(MUTED);
    doc.text("no output", coilX, centre - 2);
  }

  const used = Math.max(height, rung.outputs.length * ROW);
  return top + used;
}

/** Returns the x the drawing finished at. */
function drawNode(doc: jsPDF, node: LadderNode, x: number, y: number, cell: number): number {
  if (node.kind === "el") {
    drawContact(doc, node, x, y);
    return x + cell;
  }

  if (node.kind === "series") {
    let cx = x;
    for (const c of node.children) {
      const next = drawNode(doc, c, cx, y, cell);
      doc.setDrawColor(INK).setLineWidth(0.4);
      cx = next;
    }
    if (node.children.length === 0) {
      doc.line(x, y, x + cell, y);
      return x + cell;
    }
    return cx;
  }

  /*
   * A branch: each leg draws itself, then two verticals close it.
   *
   * The stub runs from where a leg's own drawing ended to the right vertical,
   * and only that far. Drawing a full-width line at each leg's height — which
   * is the obvious thing — paints straight through the gap between that leg's
   * own contact bars and fills in every contact on it.
   */
  let widest = x + cell;
  let ly = y;
  const legs: { top: number; end: number }[] = [];

  for (const leg of node.children) {
    const end = drawNode(doc, leg, x, ly, cell);
    legs.push({ top: ly, end });
    widest = Math.max(widest, end);
    ly += legCount(leg) * ROW;
  }

  doc.setDrawColor(INK).setLineWidth(0.5);
  const firstTop = legs[0].top;
  const lastTop = legs[legs.length - 1].top;
  doc.line(x, firstTop, x, lastTop);
  doc.line(widest, firstTop, widest, lastTop);

  doc.setLineWidth(0.4);
  for (const leg of legs) {
    if (leg.end < widest) doc.line(leg.end, leg.top, widest, leg.top);
  }
  return widest;
}

function drawContact(
  doc: jsPDF,
  node: { type: string; tag: string; preset?: number },
  x: number,
  y: number,
) {
  const meta = INSTRUCTION_BY_TYPE.get(node.type as never);
  const w = CELL;
  const gap = 4;
  const barX1 = x + w / 2 - gap / 2;
  const barX2 = x + w / 2 + gap / 2;

  doc.setDrawColor(INK).setLineWidth(0.4);
  doc.line(x, y, barX1, y);
  doc.line(barX2, y, x + w, y);
  doc.setLineWidth(0.6);
  doc.line(barX1, y - 3, barX1, y + 3);
  doc.line(barX2, y - 3, barX2, y + 3);

  // The NC slash, crossing both bars — the same drawing as on screen.
  if (node.type === "XIO") doc.line(barX1 - 1.5, y + 3.5, barX2 + 1.5, y - 3.5);

  if (meta && meta.side === "input" && node.type !== "XIC" && node.type !== "XIO") {
    doc.setFont("helvetica", "bold").setFontSize(6).setTextColor(INK);
    doc.text(node.type === "ONS" ? "P" : node.type, x + w / 2, y + 1, { align: "center" });
  }

  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(INK);
  doc.text(node.tag || "—", x + w / 2, y - 5, { align: "center" });
  doc.setFontSize(6).setTextColor(MUTED);
  doc.text(node.type, x + w / 2, y + 7, { align: "center" });
}

function drawCoil(doc: jsPDF, el: Element, x: number, y: number) {
  const meta = INSTRUCTION_BY_TYPE.get(el.type);
  doc.setDrawColor(INK).setLineWidth(0.4);

  if (meta && meta.group !== "Bit") {
    // A boxed instruction — timer, counter, maths.
    doc.rect(x, y - 5, 12, 10);
    doc.setFont("helvetica", "bold").setFontSize(6.5).setTextColor(INK);
    doc.text(el.type, x + 6, y + 1, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(INK);
    doc.text(el.tag || "—", x + 6, y - 7, { align: "center" });
    if (el.preset !== undefined) {
      doc.setFontSize(6).setTextColor(MUTED);
      doc.text(`PRE ${el.preset}`, x + 6, y + 8, { align: "center" });
    }
    return;
  }

  /*
   * A coil is two arcs facing each other — the ( ) every ladder drawing uses.
   *
   * These were straight segments, which drew two chevrons pointing at each
   * other and read as nothing in particular. Cubic beziers, bulging outward,
   * give the shape an engineer recognises without having to read the label.
   */
  doc.setLineWidth(0.6);
  doc.line(x, y, x + 3.5, y);
  doc.line(x + 8.5, y, x + 12, y);
  // Left arc: down the page from the top, bulging left.
  doc.lines([[-2.6, 1.4, -2.6, 4.6, 0, 6]], x + 4, y - 3, [1, 1], "S");
  // Right arc: mirrored.
  doc.lines([[2.6, 1.4, 2.6, 4.6, 0, 6]], x + 8, y - 3, [1, 1], "S");
  doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(INK);
  doc.text(el.tag || "—", x + 6, y - 6, { align: "center" });
  doc.setFontSize(6).setTextColor(MUTED);
  doc.text(el.type, x + 6, y + 8, { align: "center" });
}

export { everyElement };
