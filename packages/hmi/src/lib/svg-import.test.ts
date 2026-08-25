// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fitSvg, sanitiseSvg } from "./svg-import";

const wrap = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`;

describe("sanitiseSvg keeps the drawing", () => {
  it("keeps ordinary shapes and their geometry", () => {
    const r = sanitiseSvg(
      wrap('<path d="M0 0 L10 10" fill="none" stroke="#333" stroke-width="2"/>'),
    );
    expect(r.error).toBeNull();
    expect(r.svg).toContain('d="M0 0 L10 10"');
    expect(r.svg).toContain('stroke-width="2"');
  });

  it("keeps groups, gradients and clip paths, which real exports use", () => {
    const r = sanitiseSvg(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><clipPath id="c"><rect x="0" y="0" width="9" height="9"/></clipPath></defs><g transform="translate(4,4)"><circle cx="5" cy="5" r="4"/></g>',
      ),
    );
    expect(r.error).toBeNull();
    expect(r.svg).toContain("linearGradient");
    expect(r.svg).toContain("clipPath");
    expect(r.svg).toContain("translate(4,4)");
  });

  it("keeps the viewBox, without which nothing scales", () => {
    expect(sanitiseSvg(wrap("<rect/>")).svg).toContain('viewBox="0 0 100 100"');
  });
});

describe("sanitiseSvg removes what can execute or fetch", () => {
  // Each of these is a real SVG that does something it should not. An SVG is
  // not an image format: it is a document format that supports script.
  const hostile: [string, string][] = [
    ["a script element", "<script>alert(1)</script>"],
    ["an onload handler", '<rect onload="alert(1)" width="1" height="1"/>'],
    ["an onclick handler", '<circle onclick="fetch(\'//evil\')" r="1"/>'],
    ["an onmouseover handler", '<path onmouseover="alert(1)" d="M0 0"/>'],
    [
      "embedded HTML",
      '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hi</body></foreignObject>',
    ],
    ["an external image", '<image href="http://evil/x.png" width="1" height="1"/>'],
    ["a javascript href", '<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'],
    [
      "an animation that rewrites an attribute",
      '<rect width="1" height="1"><animate attributeName="href" to="javascript:alert(1)"/></rect>',
    ],
    ["a use pointing at another document", '<use href="http://evil/x.svg#a"/>'],
    ["a style that fetches", '<rect style="fill:url(http://evil/x)" width="1" height="1"/>'],
    ["a style with an expression", '<rect style="width:expression(alert(1))"/>'],
    ["a set element", '<set attributeName="onload" to="alert(1)"/>'],
  ];

  for (const [name, payload] of hostile) {
    it(`strips ${name}`, () => {
      const r = sanitiseSvg(wrap(payload));
      expect(r.error).toBeNull();
      const out = (r.svg ?? "").toLowerCase();
      expect(out).not.toContain("alert(");
      expect(out).not.toContain("evil");
      expect(out).not.toContain("<script");
      expect(out).not.toContain("onload");
      expect(out).not.toContain("onclick");
      expect(out).not.toContain("onmouseover");
      expect(out).not.toContain("foreignobject");
      expect(out).not.toContain("javascript:");
    });
  }

  it("reports what it removed rather than altering the drawing silently", () => {
    const r = sanitiseSvg(wrap('<script>x</script><rect onload="y" width="1" height="1"/>'));
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it("removes a child that sits between two it keeps, without skipping either", () => {
    // The classic sanitiser bug: removing while iterating skips the next
    // sibling, so a second payload survives.
    const r = sanitiseSvg(
      wrap('<script>a</script><script>b</script><script>c</script><rect width="1" height="1"/>'),
    );
    expect(r.svg).not.toContain("<script");
    expect(r.svg).toContain("<rect");
  });

  it("strips a handler nested several groups deep", () => {
    const r = sanitiseSvg(
      wrap('<g><g><g><rect onclick="alert(1)" width="1" height="1"/></g></g></g>'),
    );
    expect((r.svg ?? "").toLowerCase()).not.toContain("onclick");
  });
});

describe("sanitiseSvg refuses what it should not try to fix", () => {
  it("refuses a file that is not SVG", () => {
    expect(sanitiseSvg("<html><body>hi</body></html>").error).toBeTruthy();
  });

  it("refuses malformed XML rather than guessing", () => {
    expect(sanitiseSvg("<svg><rect>").error).toBeTruthy();
  });

  it("refuses something far too large to be a symbol", () => {
    const huge = wrap(`<rect d="${"x".repeat(250_000)}"/>`);
    expect(sanitiseSvg(huge).error).toContain("200 kB");
  });
});

describe("fitSvg", () => {
  it("replaces a fixed width and height with the box it was given", () => {
    const out = fitSvg('<svg width="512" height="512" viewBox="0 0 512 512"><rect/></svg>', 80, 40);
    expect(out).toContain('width="80"');
    expect(out).toContain('height="40"');
    expect(out).not.toContain('width="512"');
    expect(out).toContain('viewBox="0 0 512 512"');
  });

  it("adds a viewBox when the export had none, or nothing scales", () => {
    expect(fitSvg("<svg><rect/></svg>", 60, 30)).toContain('viewBox="0 0 60 30"');
  });

  it("stretches rather than letterboxes, because a panel is laid out in pixels", () => {
    expect(fitSvg("<svg><rect/></svg>", 60, 30)).toContain('preserveAspectRatio="none"');
  });
});
