import type { GanttTask } from "@/lib/platform/gantt";

/**
 * The plan as a spreadsheet, both directions.
 *
 * CSV rather than Microsoft Project XML, because the thing people actually do
 * with a plan is send it to somebody who does not have the tool it came from.
 * A project manager opens it in Excel, a client pastes it into a status report,
 * and both of those need a file that opens anywhere.
 *
 * Round-trips: what export writes, import reads. The id column is what makes
 * that work, so a plan can leave, be edited by somebody else, and come back
 * without duplicating every task.
 */

export const PLAN_COLUMNS = [
  "id",
  "phase",
  "title",
  "owner",
  "status",
  "starts_on",
  "due_on",
  "depends_on",
] as const;

/**
 * Quote a field for CSV.
 *
 * Commas, quotes and newlines all have to be escaped or the file silently
 * becomes a different table. Task titles contain commas constantly ("FDS:
 * Functional Design Specification, rev B"), so this is not a rare path.
 */
function cell(value: string | null | undefined): string {
  const v = value ?? "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function planToCsv(tasks: GanttTask[]): string {
  const lines = [PLAN_COLUMNS.join(",")];
  for (const t of tasks) {
    lines.push(
      [
        cell(t.id),
        cell(t.phase),
        cell(t.title),
        cell(t.owner),
        cell(t.status),
        cell(t.startsOn?.slice(0, 10) ?? ""),
        cell(t.dueOn?.slice(0, 10) ?? ""),
        cell(t.dependsOn),
      ].join(","),
    );
  }
  // A trailing newline: some tools drop the last row without one.
  return `${lines.join("\n")}\n`;
}

/**
 * Split one CSV line, respecting quotes.
 *
 * Written out rather than split(",") because a quoted title containing a comma
 * is the normal case here, and splitting naively shifts every column after it.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface ImportedRow {
  id: string | null;
  title: string;
  phase: string | null;
  owner: string | null;
  status: string | null;
  startsOn: string | null;
  dueOn: string | null;
  dependsOn: string | null;
}

export interface ImportResult {
  rows: ImportedRow[];
  /** Told, not swallowed: a plan that imported "mostly" is worse than one that says what it skipped. */
  problems: string[];
}

const STATUSES = new Set(["todo", "doing", "blocked", "done"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read a plan back in.
 *
 * Tolerant about column order and about extra columns, because the file will
 * have been through a spreadsheet and somebody will have added a notes column.
 * Strict about what it accepts into a date or a status, because a plan that
 * silently takes "31/09/2026" and stores nothing is worse than one that says
 * the row was skipped.
 */
export function csvToPlan(text: string): ImportResult {
  const problems: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], problems: ["The file is empty."] };

  const header = parseCsvLine(lines[0] as string).map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name);
  const iTitle = at("title");
  if (iTitle === -1) {
    return { rows: [], problems: ['No "title" column, so there is nothing to import.'] };
  }
  const iId = at("id");
  const iPhase = at("phase");
  const iOwner = at("owner");
  const iStatus = at("status");
  const iStart = at("starts_on");
  const iDue = at("due_on");
  const iDep = at("depends_on");

  const rows: ImportedRow[] = [];
  for (let n = 1; n < lines.length; n++) {
    const c = parseCsvLine(lines[n] as string);
    const get = (i: number) => (i === -1 ? "" : (c[i] ?? "").trim());

    const title = get(iTitle);
    if (!title) {
      problems.push(`Row ${n + 1}: no title, skipped.`);
      continue;
    }

    const date = (raw: string, label: string): string | null => {
      if (!raw) return null;
      if (!DATE.test(raw)) {
        problems.push(`Row ${n + 1}: ${label} "${raw}" is not yyyy-mm-dd, ignored.`);
        return null;
      }
      // Reject a well-formed date that is not a real one, like 2026-02-30.
      const [y, m, d] = raw.split("-").map(Number);
      const probe = new Date(y as number, (m as number) - 1, d);
      if (probe.getMonth() !== (m as number) - 1 || probe.getDate() !== d) {
        problems.push(`Row ${n + 1}: ${label} "${raw}" is not a real date, ignored.`);
        return null;
      }
      return raw;
    };

    const status = get(iStatus).toLowerCase();
    if (status && !STATUSES.has(status)) {
      problems.push(`Row ${n + 1}: status "${status}" is not one of todo, doing, blocked, done.`);
    }

    rows.push({
      id: get(iId) || null,
      title: title.slice(0, 300),
      phase: get(iPhase) || null,
      owner: get(iOwner) || null,
      status: STATUSES.has(status) ? status : null,
      startsOn: date(get(iStart), "starts_on"),
      dueOn: date(get(iDue), "due_on"),
      dependsOn: get(iDep) || null,
    });
  }

  return { rows, problems };
}
