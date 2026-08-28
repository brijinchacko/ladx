/**
 * What a recording must not lose.
 *
 * The whole value of keeping history is that it can be trusted afterwards, so
 * the tests are about the ways a naive implementation quietly lies: a spike
 * averaged away, a gap in the data drawn as a zero, and a bound that is not
 * actually bounded.
 */

import { describe, expect, it } from "vitest";
import { Historian, historyToCsv } from "./historian";

const opts = { liveSamples: 4, buckets: 100, bucketMs: 1000 };

describe("keeping the recent past whole", () => {
  it("holds samples at full resolution until it has to compact", () => {
    const h = new Historian(["a"], opts);
    for (let i = 0; i < 4; i++) h.push({ t: i * 100, v: [i] });
    const all = h.all();
    expect(all).toHaveLength(4);
    expect(all.every((b) => b.span === 0)).toBe(true);
  });

  it("draws a live sample as a band of zero width, so both render alike", () => {
    const h = new Historian(["a"], opts);
    h.push({ t: 0, v: [7] });
    expect(h.all()[0]).toEqual({ t: 0, span: 0, lo: [7], hi: [7] });
  });
});

describe("compaction keeps the spike", () => {
  it("keeps the minimum and maximum of a bucket, not the mean", () => {
    const h = new Historian(["a"], opts);
    // A flat run with one excursion, all inside one bucket. An average would
    // put the excursion at about 20 and the chart would show nothing.
    h.push({ t: 0, v: [10] });
    h.push({ t: 100, v: [10] });
    h.push({ t: 200, v: [900] });
    h.push({ t: 300, v: [10] });
    for (let i = 0; i < 6; i++) h.push({ t: 2000 + i * 100, v: [10] });

    const compacted = h.all().filter((b) => b.span > 0);
    expect(compacted.length).toBeGreaterThan(0);
    const first = compacted[0];
    expect(first?.lo).toEqual([10]);
    expect(first?.hi).toEqual([900]);
  });

  it("puts a bucket on a clock boundary rather than on the push count", () => {
    const h = new Historian(["a"], opts);
    for (let i = 0; i < 10; i++) h.push({ t: 1234 + i * 100, v: [i] });
    const compacted = h.all().filter((b) => b.span > 0);
    // Floor of 1234 against a 1000 ms bucket.
    expect(compacted[0]?.t).toBe(1000);
  });

  it("compacts every pen independently", () => {
    const h = new Historian(["a", "b"], opts);
    h.push({ t: 0, v: [1, 100] });
    h.push({ t: 100, v: [5, 50] });
    for (let i = 0; i < 6; i++) h.push({ t: 2000 + i * 100, v: [0, 0] });
    const first = h.all().find((b) => b.span > 0);
    expect(first?.lo).toEqual([1, 50]);
    expect(first?.hi).toEqual([5, 100]);
  });
});

describe("a gap is not a zero", () => {
  it("carries a null through compaction rather than folding it in as zero", () => {
    const h = new Historian(["a"], opts);
    // A tank at 80 with two readings that could not be taken. Treating null
    // as zero would record a minimum of 0 and draw the tank emptying.
    h.push({ t: 0, v: [80] });
    h.push({ t: 100, v: [null] });
    h.push({ t: 200, v: [null] });
    h.push({ t: 300, v: [82] });
    for (let i = 0; i < 6; i++) h.push({ t: 2000 + i * 100, v: [80] });

    const first = h.all().find((b) => b.span > 0);
    expect(first?.lo).toEqual([80]);
    expect(first?.hi).toEqual([82]);
  });

  it("records null for a bucket where nothing was readable at all", () => {
    const h = new Historian(["a"], opts);
    for (let i = 0; i < 4; i++) h.push({ t: i * 100, v: [null] });
    for (let i = 0; i < 6; i++) h.push({ t: 2000 + i * 100, v: [1] });
    const first = h.all().find((b) => b.span > 0);
    expect(first?.lo).toEqual([null]);
    expect(first?.hi).toEqual([null]);
  });

  it("ignores a non-finite value rather than storing NaN", () => {
    const h = new Historian(["a"], opts);
    h.push({ t: 0, v: [5] });
    h.push({ t: 100, v: [Number.NaN] });
    for (let i = 0; i < 8; i++) h.push({ t: 2000 + i * 100, v: [5] });
    const first = h.all().find((b) => b.span > 0);
    expect(first?.lo).toEqual([5]);
    expect(first?.hi).toEqual([5]);
  });
});

describe("it stays bounded", () => {
  it("never exceeds its bucket count however long the run", () => {
    const h = new Historian(["a"], { liveSamples: 2, buckets: 5, bucketMs: 1000 });
    for (let i = 0; i < 500; i++) h.push({ t: i * 1000, v: [i] });
    const compacted = h.all().filter((b) => b.span > 0);
    expect(compacted.length).toBeLessThanOrEqual(5);
  });

  it("loses the beginning rather than the end", () => {
    const h = new Historian(["a"], { liveSamples: 2, buckets: 3, bucketMs: 1000 });
    for (let i = 0; i < 50; i++) h.push({ t: i * 1000, v: [i] });
    const all = h.all();
    const last = all[all.length - 1];
    expect(last?.hi).toEqual([49]);
  });

  it("terminates on a sample wider than a whole bucket", () => {
    const h = new Historian(["a"], { liveSamples: 1, buckets: 10, bucketMs: 10 });
    // Each sample is its own bucket and then some. A compaction loop that
    // waits for a sample inside the window would never finish.
    for (let i = 0; i < 20; i++) h.push({ t: i * 100_000, v: [i] });
    expect(h.length).toBeGreaterThan(0);
  });
});

describe("querying", () => {
  const h = new Historian(["a"], { liveSamples: 200, buckets: 100, bucketMs: 1000 });
  for (let i = 0; i < 50; i++) h.push({ t: i * 1000, v: [i] });

  it("returns what overlaps the window", () => {
    const got = h.range(10_000, 20_000);
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((b) => b.t + b.span >= 10_000 && b.t <= 20_000)).toBe(true);
  });

  it("does not care which way round the window is given", () => {
    expect(h.range(20_000, 10_000).length).toBe(h.range(10_000, 20_000).length);
  });

  it("reports the extent of what it holds", () => {
    const e = h.extent();
    expect(e?.from).toBe(0);
    expect(e?.to).toBeGreaterThanOrEqual(49_000);
  });

  it("has no extent when nothing has been recorded", () => {
    expect(new Historian(["a"]).extent()).toBeNull();
  });
});

describe("round trip", () => {
  it("survives being written out and read back", () => {
    const h = new Historian(["a", "b"], opts);
    for (let i = 0; i < 20; i++) h.push({ t: i * 300, v: [i, i * 2] });
    const back = Historian.fromJSON(["a", "b"], JSON.parse(JSON.stringify(h.toJSON())), opts);
    expect(back.all()).toEqual(h.all());
  });

  it("survives rubbish rather than throwing", () => {
    for (const bad of [null, undefined, 42, "x", {}, { old: "no" }, { live: 3 }]) {
      expect(() => Historian.fromJSON(["a"], bad)).not.toThrow();
    }
    expect(Historian.fromJSON(["a"], { old: [{ nonsense: 1 }] }).length).toBe(0);
  });
});

describe("CSV", () => {
  it("carries the low and the high in separate columns", () => {
    const h = new Historian(["Level"], opts);
    h.push({ t: 0, v: [42] });
    const csv = historyToCsv(h);
    const [head, first] = csv.split("\n");
    expect(head).toBe("timestamp_utc,epoch_ms,span_ms,Level_lo,Level_hi");
    expect(first?.endsWith("42,42")).toBe(true);
  });

  it("writes timestamps in UTC, so a clock change does not repeat an hour", () => {
    const h = new Historian(["a"], opts);
    h.push({ t: 1_700_000_000_000, v: [1] });
    expect(historyToCsv(h)).toContain("2023-11-14T22:13:20.000Z");
  });

  it("leaves a gap empty rather than writing a zero", () => {
    const h = new Historian(["a"], opts);
    h.push({ t: 0, v: [null] });
    expect(historyToCsv(h).split("\n")[1]?.endsWith(",,")).toBe(true);
  });

  it("quotes a pen name containing a comma", () => {
    const h = new Historian(['Tank "A", level'], opts);
    expect(historyToCsv(h).split("\n")[0]).toContain('"Tank ""A"", level_lo"');
  });
});
