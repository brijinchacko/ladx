import { describe, expect, it } from "vitest";
import { REALISTIC_IDS, hasRealistic, shade } from "./symbols-realistic";

describe("shade", () => {
  it("lightens towards white and darkens towards black", () => {
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#808080", -1)).toBe("#000000");
  });

  it("returns the colour unchanged at zero", () => {
    expect(shade("#3fbfb5", 0)).toBe("#3fbfb5");
  });

  it("keeps hue while changing value, so a tinted pump shades as itself", () => {
    // The point of deriving every gradient from the widget's own fill: a green
    // pump must shade green, not steel with a green wash over it.
    const lit = shade("#2e7d32", 0.4);
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(lit.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r as number);
    expect(g).toBeGreaterThan(b as number);
  });

  it("accepts a colour with or without the hash", () => {
    expect(shade("808080", 1)).toBe("#ffffff");
  });

  it("passes anything it cannot parse straight through rather than returning black", () => {
    // A widget whose fill is a CSS name or a var() must not render as a black
    // rectangle because the shader gave up.
    expect(shade("rebeccapurple", 0.5)).toBe("rebeccapurple");
    expect(shade("", 0.5)).toBe("");
    expect(shade("#abc", 0.5)).toBe("#abc");
  });

  it("always produces six hex digits, so no gradient stop is malformed", () => {
    for (const base of ["#000000", "#ffffff", "#010203", "#fefdfc"]) {
      for (const amt of [-0.9, -0.42, -0.1, 0.22, 0.5, 0.9]) {
        expect(shade(base, amt)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("clamps rather than wrapping past the ends", () => {
    expect(shade("#ffffff", 5)).toBe("#ffffff");
    expect(shade("#000000", -5)).toBe("#000000");
  });
});

describe("the realistic set", () => {
  it("covers the equipment people actually put on an overview", () => {
    for (const id of ["tank", "pump", "motor", "valve-control", "conveyor"]) {
      expect(hasRealistic(id)).toBe(true);
    }
  });

  it("says no for the ones that are schematic only, so the caller can fall back", () => {
    // Most of the library has no realistic drawing, and a missing one must
    // leave the schematic in place rather than a hole on the panel.
    expect(hasRealistic("instrument")).toBe(false);
    expect(hasRealistic("nonsense")).toBe(false);
  });

  it("every id it claims is one it can actually draw", () => {
    for (const id of REALISTIC_IDS) expect(hasRealistic(id)).toBe(true);
  });
});
