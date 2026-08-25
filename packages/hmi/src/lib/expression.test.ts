import { describe, expect, it } from "vitest";
import { type EvalContext, evaluate, referencedTags } from "./expression";

const tags: Record<string, number> = { Level: 62, Motor_Run: 1, Fault: 0, Setpoint: 75, Neg: -4 };
const ctx: EvalContext = { tag: (_s, name) => tags[name] };

const val = (src: string) => evaluate(src, ctx).value;
const err = (src: string) => evaluate(src, ctx).error;

describe("values and tags", () => {
  it("reads a tag", () => expect(val("{Level}")).toBe(62));
  it("reads a source-qualified tag", () => expect(val("{plc:Level}")).toBe(62));
  it("does arithmetic", () => expect(val("{Level} + 8")).toBe(70));
  it("respects precedence", () => expect(val("2 + 3 * 4")).toBe(14));
  it("respects brackets", () => expect(val("(2 + 3) * 4")).toBe(20));
  it("negates", () => expect(val("-{Level}")).toBe(-62));
  it("knows true and false", () => expect(val("true")).toBe(true));
});

describe("comparison and logic", () => {
  it("compares", () => expect(val("{Level} > 50")).toBe(true));
  it("ands", () => expect(val("{Motor_Run} && !{Fault}")).toBe(true));
  it("ors", () => expect(val("{Fault} || {Motor_Run}")).toBe(true));
  it("takes a ternary", () => expect(val("{Level} > 80 ? 1 : 0")).toBe(0));
  it("nests ternaries the way a multi-state binding needs", () => {
    expect(val("{Level} > 80 ? 2 : {Level} > 50 ? 1 : 0")).toBe(1);
  });

  it("short-circuits, so a guarded divide is safe", () => {
    // `{Fault} && 1/{Fault}` must not evaluate the right-hand side.
    expect(err("{Fault} && 1 / {Fault}")).toBeNull();
    expect(val("{Fault} && 1 / {Fault}")).toBe(false);
  });
});

describe("functions", () => {
  it("clamps", () => expect(val("clamp(150, 0, 100)")).toBe(100));
  it("scales 4-20 mA to percent", () => expect(val("scale(12, 4, 20, 0, 100)")).toBe(50));
  it("rounds to a place", () => expect(val("round(3.14159, 2)")).toBe(3.14));
  it("takes min and max of several", () => expect(val("max(1, 9, 4)")).toBe(9));
  it("refuses the wrong argument count with a useful message", () => {
    expect(err("clamp(1, 2)")).toContain("takes 3");
  });
  it("refuses an unknown function", () => {
    expect(err("frobnicate(1)")).toContain("no function");
  });
});

describe("safety: there is no way out of the grammar", () => {
  // The point of a parser rather than eval. Each of these is an expression
  // that would do real damage under `new Function`, and here each is a
  // parse error that returns null.
  const hostile = [
    "constructor",
    "this",
    "globalThis",
    "window.location",
    "process.env",
    "fetch('http://evil')",
    "constructor.constructor('return 1')()",
    "[].constructor",
    "(()=>1)()",
    "document.cookie",
    "require('fs')",
    "1;alert(1)",
    "__proto__",
  ];

  for (const src of hostile) {
    it(`refuses ${src}`, () => {
      const r = evaluate(src, ctx);
      expect(r.value).toBeNull();
      expect(r.error).toBeTruthy();
    });
  }

  it("cannot reach a host object through a function name", () => {
    expect(evaluate("abs.constructor", ctx).value).toBeNull();
  });

  it("treats an identifier as an error rather than a global lookup", () => {
    expect(err("Level")).toContain("{Level}");
  });
});

describe("failure is quiet and specific", () => {
  it("never throws, so one bad binding cannot blank a screen", () => {
    expect(() => evaluate("{{{", ctx)).not.toThrow();
    expect(() => evaluate("", ctx)).not.toThrow();
  });

  it("names an unknown tag rather than treating it as zero", () => {
    // Silently zero is how a screen shows a stopped pump as running.
    expect(err("{Nonexistent}")).toContain("Nonexistent");
  });

  it("reports an unclosed tag reference", () => {
    expect(err("{Level")).toContain("closing brace");
  });

  it("reports an unknown tag source", () => {
    expect(err("{pld:Level}")).toContain("plc:");
  });

  it("returns zero for a divide by zero rather than Infinity on an operator's screen", () => {
    expect(val("{Level} / 0")).toBe(0);
    expect(val("{Level} % 0")).toBe(0);
  });
});

describe("strings", () => {
  it("concatenates for a caption", () => expect(val('{Level} + " %"')).toBe("62 %"));
  it("compares", () => expect(val('"a" == "a"')).toBe(true));
});

describe("referencedTags", () => {
  it("finds every tag in an expression, for the cross-reference", () => {
    const refs = referencedTags("{Level} > {Setpoint} && !{plc:Fault}");
    expect(refs.map((r) => r.name).sort()).toEqual(["Fault", "Level", "Setpoint"]);
  });

  it("returns nothing for a broken expression rather than guessing", () => {
    expect(referencedTags("{Level")).toEqual([]);
  });
});
