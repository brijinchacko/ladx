// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT, applyTheme, isTheme, resolveTheme } from "./theme";

describe("applyTheme", () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement("html");
  });

  it("marks an explicit choice on the document", () => {
    applyTheme("dark", root);
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyTheme("light", root);
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  // The stylesheet keys off light and dark. A third value would match nothing
  // and leave the page on its light defaults for ever.
  it("removes the attribute for system rather than writing the word", () => {
    applyTheme("dark", root);
    applyTheme("system", root);
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});

describe("isTheme", () => {
  it("accepts the three and refuses anything else", () => {
    for (const t of ["light", "dark", "system"]) expect(isTheme(t)).toBe(true);
    for (const t of ["Dark", "auto", "", null, undefined, 1, {}]) expect(isTheme(t)).toBe(false);
  });
});

describe("resolveTheme", () => {
  it("passes an explicit choice through", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
  });

  it("asks the machine for system", () => {
    const original = window.matchMedia;
    // @ts-expect-error replacing for the test
    window.matchMedia = (q: string) => ({
      matches: q.includes("dark"),
      addEventListener() {},
      removeEventListener() {},
    });
    expect(resolveTheme("system")).toBe("dark");
    // @ts-expect-error replacing for the test
    window.matchMedia = (q: string) => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    expect(resolveTheme("system")).toBe("light");
    window.matchMedia = original;
  });
});

describe("the no-flash script", () => {
  // Somebody who chose dark should never see a white flash, so this has to run
  // before the first paint and cannot wait for React.
  it("sets the attribute from storage", () => {
    const root = document.createElement("html");
    const store: Record<string, string> = { [THEME_KEY]: "dark" };
    const fn = new Function(
      "localStorage",
      "document",
      THEME_SCRIPT.replace("document.documentElement", "document.documentElement"),
    );
    fn({ getItem: (k: string) => store[k] ?? null }, { documentElement: root });
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("writes nothing for system, so the media query decides", () => {
    const root = document.createElement("html");
    const fn = new Function("localStorage", "document", THEME_SCRIPT);
    fn({ getItem: () => "system" }, { documentElement: root });
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  // A private window with site data blocked throws on read. A page that fails
  // to render is far worse than a page in the wrong theme.
  it("survives storage throwing", () => {
    const root = document.createElement("html");
    const fn = new Function("localStorage", "document", THEME_SCRIPT);
    expect(() =>
      fn(
        {
          getItem() {
            throw new Error("blocked");
          },
        },
        { documentElement: root },
      ),
    ).not.toThrow();
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("ignores a stored value that is not a theme", () => {
    const root = document.createElement("html");
    const fn = new Function("localStorage", "document", THEME_SCRIPT);
    fn({ getItem: () => "purple" }, { documentElement: root });
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});
