/**
 * What faceplate expansion must and must not do.
 *
 * The failures worth testing are the quiet ones. A parameter that does not
 * substitute leaves a binding pointing at a tag called `{{Tag}}`, which reads
 * nothing and looks like a wiring mistake. Two instances sharing widget ids
 * make selection pick whichever drew last. And substitution reaching a field
 * it should not is how a drawing with holes in it turns into a macro language.
 */

import { describe, expect, it } from "vitest";
import { expandAll, expandInstance, paramsUsed, substitute } from "./faceplates";
import type { Faceplate, Widget } from "./types";

const valve: Faceplate = {
  id: "fp-valve",
  name: "Valve",
  size: { width: 100, height: 60 },
  params: [
    { name: "Tag", kind: "tag", default: "XV000" },
    { name: "Label", kind: "text", default: "Valve" },
  ],
  widgets: [
    {
      id: "w1",
      kind: "lamp",
      rect: { x: 0, y: 0, w: 40, h: 40 },
      value: { kind: "plc", tag: "{{Tag}}.Opened_FB" },
      animations: [{ id: "a1", when: { kind: "plc", tag: "{{Tag}}.Fault" }, fill: "#B4531A" }],
    },
    {
      id: "w2",
      kind: "text",
      rect: { x: 44, y: 10, w: 56, h: 20 },
      text: "{{Label}}",
    },
    {
      id: "w3",
      kind: "button",
      rect: { x: 0, y: 44, w: 100, h: 16 },
      onPress: [
        {
          kind: "setTag",
          target: { source: "plc", tag: "{{Tag}}.Open_Cmd" },
          value: { kind: "const", value: 1 },
        },
      ],
    },
  ],
};

const instance = (over: Partial<Widget> = {}): Widget => ({
  id: "i1",
  kind: "faceplate",
  rect: { x: 200, y: 100, w: 100, h: 60 },
  faceplate: { id: "fp-valve", args: { Tag: "XV101", Label: "Inlet" } },
  ...over,
});

describe("substitute", () => {
  it("replaces a parameter", () => {
    expect(substitute("{{Tag}}.Open_FB", { Tag: "XV101" })).toBe("XV101.Open_FB");
  });

  it("replaces several, and tolerates spacing", () => {
    expect(substitute("{{ A }}-{{B}}", { A: "one", B: "two" })).toBe("one-two");
  });

  it("leaves an unknown parameter visible rather than blanking it", () => {
    // Blanking would produce a binding to an empty tag name, which reads
    // nothing and looks like a wiring fault. Leaving it shows the cause.
    expect(substitute("{{Missing}}.DN", {})).toBe("{{Missing}}.DN");
  });

  it("leaves an empty argument visible for the same reason", () => {
    expect(substitute("{{Tag}}", { Tag: "" })).toBe("{{Tag}}");
  });

  it("does not touch text with no parameters", () => {
    expect(substitute("Motor 1", { Tag: "X" })).toBe("Motor 1");
  });
});

describe("paramsUsed", () => {
  it("finds every parameter the definition refers to", () => {
    expect(paramsUsed(valve).sort()).toEqual(["Label", "Tag"]);
  });

  it("is not confused by being called twice", () => {
    // The pattern is a module-level regex with the global flag, so lastIndex
    // survives between calls unless it is reset. Getting this wrong makes the
    // second call miss the first match.
    expect(paramsUsed(valve).sort()).toEqual(["Label", "Tag"]);
    expect(paramsUsed(valve).sort()).toEqual(["Label", "Tag"]);
  });
});

describe("expandInstance", () => {
  const out = expandInstance(instance(), [valve]);

  it("produces one widget per widget in the definition", () => {
    expect(out.problem).toBeUndefined();
    expect(out.widgets).toHaveLength(3);
  });

  it("substitutes into a value binding", () => {
    expect(out.widgets[0]?.value).toEqual({ kind: "plc", tag: "XV101.Opened_FB" });
  });

  it("substitutes into an animation binding", () => {
    const when = out.widgets[0]?.animations?.[0]?.when;
    expect(when).toEqual({ kind: "plc", tag: "XV101.Fault" });
  });

  it("substitutes into a caption", () => {
    expect(out.widgets[1]?.text).toBe("Inlet");
  });

  it("substitutes into an action target", () => {
    const act = out.widgets[2]?.onPress?.[0];
    expect(act?.kind === "setTag" && act.target.tag).toBe("XV101.Open_Cmd");
  });

  it("offsets the parts to the instance's position", () => {
    expect(out.widgets[0]?.rect).toEqual({ x: 200, y: 100, w: 40, h: 40 });
  });

  it("scales the parts when the instance is a different size", () => {
    const big = expandInstance(instance({ rect: { x: 0, y: 0, w: 200, h: 120 } }), [valve]);
    expect(big.widgets[0]?.rect).toEqual({ x: 0, y: 0, w: 80, h: 80 });
  });

  it("gives every part an id unique to the instance", () => {
    const a = expandInstance(instance({ id: "i1" }), [valve]);
    const b = expandInstance(instance({ id: "i2" }), [valve]);
    const ids = [...a.widgets, ...b.widgets].map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("locks the parts, so they cannot be dragged away from the instance", () => {
    expect(out.widgets.every((w) => w.locked)).toBe(true);
  });

  it("falls back to a parameter default when the argument is missing", () => {
    const bare = expandInstance(instance({ faceplate: { id: "fp-valve", args: {} } }), [valve]);
    expect(bare.widgets[0]?.value).toEqual({ kind: "plc", tag: "XV000.Opened_FB" });
    expect(bare.widgets[1]?.text).toBe("Valve");
  });

  it("reports a missing definition rather than drawing nothing", () => {
    const gone = expandInstance(instance({ faceplate: { id: "nope", args: {} } }), [valve]);
    expect(gone.widgets).toEqual([]);
    expect(gone.problem).toContain("nope");
  });

  it("reports an instance with no faceplate chosen", () => {
    const none = expandInstance(instance({ faceplate: undefined }), [valve]);
    expect(none.problem).toBeTruthy();
  });

  it("refuses a faceplate containing a faceplate rather than recursing", () => {
    const nested: Faceplate = {
      ...valve,
      id: "fp-nested",
      widgets: [{ id: "n1", kind: "faceplate", rect: { x: 0, y: 0, w: 10, h: 10 } }],
    };
    const out2 = expandInstance(instance({ faceplate: { id: "fp-nested", args: {} } }), [
      valve,
      nested,
    ]);
    expect(out2.widgets).toEqual([]);
    expect(out2.problem).toContain("Flatten");
  });

  it("passes an ordinary widget through untouched", () => {
    const plain: Widget = { id: "p1", kind: "rect", rect: { x: 1, y: 2, w: 3, h: 4 } };
    expect(expandInstance(plain, [valve]).widgets).toEqual([plain]);
  });
});

describe("expandAll", () => {
  it("mixes expanded instances with ordinary widgets", () => {
    const plain: Widget = { id: "p1", kind: "rect", rect: { x: 0, y: 0, w: 10, h: 10 } };
    const { widgets, problems } = expandAll([plain, instance()], [valve]);
    expect(widgets).toHaveLength(4);
    expect(problems).toEqual([]);
  });

  it("drops an instance and says why when the document has no faceplates", () => {
    const { widgets, problems } = expandAll([instance()], []);
    expect(widgets).toEqual([]);
    expect(problems).toHaveLength(1);
  });

  it("leaves a screen with no instances exactly as it was", () => {
    const plain: Widget[] = [
      { id: "a", kind: "rect", rect: { x: 0, y: 0, w: 1, h: 1 } },
      { id: "b", kind: "lamp", rect: { x: 0, y: 0, w: 1, h: 1 } },
    ];
    expect(expandAll(plain, [valve]).widgets).toEqual(plain);
  });
});
