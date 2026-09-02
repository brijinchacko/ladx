import type { LadxProgram } from "@ladx/studio";
import { describe, expect, it } from "vitest";
import { buildXref, xrefFindings } from "./xref";

// A small program in the editor's own shape: two rungs, a seal-in and a timer.
const program = {
  version: 1,
  name: "Test",
  tags: [
    { name: "Start_PB", type: "BOOL", value: 0, address: "I0.0", isInput: true },
    { name: "Stop_PB", type: "BOOL", value: 0, address: "I0.1", isInput: true },
    { name: "Motor_Run", type: "BOOL", value: 0, address: "Q0.0", isOutput: true },
    { name: "Run_Timer", type: "TIMER", value: 0 },
    { name: "Spare_In", type: "BOOL", value: 0, address: "I0.7" },
  ],
  rungs: [],
  routines: [
    {
      id: "rt1",
      name: "Main",
      rungs: [
        {
          id: "r1",
          comment: "Seal-in",
          branches: [
            [
              { id: "e1", type: "XIC", tag: "Start_PB" },
              { id: "e2", type: "XIO", tag: "Stop_PB" },
            ],
            [{ id: "e3", type: "XIC", tag: "Motor_Run" }],
          ],
          outputs: [{ id: "e4", type: "OTE", tag: "Motor_Run" }],
        },
        {
          id: "r2",
          branches: [[{ id: "e5", type: "XIC", tag: "Motor_Run" }]],
          outputs: [{ id: "e6", type: "TON", tag: "Run_Timer", preset: 5000 }],
        },
        {
          id: "r3",
          branches: [[{ id: "e7", type: "GRT", tag: "Level_PV", operand: "Level_SP" }]],
          outputs: [{ id: "e8", type: "MOV", tag: "Level_PV", dest: "Level_Last" }],
        },
      ],
    },
  ],
} as unknown as LadxProgram;

const hmi = {
  id: "h1",
  name: "Line 2",
  doc: {
    screens: [
      {
        name: "Overview",
        widgets: [
          { id: "w1", type: "lamp", value: { kind: "plc", tag: "Motor_Run" } },
          {
            id: "w2",
            type: "button",
            onPress: [
              {
                kind: "setTag",
                target: { source: "plc", tag: "Start_PB" },
                value: { kind: "const", value: true },
              },
            ],
          },
          { id: "w3", type: "numeric", value: { kind: "plc", tag: "Ghost_Tag" } },
        ],
      },
    ],
    alarms: [{ id: "a1", target: { source: "plc", tag: "Motor_Run" }, condition: "off" }],
  },
};

const drawing = {
  id: "d1",
  name: "050 PLC digital inputs",
  data: {
    entities: [
      { type: "text", text: "Start_PB  X1:3" },
      { type: "text", text: "Motor_Run_2 spare" },
      { type: "dimension", label: "Motor_Run" },
    ],
  },
};

describe("cross reference", () => {
  const entries = buildXref({ program, hmi: [hmi], drawings: [drawing] });
  const by = Object.fromEntries(entries.map((e) => [e.tag, e]));
  const get = (tag: string) => {
    const e = by[tag];
    if (!e) throw new Error(`no entry for ${tag}`);
    return e;
  };

  it("finds every use of a tag across the three tools", () => {
    const motor = get("Motor_Run");
    expect(motor.declared).toBe(true);
    expect(motor.address).toBe("Q0.0");
    // XIC in rung 1, OTE in rung 1, XIC in rung 2
    expect(motor.program.map((p) => `${p.rung}:${p.instruction}:${p.role}`)).toEqual([
      "1:XIC:reads",
      "1:OTE:writes",
      "2:XIC:reads",
    ]);
    expect(motor.hmi.map((h) => h.use)).toEqual(["lamp binding", "alarm (off)"]);
    expect(motor.cad).toHaveLength(1);
    expect(motor.cad[0]?.text).toBe("Motor_Run");
  });

  it("does not find a tag inside a longer name on a drawing", () => {
    // "Motor_Run_2 spare" must not count as Motor_Run.
    expect(get("Motor_Run").cad.every((c) => !c.text.includes("_2"))).toBe(true);
  });

  it("reads compare operands and move destinations", () => {
    expect(get("Level_SP").program[0]?.role).toBe("reads");
    expect(get("Level_Last").program[0]?.role).toBe("writes");
  });

  it("sees an HMI action that writes a PLC tag", () => {
    expect(get("Start_PB").hmi.map((h) => h.use)).toEqual(["button writes it"]);
  });

  it("puts the most used tag first and the spare last", () => {
    expect(entries[0]?.tag).toBe("Motor_Run");
    expect(entries.at(-1)?.tag).toBe("Spare_In");
  });

  it("turns the gaps into findings", () => {
    const findings = xrefFindings(entries);
    const of = (tag: string) => findings.filter((f) => f.tag === tag).map((f) => f.finding);
    expect(of("Ghost_Tag")).toEqual(["the HMI binds to it but the program has no such tag"]);
    expect(of("Spare_In")).toEqual(["declared but never used"]);
    expect(of("Level_PV")).toEqual(["used in the program but never declared"]);
    expect(of("Motor_Run")).toEqual([]);
  });
});
