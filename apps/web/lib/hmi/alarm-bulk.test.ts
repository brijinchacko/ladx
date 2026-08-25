import type { Tag } from "@ladx/studio";
import { describe, expect, it } from "vitest";
import { buildBulkAlarms, conditionsForTag, messageFor } from "./alarm-bulk";
import type { AlarmDef } from "./types";

const analog = (name: string, comment?: string): Tag => ({ name, type: "INT", value: 0, comment });
const digital = (name: string): Tag => ({ name, type: "BOOL", value: 0 });

describe("which conditions a tag can take", () => {
  it("gives a BOOL only a digital alarm", () => {
    expect(conditionsForTag(digital("Fault"))).toEqual(["digital"]);
  });

  it("gives an analogue the limit conditions", () => {
    expect(conditionsForTag(analog("Level"))).toContain("hi");
    expect(conditionsForTag(analog("Level"))).not.toContain("digital");
  });
});

describe("building in bulk", () => {
  it("makes one alarm per condition per tag", () => {
    const { alarms } = buildBulkAlarms([analog("A"), analog("B")], { conditions: ["hi", "lo"] });
    expect(alarms).toHaveLength(4);
  });

  it("places limits as a percent of span, so one setting fits every range", () => {
    const { alarms } = buildBulkAlarms([analog("T")], {
      conditions: ["hi", "lo"],
      rangeMin: 0,
      rangeMax: 200,
      hiPercent: 80,
      loPercent: 20,
    });
    expect(alarms.find((a) => a.condition === "hi")?.setpoint).toBe(160);
    expect(alarms.find((a) => a.condition === "lo")?.setpoint).toBe(40);
  });

  it("handles a range that does not start at zero", () => {
    const { alarms } = buildBulkAlarms([analog("T")], {
      conditions: ["hi"],
      rangeMin: -50,
      rangeMax: 50,
      hiPercent: 75,
    });
    expect(alarms[0]?.setpoint).toBe(25);
  });

  it("gives a deadband rather than zero, which would chatter", () => {
    const { alarms } = buildBulkAlarms([analog("T")], {
      conditions: ["hi"],
      rangeMax: 100,
      deadbandPercent: 2,
    });
    expect(alarms[0]?.deadband).toBe(2);
  });

  it("escalates the outer limits above the inner ones", () => {
    // EEMUA 191: a flood of same-priority alarms is worse than none. A hi-hi
    // must outrank a hi or the operator cannot tell which to act on.
    const { alarms } = buildBulkAlarms([analog("T")], {
      conditions: ["hi", "hihi"],
      priority: "medium",
      escalateOuter: true,
    });
    expect(alarms.find((a) => a.condition === "hi")?.priority).toBe("medium");
    expect(alarms.find((a) => a.condition === "hihi")?.priority).toBe("high");
  });

  it("does not escalate past critical", () => {
    const { alarms } = buildBulkAlarms([analog("T")], {
      conditions: ["hihi"],
      priority: "critical",
      escalateOuter: true,
    });
    expect(alarms[0]?.priority).toBe("critical");
  });

  it("leaves priorities alone when escalation is off", () => {
    const { alarms } = buildBulkAlarms([analog("T")], {
      conditions: ["hi", "hihi"],
      priority: "low",
      escalateOuter: false,
    });
    expect(alarms.every((a) => a.priority === "low")).toBe(true);
  });

  it("makes a digital alarm for a BOOL and skips the limit conditions", () => {
    const { alarms } = buildBulkAlarms([digital("Fault")], { conditions: ["digital", "hi"] });
    expect(alarms).toHaveLength(1);
    expect(alarms[0]?.condition).toBe("digital");
    expect(alarms[0]?.setpoint).toBeUndefined();
  });

  it("carries which polarity is the alarm on a digital", () => {
    const { alarms } = buildBulkAlarms([digital("Healthy")], {
      conditions: ["digital"],
      trueIsAlarm: false,
    });
    expect(alarms[0]?.trueIsAlarm).toBe(false);
  });
});

describe("what it refuses, and says so", () => {
  it("skips a BOOL when only analogue conditions were asked for", () => {
    const { alarms, skipped } = buildBulkAlarms([digital("Fault")], { conditions: ["hi"] });
    expect(alarms).toHaveLength(0);
    expect(skipped[0]?.reason).toContain("BOOL");
  });

  it("skips a tag that already has that alarm rather than duplicating it", () => {
    const existing: AlarmDef[] = [
      {
        id: "x",
        target: { source: "plc", tag: "T" },
        condition: "hi",
        priority: "high",
        message: "T high",
        enabled: true,
      },
    ];
    const { alarms, skipped } = buildBulkAlarms(
      [analog("T")],
      { conditions: ["hi", "lo"] },
      existing,
    );
    expect(alarms.map((a) => a.condition)).toEqual(["lo"]);
    expect(skipped[0]?.reason).toContain("already has");
  });

  it("can be told to duplicate anyway", () => {
    const existing: AlarmDef[] = [
      {
        id: "x",
        target: { source: "plc", tag: "T" },
        condition: "hi",
        priority: "high",
        message: "T high",
        enabled: true,
      },
    ];
    const { alarms } = buildBulkAlarms(
      [analog("T")],
      { conditions: ["hi"], skipExisting: false },
      existing,
    );
    expect(alarms).toHaveLength(1);
  });

  it("reports every skip, so a run is never silently partial", () => {
    const { skipped } = buildBulkAlarms([digital("A"), digital("B")], { conditions: ["hi"] });
    expect(skipped).toHaveLength(2);
  });
});

describe("messages", () => {
  it("uses the tag comment when it has one", () => {
    // "Bearing temperature high" beats "TT_104_PV high" at three in the morning.
    expect(messageFor(analog("TT_104_PV", "Bearing temperature"), "hi")).toBe(
      "Bearing temperature high",
    );
  });

  it("falls back to the tag name with underscores opened out", () => {
    expect(messageFor(analog("Tank_Level"), "lolo")).toBe("Tank Level low low");
  });
});

describe("ids", () => {
  it("are stable, so a preview matches what gets committed", () => {
    const a = buildBulkAlarms([analog("T")], { conditions: ["hi"] }).alarms[0]?.id;
    const b = buildBulkAlarms([analog("T")], { conditions: ["hi"] }).alarms[0]?.id;
    expect(a).toBe(b);
  });

  it("are unique across a run", () => {
    const { alarms } = buildBulkAlarms([analog("A"), analog("B"), analog("C")], {
      conditions: ["hi", "hihi", "lo", "lolo"],
    });
    expect(new Set(alarms.map((a) => a.id)).size).toBe(alarms.length);
  });
});
