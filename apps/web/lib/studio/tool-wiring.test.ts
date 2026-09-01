// Every tool that says it works on one program must actually accept one.
//
// This is checked against the source rather than asserted in prose because the
// failure is silent and was already real: five of the scoped tools read
// `?project=` and the rest ignored it, so a link from a project opened a page
// showing whichever program it happened to show last. Nothing errored. The user
// simply ended up looking at a different job from the one they clicked.
//
// A `scoped: true` tool with no `searchParams` in its page is that bug, so it
// fails here instead of on somebody's screen.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLS, scopedTools } from "./tools";

const webRoot = path.resolve(__dirname, "../..");

function pageSource(href: string): string {
  const route = href.replace(/^\/studio\/?/, "");
  const file = path.join(webRoot, "app", "(studio)", "studio", route, "page.tsx");
  return readFileSync(file, "utf8");
}

describe("tool wiring", () => {
  it("every tool in the list has a page behind it", () => {
    for (const tool of TOOLS) {
      expect(() => pageSource(tool.href), `${tool.label} has no page`).not.toThrow();
    }
  });

  it("every scoped tool reads the project it was given", () => {
    for (const tool of scopedTools()) {
      const src = pageSource(tool.href);
      expect(src, `${tool.label} says it is scoped but never reads searchParams`).toContain(
        "searchParams",
      );
      expect(src, `${tool.label} never looks for a project`).toMatch(/project\??:/);
    }
  });

  it("every scoped tool tells the user which project it is on", () => {
    for (const tool of scopedTools()) {
      const src = pageSource(tool.href);
      // Either it renders the shared bar, or it puts the project in the header
      // itself. Both say which job this is; neither is silent about it.
      const saysWhich = src.includes("ProjectContext") || /projectName|project\.name/.test(src);
      expect(saysWhich, `${tool.label} opens on a project without saying which`).toBe(true);
    }
  });

  it("no unscoped tool pretends to take a project", () => {
    // Standards and Knowledge are about the account. A project in their URL
    // would suggest the rules differ per job, which they do not.
    for (const tool of TOOLS.filter((t) => !t.scoped)) {
      const src = pageSource(tool.href);
      expect(
        src.includes("ProjectContext"),
        `${tool.label} is unscoped but shows a project bar`,
      ).toBe(false);
    }
  });
});
