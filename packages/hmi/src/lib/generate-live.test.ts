/**
 * The whole chain, end to end.
 *
 * Everything else tests a piece: the parser reads JSON, the normaliser repairs
 * bindings, the layout fits the glass. None of that proves the thing anybody
 * actually wants, which is that a generated screen, put on a running program,
 * reads and writes real values.
 *
 * So this builds a real ladder program with a seal-in and a timer, runs it on
 * the same scan engine the editor runs, and drives it entirely through the
 * objects a generation produced. If the button the generator drew does not
 * start the motor the generator drew a lamp for, this fails.
 */

import { type LadxProgram, type Tag, scan } from "@ladx/studio";
import { describe, expect, it } from "vitest";
import { type GenContext, draftScreen, firstJsonObject, normaliseScreen } from "./generate";
import { buildTagSpace, makeContext, resolveBool, resolveNumber, writeTag } from "./runtime";
import type { Action, Widget } from "./types";

/**
 * Start, stop, seal-in, and a timer that lights a lamp five seconds in.
 *
 * Stop is normally closed and starts at 1, which is the thing every part of
 * this has to get the right way round.
 */
function program(): LadxProgram {
  return {
    name: "Conveyor",
    scanMs: 100,
    tags: [
      { name: "Start", type: "BOOL", value: 0, isInput: true, device: "PUSHBUTTON_NO" },
      { name: "Stop", type: "BOOL", value: 1, isInput: true, device: "PUSHBUTTON_NC" },
      { name: "Motor", type: "BOOL", value: 0, isOutput: true, device: "MOTOR" },
      { name: "RunLamp", type: "BOOL", value: 0, isOutput: true, device: "LAMP" },
      { name: "T1", type: "TIMER", value: 0, preset: 5000, acc: 0, dn: false },
    ],
    rungs: [
      {
        id: "r1",
        branches: [
          [
            { id: "e1", type: "XIC", tag: "Start" },
            { id: "e2", type: "XIC", tag: "Stop" },
          ],
          // The seal-in repeats the stop condition, or the stop button does
          // nothing once the motor has latched.
          [
            { id: "e3", type: "XIC", tag: "Motor" },
            { id: "e4", type: "XIC", tag: "Stop" },
          ],
        ],
        outputs: [{ id: "o1", type: "OTE", tag: "Motor" }],
      },
      {
        id: "r2",
        branches: [[{ id: "e5", type: "XIC", tag: "Motor" }]],
        outputs: [{ id: "o2", type: "TON", tag: "T1", preset: 5000 }],
      },
      {
        id: "r3",
        branches: [[{ id: "e6", type: "XIC", tag: "T1.DN" }]],
        outputs: [{ id: "o3", type: "OTE", tag: "RunLamp" }],
      },
    ],
  };
}

/** The editor's scan loop, in miniature: HMI writes fold in, then the rungs run. */
class Rig {
  tags: Tag[];
  edges: Record<string, boolean> = {};
  space = buildTagSpace([], []);
  private pending = new Map<string, number>();

  constructor(
    private prog: LadxProgram,
    hmiTags: { name: string; type: Tag["type"]; value: number }[] = [],
  ) {
    this.tags = prog.tags.map((t) => ({ ...t }));
    this.space = buildTagSpace(this.tags, hmiTags);
  }

  /** What a widget's press or release handler does, exactly as the editor does it. */
  fire(actions: Action[] | undefined) {
    for (const a of actions ?? []) {
      if (a.kind === "setTag" && a.value.kind === "const") {
        const v = Number(a.value.value);
        if (a.target.source === "plc") this.pending.set(a.target.tag, v);
        else this.space = writeTag(this.space, a.target, v).space;
      }
      if (a.kind === "toggleTag") {
        const now = this.read(a.target.tag) ?? 0;
        if (a.target.source === "plc") this.pending.set(a.target.tag, now ? 0 : 1);
        else this.space = writeTag(this.space, a.target, now ? 0 : 1).space;
      }
    }
  }

  step(dtMs = 100) {
    this.tags = this.tags.map((t) => {
      const v = this.pending.get(t.name);
      return v !== undefined ? { ...t, value: v } : t;
    });
    this.pending.clear();
    const result = scan(this.prog, this.tags, this.edges, dtMs);
    this.tags = result.tags;
    this.edges = result.edges;
    this.space = buildTagSpace(
      this.tags,
      [...this.space.hmi].map(([name, value]) => ({ name, type: "INT" as const, value })),
    );
  }

  private read(name: string): number | undefined {
    return this.tags.find((t) => t.name === name)?.value;
  }

  ctx() {
    return makeContext(this.space, this.tags);
  }

  bool(w: Widget | undefined): boolean {
    return resolveBool(w?.value, this.ctx());
  }

  number(w: Widget | undefined): number | null {
    return resolveNumber(w?.value, this.ctx());
  }
}

function context(prog: LadxProgram): GenContext {
  return {
    plcTags: prog.tags,
    hmiTags: [],
    size: { width: 800, height: 480 },
    existing: [],
    screenSlugs: ["overview"],
    alarms: [],
    mode: "replace",
  };
}

/**
 * A reply of the shape a model actually sends, deliberately imperfect.
 *
 * The tag names are the wrong case in two places, one binding names a tag the
 * program does not have, and the timer bar is bound to the timer rather than
 * its accumulator. Every one of those is something the normaliser has to deal
 * with before the screen can run, and a test using a clean reply proves
 * nothing about the day the reply is not.
 */
const MODEL_REPLY = `Here is the screen:
\`\`\`json
{
  "background": "#E8EAEC",
  "widgets": [
    { "kind": "text", "text": "Conveyor", "x": 12, "y": 10, "w": 200, "h": 24 },
    { "kind": "alarmBanner", "x": 12, "y": 40, "w": 776, "h": 30 },
    { "kind": "button", "name": "Start", "x": 12, "y": 90, "w": 120, "h": 44, "text": "START",
      "onPress":   [{ "kind": "setTag", "source": "plc", "tag": "start", "value": 1 }],
      "onRelease": [{ "kind": "setTag", "source": "plc", "tag": "start", "value": 0 }] },
    { "kind": "button", "name": "Stop", "x": 144, "y": 90, "w": 120, "h": 44, "text": "STOP",
      "onPress":   [{ "kind": "setTag", "source": "plc", "tag": "Stop", "value": 0 }],
      "onRelease": [{ "kind": "setTag", "source": "plc", "tag": "Stop", "value": 1 }] },
    { "kind": "lamp", "name": "Running", "x": 300, "y": 90, "w": 40, "h": 40,
      "value": { "plc": "motor" },
      "animations": [{ "when": { "expr": "{plc:Motor}" }, "fill": "#3FBFB5" }] },
    { "kind": "lamp", "name": "Fault", "x": 360, "y": 90, "w": 40, "h": 40,
      "value": { "plc": "FaultActive" } },
    { "kind": "bar", "name": "Cycle", "x": 12, "y": 160, "w": 300, "h": 30,
      "value": { "plc": "T1.ACC" }, "min": 0, "max": 5000 },
    { "kind": "lamp", "name": "Cycle done", "x": 330, "y": 160, "w": 30, "h": 30,
      "value": { "plc": "T1.DN" } }
  ],
  "alarms": [
    { "source": "plc", "tag": "Motor", "condition": "digital", "trueIsAlarm": false,
      "priority": "low", "message": "Conveyor stopped" }
  ],
  "notes": "Start and stop are momentary."
}
\`\`\``;

describe("a generated screen, running on a real program", () => {
  const prog = program();
  const out = normaliseScreen(firstJsonObject(MODEL_REPLY), context(prog));
  const find = (name: string) => out.widgets.find((w) => w.name === name);

  it("keeps every object except the one bound to a tag that does not exist", () => {
    expect(out.widgets).toHaveLength(8);
    expect(find("Fault")?.value).toBeUndefined();
    expect(out.problems.join(" ")).toContain("FaultActive");
  });

  it("repaired the two names the model got the case wrong on", () => {
    expect(find("Running")?.value).toEqual({ kind: "plc", tag: "Motor" });
    const press = find("Start")?.onPress?.[0];
    expect(press?.kind === "setTag" && press.target.tag).toBe("Start");
  });

  it("starts the motor when the generated start button is pressed and released", () => {
    const rig = new Rig(program());
    rig.step();
    expect(rig.bool(find("Running"))).toBe(false);

    rig.fire(find("Start")?.onPress);
    rig.step();
    expect(rig.bool(find("Running"))).toBe(true);

    // And it stays on after the button comes back up, which is the seal-in
    // doing its job rather than the button being held.
    rig.fire(find("Start")?.onRelease);
    rig.step();
    expect(rig.bool(find("Running"))).toBe(true);
  });

  it("stops the motor when the generated stop button is pressed", () => {
    const rig = new Rig(program());
    rig.fire(find("Start")?.onPress);
    rig.step();
    rig.fire(find("Start")?.onRelease);
    rig.step();
    expect(rig.bool(find("Running"))).toBe(true);

    rig.fire(find("Stop")?.onPress);
    rig.step();
    expect(rig.bool(find("Running"))).toBe(false);

    // Releasing the stop button must not restart it. If this ever passes as
    // true the seal-in has been written without the stop in the latch leg.
    rig.fire(find("Stop")?.onRelease);
    rig.step();
    expect(rig.bool(find("Running"))).toBe(false);
  });

  it("fills the generated bar as the timer runs and lights the lamp at the preset", () => {
    const rig = new Rig(program());
    rig.fire(find("Start")?.onPress);
    rig.step();
    rig.fire(find("Start")?.onRelease);

    for (let i = 0; i < 30; i++) rig.step(200);

    expect(rig.number(find("Cycle"))).toBeGreaterThanOrEqual(5000);
    expect(rig.bool(find("Cycle done"))).toBe(true);
    // Bound to the accumulator against the timer's own preset, so full means
    // done rather than a number that happened to look right.
    expect(find("Cycle")?.max).toBe(5000);
  });

  it("built the alarm the model asked for, on the healthy-is-zero sense", () => {
    expect(out.alarms).toHaveLength(1);
    expect(out.alarms[0]).toMatchObject({
      condition: "digital",
      trueIsAlarm: false,
      target: { source: "plc", tag: "Motor" },
    });
  });
});

describe("the tag table draft, running on the same program", () => {
  const prog = program();
  const out = draftScreen(context(prog));
  const buttonFor = (tag: string) =>
    out.widgets.find(
      (w) =>
        w.kind === "button" && w.onPress?.[0]?.kind === "setTag" && w.onPress[0].target.tag === tag,
    );
  const lampFor = (tag: string) =>
    out.widgets.find((w) => w.kind === "lamp" && w.value?.kind === "plc" && w.value.tag === tag);

  it("drew a control for every input and an indicator for every output", () => {
    expect(buttonFor("Start")).toBeTruthy();
    expect(buttonFor("Stop")).toBeTruthy();
    expect(lampFor("Motor")).toBeTruthy();
    expect(lampFor("RunLamp")).toBeTruthy();
  });

  it("runs the machine through the objects it drew", () => {
    const rig = new Rig(program());
    rig.step();
    expect(rig.bool(lampFor("Motor"))).toBe(false);

    rig.fire(buttonFor("Start")?.onPress);
    rig.step();
    rig.fire(buttonFor("Start")?.onRelease);
    rig.step();
    expect(rig.bool(lampFor("Motor"))).toBe(true);

    // The stop button it drew writes zero, because the tag is normally closed.
    rig.fire(buttonFor("Stop")?.onPress);
    rig.step();
    expect(rig.bool(lampFor("Motor"))).toBe(false);
    rig.fire(buttonFor("Stop")?.onRelease);
    rig.step();
    expect(rig.bool(lampFor("Motor"))).toBe(false);
  });

  it("lights the output lamp when the timer it drew a bar for finishes", () => {
    const rig = new Rig(program());
    rig.fire(buttonFor("Start")?.onPress);
    rig.step();
    rig.fire(buttonFor("Start")?.onRelease);
    for (let i = 0; i < 30; i++) rig.step(200);

    expect(rig.bool(lampFor("RunLamp"))).toBe(true);
    const bar = out.widgets.find((w) => w.kind === "bar");
    expect(rig.number(bar)).toBeGreaterThanOrEqual(5000);
  });
});
