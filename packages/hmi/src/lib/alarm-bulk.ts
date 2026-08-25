import type { Tag } from "@ladx/studio";
import type { AlarmCondition, AlarmDef, AlarmPriority } from "./types";

/**
 * Making alarms in bulk.
 *
 * A plant has hundreds of them and they are overwhelmingly the same few
 * shapes: every digital fault bit is one alarm, every analogue measurement is a
 * hi and a lo, sometimes a hi-hi and a lo-lo as well. Configuring those one at
 * a time is how an alarm system ends up half-built, with the last forty tags
 * never done because somebody ran out of afternoon.
 *
 * The naming and the defaults are deliberate. EEMUA 191 and ISA-18.2 both warn
 * that a flood of same-priority alarms is worse than none, so a bulk run
 * defaults the analogue outers to a higher priority than the inners and leaves
 * everything at a sane deadband rather than zero, which chatters.
 */

export interface BulkOptions {
  /** Which conditions to make for each tag. */
  conditions: AlarmCondition[];
  priority: AlarmPriority;
  /** Outer limits get one step up: a hi-hi matters more than a hi. */
  escalateOuter: boolean;
  /** Percent of span, so one setting works across tags with different ranges. */
  hiPercent: number;
  hihiPercent: number;
  loPercent: number;
  loloPercent: number;
  deadbandPercent: number;
  onDelay: number;
  /** For digital tags: does 1 or 0 mean bad? */
  trueIsAlarm: boolean;
  /** Assumed engineering range when a tag does not carry one. */
  rangeMin: number;
  rangeMax: number;
  /** Skip a tag that already has an alarm of the same condition. */
  skipExisting: boolean;
}

export const DEFAULT_BULK: BulkOptions = {
  conditions: ["hi", "lo"],
  priority: "medium",
  escalateOuter: true,
  hiPercent: 80,
  hihiPercent: 90,
  loPercent: 20,
  loloPercent: 10,
  deadbandPercent: 2,
  onDelay: 0,
  trueIsAlarm: true,
  rangeMin: 0,
  rangeMax: 100,
  skipExisting: true,
};

const UP: Record<AlarmPriority, AlarmPriority> = {
  journal: "low",
  low: "medium",
  medium: "high",
  high: "critical",
  critical: "critical",
};

/** Which conditions make sense for a tag: a BOOL cannot have a hi limit. */
export function conditionsForTag(tag: Tag): AlarmCondition[] {
  return tag.type === "BOOL" ? ["digital"] : ["hi", "hihi", "lo", "lolo", "deviation", "roc"];
}

const LABEL: Record<AlarmCondition, string> = {
  digital: "fault",
  hi: "high",
  hihi: "high high",
  lo: "low",
  lolo: "low low",
  deviation: "deviation",
  roc: "rate of change",
};

/**
 * A message an operator can act on.
 *
 * The tag's own comment when it has one, because "Bearing temperature high"
 * beats "TT_104_PV high" at three in the morning. Underscores become spaces
 * either way: a tag name is an identifier, not a sentence.
 */
export function messageFor(tag: Tag, condition: AlarmCondition): string {
  const subject = tag.comment?.trim() || tag.name.replace(/_/g, " ");
  return `${subject} ${LABEL[condition]}`;
}

function setpointFor(condition: AlarmCondition, o: BulkOptions, lo: number, hi: number): number {
  const span = hi - lo;
  const at = (pct: number) => lo + (span * pct) / 100;
  switch (condition) {
    case "hi":
      return at(o.hiPercent);
    case "hihi":
      return at(o.hihiPercent);
    case "lo":
      return at(o.loPercent);
    case "lolo":
      return at(o.loloPercent);
    default:
      return at(o.hiPercent);
  }
}

export interface BulkResult {
  alarms: AlarmDef[];
  /** Tags that were skipped, and why, so a run is never silently partial. */
  skipped: { tag: string; reason: string }[];
}

/**
 * Build the alarms for a set of tags.
 *
 * Pure, so the dialog can show exactly what a run will produce before it
 * commits. A bulk operation that cannot be previewed is one people are right
 * to be afraid of.
 */
export function buildBulkAlarms(
  tags: Tag[],
  options: Partial<BulkOptions>,
  existing: AlarmDef[] = [],
): BulkResult {
  const o = { ...DEFAULT_BULK, ...options };
  const alarms: AlarmDef[] = [];
  const skipped: { tag: string; reason: string }[] = [];

  const have = new Set(existing.map((a) => `${a.target.tag}::${a.condition}`));
  const lo = Math.min(o.rangeMin, o.rangeMax);
  const hi = Math.max(o.rangeMin, o.rangeMax);
  const span = hi - lo || 1;
  let n = 0;

  for (const tag of tags) {
    const allowed = conditionsForTag(tag);
    const wanted = o.conditions.filter((c) => allowed.includes(c));

    if (wanted.length === 0) {
      skipped.push({
        tag: tag.name,
        reason:
          tag.type === "BOOL"
            ? "a BOOL takes only a digital alarm"
            : "no analogue condition was chosen",
      });
      continue;
    }

    for (const condition of wanted) {
      if (o.skipExisting && have.has(`${tag.name}::${condition}`)) {
        skipped.push({ tag: tag.name, reason: `already has a ${LABEL[condition]} alarm` });
        continue;
      }
      const outer = condition === "hihi" || condition === "lolo";
      alarms.push({
        // Deterministic rather than random: running the same build twice
        // produces the same ids, so a preview matches what gets committed.
        id: `bulk-${tag.name}-${condition}-${n++}`.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        target: { source: "plc", tag: tag.name },
        condition,
        ...(condition === "digital"
          ? { trueIsAlarm: o.trueIsAlarm }
          : {
              setpoint: round2(setpointFor(condition, o, lo, hi)),
              deadband: round2((span * o.deadbandPercent) / 100),
            }),
        onDelay: o.onDelay,
        priority: o.escalateOuter && outer ? UP[o.priority] : o.priority,
        message: messageFor(tag, condition),
        enabled: true,
      });
    }
  }

  return { alarms, skipped };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
