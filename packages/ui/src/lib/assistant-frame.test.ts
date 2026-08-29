/**
 * The one thing a floating panel must never do is become unreachable.
 *
 * Everything here is a way that happens: a position saved on a wide monitor and
 * restored on a laptop, a window resized under the panel, a stored value edited
 * by hand, a drag that carries the header off the top of the screen. In every
 * case the failure is silent and total, because the only handle for moving the
 * panel back is the header that is no longer on screen.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type Frame,
  MIN_H,
  MIN_W,
  clampFrame,
  defaultFrame,
  loadFrame,
  saveFrame,
  viewportKnown,
} from "./assistant-frame";

/*
 * A stub rather than jsdom. The module touches getItem, setItem and whether
 * `window` exists; a DOM implementation would be a dependency and a slower
 * suite for exactly the same coverage.
 */
const store = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  },
};

beforeEach(() => store.clear());

const frame = (over: Partial<Frame> = {}): Frame => ({
  x: 100,
  y: 100,
  w: 400,
  h: 460,
  mode: "floating",
  ...over,
});

describe("the default", () => {
  it("sits bottom right, inside the viewport", () => {
    const f = defaultFrame(1440, 900);
    expect(f.x + f.w).toBeLessThanOrEqual(1440);
    expect(f.y + f.h).toBeLessThanOrEqual(900);
    expect(f.x).toBeGreaterThan(0);
  });

  it("still fits on a small window", () => {
    const f = defaultFrame(360, 500);
    expect(f.w).toBeLessThanOrEqual(360);
    expect(f.x).toBeGreaterThanOrEqual(0);
  });

  it("never starts below the minimum size", () => {
    const f = defaultFrame(200, 200);
    expect(f.w).toBeGreaterThanOrEqual(MIN_W);
    expect(f.h).toBeGreaterThanOrEqual(MIN_H);
  });
});

describe("clamping keeps it grabbable", () => {
  it("pulls back a panel remembered off the right of a narrower screen", () => {
    // Saved at x=2100 on a 2560 monitor, opened on a 1440 laptop.
    const f = clampFrame(frame({ x: 2100 }), 1440, 900);
    expect(f.x).toBeLessThanOrEqual(1440 - 120);
  });

  it("leaves the header on screen when pushed off the left", () => {
    const f = clampFrame(frame({ x: -5000, w: 400 }), 1440, 900);
    // Some of the panel may hang off, but not all of it.
    expect(f.x + f.w).toBeGreaterThanOrEqual(120);
  });

  it("never lets the header go above the top", () => {
    // A header above the viewport cannot be grabbed at all, so unlike the
    // sides this one has no give.
    expect(clampFrame(frame({ y: -300 }), 1440, 900).y).toBe(0);
  });

  it("keeps the header on screen when dragged past the bottom", () => {
    const f = clampFrame(frame({ y: 5000 }), 1440, 900);
    expect(f.y).toBeLessThanOrEqual(900);
  });

  it("holds the minimum size", () => {
    const f = clampFrame(frame({ w: 10, h: 10 }), 1440, 900);
    expect(f.w).toBe(MIN_W);
    expect(f.h).toBe(MIN_H);
  });

  it("shrinks a panel too big for the window", () => {
    const f = clampFrame(frame({ w: 4000, h: 4000 }), 1000, 700);
    expect(f.w).toBeLessThanOrEqual(1000);
    expect(f.h).toBeLessThanOrEqual(700);
  });

  it("prefers the minimum size over fitting a tiny window", () => {
    // A viewport smaller than the minimum is a real case on a phone in
    // landscape. Shrinking below the minimum would make the panel unusable,
    // so it overflows instead and stays draggable.
    const f = clampFrame(frame(), 200, 150);
    expect(f.w).toBe(MIN_W);
    expect(f.h).toBe(MIN_H);
  });

  it("leaves a frame already inside alone", () => {
    const f = frame({ x: 200, y: 120, w: 400, h: 400 });
    expect(clampFrame(f, 1440, 900)).toEqual(f);
  });

  it("keeps the mode", () => {
    expect(clampFrame(frame({ mode: "minimised" }), 1440, 900).mode).toBe("minimised");
  });
});

describe("what comes back from storage", () => {
  it("is the default when nothing is stored", () => {
    expect(loadFrame("hmi", 1440, 900)).toEqual(defaultFrame(1440, 900));
  });

  it("is clamped to the viewport it is restored into, not the one it was saved from", () => {
    saveFrame("hmi", frame({ x: 2400, y: 1300 }));
    const f = loadFrame("hmi", 1440, 900);
    expect(f.x).toBeLessThanOrEqual(1440 - 120);
    expect(f.y).toBeLessThanOrEqual(900);
  });

  it("round trips a sane frame", () => {
    const f = frame({ x: 220, y: 140, w: 420, h: 480, mode: "floating" });
    saveFrame("cad", f);
    expect(loadFrame("cad", 1440, 900)).toEqual(f);
  });

  it("keeps tools apart", () => {
    saveFrame("hmi", frame({ x: 200 }));
    saveFrame("cad", frame({ x: 600 }));
    expect(loadFrame("hmi", 1440, 900).x).toBe(200);
    expect(loadFrame("cad", 1440, 900).x).toBe(600);
  });

  it("falls back rather than throwing on rubbish", () => {
    for (const bad of ["{", "null", "42", '"x"', "[]", '{"x":"left"}']) {
      store.set("ladx.assistant.frame.hmi.v1", bad);
      expect(() => loadFrame("hmi", 1440, 900)).not.toThrow();
      const f = loadFrame("hmi", 1440, 900);
      expect(f.w).toBeGreaterThanOrEqual(MIN_W);
      expect(Number.isFinite(f.x)).toBe(true);
    }
  });

  it("ignores a mode that is not one", () => {
    store.set("ladx.assistant.frame.hmi.v1", JSON.stringify({ ...frame(), mode: "fullscreen" }));
    expect(loadFrame("hmi", 1440, 900).mode).toBe(defaultFrame(1440, 900).mode);
  });

  it("floats by default, rather than taking a strip off every tool", () => {
    expect(defaultFrame(1440, 900).mode).toBe("floating");
  });

  it("ignores a NaN that JSON let through", () => {
    store.set("ladx.assistant.frame.hmi.v1", '{"x":null,"y":null,"w":null,"h":null}');
    const f = loadFrame("hmi", 1440, 900);
    expect(Number.isFinite(f.x)).toBe(true);
    expect(f.w).toBeGreaterThanOrEqual(MIN_W);
  });
});

describe("a viewport that is not known yet", () => {
  /*
   * A webview reports no size for a moment while its window is being made.
   * Every term in defaultFrame bottoms out against that zero, and the result
   * is the panel sitting on the desktop sidebar with no way to shift it: the
   * corner it lands in is legal at every later size, so clamping never moves
   * it again. Placement has to wait instead of guessing.
   */
  it("says a zero sized window is not measurable", () => {
    expect(viewportKnown(0, 0)).toBe(false);
    expect(viewportKnown(1280, 0)).toBe(false);
    expect(viewportKnown(0, 720)).toBe(false);
  });

  it("says a real window is", () => {
    expect(viewportKnown(1280, 720)).toBe(true);
  });

  it("is the corner case worth waiting for: zero puts the panel on the sidebar", () => {
    const f = defaultFrame(0, 0);
    // The desktop sidebar is 256 wide and starts at the top left.
    expect(f.x).toBeLessThan(256);
    expect(f.y).toBeLessThan(64);
  });

  it("and clamping never rescues it, which is why it must not be placed there", () => {
    const bad = defaultFrame(0, 0);
    expect(clampFrame(bad, 1280, 720)).toEqual(bad);
  });

  it("places clear of the sidebar once the window can be measured", () => {
    expect(defaultFrame(1280, 720).x).toBeGreaterThanOrEqual(256);
  });
});
