import { describe, expect, it } from "vitest";
import {
  type AlarmRuntime,
  acknowledge,
  conditionMet,
  isActive,
  isOutstanding,
  needsAck,
  newRuntime,
  setOutOfService,
  shelve,
  sortForSummary,
  stepAlarm,
  unshelve,
} from "./alarms";
import type { AlarmDef } from "./types";

const def = (o: Partial<AlarmDef> = {}): AlarmDef => ({
  id: "a1",
  target: { source: "plc", tag: "Level" },
  condition: "hi",
  setpoint: 80,
  priority: "high",
  message: "Level high",
  enabled: true,
  ...o,
});

/** Drive a sequence of values and return the states it passed through. */
function run(d: AlarmDef, values: [number, number][], rt = newRuntime(d.id)) {
  const states: string[] = [];
  let cur: AlarmRuntime = rt;
  for (const [v, t] of values) {
    const r = stepAlarm(d, cur, v, t);
    cur = r.runtime;
    states.push(cur.state);
  }
  return { states, runtime: cur };
}

describe("the ISA-18.2 state machine", () => {
  it("raises unacknowledged when the condition appears", () => {
    const { runtime } = run(def(), [
      [50, 0],
      [85, 1000],
    ]);
    expect(runtime.state).toBe("UNACK");
    expect(runtime.count).toBe(1);
  });

  it("acknowledging does NOT clear an alarm whose condition still holds", () => {
    // The rule an implementation must not get wrong. Removing an acked alarm
    // hides a live process problem behind a button press.
    let { runtime } = run(def(), [[85, 0]]);
    runtime = acknowledge(runtime, 100);
    expect(runtime.state).toBe("ACK");
    expect(isActive(runtime.state)).toBe(true);

    const after = stepAlarm(def(), runtime, 85, 200);
    expect(after.runtime.state).toBe("ACK");
    expect(isOutstanding(after.runtime.state)).toBe(true);
  });

  it("keeps an alarm that cleared before anybody acknowledged it", () => {
    // The condition that came and went overnight is the one to find in the
    // morning, so it waits in RTN_UNACK rather than vanishing.
    const { runtime } = run(def(), [
      [85, 0],
      [50, 1000],
    ]);
    expect(runtime.state).toBe("RTN_UNACK");
    expect(isOutstanding(runtime.state)).toBe(true);
    expect(needsAck(runtime.state)).toBe(true);
  });

  it("goes quiet when it clears after being acknowledged", () => {
    let { runtime } = run(def(), [[85, 0]]);
    runtime = acknowledge(runtime, 10);
    const after = stepAlarm(def(), runtime, 50, 20);
    expect(after.runtime.state).toBe("NORMAL");
    expect(isOutstanding(after.runtime.state)).toBe(false);
  });

  it("acknowledging a returned alarm ends it", () => {
    let { runtime } = run(def(), [
      [85, 0],
      [50, 10],
    ]);
    expect(runtime.state).toBe("RTN_UNACK");
    runtime = acknowledge(runtime, 20);
    expect(runtime.state).toBe("NORMAL");
  });

  it("re-arms if the condition comes back before it was acknowledged", () => {
    const { runtime } = run(def(), [
      [85, 0],
      [50, 10],
      [90, 20],
    ]);
    expect(runtime.state).toBe("UNACK");
    expect(runtime.count).toBe(2);
  });

  it("emits raised and cleared exactly once each", () => {
    const d = def();
    let rt = newRuntime(d.id);
    const kinds: string[] = [];
    for (const [v, t] of [
      [50, 0],
      [85, 1],
      [86, 2],
      [87, 3],
      [50, 4],
      [40, 5],
    ] as [number, number][]) {
      const r = stepAlarm(d, rt, v, t);
      rt = r.runtime;
      kinds.push(...r.events.map((e) => e.kind));
    }
    expect(kinds).toEqual(["raised", "cleared"]);
  });
});

describe("deadband", () => {
  it("holds a hi alarm until the value falls back through it", () => {
    // Trips at 80, and must not clear at 79 or it chatters. A chattering alarm
    // is how operators learn to ignore the list.
    const d = def({ setpoint: 80, deadband: 2 });
    expect(run(d, [[80, 0]]).runtime.state).toBe("UNACK");
    expect(
      run(d, [
        [80, 0],
        [79, 1],
      ]).runtime.state,
    ).toBe("UNACK");
    expect(
      run(d, [
        [80, 0],
        [77.9, 1],
      ]).runtime.state,
    ).toBe("RTN_UNACK");
  });

  it("applies the deadband the other way round for a lo alarm", () => {
    // The classic bug: using the same sign for both, producing a lo alarm
    // that can never clear.
    const d = def({ condition: "lo", setpoint: 20, deadband: 2 });
    expect(run(d, [[20, 0]]).runtime.state).toBe("UNACK");
    expect(
      run(d, [
        [20, 0],
        [21, 1],
      ]).runtime.state,
    ).toBe("UNACK");
    expect(
      run(d, [
        [20, 0],
        [22.1, 1],
      ]).runtime.state,
    ).toBe("RTN_UNACK");
  });

  it("does not chatter across a hundred samples sitting on the limit", () => {
    const d = def({ setpoint: 80, deadband: 2 });
    let rt = newRuntime(d.id);
    let raises = 0;
    for (let i = 0; i < 100; i++) {
      const v = 80 + (i % 2 === 0 ? 0.1 : -0.1);
      const r = stepAlarm(d, rt, v, i);
      rt = r.runtime;
      raises += r.events.filter((e) => e.kind === "raised").length;
    }
    expect(raises).toBe(1);
  });
});

describe("digital alarms", () => {
  it("trips on 1 by default", () => {
    const d = def({ condition: "digital", setpoint: undefined });
    expect(run(d, [[1, 0]]).runtime.state).toBe("UNACK");
    expect(run(d, [[0, 0]]).runtime.state).toBe("NORMAL");
  });

  it("can trip on 0, which is what a healthy NC contact going open looks like", () => {
    const d = def({ condition: "digital", trueIsAlarm: false });
    expect(run(d, [[0, 0]]).runtime.state).toBe("UNACK");
    expect(run(d, [[1, 0]]).runtime.state).toBe("NORMAL");
  });
});

describe("on-delay", () => {
  const d = def({ onDelay: 5 });

  it("does not raise while the delay is still running", () => {
    const { runtime } = run(d, [
      [85, 0],
      [85, 2000],
      [85, 4900],
    ]);
    expect(runtime.state).toBe("NORMAL");
  });

  it("raises once the condition has held long enough", () => {
    const { runtime } = run(d, [
      [85, 0],
      [85, 5000],
    ]);
    expect(runtime.state).toBe("UNACK");
  });

  it("never raises on a flicker shorter than the delay", () => {
    const { runtime } = run(d, [
      [85, 0],
      [50, 1000],
      [85, 2000],
      [50, 3000],
    ]);
    expect(runtime.state).toBe("NORMAL");
    expect(runtime.count).toBe(0);
  });

  it("restarts the delay after a flicker rather than carrying it over", () => {
    // Carrying it would let two brief excursions add up to one alarm.
    const { runtime } = run(d, [
      [85, 0],
      [50, 4000],
      [85, 4100],
      [85, 8000],
    ]);
    expect(runtime.state).toBe("NORMAL");
  });
});

describe("shelving", () => {
  it("silences an alarm until the shelf expires", () => {
    let { runtime } = run(def(), [[85, 0]]);
    runtime = shelve(runtime, 30, 1000);
    expect(runtime.state).toBe("SHELVED");
    // Still shelved 29 minutes later, even with the condition present.
    const mid = stepAlarm(def(), runtime, 85, 1000 + 29 * 60_000);
    expect(mid.runtime.state).toBe("SHELVED");
  });

  it("comes back by itself when the shelf expires", () => {
    let { runtime } = run(def(), [[85, 0]]);
    runtime = shelve(runtime, 30, 1000);
    const after = stepAlarm(def(), runtime, 85, 1000 + 31 * 60_000);
    expect(after.runtime.state).toBe("NORMAL");
    expect(after.events.map((e) => e.kind)).toContain("unshelved");
    // And re-raises on the next evaluation, because the condition still holds.
    const again = stepAlarm(def(), after.runtime, 85, 1000 + 32 * 60_000);
    expect(again.runtime.state).toBe("UNACK");
  });

  it("cannot be shelved indefinitely", () => {
    // ISA-18.2 wants shelving temporary and tracked. Forever is what
    // out-of-service is for, and that has a different audit trail.
    const rt = shelve(newRuntime("a1"), 99_999, 0);
    expect((rt.shelvedUntil ?? 0) - 0).toBeLessThanOrEqual(24 * 60 * 60_000);
  });

  it("unshelves on demand", () => {
    const rt = unshelve(shelve(newRuntime("a1"), 30, 0));
    expect(rt.state).toBe("NORMAL");
    expect(rt.shelvedUntil).toBeUndefined();
  });
});

describe("out of service and suppression", () => {
  it("ignores the process entirely while out of service", () => {
    const rt = setOutOfService(newRuntime("a1"), true);
    const after = stepAlarm(def(), rt, 999, 1000);
    expect(after.runtime.state).toBe("OUT_OF_SERVICE");
    expect(after.events).toEqual([]);
  });

  it("returns to normal when put back in service", () => {
    const rt = setOutOfService(setOutOfService(newRuntime("a1"), true), false);
    expect(rt.state).toBe("NORMAL");
  });

  it("a disabled definition raises nothing", () => {
    const { runtime } = run(def({ enabled: false }), [[999, 0]]);
    expect(runtime.state).toBe("NORMAL");
  });
});

describe("conditionMet", () => {
  it("hihi and lolo behave as hi and lo against their own setpoints", () => {
    expect(conditionMet(def({ condition: "hihi", setpoint: 95 }), 96, false)).toBe(true);
    expect(conditionMet(def({ condition: "lolo", setpoint: 5 }), 4, false)).toBe(true);
  });

  it("deviation works on magnitude, so either direction trips", () => {
    const d = def({ condition: "deviation", setpoint: 3 });
    expect(conditionMet(d, 4, false)).toBe(true);
    expect(conditionMet(d, -4, false)).toBe(true);
    expect(conditionMet(d, 1, false)).toBe(false);
  });
});

describe("the summary order", () => {
  it("puts what has not been seen above everything, then priority, then newest", () => {
    const rows = [
      {
        def: def({ id: "b", priority: "critical" }),
        runtime: { ...newRuntime("b"), state: "ACK" as const, raisedAt: 5 },
      },
      {
        def: def({ id: "a", priority: "low" }),
        runtime: { ...newRuntime("a"), state: "UNACK" as const, raisedAt: 1 },
      },
      {
        def: def({ id: "c", priority: "critical" }),
        runtime: { ...newRuntime("c"), state: "UNACK" as const, raisedAt: 2 },
      },
    ];
    expect(sortForSummary(rows).map((r) => r.def.id)).toEqual(["c", "a", "b"]);
  });
});
