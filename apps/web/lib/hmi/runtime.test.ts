import type { Tag } from "@ladx/studio";
import { describe, expect, it } from "vitest";
import {
  TrendBuffer,
  buildTagSpace,
  capacityFor,
  makeContext,
  readMember,
  resolve,
  resolveBool,
  resolveNumber,
  valueOfPlcTag,
  writeTag,
} from "./runtime";

const plc: Tag[] = [
  { name: "Level", type: "INT", value: 62 },
  { name: "Motor_Run", type: "BOOL", value: 1 },
  { name: "Bake", type: "TIMER", value: 0, acc: 4200, preset: 10_000, dn: false, tt: true },
  { name: "Done", type: "TIMER", value: 0, acc: 10_000, preset: 10_000, dn: true },
];
const hmi = [{ name: "Setpoint", type: "INT" as const, value: 75 }];
const space = buildTagSpace(plc, hmi);
const ctx = makeContext(space, plc);

describe("what a screen sees of a tag", () => {
  it("reads a plain value", () => expect(valueOfPlcTag(plc[0] as Tag)).toBe(62));

  it("reads a timer as its done bit, not its raw value field", () => {
    // A lamp bound to a timer should light when it times out. The raw value
    // field of a TIMER is not that, and binding to it shows nothing useful.
    expect(valueOfPlcTag(plc[2] as Tag)).toBe(0);
    expect(valueOfPlcTag(plc[3] as Tag)).toBe(1);
  });

  it("reaches the dotted members a timer is actually used through", () => {
    expect(readMember(plc, "Bake.ACC")).toBe(4200);
    expect(readMember(plc, "Bake.PRE")).toBe(10_000);
    expect(readMember(plc, "Bake.TT")).toBe(1);
    expect(readMember(plc, "Bake.DN")).toBe(0);
  });

  it("is undefined for a member that does not exist", () => {
    expect(readMember(plc, "Bake.NOPE")).toBeUndefined();
    expect(readMember(plc, "Missing.DN")).toBeUndefined();
    expect(readMember(plc, "Level")).toBeUndefined();
  });
});

describe("the two tag spaces stay separate", () => {
  it("finds a PLC tag and an HMI tag in their own spaces", () => {
    expect(ctx.tag("plc", "Level")).toBe(62);
    expect(ctx.tag("hmi", "Setpoint")).toBe(75);
  });

  it("does not find an HMI tag when asked for a PLC one", () => {
    // The point of keeping them apart: a local tag must not shadow a
    // controller tag of the same name.
    expect(ctx.tag("plc", "Setpoint")).toBeUndefined();
    expect(ctx.tag("hmi", "Level")).toBeUndefined();
  });

  it("prefers the controller when the binding is unqualified", () => {
    const shadowed = makeContext(
      buildTagSpace(plc, [{ name: "Level", type: "INT", value: 999 }]),
      plc,
    );
    expect(shadowed.tag("auto", "Level")).toBe(62);
  });
});

describe("bindings", () => {
  it("reads a constant", () => {
    expect(resolve({ kind: "const", value: 7 }, ctx).value).toBe(7);
  });

  it("reads a tag", () => {
    expect(resolve({ kind: "plc", tag: "Level" }, ctx).value).toBe(62);
  });

  it("names a missing tag rather than reading zero", () => {
    // Silently zero is how a screen shows a stopped pump as running.
    const r = resolve({ kind: "plc", tag: "Ghost" }, ctx);
    expect(r.value).toBeNull();
    expect(r.error).toContain("Ghost");
  });

  it("evaluates an expression across both spaces", () => {
    expect(resolve({ kind: "expr", source: "{Level} > {hmi:Setpoint}" }, ctx).value).toBe(false);
  });

  it("is null and quiet with no binding at all", () => {
    expect(resolve(undefined, ctx)).toEqual({ value: null, error: null });
  });

  it("coerces for a numeric and for a lamp", () => {
    expect(resolveNumber({ kind: "plc", tag: "Level" }, ctx)).toBe(62);
    expect(resolveBool({ kind: "plc", tag: "Motor_Run" }, ctx)).toBe(true);
    expect(resolveBool({ kind: "expr", source: "{Level} > 90" }, ctx)).toBe(false);
  });

  it("gives a numeric null rather than NaN when the binding is broken", () => {
    expect(resolveNumber({ kind: "plc", tag: "Ghost" }, ctx)).toBeNull();
  });
});

describe("writes", () => {
  it("writes an HMI tag without touching the PLC map", () => {
    const r = writeTag(space, { source: "hmi", tag: "Setpoint" }, 80);
    expect(r.error).toBeNull();
    expect(r.space.hmi.get("Setpoint")).toBe(80);
    expect(r.space.plc).toBe(space.plc);
  });

  it("refuses a tag that does not exist instead of creating one", () => {
    // A typo in a button should be visible, not silently make a tag nobody
    // else reads.
    const r = writeTag(space, { source: "plc", tag: "Typpo" }, 1);
    expect(r.error).toContain("Typpo");
    expect(r.space).toBe(space);
  });

  it("does not mutate the space it was given", () => {
    const before = space.hmi.get("Setpoint");
    writeTag(space, { source: "hmi", tag: "Setpoint" }, 123);
    expect(space.hmi.get("Setpoint")).toBe(before);
  });
});

describe("the trend ring", () => {
  it("keeps samples oldest first", () => {
    const b = new TrendBuffer(5);
    for (let i = 0; i < 3; i++) b.push({ t: i, v: [i] });
    expect(b.toArray().map((s) => s.t)).toEqual([0, 1, 2]);
  });

  it("drops the oldest once it is full rather than growing", () => {
    // A trend open all shift must not grow without bound.
    const b = new TrendBuffer(3);
    for (let i = 0; i < 10; i++) b.push({ t: i, v: [i] });
    expect(b.length).toBe(3);
    expect(b.toArray().map((s) => s.t)).toEqual([7, 8, 9]);
  });

  it("stays ordered across many wraps", () => {
    const b = new TrendBuffer(4);
    for (let i = 0; i < 1000; i++) b.push({ t: i, v: [i] });
    const ts = b.toArray().map((s) => s.t);
    expect(ts).toEqual([996, 997, 998, 999]);
    expect([...ts].sort((a, z) => a - z)).toEqual(ts);
  });

  it("clears", () => {
    const b = new TrendBuffer(3);
    b.push({ t: 1, v: [1] });
    b.clear();
    expect(b.toArray()).toEqual([]);
  });

  it("survives a capacity of zero rather than dividing by it", () => {
    const b = new TrendBuffer(0);
    b.push({ t: 1, v: [1] });
    expect(b.length).toBe(1);
  });
});

describe("capacityFor", () => {
  it("sizes a ten minute trend at one second", () => {
    expect(capacityFor(600, 1000)).toBe(600);
  });

  it("caps a silly configuration rather than exhausting memory", () => {
    expect(capacityFor(86_400, 1)).toBeLessThanOrEqual(20_000);
  });

  it("never returns less than two, because a line needs two points", () => {
    expect(capacityFor(0, 100_000)).toBe(2);
  });
});
