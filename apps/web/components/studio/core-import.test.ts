// The import button says what it will open. It has to be able to open it.
//
// The label, the file-picker filter and the branch that chooses a reader are
// three separate strings in one file, and nothing tied them together: the
// button said "Open an L5X or SCL" while the picker filtered to .L5X only,
// which is a button that cannot do what it says.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(__dirname, "core-import.ts"), "utf8");

describe("the import button", () => {
  it("offers every extension its label promises", () => {
    const label = source.match(/label:\s*"([^"]+)"/)?.[1] ?? "";
    const accept = source.match(/input\.accept\s*=\s*"([^"]+)"/)?.[1] ?? "";
    expect(label.length).toBeGreaterThan(0);

    if (/L5X/i.test(label)) {
      expect(accept.toLowerCase(), "the label offers L5X").toContain(".l5x");
    }
    if (/SCL/i.test(label)) {
      expect(accept.toLowerCase(), "the label offers SCL").toContain(".scl");
    }
  });

  it("routes every offered extension to a reader", () => {
    const accept = (source.match(/input\.accept\s*=\s*"([^"]+)"/)?.[1] ?? "")
      .split(",")
      .map((e) => e.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean);
    // The branch that picks the SCL reader, as a real regex rather than as a
    // claim about one.
    const branch = source.match(/\/\\\.\(([a-z|]+)\)\$\/i\.test\(file\.name\)/)?.[1] ?? "";
    const scl = new Set(branch.split("|").filter(Boolean));

    for (const ext of new Set(accept)) {
      const routed = scl.has(ext) || ext === "l5x" || ext === "xml";
      expect(routed, `.${ext} is offered but no reader claims it`).toBe(true);
    }
  });

  it("says that SCL carries no addresses, where somebody importing one will read it", () => {
    // An I/O list built from an SCL import is empty for a reason, and the
    // reason belongs next to the import rather than on a settings page.
    expect(source).toContain("no hardware addresses");
  });

  it("says when the import is not the whole program", () => {
    // The failure this guards against is silent: an IR that looks complete and
    // is missing rungs makes every analysis downstream confidently wrong.
    expect(source).toContain("not the whole program");
  });
});
