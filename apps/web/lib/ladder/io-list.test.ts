import { describe, expect, it } from "vitest";
import { cleanName, guessMapping, mergeTags, parseSheet, tagsFromSheet } from "./io-list";

const CSV = `Tag,Address,Type,Description
Start_PB,I0.0,BOOL,Start button
"Stop, PB",I0.1,,Stop button (NC)
Motor_Run,Q0.0,BOOL,Motor contactor
Level_PV,IW64,REAL,Tank level
Start_PB,I0.0,BOOL,duplicate row
,I0.5,BOOL,no name
`;

describe("reading an I/O list", () => {
  it("splits an Excel export, quotes and all", () => {
    const sheet = parseSheet(CSV);
    expect(sheet.delimiter).toBe(",");
    expect(sheet.headers).toEqual(["Tag", "Address", "Type", "Description"]);
    expect(sheet.rows[1]).toEqual(["Stop, PB", "I0.1", "", "Stop button (NC)"]);
  });

  it("reads a tab separated paste from Sheets", () => {
    const sheet = parseSheet("Name\tAddr\nA\tI0.0\nB\tQ0.0");
    expect(sheet.delimiter).toBe("\t");
    expect(sheet.rows).toHaveLength(2);
  });

  it("guesses the columns from their headings", () => {
    expect(guessMapping(["Tag", "Address", "Type", "Description"])).toEqual({
      name: 0,
      address: 1,
      type: 2,
      comment: 3,
    });
    expect(guessMapping(["Signal", "PLC Address", "Comments", "I/O"])).toEqual({
      name: 0,
      address: 1,
      comment: 2,
      direction: 3,
    });
    // Nothing recognisable: the first column is the name.
    expect(guessMapping(["a", "b"]).name).toBe(0);
  });

  it("makes tags the editor can hold, and says what it could not keep", () => {
    const sheet = parseSheet(CSV);
    const { tags, skipped } = tagsFromSheet(sheet, guessMapping(sheet.headers));
    expect(tags.map((t) => t.name)).toEqual(["Start_PB", "Stop_PB", "Motor_Run", "Level_PV"]);
    // The duplicate and the nameless row.
    expect(skipped).toBe(2);
    expect(tags[0]).toMatchObject({ address: "I0.0", isInput: true, type: "BOOL" });
    expect(tags[2]).toMatchObject({ address: "Q0.0", isOutput: true });
    expect(tags[3]?.type).toBe("INT");
    expect(tags[3]?.lost).toMatch(/REAL/);
  });

  it("cleans a name into something the editor accepts", () => {
    expect(cleanName("Stop, PB")).toBe("Stop_PB");
    expect(cleanName("2nd Pump")).toBe("T_2nd_Pump");
    expect(cleanName("  ")).toBe("");
  });

  it("fills in blanks on tags the program has and never changes a type", () => {
    const existing = [
      { name: "Start_PB", type: "BOOL", value: 1 },
      { name: "Level_PV", type: "TIMER", value: 0, address: "T1" },
    ];
    const sheet = parseSheet(CSV);
    const { tags: imported } = tagsFromSheet(sheet, guessMapping(sheet.headers));
    const { tags, added, updated } = mergeTags(existing, imported);
    expect(added).toBe(2);
    expect(updated).toBe(2);
    const start = tags.find((t) => t.name === "Start_PB");
    // Value kept, address and description filled in.
    expect(start).toMatchObject({ value: 1, address: "I0.0", comment: "Start button" });
    const level = tags.find((t) => t.name === "Level_PV");
    // The sheet said REAL; the program said TIMER; the program wins.
    expect(level?.type).toBe("TIMER");
    expect(level?.address).toBe("T1");
  });
});
