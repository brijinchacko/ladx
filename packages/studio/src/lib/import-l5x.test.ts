/**
 * @vitest-environment jsdom
 *
 * What an import must not get wrong.
 *
 * The failures that matter here are the quiet ones. An instruction silently
 * approximated to the nearest thing LADX has produces logic that looks right
 * and behaves differently, which is the worst outcome available in this domain.
 * A branch flattened without saying so does the same. And a whole file refused
 * because one rung used an unknown instruction is how people give up on a
 * converter.
 *
 * The fixtures below are written by hand from the documented neutral text
 * notation, not lifted from a vendor's sample project. See ADR 0003.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { type ImportNote, parseL5X, parseNeutralRung, resetImportIds } from "./import-l5x";

beforeEach(() => resetImportIds());

const notes = () => [] as ImportNote[];

function l5x(body: string, opts: { target?: string; tags?: string } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" TargetName="${opts.target ?? "Conveyor"}" TargetType="Program">
  <Controller Use="Context" Name="Line1">
    <Tags>${opts.tags ?? ""}</Tags>
    <Programs>
      <Program Name="MainProgram">
        <Routines>
          <Routine Name="MainRoutine" Type="RLL">
            <RLLContent>
${body}
            </RLLContent>
          </Routine>
        </Routines>
      </Program>
    </Programs>
  </Controller>
</RSLogix5000Content>`;
}

const rung = (text: string, comment?: string) =>
  `<Rung Number="0" Type="N">${comment ? `<Comment><![CDATA[${comment}]]></Comment>` : ""}<Text><![CDATA[${text}]]></Text></Rung>`;

describe("neutral text, the part that carries the logic", () => {
  it("reads a plain series rung", () => {
    const n = notes();
    const r = parseNeutralRung("XIC(Start)XIO(Stop)OTE(Motor);", "r1", n);
    expect(r.branches).toHaveLength(1);
    expect(r.branches[0]?.map((e) => `${e.type}(${e.tag})`)).toEqual(["XIC(Start)", "XIO(Stop)"]);
    expect(r.outputs.map((e) => `${e.type}(${e.tag})`)).toEqual(["OTE(Motor)"]);
  });

  it("reads a seal-in, which is the shape this exists for", () => {
    const n = notes();
    const r = parseNeutralRung("[XIC(Start),XIC(Motor)]XIO(Stop)OTE(Motor);", "r1", n);
    expect(r.branches).toHaveLength(2);
    // Each parallel leg carries the series conditions that follow the group,
    // which is what juxtaposition means in this notation.
    expect(r.branches[0]?.map((e) => e.tag)).toEqual(["Start", "Stop"]);
    expect(r.branches[1]?.map((e) => e.tag)).toEqual(["Motor", "Stop"]);
    expect(r.outputs.map((e) => e.tag)).toEqual(["Motor"]);
  });

  it("keeps a timer's preset", () => {
    const n = notes();
    const r = parseNeutralRung("XIC(Run)TON(T1,5000,0);", "r1", n);
    expect(r.outputs[0]?.type).toBe("TON");
    expect(r.outputs[0]?.preset).toBe(5000);
  });

  it("carries a MOV's source and destination", () => {
    const n = notes();
    const r = parseNeutralRung("XIC(Go)MOV(Setpoint,Target);", "r1", n);
    const mov = r.outputs[0];
    expect(mov?.type).toBe("MOV");
    expect(mov?.operand).toBe("Setpoint");
    expect(mov?.dest).toBe("Target");
  });

  it("carries a compare's second operand", () => {
    const n = notes();
    const r = parseNeutralRung("GRT(Level,80)OTE(Hi);", "r1", n);
    expect(r.branches[0]?.[0]?.type).toBe("GRT");
    expect(r.branches[0]?.[0]?.operand).toBe("80");
  });

  it("keeps the rest of a rung when one instruction is unknown", () => {
    // Refusing the whole rung is what makes a converter useless. The unknown
    // one is named and the rest is kept.
    const n = notes();
    const r = parseNeutralRung("XIC(Start)PIDE(Loop1)OTE(Motor);", "MainRoutine, rung 1", n);
    expect(r.branches[0]?.map((e) => e.tag)).toEqual(["Start"]);
    expect(r.outputs.map((e) => e.tag)).toEqual(["Motor"]);
    expect(n.some((x) => x.severity === "manual" && x.message.includes("PIDE"))).toBe(true);
  });

  it("says so when it reads RTO as TON, because they differ where it matters", () => {
    const n = notes();
    parseNeutralRung("XIC(Run)RTO(T1,5000,0);", "r1", n);
    expect(n.some((x) => x.message.includes("retentive"))).toBe(true);
  });

  it("says so when it reads OSR as ONS", () => {
    const n = notes();
    parseNeutralRung("XIC(Btn)OSR(B1)OTE(Pulse);", "r1", n);
    expect(n.some((x) => x.message.includes("OSR"))).toBe(true);
  });

  it("flags a nested branch rather than flattening it quietly", () => {
    const n = notes();
    parseNeutralRung("[XIC(A),[XIC(B),XIC(C)]]OTE(D);", "r1", n);
    expect(
      n.some((x) => x.severity === "manual" && x.message.includes("branch inside a branch")),
    ).toBe(true);
  });

  it("is not confused by a comma inside an instruction's arguments", () => {
    // The split has to respect parentheses, or TON(T1,5000,0) becomes three
    // branches and the rung is nonsense.
    const n = notes();
    const r = parseNeutralRung("[XIC(A),XIC(B)]TON(T1,5000,0);", "r1", n);
    expect(r.branches).toHaveLength(2);
    expect(r.outputs).toHaveLength(1);
    expect(r.outputs[0]?.preset).toBe(5000);
  });

  it("survives an empty rung", () => {
    const n = notes();
    const r = parseNeutralRung(";", "r1", n);
    expect(r.outputs).toEqual([]);
  });
});

describe("the L5X wrapper", () => {
  it("reads a whole file into a program", () => {
    const out = parseL5X(l5x(rung("[XIC(Start_PB),XIC(Motor)]XIO(Stop_PB)OTE(Motor);", "Seal in")));
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.program.name).toBe("Conveyor");
    expect(out.program.rungs).toHaveLength(1);
    expect(out.program.rungs[0]?.comment).toContain("Seal in");
  });

  it("reads declared tags with their types and descriptions", () => {
    const out = parseL5X(
      l5x(rung("XIC(Start)OTE(Motor);"), {
        tags:
          '<Tag Name="Start" DataType="BOOL"><Description><![CDATA[Start button]]></Description></Tag>' +
          '<Tag Name="Count" DataType="DINT" />',
      }),
    );
    if ("error" in out) throw new Error(out.error);
    const start = out.program.tags.find((t) => t.name === "Start");
    expect(start?.type).toBe("BOOL");
    expect(start?.comment).toBe("Start button");
    expect(out.program.tags.find((t) => t.name === "Count")?.type).toBe("INT");
  });

  it("leaves out a type it does not have rather than coercing it", () => {
    // A REAL quietly becoming an INT is a setpoint that is wrong by a rounding
    // error, found months later.
    const out = parseL5X(
      l5x(rung("XIC(Start)OTE(Motor);"), { tags: '<Tag Name="Flow" DataType="REAL" />' }),
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.program.tags.find((t) => t.name === "Flow")).toBeUndefined();
    expect(out.notes.some((n) => n.message.includes("REAL"))).toBe(true);
  });

  it("creates tags the logic uses but the export never declared, and says so", () => {
    const out = parseL5X(l5x(rung("XIC(Start)OTE(Motor);")));
    if ("error" in out) throw new Error(out.error);
    expect(out.program.tags.map((t) => t.name).sort()).toEqual(["Motor", "Start"]);
    expect(out.notes.some((n) => n.message.includes("not declared"))).toBe(true);
  });

  it("skips a routine that is not ladder, and names it", () => {
    const xml = l5x("").replace(
      '<Routine Name="MainRoutine" Type="RLL">',
      '<Routine Name="Calc" Type="ST"><STContent><Line><![CDATA[a := 1;]]></Line></STContent></Routine><Routine Name="MainRoutine" Type="RLL">',
    );
    const withRung = xml.replace("<RLLContent>\n\n", `<RLLContent>${rung("XIC(A)OTE(B);")}`);
    const out = parseL5X(withRung);
    if ("error" in out) throw new Error(out.error);
    expect(out.notes.some((n) => n.message.includes("Calc") && n.severity === "manual")).toBe(true);
  });
});

describe("refusing well", () => {
  it("says what to do when handed something that is not an L5X", () => {
    const out = parseL5X("<?xml version='1.0'?><root />");
    expect("error" in out && out.error).toContain("Export");
  });

  it("says so when the XML is broken", () => {
    const out = parseL5X("<RSLogix5000Content><unclosed>");
    expect("error" in out).toBe(true);
  });

  it("does not claim success on an export with no ladder in it", () => {
    const out = parseL5X(l5x(""));
    expect("error" in out && out.error).toContain("No ladder rungs");
  });

  it("is not fooled by an empty string", () => {
    expect("error" in parseL5X("")).toBe(true);
  });
});
