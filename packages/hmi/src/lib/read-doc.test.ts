import { describe, expect, it } from "vitest";
import { emptyDoc, readDoc } from "./types";

/**
 * Opening whatever is in the store.
 *
 * The store holds what was written to it, which is not always what this build
 * would write: an older format, a partial write, a row somebody edited. The
 * guard this replaced checked only that `screens` was a non-empty array, so a
 * screen missing its size passed and then threw inside the first render. What
 * the person saw was "Application error: a client-side exception has occurred"
 * and no way back to their list of applications.
 */
describe("readDoc", () => {
  it("keeps a document that is already whole", () => {
    const doc = emptyDoc("Line 4");
    const out = readDoc(doc);
    expect(out.name).toBe("Line 4");
    expect(out.screens).toHaveLength(1);
    expect(out.screens[0]?.size).toEqual({ width: 800, height: 480 });
  });

  it("fills in a screen with no size, which used to white-screen the editor", () => {
    const out = readDoc({
      version: 1,
      name: "Older",
      screens: [{ id: "s1", name: "Overview", widgets: [] }],
    });
    // The default panel size rather than undefined: the first render reads
    // .width off this, and undefined is the crash.
    expect(out.screens[0]?.size).toEqual({ width: 800, height: 480 });
    expect(out.screens[0]?.background).toBeTruthy();
    expect(out.screens[0]?.slug).toBe("overview");
  });

  it("prefers the document's own panel size when filling a screen in", () => {
    const out = readDoc({
      version: 1,
      name: "Wide",
      defaultSize: { width: 1920, height: 1080 },
      screens: [{ id: "s1", name: "Overview", widgets: [] }],
    });
    expect(out.screens[0]?.size).toEqual({ width: 1920, height: 1080 });
  });

  it("replaces widgets that are not a list rather than iterating them", () => {
    const out = readDoc({
      version: 1,
      name: "Broken",
      screens: [{ id: "s1", name: "Overview", size: { width: 800, height: 480 }, widgets: null }],
    });
    expect(out.screens[0]?.widgets).toEqual([]);
  });

  it("gives an empty application for anything unreadable", () => {
    for (const bad of [null, undefined, 42, "a string", [], {}, { screens: [] }]) {
      const out = readDoc(bad, "Fallback");
      expect(out.screens.length).toBeGreaterThan(0);
      expect(out.screens[0]?.size.width).toBeGreaterThan(0);
    }
  });

  it("keeps the name off an otherwise unusable document", () => {
    // The name is the one thing the person recognises in their list, so it
    // survives even when nothing else does.
    const out = readDoc({ name: "Acme Line 4", screens: [] }, "Untitled");
    expect(out.name).toBe("Acme Line 4");
  });

  it("points home at a screen that exists", () => {
    const out = readDoc({
      version: 1,
      name: "Moved",
      screens: [{ id: "s1", name: "Tank", size: { width: 800, height: 480 }, widgets: [] }],
      homeSlug: "a-screen-that-was-deleted",
    });
    expect(out.homeSlug).toBe("tank");
  });

  it("survives a screens array holding nulls", () => {
    const out = readDoc({
      version: 1,
      name: "Holey",
      screens: [null, { id: "s2", name: "Real", size: { width: 800, height: 480 }, widgets: [] }],
    });
    expect(out.screens).toHaveLength(1);
    expect(out.screens[0]?.name).toBe("Real");
  });

  it("defaults the lists a document from before a feature will not have", () => {
    const out = readDoc({
      version: 1,
      name: "Old",
      screens: [{ id: "s1", name: "Overview", size: { width: 800, height: 480 }, widgets: [] }],
    });
    expect(out.faceplates).toEqual([]);
    expect(out.recipes).toEqual([]);
    expect(out.trends).toEqual([]);
    expect(out.alarms).toEqual([]);
    expect(out.popupPriorities).toEqual(["critical"]);
  });
});
