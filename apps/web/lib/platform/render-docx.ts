import type { Client, CompanyProfile, Project } from "@/lib/db/schema";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Block, Inline } from "./doc-ast";
import { parseDocument } from "./doc-ast";

/**
 * The document as a real .docx.
 *
 * Not HTML renamed to .doc, which is the shortcut most tools take: Word opens
 * those but they are fragile, they do not carry styles, and a client who edits
 * one and sends it back produces something nobody can round-trip. This is an
 * actual Office Open XML package, so tables are Word tables, headings are Word
 * headings, and the recipient can edit it the way they edit anything else.
 *
 * The logo comes across as an embedded image, which is why the data URL the
 * company profile stores is convenient here: the bytes are already to hand.
 */

const INK = "0F1A24";
const MUTED = "4A5A68";
const LINE = "D5DCE2";

function runs(spans: Inline[], opts: { size?: number; color?: string; bold?: boolean } = {}) {
  return spans.map(
    (s) =>
      new TextRun({
        text: s.text,
        bold: s.bold || opts.bold,
        font: s.code ? "Consolas" : undefined,
        size: opts.size ?? 20, // half-points, so 20 = 10pt
        color: opts.color ?? INK,
      }),
  );
}

const HEADING_FOR: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/**
 * Decode a data URL into the bytes and dimensions docx needs.
 *
 * Returns null for anything that is not a decodable raster image. SVG is
 * excluded on purpose: Word's SVG support is inconsistent across versions, and
 * a logo that silently fails to appear is worse than one that is skipped and
 * replaced with the company name.
 */
function decodeLogo(dataUrl: string | null): { data: Buffer; type: "png" | "jpg" } | null {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    return {
      data: Buffer.from(m[2] as string, "base64"),
      type: (m[1] ?? "png").toLowerCase().startsWith("jp") ? "jpg" : "png",
    };
  } catch {
    return null;
  }
}

function blockToDocx(block: Block): (Paragraph | Table)[] {
  switch (block.kind) {
    case "heading":
      return [
        new Paragraph({
          heading: HEADING_FOR[block.level],
          spacing: { before: 240, after: 120 },
          children: runs(block.spans, { bold: true, size: block.level <= 2 ? 26 : 22 }),
        }),
      ];

    case "paragraph":
      return [new Paragraph({ spacing: { after: 120 }, children: runs(block.spans) })];

    case "bullets":
      return block.items.map(
        (item) => new Paragraph({ bullet: { level: 0 }, children: runs(item) }),
      );

    case "numbered":
      return block.items.map(
        (item, i) =>
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: `${i + 1}. `, bold: true }), ...runs(item)],
          }),
      );

    case "quote":
      return [
        new Paragraph({
          spacing: { before: 120, after: 120 },
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: "2C9A9E", space: 8 } },
          children: runs(block.spans, { color: MUTED }),
        }),
      ];

    case "rule":
      return [
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } },
          children: [],
        }),
      ];

    case "table": {
      const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
      const borders = { top: border, bottom: border, left: border, right: border };
      const headerRow = new TableRow({
        tableHeader: true,
        children: block.header.map(
          (cell) =>
            new TableCell({
              borders,
              shading: { fill: "F4F7F9" },
              children: [new Paragraph({ children: runs(cell, { bold: true, size: 18 }) })],
            }),
        ),
      });
      const bodyRows = block.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  borders,
                  children: [new Paragraph({ children: runs(cell, { size: 18 }) })],
                }),
            ),
          }),
      );
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }),
        // Word butts a following paragraph straight against a table otherwise.
        new Paragraph({ spacing: { after: 120 }, children: [] }),
      ];
    }
  }
}

export async function renderDocx(input: {
  title: string;
  abbr: string;
  markdown: string;
  company: CompanyProfile | null;
  client: Client | null;
  project: Project;
}): Promise<Buffer> {
  const { title, abbr, markdown, company, client, project } = input;

  const header: (Paragraph | Table)[] = [];
  const logo = decodeLogo(company?.logo ?? null);

  if (logo) {
    header.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new ImageRun({
            data: logo.data,
            type: logo.type,
            transformation: { width: 150, height: 44 },
          }),
        ],
      }),
    );
  }

  if (company?.name) {
    header.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: company.name, bold: true, size: 24, color: INK })],
      }),
    );
    const lines = [
      company.addressLine1,
      company.addressLine2,
      [company.city, company.region].filter(Boolean).join(", "),
      [company.postcode, company.country].filter(Boolean).join(" "),
      [company.phone, company.email, company.website].filter(Boolean).join("  ·  "),
    ].filter((l): l is string => Boolean(l?.trim()));
    for (const line of lines) {
      header.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: line, size: 16, color: MUTED })],
        }),
      );
    }
  }

  header.push(
    new Paragraph({
      spacing: { before: 120, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 4 } },
      children: [],
    }),
  );

  // The "prepared for" block, which is what makes it a client deliverable
  // rather than a generic document.
  if (client) {
    header.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: "PREPARED FOR", bold: true, size: 14, color: MUTED })],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: client.name, bold: true, size: 20 }),
          ...(client.city
            ? [new TextRun({ text: `  ·  ${client.city}`, size: 18, color: MUTED })]
            : []),
        ],
      }),
    );
  }

  const body = parseDocument(markdown).flatMap(blockToDocx);

  const doc = new Document({
    creator: company?.name ?? "LADX Studio",
    title: `${title} (${abbr})`,
    description: project.name,
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 900, right: 900 } } },
        children: [...header, ...body],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
