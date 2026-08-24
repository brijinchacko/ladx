/**
 * The document, parsed once into blocks.
 *
 * A template is markdown; the platform has to emit it as HTML for the browser,
 * as .docx for Word, and as PDF for the file somebody attaches to an email. The
 * mistake would be three parsers drifting apart, so there is one: markdown goes
 * to blocks here, and each renderer walks the same blocks.
 *
 * The grammar is exactly what these templates use. That is deliberate. A
 * general markdown library would be a dependency and an attack surface for
 * documents that are, in practice, headings, tables, bullets and rules.
 */

export type Inline = { text: string; bold?: boolean; code?: boolean };

export type Block =
  | { kind: "heading"; level: number; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "bullets"; items: Inline[][] }
  | { kind: "numbered"; items: Inline[][] }
  | { kind: "quote"; spans: Inline[] }
  | { kind: "rule" }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] };

/** A markdown table separator row: |---|---| with optional alignment colons. */
const SEP_ROW = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/**
 * Split one line into bold, code and plain runs.
 *
 * Runs rather than nested markup, because every target renderer wants a flat
 * list of styled spans: Word wants TextRuns, jsPDF wants font switches, and
 * HTML is happy either way.
 */
export function parseInline(text: string): Inline[] {
  const spans: Inline[] = [];
  // Alternating capture on ** and ` keeps the delimiters out of the output.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) spans.push({ text: text.slice(last, at) });
    const token = m[0];
    if (token.startsWith("**")) spans.push({ text: token.slice(2, -2), bold: true });
    else spans.push({ text: token.slice(1, -1), code: true });
    last = at + token.length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length ? spans : [{ text }];
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseDocument(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trim();

    // Table: header row, separator, then body until the pipes stop.
    if (line.startsWith("|") && SEP_ROW.test(lines[i + 1]?.trim() ?? "")) {
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        const cells = splitRow((lines[i] as string).trim());
        // Pad or trim to the header width so every renderer can assume a grid.
        const normalised = header.map((_, c) => parseInline(cells[c] ?? ""));
        rows.push(normalised);
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (line === "") {
      i++;
      continue;
    }

    if (line === "---") {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: Math.min(heading[1]?.length ?? 1, 6),
        spans: parseInline(heading[2] ?? ""),
      });
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      blocks.push({ kind: "quote", spans: parseInline(line.slice(2)) });
      i++;
      continue;
    }

    // Consecutive bullets collapse into one list, which is what every renderer
    // needs in order to produce a single <ul> or one Word list.
    if (/^[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        items.push(parseInline((lines[i] as string).trim().replace(/^[-*]\s+/, "")));
        i++;
      }
      blocks.push({ kind: "bullets", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        items.push(parseInline((lines[i] as string).trim().replace(/^\d+\.\s+/, "")));
        i++;
      }
      blocks.push({ kind: "numbered", items });
      continue;
    }

    blocks.push({ kind: "paragraph", spans: parseInline(line) });
    i++;
  }

  return blocks;
}

/** Flatten spans back to plain text, for widths and alt text. */
export function spansToText(spans: Inline[]): string {
  return spans.map((s) => s.text).join("");
}
