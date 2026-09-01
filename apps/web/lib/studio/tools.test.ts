import { describe, expect, it } from "vitest";
import { GROUPS, TOOLS, scopedTools, toolHref, toolsIn } from "./tools";

describe("the tool list", () => {
  it("puts every tool in a group that exists", () => {
    const known = new Set(GROUPS.map((g) => g.id));
    for (const t of TOOLS) {
      expect(known.has(t.group), `${t.label} is in group "${t.group}"`).toBe(true);
    }
  });

  it("leaves no group empty, so no heading stands over nothing", () => {
    for (const g of GROUPS) {
      expect(toolsIn(g.id).length, `${g.label} is empty`).toBeGreaterThan(0);
    }
  });

  it("gives every tool a distinct route and a description", () => {
    expect(new Set(TOOLS.map((t) => t.href)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.href.startsWith("/studio/")).toBe(true);
      expect(t.about.length, `${t.label} has no description`).toBeGreaterThan(0);
    }
  });

  // The whole point of the grouping. A flat list of ten is a pile.
  it("keeps each group small enough to scan", () => {
    for (const g of GROUPS) {
      expect(toolsIn(g.id).length, `${g.label} is too long to scan`).toBeLessThanOrEqual(4);
    }
  });
});

describe("toolHref", () => {
  const ladder = TOOLS.find((t) => t.href === "/studio/ladder");
  const standards = TOOLS.find((t) => t.href === "/studio/standards");

  it("carries the project into a tool that works on one program", () => {
    expect(toolHref(ladder!, "abc")).toBe("/studio/ladder?project=abc");
  });

  // A URL that promises a context the page ignores is worse than no context:
  // the user lands on a different program from the one they clicked from.
  it("does not promise a context an unscoped tool would ignore", () => {
    expect(toolHref(standards!, "abc")).toBe("/studio/standards");
  });

  it("is the plain route when there is no project", () => {
    expect(toolHref(ladder!, null)).toBe("/studio/ladder");
    expect(toolHref(ladder!, undefined)).toBe("/studio/ladder");
  });
});

describe("scopedTools", () => {
  it("is the set a project can offer", () => {
    const hrefs = scopedTools().map((t) => t.href);
    expect(hrefs).toContain("/studio/ladder");
    expect(hrefs).toContain("/studio/commission");
    // Standards and Knowledge are about the account, not about one job.
    expect(hrefs).not.toContain("/studio/standards");
    expect(hrefs).not.toContain("/studio/knowledge");
  });
});
