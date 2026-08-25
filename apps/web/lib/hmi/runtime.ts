import { type EvalContext, evaluate } from "@/lib/hmi/expression";
import type { Binding, HmiTag, TagRef } from "@/lib/hmi/types";
import type { Tag } from "@ladx/studio";

/**
 * What the screen can see.
 *
 * Two tag spaces, deliberately separate. `plc` is the ladder program's tag
 * table, read live from the scan engine; `hmi` is what this document owns.
 * Keeping them apart means a screen cannot accidentally shadow a controller
 * tag with a local one of the same name, which is a mistake that only shows
 * up on the day the two disagree.
 */
export interface TagSpace {
  plc: Map<string, number>;
  hmi: Map<string, number>;
}

export function buildTagSpace(plcTags: Tag[], hmiTags: HmiTag[]): TagSpace {
  return {
    plc: new Map(plcTags.map((t) => [t.name, valueOfPlcTag(t)])),
    hmi: new Map(hmiTags.map((t) => [t.name, t.value])),
  };
}

/**
 * A tag's value as a screen should see it.
 *
 * A timer is not a number to an HMI: what a screen binds to is the done bit or
 * the accumulated value, and handing it the raw `value` field of a TIMER tag
 * would show nothing useful. Done reads as 1 so a lamp bound to a timer lights
 * when it times out, which is what anybody would expect it to mean.
 */
export function valueOfPlcTag(t: Tag): number {
  if (t.type === "TIMER" || t.type === "COUNTER") return t.dn ? 1 : 0;
  return t.value;
}

/**
 * Resolve `Tag.DN`, `Tag.ACC`, `Tag.PRE` the way the ladder editor writes them.
 *
 * The dotted members are how a timer is actually used, and a screen that
 * cannot reach `.ACC` cannot draw a progress bar for a bake cycle.
 */
export function readMember(tags: Tag[], name: string): number | undefined {
  const dot = name.indexOf(".");
  if (dot === -1) return undefined;
  const base = name.slice(0, dot);
  const member = name.slice(dot + 1).toUpperCase();
  const tag = tags.find((t) => t.name === base);
  if (!tag) return undefined;
  switch (member) {
    case "DN":
      return tag.dn ? 1 : 0;
    case "TT":
      return tag.tt ? 1 : 0;
    case "EN":
      return tag.en ? 1 : 0;
    case "ACC":
      return tag.acc ?? 0;
    case "PRE":
      return tag.preset ?? 0;
    default:
      return undefined;
  }
}

export function makeContext(space: TagSpace, plcTags: Tag[]): EvalContext {
  return {
    tag(source, name) {
      if (source === "plc") return space.plc.get(name) ?? readMember(plcTags, name);
      if (source === "hmi") return space.hmi.get(name);
      // Unqualified: the controller first, because that is what a screen is
      // usually about, then the HMI's own.
      return space.plc.get(name) ?? readMember(plcTags, name) ?? space.hmi.get(name);
    },
  };
}

export interface Resolved {
  value: string | number | boolean | null;
  error: string | null;
}

/** Read one binding. Never throws: a broken binding must not blank a screen. */
export function resolve(binding: Binding | undefined, ctx: EvalContext): Resolved {
  if (!binding) return { value: null, error: null };
  switch (binding.kind) {
    case "const":
      return { value: binding.value, error: null };
    case "plc": {
      const v = ctx.tag("plc", binding.tag);
      return v === undefined
        ? { value: null, error: `No PLC tag "${binding.tag}".` }
        : { value: v, error: null };
    }
    case "hmi": {
      const v = ctx.tag("hmi", binding.tag);
      return v === undefined
        ? { value: null, error: `No HMI tag "${binding.tag}".` }
        : { value: v, error: null };
    }
    case "expr":
      return evaluate(binding.source, ctx);
    default:
      return { value: null, error: "Unknown binding." };
  }
}

/** A binding read as a number, for a bar, a gauge or a numeric. */
export function resolveNumber(binding: Binding | undefined, ctx: EvalContext): number | null {
  const r = resolve(binding, ctx);
  if (r.value === null) return null;
  if (typeof r.value === "number") return r.value;
  if (typeof r.value === "boolean") return r.value ? 1 : 0;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : null;
}

/** A binding read as on/off, for a lamp or a visibility animation. */
export function resolveBool(binding: Binding | undefined, ctx: EvalContext): boolean {
  const r = resolve(binding, ctx);
  if (typeof r.value === "boolean") return r.value;
  if (typeof r.value === "number") return r.value !== 0;
  if (typeof r.value === "string") return r.value.length > 0;
  return false;
}

/* ─────────────────────────────── trends ─────────────────────────────── */

export interface Sample {
  t: number;
  v: (number | null)[];
}

/**
 * A fixed-length ring of samples.
 *
 * A trend on a screen that has been open all shift must not grow without
 * bound, and an array that is shifted every sample is O(n) per tick. The ring
 * keeps both the memory and the cost flat, which matters because this runs
 * inside the scan loop.
 */
export class TrendBuffer {
  private buf: Sample[];
  private head = 0;
  private filled = 0;

  constructor(readonly capacity: number) {
    this.buf = new Array(Math.max(1, capacity));
  }

  push(sample: Sample): void {
    this.buf[this.head] = sample;
    this.head = (this.head + 1) % this.buf.length;
    if (this.filled < this.buf.length) this.filled++;
  }

  /** Oldest first, which is the order a chart draws. */
  toArray(): Sample[] {
    const out: Sample[] = [];
    const start = (this.head - this.filled + this.buf.length) % this.buf.length;
    for (let i = 0; i < this.filled; i++) {
      const s = this.buf[(start + i) % this.buf.length];
      if (s) out.push(s);
    }
    return out;
  }

  get length(): number {
    return this.filled;
  }

  clear(): void {
    this.head = 0;
    this.filled = 0;
  }
}

/** How many samples a span at an interval needs, capped so a silly config cannot exhaust memory. */
export function capacityFor(spanSeconds: number, intervalMs: number): number {
  const n = Math.ceil((spanSeconds * 1000) / Math.max(50, intervalMs));
  return Math.min(Math.max(n, 2), 20_000);
}

/* ─────────────────────────────── writes ─────────────────────────────── */

/**
 * Apply a write from a control.
 *
 * Returns a new space rather than mutating, so a press is a value the render
 * loop consumes on its next pass instead of a side effect landing mid-frame.
 * Writing to a tag that does not exist is refused rather than creating one:
 * a typo in a button should be visible, not silently make a new tag nobody
 * else reads.
 */
export function writeTag(
  space: TagSpace,
  ref: TagRef,
  value: number,
): { space: TagSpace; error: string | null } {
  const target = ref.source === "plc" ? space.plc : space.hmi;
  if (!target.has(ref.tag)) {
    return { space, error: `No ${ref.source.toUpperCase()} tag "${ref.tag}" to write to.` };
  }
  const next: TagSpace = {
    plc: ref.source === "plc" ? new Map(space.plc) : space.plc,
    hmi: ref.source === "hmi" ? new Map(space.hmi) : space.hmi,
  };
  (ref.source === "plc" ? next.plc : next.hmi).set(ref.tag, value);
  return { space: next, error: null };
}
