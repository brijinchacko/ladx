/**
 * What a stored layout must not be able to do.
 *
 * The interesting cases are all about a layout outliving the code that wrote
 * it. A width from a wider monitor, a panel moved to a side that has since
 * been disallowed, a value somebody edited by hand: each one is a way to end
 * up with a pane one pixel wide, or a panel rendered somewhere the layout does
 * not draw, and none of them announce themselves.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { type DockPanelDef, createDock } from "./dock";

/*
 * A stub rather than jsdom.
 *
 * The dock touches exactly three things on the browser: getItem, setItem, and
 * whether `window` exists at all. Pulling in a DOM implementation to provide
 * those would be a dependency and a slower suite for no more coverage, and the
 * code under test is the same either way.
 */
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    clear: () => store.clear(),
  },
};

const PANELS: DockPanelDef<"tree" | "props" | "cmd">[] = [
  { id: "tree", title: "Project", side: "left", size: 200, min: 150, max: 380, blurb: "" },
  {
    id: "props",
    title: "Properties",
    side: "right",
    size: 220,
    min: 180,
    max: 400,
    blurb: "",
    sides: ["right", "left"],
  },
  {
    id: "cmd",
    title: "Command",
    side: "bottom",
    size: 96,
    min: 64,
    max: 320,
    blurb: "",
    defaultOpen: false,
  },
];

const KEY = "test.dock.v1";
const dock = createDock(PANELS, KEY);

beforeEach(() => window.localStorage.clear());

describe("defaults", () => {
  it("opens everything except what asked not to be", () => {
    expect(dock.defaults.tree.open).toBe(true);
    expect(dock.defaults.cmd.open).toBe(false);
  });

  it("starts each panel at its declared size", () => {
    expect(dock.defaults.props.size).toBe(220);
  });

  it("is not moved when nothing has moved", () => {
    expect(dock.isMoved(dock.defaults)).toBe(false);
  });
});

describe("reading a stored layout", () => {
  const store = (v: unknown) => window.localStorage.setItem(KEY, JSON.stringify(v));

  it("returns the defaults when nothing is stored", () => {
    expect(dock.load()).toEqual(dock.defaults);
  });

  it("clamps a width from a wider monitor rather than trusting it", () => {
    store({ tree: { open: true, size: 4000 } });
    expect(dock.load().tree.size).toBe(380);
  });

  it("clamps a width too small to grab", () => {
    store({ tree: { open: true, size: 1 } });
    expect(dock.load().tree.size).toBe(150);
  });

  it("falls back to the default size when the stored one is not a number", () => {
    store({ tree: { open: true, size: "wide" } });
    expect(dock.load().tree.size).toBe(200);
  });

  it("falls back for a size that is a number but not finite", () => {
    // JSON turns Infinity into null, so this arrives as a non-number; NaN the
    // same. Either way it must not reach the clamp, which would pass it on.
    store({ tree: { open: true, size: Number.POSITIVE_INFINITY } });
    expect(dock.load().tree.size).toBe(200);
  });

  it("keeps a panel absent from the store at its default", () => {
    store({ tree: { open: false } });
    const out = dock.load();
    expect(out.tree.open).toBe(false);
    expect(out.props).toEqual(dock.defaults.props);
  });

  it("ignores a panel that no longer exists", () => {
    store({ gone: { open: true, size: 99 }, tree: { open: true, size: 200 } });
    expect(Object.keys(dock.load()).sort()).toEqual(["cmd", "props", "tree"]);
  });

  it("survives rubbish rather than throwing", () => {
    for (const bad of ["not json", "null", "42", '"a string"', "[]"]) {
      window.localStorage.setItem(KEY, bad);
      expect(() => dock.load()).not.toThrow();
      expect(dock.load().tree.size).toBe(200);
    }
  });
});

describe("sides", () => {
  it("reports a panel's declared side when it has not been moved", () => {
    expect(dock.sideOf(dock.defaults, "props")).toBe("right");
  });

  it("honours a move the definition permits", () => {
    const moved = { ...dock.defaults, props: { ...dock.defaults.props, side: "left" as const } };
    expect(dock.sideOf(moved, "props")).toBe("left");
  });

  it("refuses a side the panel is not allowed, rather than rendering nowhere", () => {
    // `tree` declares no `sides`, so left is the only place it goes. A stored
    // "bottom" from an older build must not leave it out of every column the
    // layout actually draws.
    const bad = { ...dock.defaults, tree: { ...dock.defaults.tree, side: "bottom" as const } };
    expect(dock.sideOf(bad, "tree")).toBe("left");
  });

  it("drops a disallowed stored side on load", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ tree: { open: true, size: 200, side: "bottom" } }),
    );
    expect(dock.load().tree.side).toBeUndefined();
  });

  it("offers no move for a panel with only one side", () => {
    expect(dock.nextSide(dock.defaults, "tree")).toBeNull();
    expect(dock.nextSide(dock.defaults, "cmd")).toBeNull();
  });

  it("cycles through the allowed sides and back", () => {
    const at = (side: "left" | "right") => ({
      ...dock.defaults,
      props: { ...dock.defaults.props, side },
    });
    expect(dock.nextSide(dock.defaults, "props")).toBe("left");
    expect(dock.nextSide(at("left"), "props")).toBe("right");
  });
});

describe("isMoved, which decides whether Reset is worth offering", () => {
  it("notices a closed panel", () => {
    expect(dock.isMoved({ ...dock.defaults, tree: { open: false, size: 200 } })).toBe(true);
  });

  it("notices a resized panel", () => {
    expect(dock.isMoved({ ...dock.defaults, tree: { open: true, size: 300 } })).toBe(true);
  });

  it("notices a panel moved to another side", () => {
    expect(dock.isMoved({ ...dock.defaults, props: { open: true, size: 220, side: "left" } })).toBe(
      true,
    );
  });

  it("is not fooled by a side stored as the one it was already on", () => {
    expect(
      dock.isMoved({ ...dock.defaults, props: { open: true, size: 220, side: "right" } }),
    ).toBe(false);
  });
});

describe("clampSize", () => {
  it("holds a panel between its own limits and rounds", () => {
    expect(dock.clampSize("tree", 10)).toBe(150);
    expect(dock.clampSize("tree", 9999)).toBe(380);
    expect(dock.clampSize("tree", 220.6)).toBe(221);
  });
});

describe("saving", () => {
  it("round trips", () => {
    const next = { ...dock.defaults, tree: { open: false, size: 300 } };
    dock.save(next);
    expect(dock.load().tree).toEqual({ open: false, size: 300, side: undefined });
  });
});
