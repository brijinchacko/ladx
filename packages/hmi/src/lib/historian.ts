/**
 * A recording of a run, kept and queryable.
 *
 * The trend buffer is a ring: it holds the last few minutes and throws away
 * everything before that. That is right for a live chart and useless for the
 * question people actually ask afterwards, which is what the temperature was
 * doing during the batch that failed.
 *
 * Be precise about what this is, because "historian" is a word with a large
 * meaning attached. In LADX the runtime is the simulator, so this records a
 * simulated run: it is a test record you can scrub, compare and attach to a
 * factory acceptance test. It is not a plant historian, it is not fed by real
 * instruments, and calling it one would be the sort of claim that gets found
 * out at the worst moment.
 *
 * ## Why min and max rather than an average
 *
 * A long run cannot be kept at full resolution, so older samples are compacted.
 * The obvious compaction is an average per bucket, and it is wrong in a way
 * that matters: averaging removes the spike, and the spike is the reason
 * somebody is looking. A one second excursion in a five minute bucket vanishes
 * completely and the chart shows a flat line through the exact moment the
 * machine tripped.
 *
 * So each bucket keeps its minimum and its maximum, and the chart draws the
 * envelope. The excursion survives compaction, the shape is honest about being
 * a range rather than a reading, and the storage is bounded. This is what real
 * historians do and it is the whole reason to trust one.
 */

/** One instant, one value per pen. Null is "not readable then", not zero. */
export interface HistorySample {
  t: number;
  v: (number | null)[];
}

/**
 * A compacted bucket: the envelope of everything that happened inside it.
 *
 * `lo` and `hi` per pen. A chart draws them as a band; a single value is a
 * band of zero width, so live samples and compacted ones render the same way.
 */
export interface HistoryBucket {
  t: number;
  /** Bucket width in milliseconds. Zero for an uncompacted sample. */
  span: number;
  lo: (number | null)[];
  hi: (number | null)[];
}

export interface HistorianOptions {
  /**
   * How many samples to keep at full resolution before compacting.
   *
   * The recent past is what somebody looks at most and is where resolution
   * matters, so it is kept whole.
   */
  liveSamples?: number;
  /** How many compacted buckets to keep. The hard bound on memory. */
  buckets?: number;
  /** Bucket width. Older data is folded into buckets this wide. */
  bucketMs?: number;
}

const DEFAULTS = {
  liveSamples: 900,
  buckets: 2_000,
  bucketMs: 5_000,
} as const;

/**
 * Widen a band to include a value, treating null as no information.
 *
 * A null is a reading that could not be taken, which is different from a
 * reading of zero. Folding it in as zero is how a historian ends up showing a
 * tank emptying every time the connection stuttered.
 */
function widen(band: (number | null)[], i: number, v: number | null, pick: "lo" | "hi"): void {
  if (v === null || !Number.isFinite(v)) return;
  const cur = band[i];
  if (cur === null || cur === undefined) {
    band[i] = v;
    return;
  }
  band[i] = pick === "lo" ? Math.min(cur, v) : Math.max(cur, v);
}

export class Historian {
  private live: HistorySample[] = [];
  private old: HistoryBucket[] = [];
  private readonly opts: Required<HistorianOptions>;

  constructor(
    /** Which pens this is recording, in the order their values arrive. */
    readonly pens: string[],
    options: HistorianOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
  }

  push(sample: HistorySample): void {
    this.live.push(sample);
    if (this.live.length > this.opts.liveSamples) this.compactOldest();
  }

  /**
   * Fold the oldest live samples into one bucket.
   *
   * Everything inside one bucket window goes at once rather than one sample at
   * a time, so the boundary is on the clock rather than on how often push was
   * called, and two runs of the same process compact the same way.
   */
  private compactOldest(): void {
    const first = this.live[0];
    if (!first) return;
    const edge = Math.floor(first.t / this.opts.bucketMs) * this.opts.bucketMs;
    const end = edge + this.opts.bucketMs;

    const taken: HistorySample[] = [];
    while (this.live.length > 0) {
      const s = this.live[0];
      if (!s || s.t >= end) break;
      taken.push(s);
      this.live.shift();
    }
    if (taken.length === 0) {
      // A single sample wider than a bucket. Drop it into its own bucket
      // rather than looping forever on it.
      const s = this.live.shift();
      if (s) taken.push(s);
      if (taken.length === 0) return;
    }

    const lo: (number | null)[] = new Array(this.pens.length).fill(null);
    const hi: (number | null)[] = new Array(this.pens.length).fill(null);
    for (const s of taken) {
      for (let i = 0; i < this.pens.length; i++) {
        widen(lo, i, s.v[i] ?? null, "lo");
        widen(hi, i, s.v[i] ?? null, "hi");
      }
    }

    this.old.push({ t: edge, span: this.opts.bucketMs, lo, hi });
    // Oldest first out. A run long enough to overflow loses its beginning,
    // which is the right end to lose: the question is nearly always about
    // what just happened.
    while (this.old.length > this.opts.buckets) this.old.shift();
  }

  /** Everything, oldest first, as bands. Live samples are zero-width bands. */
  all(): HistoryBucket[] {
    const liveAsBuckets = this.live.map((s) => ({
      t: s.t,
      span: 0,
      lo: [...s.v],
      hi: [...s.v],
    }));
    return [...this.old, ...liveAsBuckets];
  }

  /** What was happening between two instants. */
  range(from: number, to: number): HistoryBucket[] {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    return this.all().filter((b) => b.t + b.span >= lo && b.t <= hi);
  }

  /** The instants recorded, or null when nothing has been. */
  extent(): { from: number; to: number } | null {
    const all = this.all();
    const first = all[0];
    const last = all[all.length - 1];
    if (!first || !last) return null;
    return { from: first.t, to: last.t + last.span };
  }

  get length(): number {
    return this.old.length + this.live.length;
  }

  clear(): void {
    this.live = [];
    this.old = [];
  }

  /**
   * Restore a recording, for a run that outlives the page.
   *
   * Defensive about shape: a recording written by an older build, or a partial
   * write, must not take the editor down on load.
   */
  static fromJSON(pens: string[], raw: unknown, options?: HistorianOptions): Historian {
    const h = new Historian(pens, options);
    const obj = raw as { old?: unknown; live?: unknown } | null;
    if (obj && Array.isArray(obj.old)) {
      h.old = (obj.old as HistoryBucket[]).filter(
        (b) => b && typeof b.t === "number" && Array.isArray(b.lo) && Array.isArray(b.hi),
      );
    }
    if (obj && Array.isArray(obj.live)) {
      h.live = (obj.live as HistorySample[]).filter(
        (s) => s && typeof s.t === "number" && Array.isArray(s.v),
      );
    }
    return h;
  }

  toJSON(): { pens: string[]; old: HistoryBucket[]; live: HistorySample[] } {
    return { pens: this.pens, old: this.old, live: this.live };
  }
}

/**
 * A recording as CSV.
 *
 * A historian nothing can get data out of is a black box, and the first thing
 * anybody wants to do with a run is put it beside another one in a spreadsheet.
 *
 * Compacted rows carry their low and high in separate columns rather than being
 * flattened to a midpoint, because flattening here would undo the entire reason
 * for keeping min and max in the first place. ISO timestamps in UTC, since a
 * recording that crosses a clock change and stores local time has an hour that
 * happens twice.
 */
export function historyToCsv(h: Historian): string {
  const head = [
    "timestamp_utc",
    "epoch_ms",
    "span_ms",
    ...h.pens.flatMap((p) => [`${p}_lo`, `${p}_hi`]),
  ];
  const rows = h
    .all()
    .map((b) => [
      new Date(b.t).toISOString(),
      String(b.t),
      String(b.span),
      ...h.pens.flatMap((_, i) => [
        b.lo[i] === null || b.lo[i] === undefined ? "" : String(b.lo[i]),
        b.hi[i] === null || b.hi[i] === undefined ? "" : String(b.hi[i]),
      ]),
    ]);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
