/**
 * What the generator must never let through.
 *
 * Almost every test here is about a screen that would look fine and be wrong:
 * a widget bound to a tag that does not exist draws perfectly and reads
 * nothing, a stop button with the sense inverted starts the machine, a
 * momentary button with no release latches it on. Those are the failures worth
 * writing tests for, so they are most of what is below.
 */

import type { Tag } from "@ladx/studio";
import { describe, expect, it } from "vitest";
import { type GenContext, draftScreen, firstJsonObject, normaliseScreen } from "./generate";
import type { Widget } from "./types";

const tags: Tag[] = [
  { name: "Start", type: "BOOL", value: 0, isInput: true, device: "PUSHBUTTON_NO" },
  { name: "Stop", type: "BOOL", value: 1, isInput: true, device: "PUSHBUTTON_NC" },
  { name: "Motor", type: "BOOL", value: 0, isOutput: true, device: "MOTOR" },
  { name: "Level", type: "INT", value: 42, comment: "Tank level" },
  { name: "T1", type: "TIMER", value: 0, preset: 5000 },
  { name: "C1", type: "COUNTER", value: 0, preset: 10 },
];

function ctx(over: Partial<GenContext> = {}): GenContext {
  return {
    plcTags: tags,
    hmiTags: [],
    size: { width: 800, height: 480 },
    existing: [],
    screenSlugs: ["overview", "alarms"],
    alarms: [],
    mode: "replace",
    ...over,
  };
}

const box = (o: Record<string, unknown>) => ({
  widgets: [{ kind: "rect", x: 0, y: 0, w: 50, h: 50, ...o }],
});

describe("firstJsonObject", () => {
  it("reads an object out of a code fence", () => {
    expect(firstJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("reads an object after a sentence", () => {
    expect(firstJsonObject('Sure, here is the screen:\n{"a":1}')).toEqual({ a: 1 });
  });

  it("is not fooled by a brace inside a caption", () => {
    expect(firstJsonObject('{"text":"a } brace","b":2}')).toEqual({ text: "a } brace", b: 2 });
  });

  it("is not fooled by an escaped quote before a brace", () => {
    expect(firstJsonObject('{"text":"say \\" then }","b":2}')).toEqual({
      text: 'say " then }',
      b: 2,
    });
  });

  it("returns null rather than throwing on rubbish", () => {
    expect(firstJsonObject("no json here")).toBeNull();
    expect(firstJsonObject('{"unclosed": ')).toBeNull();
  });
});

describe("bindings are checked against the real tag table", () => {
  it("drops a binding to a tag that does not exist, and says so", () => {
    const out = normaliseScreen(
      box({ kind: "lamp", name: "Pump", value: { plc: "PumpRun" } }),
      ctx(),
    );
    expect(out.widgets).toHaveLength(1);
    expect(out.widgets[0]?.value).toBeUndefined();
    expect(out.problems.join(" ")).toContain("PumpRun");
  });

  it("repairs a name that differs only by case or underscores", () => {
    const out = normaliseScreen(box({ kind: "lamp", value: { plc: "motor" } }), ctx());
    expect(out.widgets[0]?.value).toEqual({ kind: "plc", tag: "Motor" });
    expect(out.problems.join(" ")).toContain("Motor");
  });

  it("prefers an exact match over a folded one", () => {
    const both: Tag[] = [
      { name: "Level", type: "INT", value: 1 },
      { name: "level", type: "INT", value: 2 },
    ];
    const out = normaliseScreen(
      box({ kind: "numeric", value: { plc: "level" } }),
      ctx({ plcTags: both }),
    );
    expect(out.widgets[0]?.value).toEqual({ kind: "plc", tag: "level" });
  });

  it("refuses to guess when two tags fold to the same name", () => {
    const both: Tag[] = [
      { name: "Motor_1", type: "BOOL", value: 0 },
      { name: "motor1", type: "BOOL", value: 0 },
    ];
    const out = normaliseScreen(
      box({ kind: "lamp", value: { plc: "MOTOR1" } }),
      ctx({ plcTags: both }),
    );
    expect(out.widgets[0]?.value).toBeUndefined();
  });

  it("allows a timer member and resolves its case", () => {
    const out = normaliseScreen(box({ kind: "lamp", value: { plc: "t1.dn" } }), ctx());
    expect(out.widgets[0]?.value).toEqual({ kind: "plc", tag: "T1.DN" });
  });

  it("rejects a member on a tag that has none", () => {
    const out = normaliseScreen(box({ kind: "lamp", value: { plc: "Motor.DN" } }), ctx());
    expect(out.widgets[0]?.value).toBeUndefined();
  });

  it("rejects a member nothing publishes", () => {
    const out = normaliseScreen(box({ kind: "numeric", value: { plc: "T1.ELAPSED" } }), ctx());
    expect(out.widgets[0]?.value).toBeUndefined();
  });

  it("accepts an expression that parses", () => {
    const good = normaliseScreen(
      box({ animations: [{ when: { expr: "{plc:Level} > 80" }, fill: "#f00" }] }),
      ctx(),
    );
    expect(good.widgets[0]?.animations).toHaveLength(1);
    expect(good.widgets[0]?.animations?.[0]?.when).toEqual({
      kind: "expr",
      source: "{plc:Level} > 80",
    });
  });

  it("rejects an expression that does not parse", () => {
    const bad = normaliseScreen(
      box({ animations: [{ when: { expr: "{Level} >>> " }, fill: "#f00" }] }),
      ctx(),
    );
    expect(bad.widgets[0]?.animations).toBeUndefined();
    expect(bad.problems.join(" ")).toContain("expression");
  });

  it("rejects an expression naming a tag that does not exist", () => {
    const out = normaliseScreen(
      box({ animations: [{ when: { expr: "{plc:Ghost} > 1" }, fill: "#f00" }] }),
      ctx(),
    );
    expect(out.widgets[0]?.animations).toBeUndefined();
    expect(out.problems.join(" ")).toContain("Ghost");
  });

  it("repairs a nearly-right tag name inside an expression", () => {
    const out = normaliseScreen(
      box({ animations: [{ when: { expr: "{plc:level} > 80 && {motor}" }, fill: "#f00" }] }),
      ctx(),
    );
    expect(out.widgets[0]?.animations?.[0]?.when).toEqual({
      kind: "expr",
      source: "{plc:Level} > 80 && {Motor}",
    });
  });

  it("leaves a brace inside a string literal alone", () => {
    const out = normaliseScreen(
      box({ animations: [{ when: { expr: '{Level} > 80 ? "a{b" : "c"' }, fill: "#f00" }] }),
      ctx(),
    );
    expect(out.widgets[0]?.animations?.[0]?.when).toEqual({
      kind: "expr",
      source: '{Level} > 80 ? "a{b" : "c"',
    });
  });
});

describe("geometry", () => {
  it("clamps a widget that runs off the right edge back on to the glass", () => {
    const out = normaliseScreen(box({ x: 700, y: 10, w: 400, h: 40 }), ctx());
    const r = out.widgets[0]?.rect ?? { x: 0, w: 0 };
    expect(r.x + r.w).toBeLessThanOrEqual(800);
  });

  it("clamps a negative origin", () => {
    const out = normaliseScreen(box({ x: -40, y: -10 }), ctx());
    expect(out.widgets[0]?.rect.x).toBe(0);
    expect(out.widgets[0]?.rect.y).toBe(0);
  });

  it("gives a zero-sized object a size rather than an invisible one", () => {
    const out = normaliseScreen(box({ w: 0, h: 0 }), ctx());
    expect(out.widgets[0]?.rect.w).toBeGreaterThan(0);
    expect(out.widgets[0]?.rect.h).toBeGreaterThan(0);
  });

  it("accepts a nested rect as well as flat fields", () => {
    const out = normaliseScreen(
      { widgets: [{ kind: "rect", rect: { x: 20, y: 30, w: 40, h: 50 } }] },
      ctx(),
    );
    expect(out.widgets[0]?.rect).toEqual({ x: 20, y: 30, w: 40, h: 50 });
  });
});

describe("ids and layering", () => {
  it("mints its own ids and ignores the model's", () => {
    const out = normaliseScreen(
      {
        widgets: [
          { id: "same", kind: "rect" },
          { id: "same", kind: "rect" },
        ],
      },
      ctx(),
    );
    expect(out.widgets[0]?.id).not.toBe("same");
    expect(out.widgets[0]?.id).not.toBe(out.widgets[1]?.id);
  });

  it("stacks new objects above what is already on the screen", () => {
    const existing: Widget[] = [
      { id: "a", kind: "rect", rect: { x: 0, y: 0, w: 10, h: 10 }, z: 7 },
    ];
    const out = normaliseScreen(box({ y: 300 }), ctx({ mode: "extend", existing }));
    expect(out.widgets[0]?.z).toBeGreaterThan(7);
  });
});

describe("kinds and symbols", () => {
  it("drops an object of a kind that does not exist", () => {
    const out = normaliseScreen({ widgets: [{ kind: "hologram" }, { kind: "rect" }] }, ctx());
    expect(out.widgets).toHaveLength(1);
    expect(out.problems.join(" ")).toContain("hologram");
  });

  it("keeps a real symbol", () => {
    const out = normaliseScreen(box({ kind: "symbol", symbol: "pump" }), ctx());
    expect(out.widgets[0]?.kind).toBe("symbol");
    expect(out.widgets[0]?.symbol).toBe("pump");
  });

  it("falls back to a box when the symbol does not exist", () => {
    const out = normaliseScreen(box({ kind: "symbol", symbol: "flux-capacitor" }), ctx());
    expect(out.widgets[0]?.kind).toBe("rect");
    expect(out.problems.join(" ")).toContain("flux-capacitor");
  });
});

describe("actions", () => {
  it("drops navigation to a screen that does not exist", () => {
    const out = normaliseScreen(
      box({ kind: "button", onPress: [{ kind: "goToScreen", slug: "nowhere" }] }),
      ctx(),
    );
    expect(out.widgets[0]?.onPress).toBeUndefined();
    expect(out.problems.join(" ")).toContain("nowhere");
  });

  it("keeps navigation to a screen that does", () => {
    const out = normaliseScreen(
      box({ kind: "button", onPress: [{ kind: "goToScreen", slug: "alarms" }] }),
      ctx(),
    );
    expect(out.widgets[0]?.onPress).toEqual([{ kind: "goToScreen", slug: "alarms" }]);
  });

  it("refuses to write to a timer member", () => {
    const out = normaliseScreen(
      box({ kind: "button", onPress: [{ kind: "setTag", source: "plc", tag: "T1.DN", value: 1 }] }),
      ctx(),
    );
    expect(out.widgets[0]?.onPress).toBeUndefined();
    expect(out.problems.join(" ")).toContain("read only");
  });

  it("finds a tag the model put in the wrong table", () => {
    const out = normaliseScreen(
      {
        hmiTags: [{ name: "Setpoint", type: "INT", value: 0 }],
        widgets: [
          {
            kind: "button",
            onPress: [{ kind: "setTag", source: "plc", tag: "Setpoint", value: 10 }],
          },
        ],
      },
      ctx(),
    );
    expect(out.widgets[0]?.onPress).toEqual([
      {
        kind: "setTag",
        target: { source: "hmi", tag: "Setpoint" },
        value: { kind: "const", value: 10 },
      },
    ]);
  });
});

describe("the button checks, which are the safety ones", () => {
  it("flags a stop button written the wrong way round", () => {
    const out = normaliseScreen(
      box({
        kind: "button",
        name: "Stop",
        onPress: [{ kind: "setTag", source: "plc", tag: "Stop", value: 1 }],
        onRelease: [{ kind: "setTag", source: "plc", tag: "Stop", value: 0 }],
      }),
      ctx(),
    );
    expect(out.problems.join(" ")).toContain("normally closed");
  });

  it("does not flag a stop button written correctly", () => {
    const out = normaliseScreen(
      box({
        kind: "button",
        name: "Stop",
        onPress: [{ kind: "setTag", source: "plc", tag: "Stop", value: 0 }],
        onRelease: [{ kind: "setTag", source: "plc", tag: "Stop", value: 1 }],
      }),
      ctx(),
    );
    expect(out.problems.join(" ")).not.toContain("normally closed");
  });

  it("flags a momentary button that never writes back", () => {
    const out = normaliseScreen(
      box({
        kind: "button",
        name: "Start",
        onPress: [{ kind: "setTag", source: "plc", tag: "Start", value: 1 }],
      }),
      ctx(),
    );
    expect(out.problems.join(" ")).toContain("latches");
  });
});

describe("tags the screen declares", () => {
  it("keeps a usable tag and lets a widget bind to it", () => {
    const out = normaliseScreen(
      {
        hmiTags: [{ name: "Setpoint", type: "INT", value: 50 }],
        widgets: [{ kind: "numeric", value: { hmi: "Setpoint" } }],
      },
      ctx(),
    );
    expect(out.hmiTags).toHaveLength(1);
    expect(out.widgets[0]?.value).toEqual({ kind: "hmi", tag: "Setpoint" });
  });

  it("drops a name an expression could not reference", () => {
    const out = normaliseScreen(
      { hmiTags: [{ name: "2 bad name", type: "INT" }], widgets: [] },
      ctx(),
    );
    expect(out.hmiTags).toHaveLength(0);
  });

  it("refuses to shadow a controller tag", () => {
    const out = normaliseScreen({ hmiTags: [{ name: "Motor", type: "BOOL" }], widgets: [] }, ctx());
    expect(out.hmiTags).toHaveLength(0);
    expect(out.problems.join(" ")).toContain("Motor");
  });
});

describe("alarms", () => {
  it("builds one on a real tag", () => {
    const out = normaliseScreen(
      {
        widgets: [],
        alarms: [
          {
            source: "plc",
            tag: "Level",
            condition: "hi",
            setpoint: 80,
            deadband: 2,
            priority: "high",
            message: "Level high",
          },
        ],
      },
      ctx(),
    );
    expect(out.alarms).toHaveLength(1);
    expect(out.alarms[0]).toMatchObject({
      condition: "hi",
      setpoint: 80,
      deadband: 2,
      priority: "high",
    });
  });

  it("drops one on a tag that does not exist", () => {
    const out = normaliseScreen(
      {
        widgets: [],
        alarms: [{ source: "plc", tag: "Ghost", condition: "hi", setpoint: 1, message: "x" }],
      },
      ctx(),
    );
    expect(out.alarms).toHaveLength(0);
  });

  it("does not repeat an alarm the document already has", () => {
    const existing = [
      {
        id: "a1",
        target: { source: "plc" as const, tag: "Level" },
        condition: "hi" as const,
        priority: "high" as const,
        message: "Level high",
        enabled: true,
      },
    ];
    const out = normaliseScreen(
      {
        widgets: [],
        alarms: [{ source: "plc", tag: "Level", condition: "hi", setpoint: 80, message: "again" }],
      },
      ctx({ alarms: existing }),
    );
    expect(out.alarms).toHaveLength(0);
  });

  it("falls back to a real priority when given one that is not", () => {
    const out = normaliseScreen(
      {
        widgets: [],
        alarms: [
          { source: "plc", tag: "Motor", condition: "digital", priority: "URGENT!!", message: "x" },
        ],
      },
      ctx(),
    );
    expect(out.alarms[0]?.priority).toBe("medium");
  });
});

describe("extending a screen that already has objects", () => {
  const existing: Widget[] = [{ id: "a", kind: "rect", rect: { x: 0, y: 0, w: 200, h: 100 } }];

  it("shifts the whole new set clear rather than landing on top", () => {
    const out = normaliseScreen(
      {
        widgets: [
          { kind: "rect", x: 10, y: 10, w: 60, h: 40 },
          { kind: "rect", x: 80, y: 10, w: 60, h: 40 },
        ],
      },
      ctx({ mode: "extend", existing }),
    );
    expect(out.widgets.every((w) => w.rect.y >= 100)).toBe(true);
    // The shift is uniform, so the layout the model designed survives it.
    const [a, b] = out.widgets;
    expect((b?.rect.y ?? 0) - (a?.rect.y ?? 0)).toBe(0);
    expect((b?.rect.x ?? 0) - (a?.rect.x ?? 0)).toBe(70);
  });

  it("leaves a set that already sits clear exactly where it is", () => {
    const out = normaliseScreen(
      { widgets: [{ kind: "rect", x: 10, y: 300, w: 60, h: 40 }] },
      ctx({ mode: "extend", existing }),
    );
    expect(out.widgets[0]?.rect.y).toBe(300);
  });

  it("says so when there is no room below", () => {
    const full: Widget[] = [{ id: "a", kind: "rect", rect: { x: 0, y: 0, w: 800, h: 470 } }];
    const out = normaliseScreen(
      { widgets: [{ kind: "rect", x: 10, y: 10, w: 60, h: 40 }] },
      ctx({ mode: "extend", existing: full }),
    );
    expect(out.problems.join(" ")).toContain("no room");
  });
});

describe("it never throws", () => {
  const rubbish: unknown[] = [
    null,
    undefined,
    42,
    "a string",
    [],
    {},
    { widgets: "not an array" },
    { widgets: [null, 7, "x", { kind: null }] },
    { widgets: [{ kind: "rect", x: Number.NaN, y: Number.POSITIVE_INFINITY, w: "wide" }] },
    { hmiTags: "no", alarms: 3, widgets: [] },
  ];

  for (const [i, r] of rubbish.entries()) {
    it(`survives rubbish ${i}`, () => {
      const out = normaliseScreen(r, ctx());
      expect(Array.isArray(out.widgets)).toBe(true);
      expect(Array.isArray(out.problems)).toBe(true);
    });
  }
});

describe("draftScreen, the version with no model in it", () => {
  const out = draftScreen(ctx());

  it("draws something for every tag in the program", () => {
    expect(out.widgets.length).toBeGreaterThan(tags.length);
  });

  it("binds only to tags that exist", () => {
    const known = new Set(tags.map((t) => t.name));
    for (const w of out.widgets) {
      for (const b of [w.value, ...(w.animations ?? []).map((a) => a.when)]) {
        if (b?.kind === "plc") expect(known.has(b.tag.split(".")[0] ?? "")).toBe(true);
      }
    }
  });

  it("gives a normally closed stop button the right sense", () => {
    const stop = out.widgets.find(
      (w) =>
        w.kind === "button" &&
        w.onPress?.[0]?.kind === "setTag" &&
        w.onPress?.[0]?.target.tag === "Stop",
    );
    expect(stop).toBeTruthy();
    const press = stop?.onPress?.[0];
    const release = stop?.onRelease?.[0];
    expect(press?.kind === "setTag" && press.value).toEqual({ kind: "const", value: 0 });
    expect(release?.kind === "setTag" && release.value).toEqual({ kind: "const", value: 1 });
  });

  it("gives a normally open start button the other sense", () => {
    const start = out.widgets.find(
      (w) =>
        w.kind === "button" &&
        w.onPress?.[0]?.kind === "setTag" &&
        w.onPress?.[0]?.target.tag === "Start",
    );
    const press = start?.onPress?.[0];
    expect(press?.kind === "setTag" && press.value).toEqual({ kind: "const", value: 1 });
    expect(start?.onRelease).toBeTruthy();
  });

  it("scales a timer bar to that timer's own preset", () => {
    const bar = out.widgets.find((w) => w.kind === "bar");
    expect(bar?.max).toBe(5000);
    expect(bar?.value).toEqual({ kind: "plc", tag: "T1.ACC" });
  });

  it("reads a counter through its accumulator, not the tag", () => {
    const values = out.widgets.filter((w) => w.kind === "numeric").map((w) => w.value);
    expect(values).toContainEqual({ kind: "plc", tag: "C1.ACC" });
  });

  it("keeps everything on the glass", () => {
    for (const w of out.widgets) {
      expect(w.rect.x).toBeGreaterThanOrEqual(0);
      expect(w.rect.y).toBeGreaterThanOrEqual(0);
      expect(w.rect.x + w.rect.w).toBeLessThanOrEqual(800);
      expect(w.rect.y + w.rect.h).toBeLessThanOrEqual(480);
    }
  });

  it("gives every object a unique id", () => {
    const ids = new Set(out.widgets.map((w) => w.id));
    expect(ids.size).toBe(out.widgets.length);
  });

  it("says there is nothing to draw rather than drawing nothing", () => {
    const empty = draftScreen(ctx({ plcTags: [] }));
    expect(empty.problems.join(" ")).toContain("no tags");
  });

  it("labels a bare tag name with the table it came from", () => {
    const withHmi = normaliseScreen(
      {
        hmiTags: [{ name: "Setpoint", type: "INT", value: 0 }],
        widgets: [
          { kind: "numeric", name: "a", value: "Setpoint" },
          { kind: "lamp", name: "b", value: "Motor" },
          { kind: "text", name: "c", value: "Just a caption" },
        ],
      },
      ctx(),
    );
    expect(withHmi.widgets[0]?.value).toEqual({ kind: "hmi", tag: "Setpoint" });
    expect(withHmi.widgets[1]?.value).toEqual({ kind: "plc", tag: "Motor" });
    expect(withHmi.widgets[2]?.value).toEqual({ kind: "const", value: "Just a caption" });
  });

  it("leaves off what will not fit rather than drawing it over column one", () => {
    // Forty tags on a 480x272 panel cannot all be shown. Wrapping would put
    // the last rows on top of the first, which reads as a working screen.
    const many: Tag[] = Array.from({ length: 40 }, (_, i) => ({
      name: `Valve${i}`,
      type: "BOOL" as const,
      value: 0,
      isOutput: true,
    }));
    const out = draftScreen(ctx({ plcTags: many, size: { width: 480, height: 272 } }));

    const boxes = out.widgets.filter((w) => w.kind === "lamp");
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const over =
          a.rect.x < b.rect.x + b.rect.w &&
          b.rect.x < a.rect.x + a.rect.w &&
          a.rect.y < b.rect.y + b.rect.h &&
          b.rect.y < a.rect.y + a.rect.h;
        expect(over).toBe(false);
      }
    }
    expect(out.problems.join(" ")).toContain("did not fit");
  });

  it("fits a small panel by using more columns, not by overflowing", () => {
    const small = draftScreen(ctx({ size: { width: 480, height: 272 } }));
    for (const w of small.widgets) {
      expect(w.rect.x + w.rect.w).toBeLessThanOrEqual(480);
      expect(w.rect.y + w.rect.h).toBeLessThanOrEqual(272);
    }
  });
});
