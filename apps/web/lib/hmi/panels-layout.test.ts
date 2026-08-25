import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  type Layout,
  PANELS,
  clamp,
  isMoved,
  loadLayout,
  panel,
  saveLayout,
} from "./panels-layout";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    },
    configurable: true,
    writable: true,
  });
});

describe("the saved layout", () => {
  it("round-trips", () => {
    const l: Layout = { ...DEFAULT_LAYOUT, tree: { open: false, size: 300 } };
    saveLayout(l);
    expect(loadLayout().tree).toEqual({ open: false, size: 300 });
  });

  it("is the default when nothing was saved", () => {
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("survives junk in storage rather than taking the editor down", () => {
    store.set("ladx.hmi.layout.v1", "{not json");
    expect(loadLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("clamps a size that would leave the canvas no room", () => {
    // A panel dragged to 4000px in an older build, or a hand-edited value.
    store.set("ladx.hmi.layout.v1", JSON.stringify({ tree: { open: true, size: 4000 } }));
    expect(loadLayout().tree.size).toBe(panel("tree").max);
  });

  it("clamps a size below the minimum too", () => {
    store.set("ladx.hmi.layout.v1", JSON.stringify({ tools: { open: true, size: 1 } }));
    expect(loadLayout().tools.size).toBe(panel("tools").min);
  });

  it("fills in a panel the saved layout has never heard of", () => {
    // What happens when a build adds a pane: the old layout must not remove it.
    store.set("ladx.hmi.layout.v1", JSON.stringify({ tree: { open: false, size: 200 } }));
    const l = loadLayout();
    for (const p of PANELS) expect(l[p.id]).toBeDefined();
    expect(l.properties).toEqual(DEFAULT_LAYOUT.properties);
  });

  it("ignores a non-boolean open flag rather than hiding a panel forever", () => {
    store.set("ladx.hmi.layout.v1", JSON.stringify({ tree: { open: "yes", size: 200 } }));
    expect(loadLayout().tree.open).toBe(true);
  });
});

describe("isMoved", () => {
  it("is false for the default, so Reset is not offered from the first render", () => {
    expect(isMoved(DEFAULT_LAYOUT)).toBe(false);
  });

  it("is true once a panel is closed", () => {
    expect(isMoved({ ...DEFAULT_LAYOUT, tools: { open: false, size: 250 } })).toBe(true);
  });

  it("is true once a panel is resized", () => {
    expect(isMoved({ ...DEFAULT_LAYOUT, tree: { open: true, size: 333 } })).toBe(true);
  });
});

describe("clamp", () => {
  it("holds the bounds", () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(50, 10, 20)).toBe(20);
    expect(clamp(15, 10, 20)).toBe(15);
  });
});
