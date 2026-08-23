import { describe, expect, it } from "vitest";
import { convert, summarise, toNeutralText, toStructuredText } from "./convert";
import { elNode, parallel, series } from "./tree";
import type { LadxProgram, Rung, Tag } from "./types";

/**
 * Conversion tests.
 *
 * The thing worth testing here is not that output is produced, it is that the
 * output means the same as the input. Each case below is a rung whose behaviour
 * is unambiguous in ladder, checked against the expression that has to come out
 * the other side.
 *
 * The seal-in is the case that matters most: it is the shape every one of these
 * tools is judged on, because getting the branch wrong turns a latching circuit
 * into a momentary one, and that is a real machine that stops when you let go
 * of the button.
 */

function tag(name: string, over: Partial<Tag> = {}): Tag {
  return { name, type: "BOOL", value: 0, ...over };
}

function rung(over: Partial<Rung>): Rung {
  return { id: "r1", branches: [], outputs: [], ...over };
}

function program(rungs: Rung[], tags: Tag[] = []): LadxProgram {
  return { name: "Test", rungs, tags, scanMs: 100 };
}

describe("structured text", () => {
  it("turns a plain contact and coil into an assignment", () => {
    const p = program(
      [
        rung({
          logic: series([elNode("XIC", "Start")]),
          outputs: [{ id: "o", type: "OTE", tag: "Run" }],
        }),
      ],
      [tag("Start"), tag("Run")],
    );
    const { text } = toStructuredText(p);
    expect(text).toContain("Run := Start;");
  });

  it("inverts a normally closed contact", () => {
    const p = program([
      rung({
        logic: series([elNode("XIO", "Stop")]),
        outputs: [{ id: "o", type: "OTE", tag: "Run" }],
      }),
    ]);
    expect(toStructuredText(p).text).toContain("Run := NOT Stop;");
  });

  it("joins a series with AND", () => {
    const p = program([
      rung({
        logic: series([elNode("XIC", "A"), elNode("XIC", "B")]),
        outputs: [{ id: "o", type: "OTE", tag: "Y" }],
      }),
    ]);
    expect(toStructuredText(p).text).toContain("Y := (A AND B);");
  });

  it("joins a parallel with OR", () => {
    const p = program([
      rung({
        logic: series([parallel([series([elNode("XIC", "A")]), series([elNode("XIC", "B")])])]),
        outputs: [{ id: "o", type: "OTE", tag: "Y" }],
      }),
    ]);
    expect(toStructuredText(p).text).toContain("Y := (A OR B);");
  });

  /**
   * The seal-in.
   *
   *   ──┬──[Start]──┬──[/Stop]──( Run )
   *     └──[Run]────┘
   *
   * The branch must enclose only Start and Run, with Stop in series after it.
   * If the parentheses come out as `Start OR (Run AND NOT Stop)` the circuit
   * cannot be stopped, and if they come out as `(Start OR Run) AND NOT Stop`
   * it is correct.
   */
  it("keeps a seal-in stoppable", () => {
    const p = program([
      rung({
        logic: series([
          parallel([series([elNode("XIC", "Start")]), series([elNode("XIC", "Run")])]),
          elNode("XIO", "Stop"),
        ]),
        outputs: [{ id: "o", type: "OTE", tag: "Run" }],
      }),
    ]);
    const { text } = toStructuredText(p);
    expect(text).toContain("Run := ((Start OR Run) AND NOT Stop);");
  });

  it("emits a timer as a function block call with a declaration", () => {
    const p = program([
      rung({
        logic: series([elNode("XIC", "Run")]),
        outputs: [{ id: "o", type: "TON", tag: "DelayTmr", preset: 5000 }],
      }),
    ]);
    const { text } = toStructuredText(p);
    expect(text).toContain("DelayTmr : TON;");
    expect(text).toContain("DelayTmr(IN := Run, PT := T#5s);");
  });

  it("writes a sub-second preset in milliseconds", () => {
    const p = program([
      rung({
        logic: series([elNode("XIC", "Run")]),
        outputs: [{ id: "o", type: "TON", tag: "T1", preset: 250 }],
      }),
    ]);
    expect(toStructuredText(p).text).toContain("PT := T#250ms");
  });

  it("latches with a conditional rather than an assignment", () => {
    // OTL only acts when the rung is true. An assignment would also clear the
    // bit when the rung went false, which is the opposite of a latch.
    const p = program([
      rung({
        logic: series([elNode("XIC", "Trip")]),
        outputs: [{ id: "o", type: "OTL", tag: "Fault" }],
      }),
    ]);
    const { text } = toStructuredText(p);
    expect(text).toContain("IF Trip THEN");
    expect(text).toContain("Fault := TRUE;");
    expect(text).not.toContain("Fault := Trip;");
  });

  it("turns a one shot into an edge instance and reports it", () => {
    const p = program([
      rung({
        logic: series([elNode("ONS", "Btn")]),
        outputs: [{ id: "o", type: "OTE", tag: "Pulse" }],
      }),
    ]);
    const { text, notes } = toStructuredText(p);
    expect(text).toContain("Btn_ons : R_TRIG;");
    expect(text).toContain("Btn_ons(CLK := Btn);");
    expect(text).toContain("Pulse := Btn_ons.Q;");
    expect(notes.some((n) => n.message.includes("R_TRIG"))).toBe(true);
  });

  it("renders a comparison as an expression", () => {
    const p = program([
      rung({
        logic: series([elNode("GRT", "Level", { operand: "80" })]),
        outputs: [{ id: "o", type: "OTE", tag: "HighAlarm" }],
      }),
    ]);
    expect(toStructuredText(p).text).toContain("HighAlarm := (Level > 80);");
  });

  it("treats an empty rung as a wire that conducts", () => {
    const p = program([
      rung({ logic: series([]), outputs: [{ id: "o", type: "OTE", tag: "Always" }] }),
    ]);
    expect(toStructuredText(p).text).toContain("Always := TRUE;");
  });

  it("keeps the condition of a rung that has no output, and says so", () => {
    // Dropping it silently loses the only record of what the rung was for.
    const p = program([rung({ logic: series([elNode("XIC", "Orphan")]), outputs: [] })]);
    const { text, notes } = toStructuredText(p);
    expect(text).toContain("Orphan");
    expect(notes.some((n) => n.severity === "warning")).toBe(true);
  });

  it("makes tag names legal identifiers", () => {
    const p = program(
      [
        rung({
          logic: series([elNode("XIC", "Start PB-1")]),
          outputs: [{ id: "o", type: "OTE", tag: "Run/Stop" }],
        }),
      ],
      [tag("Start PB-1")],
    );
    const { text } = toStructuredText(p);
    expect(text).toContain("Run_Stop := Start_PB_1;");
  });

  it("warns about an unguarded division", () => {
    const p = program([
      rung({
        logic: series([elNode("XIC", "Go")]),
        outputs: [{ id: "o", type: "DIV", tag: "A", operand: "B", dest: "C" }],
      }),
    ]);
    const { notes } = toStructuredText(p);
    expect(notes.some((n) => n.message.includes("divide by zero"))).toBe(true);
  });
});

describe("neutral text", () => {
  it("writes a branch in square brackets, keeping the ladder shape", () => {
    const p = program([
      rung({
        logic: series([
          parallel([series([elNode("XIC", "Start")]), series([elNode("XIC", "Run")])]),
          elNode("XIO", "Stop"),
        ]),
        outputs: [{ id: "o", type: "OTE", tag: "Run" }],
      }),
    ]);
    const { text } = toNeutralText(p);
    expect(text).toContain("[XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);");
  });

  it("carries a timer preset through", () => {
    const p = program([
      rung({
        logic: series([elNode("XIC", "Run")]),
        outputs: [{ id: "o", type: "TON", tag: "T1", preset: 5000 }],
      }),
    ]);
    expect(toNeutralText(p).text).toContain("XIC(Run)TON(T1,5000,0);");
  });
});

describe("the report", () => {
  it("always says that ladder geometry is not preserved by text targets", () => {
    const p = program([
      rung({ logic: series([elNode("XIC", "A")]), outputs: [{ id: "o", type: "OTE", tag: "B" }] }),
    ]);
    const { notes } = toStructuredText(p);
    expect(notes.some((n) => n.message.includes("geometry"))).toBe(true);
  });

  it("counts notes by severity", () => {
    const counts = summarise([
      { severity: "info", where: "x", message: "a" },
      { severity: "manual", where: "x", message: "b" },
      { severity: "manual", where: "x", message: "c" },
    ]);
    expect(counts).toEqual({ info: 1, warning: 0, manual: 2 });
  });
});

describe("every target produces output", () => {
  const p = program(
    [
      rung({
        logic: series([
          parallel([series([elNode("XIC", "Start")]), series([elNode("XIC", "Run")])]),
          elNode("XIO", "Stop"),
        ]),
        outputs: [{ id: "o", type: "OTE", tag: "Run" }],
      }),
    ],
    [tag("Start"), tag("Stop"), tag("Run")],
  );

  for (const target of ["st", "scl", "neutral", "plcopen"] as const) {
    it(target, () => {
      const result = convert(p, target);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.filename).toContain("Test");
      // Whatever the target, the tags have to appear in it somewhere.
      expect(result.text).toContain("Start");
    });
  }

  it("produces well formed XML for PLCopen", () => {
    const { text } = convert(p, "plcopen");
    expect(text.startsWith("<?xml")).toBe(true);
    // Angle brackets from the ST body must be escaped, not left to break the
    // document. NOT Stop contains no brackets, so check a comparison instead.
    const withCompare = convert(
      program([
        rung({
          logic: series([elNode("LES", "Level", { operand: "10" })]),
          outputs: [{ id: "o", type: "OTE", tag: "Low" }],
        }),
      ]),
      "plcopen",
    );
    expect(withCompare.text).toContain("&lt;");
    // The comparison operator from the ST body must arrive escaped. If it did
    // not, this substring would appear literally and the XML would be broken.
    expect(withCompare.text).not.toContain("Level < 10");
    expect(withCompare.text).toContain("Level &lt; 10");
  });
});
