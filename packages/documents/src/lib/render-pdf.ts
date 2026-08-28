import { jsPDF } from "jspdf";
import type { Block, Inline } from "./doc-ast";
import { parseDocument, spansToText, tableHasHeader } from "./doc-ast";
import type { DocCompany, DocParty, DocProject } from "./document";

/**
 * The document as a PDF.
 *
 * Laid out by hand rather than by printing HTML, because printing HTML on the
 * server means shipping a headless browser, and this host runs fifteen other
 * applications on 8 GB. A layout engine for headings, paragraphs, bullets and
 * tables is a few hundred lines and costs nothing at runtime.
 *
 * The part that earns its keep is the table: real column widths measured from
 * the content, wrapped cell text, and page breaks that repeat the header row.
 * Automation documents are mostly tables, and a table that runs off the bottom
 * of page one is the difference between a usable deliverable and a draft.
 */

const A4 = { w: 210, h: 297 };
const MARGIN = { top: 18, bottom: 18, left: 16, right: 16 };
const CONTENT_W = A4.w - MARGIN.left - MARGIN.right;

const INK: [number, number, number] = [15, 26, 36];
const MUTED: [number, number, number] = [74, 90, 104];
const LINE: [number, number, number] = [213, 220, 226];
const HEAD_BG: [number, number, number] = [244, 247, 249];
const TEAL: [number, number, number] = [44, 154, 158];

interface Ctx {
  doc: jsPDF;
  y: number;
  /** Reset y and add a page. Returns the new y. */
  page: () => void;
}

function setFont(doc: jsPDF, opts: { size: number; bold?: boolean; mono?: boolean }) {
  doc.setFont(opts.mono ? "courier" : "helvetica", opts.bold ? "bold" : "normal");
  doc.setFontSize(opts.size);
}

/** Ensure `need` mm of room, adding a page when there is not. */
function ensure(ctx: Ctx, need: number) {
  if (ctx.y + need > A4.h - MARGIN.bottom) ctx.page();
}

/**
 * Draw styled spans on one line, honouring bold and code runs.
 *
 * Returns the width consumed, so callers can lay out inline content. Wrapping
 * is handled by the callers that need it, because a heading wraps differently
 * from a table cell.
 */
function drawSpans(doc: jsPDF, spans: Inline[], x: number, y: number, size: number) {
  let cursor = x;
  for (const s of spans) {
    setFont(doc, { size, bold: s.bold, mono: s.code });
    doc.text(s.text, cursor, y);
    cursor += doc.getTextWidth(s.text);
  }
  return cursor - x;
}

/** Wrap plain text to a width, returning lines. */
function wrap(doc: jsPDF, text: string, width: number, size: number, bold = false): string[] {
  setFont(doc, { size, bold });
  return doc.splitTextToSize(text || " ", width) as string[];
}

function drawParagraph(ctx: Ctx, spans: Inline[], size: number, color = INK, indent = 0) {
  const { doc } = ctx;
  const text = spansToText(spans);
  const lines = wrap(doc, text, CONTENT_W - indent, size);
  const lh = size * 0.42 + 0.8;

  doc.setTextColor(...color);
  for (const line of lines) {
    ensure(ctx, lh + 1);
    // Bold is preserved only when the whole run is bold, which is the case in
    // these templates; mixed inline bold inside a wrapped paragraph would need
    // per-word measurement for a gain nobody would notice.
    setFont(doc, { size, bold: spans.length === 1 && Boolean(spans[0]?.bold) });
    doc.text(line, MARGIN.left + indent, ctx.y);
    ctx.y += lh;
  }
  ctx.y += 1.2;
}

/**
 * Column widths from the content.
 *
 * Measured, then scaled to the page. A fixed even split makes a Tag column as
 * wide as a Description column, which wastes half the page on these documents.
 * Every column is given a floor so a narrow one stays readable.
 */
function columnWidths(doc: jsPDF, header: Inline[][], rows: Inline[][][]): number[] {
  const cols = header.length;
  const natural = header.map((h, c) => {
    setFont(doc, { size: 7.5, bold: true });
    let max = doc.getTextWidth(spansToText(h));
    setFont(doc, { size: 7.5 });
    for (const row of rows) {
      const w = doc.getTextWidth(spansToText(row[c] ?? []));
      if (w > max) max = w;
    }
    // Cap a single runaway column so one long cell cannot squeeze the rest.
    return Math.min(max + 4, CONTENT_W * 0.45);
  });

  const total = natural.reduce((a, b) => a + b, 0) || 1;
  const min = Math.min(14, CONTENT_W / cols);
  const scaled = natural.map((w) => Math.max(min, (w / total) * CONTENT_W));

  // Rescale after applying the floor so the row still fits the page exactly.
  const after = scaled.reduce((a, b) => a + b, 0);
  return scaled.map((w) => (w / after) * CONTENT_W);
}

function drawTable(ctx: Ctx, block: Extract<Block, { kind: "table" }>) {
  const { doc } = ctx;
  const size = 7.5;
  const widths = columnWidths(doc, block.header, block.rows);
  const pad = 1.6;
  const lh = 3.4;

  const drawRow = (cells: Inline[][], isHeader: boolean) => {
    const wrapped = cells.map((cell, c) =>
      wrap(doc, spansToText(cell), (widths[c] as number) - pad * 2, size, isHeader),
    );
    const rowH = Math.max(...wrapped.map((l) => l.length)) * lh + pad * 2;

    ensure(ctx, rowH);

    let x = MARGIN.left;
    for (let c = 0; c < cells.length; c++) {
      const w = widths[c] as number;
      if (isHeader) {
        doc.setFillColor(...HEAD_BG);
        doc.rect(x, ctx.y, w, rowH, "F");
      }
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.15);
      doc.rect(x, ctx.y, w, rowH);

      doc.setTextColor(...INK);
      setFont(doc, { size, bold: isHeader });
      let ty = ctx.y + pad + 2.4;
      for (const line of wrapped[c] as string[]) {
        doc.text(line, x + pad, ty);
        ty += lh;
      }
      x += w;
    }
    ctx.y += rowH;
  };

  const showHeader = tableHasHeader(block.header);
  if (showHeader) drawRow(block.header, true);
  for (const row of block.rows) {
    // A page break inside a table repeats the header, so the second page is
    // still readable on its own.
    if (ctx.y + 8 > A4.h - MARGIN.bottom) {
      ctx.page();
      if (showHeader) drawRow(block.header, true);
    }
    drawRow(row, false);
  }
  ctx.y += 2.5;
}

function drawBlock(ctx: Ctx, block: Block) {
  const { doc } = ctx;
  switch (block.kind) {
    case "heading": {
      const size = block.level <= 1 ? 15 : block.level === 2 ? 11.5 : 9.5;
      ensure(ctx, size * 0.6 + 6);
      ctx.y += block.level <= 2 ? 3.5 : 2;
      doc.setTextColor(...INK);
      setFont(doc, { size, bold: true });
      const lines = wrap(doc, spansToText(block.spans), CONTENT_W, size, true);
      for (const line of lines) {
        ensure(ctx, size * 0.5);
        doc.text(line, MARGIN.left, ctx.y);
        ctx.y += size * 0.45 + 0.6;
      }
      if (block.level === 2) {
        doc.setDrawColor(...LINE);
        doc.setLineWidth(0.2);
        doc.line(MARGIN.left, ctx.y, A4.w - MARGIN.right, ctx.y);
        ctx.y += 2.2;
      } else {
        ctx.y += 1;
      }
      break;
    }
    case "paragraph":
      drawParagraph(ctx, block.spans, 8.5);
      break;
    case "bullets":
      for (const item of block.items) {
        ensure(ctx, 4);
        doc.setTextColor(...MUTED);
        setFont(doc, { size: 8.5 });
        doc.text("•", MARGIN.left + 1, ctx.y);
        drawParagraph(ctx, item, 8.5, INK, 5);
      }
      break;
    case "numbered":
      block.items.forEach((item, i) => {
        ensure(ctx, 4);
        doc.setTextColor(...MUTED);
        setFont(doc, { size: 8.5, bold: true });
        doc.text(`${i + 1}.`, MARGIN.left, ctx.y);
        drawParagraph(ctx, item, 8.5, INK, 6);
      });
      break;
    case "quote": {
      const lines = wrap(doc, spansToText(block.spans), CONTENT_W - 6, 8);
      const h = lines.length * 3.6 + 2;
      ensure(ctx, h + 2);
      doc.setDrawColor(...TEAL);
      doc.setLineWidth(0.7);
      doc.line(MARGIN.left, ctx.y - 2.4, MARGIN.left, ctx.y + h - 4);
      drawParagraph(ctx, block.spans, 8, MUTED, 4);
      break;
    }
    case "rule":
      ensure(ctx, 5);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      doc.line(MARGIN.left, ctx.y, A4.w - MARGIN.right, ctx.y);
      ctx.y += 3.5;
      break;
    case "table":
      drawTable(ctx, block);
      break;
  }
}

export function renderPdf(input: {
  title: string;
  abbr: string;
  markdown: string;
  company: DocCompany | null;
  client: DocParty | null;
  project: DocProject;
}): Buffer {
  const { title, abbr, markdown, company, client, project } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const ctx: Ctx = {
    doc,
    y: MARGIN.top,
    page: () => {
      doc.addPage();
      ctx.y = MARGIN.top;
    },
  };

  /* ── letterhead ── */
  let headerBottom = MARGIN.top;

  if (company?.logo?.startsWith("data:image/")) {
    try {
      const fmt = company.logo.includes("image/jpeg") ? "JPEG" : "PNG";
      doc.addImage(company.logo, fmt, MARGIN.left, ctx.y, 38, 11, undefined, "FAST");
      headerBottom = ctx.y + 13;
    } catch {
      // An unreadable logo must not stop the document being produced.
    }
  }

  if (company?.name) {
    doc.setTextColor(...INK);
    setFont(doc, { size: 11, bold: true });
    doc.text(company.name, A4.w - MARGIN.right, ctx.y + 4, { align: "right" });
    let ly = ctx.y + 8.5;
    doc.setTextColor(...MUTED);
    setFont(doc, { size: 7 });
    for (const line of [
      company.addressLine1,
      company.addressLine2,
      [company.city, company.region].filter(Boolean).join(", "),
      [company.postcode, company.country].filter(Boolean).join(" "),
      [company.phone, company.email, company.website].filter(Boolean).join("  ·  "),
    ].filter((l): l is string => Boolean(l?.trim()))) {
      doc.text(line, A4.w - MARGIN.right, ly, { align: "right" });
      ly += 3.2;
    }
    headerBottom = Math.max(headerBottom, ly);
  }

  ctx.y = headerBottom + 1;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(MARGIN.left, ctx.y, A4.w - MARGIN.right, ctx.y);
  ctx.y += 6;

  /* ── document / project / client blocks ── */
  const cols: { label: string; value: string; sub?: string }[] = [
    { label: "DOCUMENT", value: title, sub: abbr },
    { label: "PROJECT", value: project.name, sub: project.code ?? "" },
  ];
  if (client) cols.push({ label: "PREPARED FOR", value: client.name, sub: client.city ?? "" });

  const colW = CONTENT_W / cols.length;
  cols.forEach((col, i) => {
    const x = MARGIN.left + i * colW;
    doc.setTextColor(...MUTED);
    setFont(doc, { size: 6 });
    doc.text(col.label, x, ctx.y);
    doc.setTextColor(...INK);
    setFont(doc, { size: 9, bold: true });
    const v = wrap(doc, col.value, colW - 4, 9, true);
    doc.text(v[0] ?? "", x, ctx.y + 4.2);
    if (col.sub) {
      doc.setTextColor(...MUTED);
      setFont(doc, { size: 7 });
      doc.text(col.sub, x, ctx.y + 8);
    }
  });
  ctx.y += 13;

  /* ── body ── */
  for (const block of parseDocument(markdown)) drawBlock(ctx, block);

  /* ── page numbers, added last so the total is known ── */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setTextColor(...MUTED);
    setFont(doc, { size: 6.5 });
    doc.text(
      `${company?.name ?? ""}${company?.name ? "  ·  " : ""}${abbr}  ·  ${project.name}`,
      MARGIN.left,
      A4.h - 10,
    );
    doc.text(`Page ${p} of ${pages}`, A4.w - MARGIN.right, A4.h - 10, { align: "right" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
