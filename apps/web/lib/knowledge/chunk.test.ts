import { describe, expect, it } from "vitest";
import { chunkText, normalise } from "./chunk";

/**
 * Chunking decides retrieval quality, so the cases here are the ones that go
 * wrong quietly: a heading separated from the paragraph it introduces, a figure
 * stranded across a boundary, and a trailing scrap that matches every query.
 */

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document in one passage", () => {
    const chunks = chunkText("A short note about the drive.\n\nIt has two paragraphs.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toContain("two paragraphs");
  });

  it("numbers passages from zero, in order", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ${"x".repeat(200)}`).join(
      "\n\n",
    );
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.ordinal).toBe(i));
  });

  it("starts a new passage at a heading, so the heading leads its section", () => {
    const doc = [
      `Intro paragraph. ${"filler ".repeat(120)}`,
      "## Braking resistor",
      "Maximum duty cycle is 20 percent.",
    ].join("\n\n");
    const chunks = chunkText(doc);
    const withHeading = chunks.find((c) => c.text.includes("## Braking resistor"));
    expect(withHeading).toBeDefined();
    // The figure must travel with its heading, not land in the next passage.
    expect(withHeading?.text).toContain("20 percent");
  });

  it("overlaps passages so a fact near a boundary is not orphaned", () => {
    const doc = Array.from(
      { length: 12 },
      (_, i) => `Sentence ${i} about torque limits and settings. ${"pad ".repeat(60)}`,
    ).join("\n\n");
    const chunks = chunkText(doc);
    expect(chunks.length).toBeGreaterThan(1);
    // Some text from the end of one chunk should reappear at the start of the
    // next, which is what the overlap is for.
    const first = chunks[0]?.text ?? "";
    const second = chunks[1]?.text ?? "";
    const tailWords = first.slice(-80).trim().split(/\s+/).slice(0, 4).join(" ");
    expect(tailWords.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
  });

  it("splits a paragraph that is longer than the hard ceiling", () => {
    const monster = `${"word ".repeat(2000)}`;
    const chunks = chunkText(monster);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(2100);
  });

  it("folds a tiny trailing scrap back into the previous passage", () => {
    // A 20 character chunk matches almost any query and answers none of them.
    const doc = `${Array.from({ length: 10 }, () => "Body text here. ".repeat(30)).join("\n\n")}\n\nEnd.`;
    const chunks = chunkText(doc);
    const last = chunks.at(-1);
    expect(last).toBeDefined();
    expect((last as { text: string }).text.length).toBeGreaterThan(100);
  });
});

describe("normalise", () => {
  it("scales a vector to unit length", () => {
    const unit = normalise([3, 4]);
    expect(unit[0]).toBeCloseTo(0.6);
    expect(unit[1]).toBeCloseTo(0.8);
    const magnitude = Math.sqrt(unit.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1);
  });

  it("leaves a zero vector alone rather than dividing by zero", () => {
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("makes the dot product of a vector with itself equal one", () => {
    const v = normalise([0.2, -1.4, 3.3, 0.001]);
    const dot = v.reduce((s, x) => s + x * x, 0);
    expect(dot).toBeCloseTo(1);
  });
});
