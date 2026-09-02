/**
 * Reading an I/O list out of a spreadsheet.
 *
 * Most jobs start with the client's I/O list in Excel: a column of tag names,
 * a column of addresses, usually a description, sometimes a type. This takes
 * the CSV export of that sheet and turns it into tags the program can start
 * from, with the columns guessed from their headings and correctable by hand.
 *
 * CSV rather than the workbook itself, on purpose. Reading .xlsx needs a
 * library the size of the rest of the app, and every spreadsheet has "Save as
 * CSV" one click away. The parser here handles quoted fields, embedded commas
 * and both delimiters, which is what an export from Excel or Sheets needs.
 */

export interface Sheet {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

/** Split one CSV or TSV line, honouring quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseSheet(text: string): Sheet {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], delimiter: "," };
  // Whichever separator appears most on the first line is the one in use.
  const first = lines[0] ?? "";
  const counts = [",", "\t", ";"].map((d) => [d, first.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  const delimiter = counts[0]?.[1] ? counts[0][0] : ",";
  const table = lines.map((l) => splitLine(l, delimiter));
  const headers = (table[0] ?? []).map((h) => h.trim());
  return { headers, rows: table.slice(1), delimiter };
}

export type Column = "name" | "address" | "type" | "comment" | "direction";

export type Mapping = Partial<Record<Column, number>>;

const GUESSES: Record<Column, RegExp> = {
  name: /^(tag|tag ?name|name|signal|symbol|point|io ?tag)$/i,
  address: /^(address|addr|io ?address|channel|terminal|location|plc ?address)$/i,
  type: /^(type|data ?type|datatype|signal ?type)$/i,
  comment: /^(description|desc|comment|comments|function|note|notes|text)$/i,
  direction: /^(direction|i\/o|io|in\/out|dir)$/i,
};

/** Which column is which, from the headings. Anything not recognised stays unmapped. */
export function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  headers.forEach((h, i) => {
    for (const col of Object.keys(GUESSES) as Column[]) {
      if (m[col] === undefined && GUESSES[col].test(h.trim())) m[col] = i;
    }
  });
  // No heading called "tag"? The first column is the name more often than not.
  if (m.name === undefined && headers.length > 0) m.name = 0;
  return m;
}

export interface ImportedTag {
  name: string;
  type: "BOOL" | "INT" | "TIMER" | "COUNTER";
  address?: string;
  comment?: string;
  isInput?: boolean;
  isOutput?: boolean;
  /** Anything the sheet said that the editor cannot keep, in words. */
  lost?: string;
}

function typeOf(raw: string | undefined): { type: ImportedTag["type"]; lost?: string } {
  const t = (raw ?? "").trim().toUpperCase();
  if (!t || t === "BOOL" || t === "BIT" || t === "DI" || t === "DO" || t === "DIGITAL") {
    return { type: "BOOL" };
  }
  if (/^(INT|DINT|SINT|WORD|DWORD|UINT|UDINT|AI|AO|ANALOG(UE)?)$/.test(t)) return { type: "INT" };
  if (/^TIMER|^TON|^TOF|^TIME$/.test(t)) return { type: "TIMER" };
  if (/^COUNTER|^CTU|^CTD$/.test(t)) return { type: "COUNTER" };
  if (t === "REAL" || t === "LREAL" || t === "FLOAT") {
    return {
      type: "INT",
      lost: "REAL becomes INT here; the ladder editor has no floating point.",
    };
  }
  if (t === "STRING")
    return { type: "INT", lost: "STRING becomes INT here; the editor has no text." };
  return { type: "INT", lost: `${t} is not a type the editor has; it becomes INT.` };
}

/** Whether an address or a direction column says input or output. */
function directionOf(address: string | undefined, direction: string | undefined) {
  const d = (direction ?? "").trim().toUpperCase();
  if (/^(I|IN|INPUT|DI|AI)$/.test(d)) return { isInput: true };
  if (/^(O|Q|OUT|OUTPUT|DO|AO)$/.test(d)) return { isOutput: true };
  const a = (address ?? "").trim().toUpperCase();
  if (/^(I|%I|IW|%IW|LOCAL:\d+:I)/.test(a)) return { isInput: true };
  if (/^(Q|%Q|QW|%QW|O|LOCAL:\d+:O)/.test(a)) return { isOutput: true };
  return {};
}

/** A tag name the editor accepts: letters, digits and underscores, not starting with a digit. */
export function cleanName(raw: string): string {
  const s = raw
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^\d/.test(s) ? `T_${s}` : s;
}

export function tagsFromSheet(
  sheet: Sheet,
  mapping: Mapping,
): { tags: ImportedTag[]; skipped: number } {
  const tags: ImportedTag[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of sheet.rows) {
    const cell = (c: Column) => (mapping[c] === undefined ? undefined : row[mapping[c] as number]);
    const name = cleanName(cell("name") ?? "");
    if (!name || seen.has(name)) {
      skipped += 1;
      continue;
    }
    seen.add(name);
    const { type, lost } = typeOf(cell("type"));
    const address = cell("address")?.trim() || undefined;
    const comment = cell("comment")?.trim() || undefined;
    tags.push({ name, type, address, comment, lost, ...directionOf(address, cell("direction")) });
  }
  return { tags, skipped };
}

/**
 * Put imported tags into a program's tag table.
 *
 * A tag the program already has keeps its value and its use in the rungs; the
 * sheet fills in what it did not know (an address, a description) and never
 * changes a type, because a type change would break every rung that uses it.
 */
export function mergeTags<
  T extends {
    name: string;
    type: string;
    address?: string;
    comment?: string;
    isInput?: boolean;
    isOutput?: boolean;
    value: number;
  },
>(existing: T[], imported: ImportedTag[]): { tags: T[]; added: number; updated: number } {
  const byName = new Map(existing.map((t) => [t.name, t]));
  let added = 0;
  let updated = 0;
  for (const t of imported) {
    const have = byName.get(t.name);
    if (have) {
      let changed = false;
      if (t.address && !have.address) {
        have.address = t.address;
        changed = true;
      }
      if (t.comment && !have.comment) {
        have.comment = t.comment;
        changed = true;
      }
      if (t.isInput && !have.isInput) {
        have.isInput = true;
        changed = true;
      }
      if (t.isOutput && !have.isOutput) {
        have.isOutput = true;
        changed = true;
      }
      if (changed) updated += 1;
    } else {
      byName.set(t.name, {
        name: t.name,
        type: t.type,
        value: 0,
        address: t.address,
        comment: t.comment,
        isInput: t.isInput,
        isOutput: t.isOutput,
      } as unknown as T);
      added += 1;
    }
  }
  return { tags: [...byName.values()], added, updated };
}
