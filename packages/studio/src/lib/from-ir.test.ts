import type { Instruction, IrProject, Logic, Rung } from "@ladx/types";
import { describe, expect, it } from "vitest";
import { ladxProgramFromIr } from "./from-ir";

function ins(op: string, operands: unknown[] = [], vendor?: unknown): Instruction {
  return {
    id: `i-${op}`,
    op,
    operands: operands.map((o) =>
      typeof o === "number" ? { kind: "number", value: o } : { kind: "tag", name: String(o) },
    ),
    vendor: vendor ?? null,
  } as Instruction;
}

const el = (i: Instruction): Logic => ({ kind: "element", instruction: i }) as Logic;
const series = (...c: Logic[]): Logic => ({ kind: "series", children: c }) as Logic;
const parallel = (...c: Logic[]): Logic => ({ kind: "parallel", children: c }) as Logic;

function rung(logic: Logic, outputs: Instruction[], comment?: string): Rung {
  return { id: "r1", comment: comment ?? null, logic, outputs } as Rung;
}

function project(rungs: Rung[], extra: Partial<IrProject> = {}): IrProject {
  return {
    ir_version: 1,
    name: "Test",
    source_vendor: "Rockwell",
    pous: [
      {
        name: "Main",
        kind: "Program",
        body: { language: "ladder", rungs },
        local_tags: [],
        comment: null,
        container: null,
      },
    ],
    tags: [],
    data_types: [],
    entry_point: "Main",
    scan_ms: 100,
    ...extra,
  } as IrProject;
}

describe("opening an IR project in the editor", () => {
  it("brings a seal-in across with its branch intact", () => {
    const { program, dropped } = ladxProgramFromIr(
      project([
        rung(
          series(
            parallel(el(ins("contact", ["Start"])), el(ins("contact", ["Motor"]))),
            el(ins("contactNegated", ["Stop"])),
          ),
          [ins("coil", ["Motor"])],
          "Seal in",
        ),
      ]),
    );

    expect(dropped).toEqual([]);
    const r = program.routines?.[0]?.rungs[0];
    expect(r?.comment).toBe("Seal in");
    expect(r?.outputs[0]?.type).toBe("OTE");

    // The parallel survived as a parallel rather than being flattened, which
    // is the whole reason the tree model exists.
    const top = r?.logic;
    expect(top?.kind).toBe("series");
    expect(top?.children?.[0]?.kind).toBe("parallel");
    expect(top?.children?.[1]).toMatchObject({ kind: "el", type: "XIO", tag: "Stop" });
  });

  it("reads a timer preset as a number, not a tag name", () => {
    const { program } = ladxProgramFromIr(
      project([rung(series(el(ins("contact", ["Run"]))), [ins("timerOn", ["T1", 5000])])]),
    );
    const out = program.routines?.[0]?.rungs[0]?.outputs[0];
    expect(out).toMatchObject({ type: "TON", tag: "T1", preset: 5000 });
  });

  it("puts a comparison's second value in the operand slot", () => {
    const { program } = ladxProgramFromIr(
      project([rung(series(el(ins("equal", ["Step", 10]))), [ins("coil", ["Ready"])])]),
    );
    const first = program.routines?.[0]?.rungs[0]?.logic?.children?.[0];
    expect(first).toMatchObject({ kind: "el", type: "EQU", tag: "Step", operand: "10" });
  });

  it("splits a three-operand instruction into operand and destination", () => {
    const { program } = ladxProgramFromIr(
      project([rung(series(), [ins("add", ["A", "B", "Total"])])]),
    );
    expect(program.routines?.[0]?.rungs[0]?.outputs[0]).toMatchObject({
      type: "ADD",
      tag: "A",
      operand: "B",
      dest: "Total",
    });
  });

  /**
   * The point of the whole module. The IR can hold instructions the editor has
   * no way to draw, and those must be named rather than quietly disappearing
   * from somebody's rung.
   */
  it("says what it could not draw instead of dropping it silently", () => {
    const { program, dropped } = ladxProgramFromIr(
      project([
        rung(series(el(ins("contact", ["Enable"]))), [
          ins("unsupported", ["Loop", "PV", "CV"], {
            original_mnemonic: "PID",
            attributes: [],
          }),
        ]),
      ]),
    );

    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.what).toBe("PID");
    expect(dropped[0]?.where).toContain("Main");
    expect(dropped[0]?.why).toContain("still in the project file");

    // The rest of the rung is still usable.
    expect(program.routines?.[0]?.rungs[0]?.logic?.children).toHaveLength(1);
    expect(program.routines?.[0]?.rungs[0]?.outputs).toEqual([]);
  });

  it("names the IR instructions the editor has no element for", () => {
    const { dropped } = ladxProgramFromIr(
      project([rung(series(el(ins("fallingEdge", ["X"]))), [ins("coilNegated", ["Y"])])]),
    );
    const what = dropped.map((d) => d.what).sort();
    expect(what).toEqual(["coilNegated", "fallingEdge"]);
  });

  it("reports a routine it cannot show rather than losing it without a word", () => {
    const p = project([]);
    p.pous.push({
      name: "Calc",
      kind: "Program",
      body: { language: "structuredText", source: "X := 1;" },
      local_tags: [],
      comment: null,
      container: null,
    } as never);

    const { program, dropped } = ladxProgramFromIr(p);
    expect(program.routines?.map((r) => r.name)).toEqual(["Main"]);
    expect(dropped.some((d) => d.where === "Calc")).toBe(true);
  });

  it("opens on the entry point rather than whichever routine came first", () => {
    const p = project([]);
    p.pous.unshift({
      name: "Subroutine",
      kind: "Program",
      body: { language: "ladder", rungs: [] },
      local_tags: [],
      comment: null,
      container: null,
    } as never);
    p.entry_point = "Main";

    const { program } = ladxProgramFromIr(p);
    expect(program.routines?.[0]?.name).toBe("Main");
  });

  it("carries tag wiring across, since the simulator behaves differently for each", () => {
    const p = project([]);
    p.tags = [
      {
        name: "Start_PB",
        data_type: { kind: "bool" },
        address: "I0.0",
        initial_value: null,
        comment: "Start",
        field: { direction: "input", kind: "pushbuttonNo" },
      },
      {
        name: "Motor",
        data_type: { kind: "bool" },
        address: "Q0.0",
        initial_value: null,
        comment: null,
        field: { direction: "output", kind: "motor" },
      },
    ] as never;

    const { program } = ladxProgramFromIr(p);
    expect(program.tags[0]).toMatchObject({
      name: "Start_PB",
      type: "BOOL",
      address: "I0.0",
      comment: "Start",
      isInput: true,
    });
    expect(program.tags[1]?.isOutput).toBe(true);
    expect(program.tags[1]?.isInput).toBeUndefined();
  });

  it("keeps the scan period, because timers are meaningless without it", () => {
    const p = project([]);
    p.scan_ms = 20;
    expect(ladxProgramFromIr(p).program.scanMs).toBe(20);
  });
});
