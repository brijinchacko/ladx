/**
 * What an exported panel must not do.
 *
 * Almost all of the risk here is one bug: a document whose text escapes the
 * script element it is embedded in. A screen is full of operator-authored
 * strings, and any of them can contain the characters that end a script tag.
 * When that happens the panel does not fail loudly, it renders half a document
 * and reads as a corrupt download.
 */

import { describe, expect, it } from "vitest";
import { buildPanelHtml, escapeHtml, panelFileName, safeJson } from "./export-panel";
import type { HmiDoc } from "./types";

const doc = (over: Partial<HmiDoc> = {}): HmiDoc =>
  ({
    screens: [
      {
        id: "s1",
        name: "Overview",
        slug: "overview",
        size: { width: 800, height: 480 },
        background: "#FFFFFF",
        widgets: [],
      },
    ],
    tags: [],
    alarms: [],
    trends: [],
    defaultSize: { width: 800, height: 480 },
    connection: { protocol: "simulated" },
    ...over,
  }) as HmiDoc;

const build = (over: Partial<HmiDoc> = {}, name = "Panel") =>
  buildPanelHtml({
    doc: doc(over),
    program: null,
    name,
    runtime: "/* runtime */",
    exportedAt: "2026-08-28T00:00:00.000Z",
  });

describe("escaping the payload", () => {
  it("never lets a closing script tag through", () => {
    // The whole bug in one case: a caption somebody typed.
    const html = build({
      screens: [
        {
          id: "s1",
          name: "Overview",
          slug: "overview",
          size: { width: 800, height: 480 },
          background: "#FFF",
          widgets: [
            {
              id: "w1",
              kind: "text",
              rect: { x: 0, y: 0, w: 10, h: 10 },
              text: "</script><script>alert(1)</script>",
            },
          ],
        },
      ],
    } as Partial<HmiDoc>);
    const payload = html.slice(html.indexOf("__LADX_PANEL__"), html.indexOf("</script>"));
    expect(payload).not.toContain("</script");
    expect(payload).toContain("\\u003c");
  });

  it("escapes the HTML comment opener, which ends a script just as well", () => {
    expect(safeJson({ t: "<!--" })).not.toContain("<!--");
  });

  it("escapes the line separators that break a JavaScript string literal", () => {
    // U+2028 and U+2029 are valid in JSON and were, for years, line
    // terminators in JavaScript source. A tag comment containing one used to
    // produce a syntax error in the exported file and nothing else.
    expect(safeJson({ t: "a\u2028b\u2029c" })).toBe('{"t":"a\\u2028b\\u2029c"}');
  });

  it("still round trips through JSON.parse", () => {
    const value = { a: "</script>", b: "<!--", c: "x y", d: [1, 2, null] };
    expect(JSON.parse(safeJson(value))).toEqual(value);
  });

  it("escapes the title rather than putting a name straight in the markup", () => {
    const html = build({}, '"><img src=x onerror=alert(1)>');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&quot;&gt;&lt;img");
  });
});

describe("the page itself", () => {
  const html = build();

  it("is a complete document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
  });

  it("carries the runtime inline rather than linking it", () => {
    expect(html).toContain("/* runtime */");
    // A src= would make the file useless anywhere but the machine it was
    // exported from, which is the one place it is not needed.
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  it("adds no external reference of its own", () => {
    // Only about the template. Whether the bundle inside it can reach the
    // network is checked where the bundle is built, against the built file,
    // because that is what actually ships and this test would pass with a
    // runtime that phoned home on every scan.
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link|<img/);
  });

  it("says in the file what the file is", () => {
    expect(html).toContain("not a Siemens or Rockwell panel project");
    expect(html).toContain("simulated by the ladder program");
  });

  it("stamps when it was exported, so one found later can be dated", () => {
    expect(html).toContain('content="2026-08-28T00:00:00.000Z"');
  });
});

describe("escapeHtml", () => {
  it("handles the four that matter", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });

  it("escapes the ampersand first, or the escapes escape each other", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("panelFileName", () => {
  it("keeps an ordinary name", () => {
    expect(panelFileName("Mixer overview")).toBe("Mixer-overview.html");
  });

  it("drops what a filesystem would refuse", () => {
    expect(panelFileName("a/b\\c:d*e?")).toBe("a-b-c-d-e.html");
  });

  it("does not download something that reads like a path", () => {
    expect(panelFileName("../../etc/passwd")).toBe("etc-passwd.html");
  });

  it("does not produce a hidden file", () => {
    expect(panelFileName(".profile")).toBe("profile.html");
  });

  it("does not leave a name that is only separators", () => {
    expect(panelFileName("///")).toBe("panel.html");
    expect(panelFileName("   ")).toBe("panel.html");
    expect(panelFileName("...")).toBe("panel.html");
  });
});
