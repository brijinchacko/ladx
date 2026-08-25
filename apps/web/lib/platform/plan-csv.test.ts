import { describe, expect, it } from "vitest";
import type { GanttTask } from "./gantt";
import { csvToPlan, parseCsvLine, planToCsv } from "./plan-csv";

const t = (o: Partial<GanttTask> & { id: string; title: string }): GanttTask => ({
  phase: "design",
  status: "todo",
  startsOn: null,
  dueOn: null,
  dependsOn: null,
  owner: null,
  ...o,
});

describe("parseCsvLine", () => {
  it("keeps a comma inside quotes together", () => {
    // The normal case here: "FDS: Functional Design Specification, rev B".
    // split(",") would shift every column after it.
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("handles a doubled quote as a literal one", () => {
    expect(parseCsvLine('a,"say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
  });

  it("keeps empty fields rather than dropping them", () => {
    expect(parseCsvLine("a,,c")).toEqual(["a", "", "c"]);
    expect(parseCsvLine(",,")).toEqual(["", "", ""]);
  });
});

describe("planToCsv", () => {
  it("writes a header and a row per task", () => {
    const csv = planToCsv([
      t({ id: "1", title: "URS", startsOn: "2026-09-01", dueOn: "2026-09-07" }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,phase,title,owner,status,starts_on,due_on,depends_on");
    expect(lines[1]).toBe("1,design,URS,,todo,2026-09-01,2026-09-07,");
  });

  it("quotes a title containing a comma", () => {
    const csv = planToCsv([t({ id: "1", title: "FDS, rev B" })]);
    expect(csv).toContain('"FDS, rev B"');
  });

  it("escapes a quote inside a title", () => {
    const csv = planToCsv([t({ id: "1", title: 'the "big" one' })]);
    expect(csv).toContain('"the ""big"" one"');
  });

  it("round-trips through the parser without losing a column", () => {
    const csv = planToCsv([t({ id: "1", title: "A, with comma", owner: 'O"Neill' })]);
    const back = csvToPlan(csv);
    expect(back.rows).toHaveLength(1);
    expect(back.rows[0]?.title).toBe("A, with comma");
    expect(back.rows[0]?.owner).toBe('O"Neill');
  });
});

describe("csvToPlan", () => {
  const head = "id,phase,title,owner,status,starts_on,due_on,depends_on";

  it("reads a plain plan", () => {
    const r = csvToPlan(`${head}\nx1,design,FDS,Sam,doing,2026-09-01,2026-09-08,`);
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toEqual({
      id: "x1",
      phase: "design",
      title: "FDS",
      owner: "Sam",
      status: "doing",
      startsOn: "2026-09-01",
      dueOn: "2026-09-08",
      dependsOn: null,
    });
  });

  it("does not care about column order or extra columns", () => {
    // The file will have been through a spreadsheet and somebody will have
    // added a notes column and moved things around.
    const r = csvToPlan("notes,title,due_on\nwhatever,FDS,2026-09-08");
    expect(r.rows[0]?.title).toBe("FDS");
    expect(r.rows[0]?.dueOn).toBe("2026-09-08");
  });

  it("refuses a file with no title column instead of importing nothing quietly", () => {
    const r = csvToPlan("id,owner\n1,Sam");
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toContain("title");
  });

  it("skips a row with no title and says which", () => {
    const r = csvToPlan(`${head}\nx1,design,,Sam,todo,,,`);
    expect(r.rows).toEqual([]);
    expect(r.problems[0]).toContain("Row 2");
  });

  it("rejects a date in the wrong format rather than storing nothing silently", () => {
    const r = csvToPlan(`${head}\nx1,design,FDS,,todo,31/09/2026,,`);
    expect(r.rows[0]?.startsOn).toBeNull();
    expect(r.problems.join(" ")).toContain("yyyy-mm-dd");
  });

  it("rejects a well-formed date that is not a real one", () => {
    // 2026-02-30 passes a regex and would roll over to 2 March through a Date.
    const r = csvToPlan(`${head}\nx1,design,FDS,,todo,2026-02-30,,`);
    expect(r.rows[0]?.startsOn).toBeNull();
    expect(r.problems.join(" ")).toContain("not a real date");
  });

  it("accepts 29 February in a leap year", () => {
    const r = csvToPlan(`${head}\nx1,design,FDS,,todo,2028-02-29,,`);
    expect(r.rows[0]?.startsOn).toBe("2028-02-29");
    expect(r.problems).toEqual([]);
  });

  it("flags an unknown status and stores none", () => {
    const r = csvToPlan(`${head}\nx1,design,FDS,,in progress,,,`);
    expect(r.rows[0]?.status).toBeNull();
    expect(r.problems.join(" ")).toContain("in progress");
  });

  it("ignores blank lines and a trailing newline", () => {
    const r = csvToPlan(`${head}\nx1,design,FDS,,todo,,,\n\n`);
    expect(r.rows).toHaveLength(1);
  });

  it("reads a file that came back with CRLF line endings", () => {
    // Which is what Excel writes on Windows.
    const r = csvToPlan(`${head}\r\nx1,design,FDS,,todo,,,\r\n`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.title).toBe("FDS");
  });

  it("says the file is empty rather than returning a silent nothing", () => {
    expect(csvToPlan("").problems[0]).toContain("empty");
  });
});
