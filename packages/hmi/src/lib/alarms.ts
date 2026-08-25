import type { AlarmDef, AlarmPriority } from "./types";

/**
 * The alarm state machine from ISA-18.2, and the evaluation that drives it.
 *
 * The states are the standard's, and the two rules worth stating plainly
 * because naive implementations get both wrong:
 *
 *   1. Acknowledging does not clear an alarm. If the condition still holds the
 *      alarm stays active; the operator has said "I have seen this", not "this
 *      is over". An implementation that removes an acked alarm from the list
 *      hides a live process problem behind a button press.
 *
 *   2. An alarm that goes away before anybody acknowledged it does not
 *      disappear. It sits in RTN_UNACK until acknowledged, because a condition
 *      that came and went in the night is exactly the one the operator needs
 *      to find in the morning.
 *
 * Everything here is pure: state in, state out. That is what makes it
 * testable, and an alarm system that cannot be tested is a liability.
 */

export type AlarmState =
  /** No condition, nothing outstanding. */
  | "NORMAL"
  /** Condition present, not acknowledged. The one that should be loud. */
  | "UNACK"
  /** Condition present, acknowledged. Still a live problem. */
  | "ACK"
  /** Condition gone, never acknowledged. Stays until somebody looks. */
  | "RTN_UNACK"
  /** Temporarily removed by the operator, with an expiry. */
  | "SHELVED"
  /** Removed by design, e.g. a unit is down. Not an operator action. */
  | "SUPPRESSED"
  /** Broken instrument, taken out by maintenance. */
  | "OUT_OF_SERVICE";

export interface AlarmRuntime {
  id: string;
  state: AlarmState;
  /** When the condition last became true. */
  raisedAt?: number;
  /** When it last cleared. */
  clearedAt?: number;
  ackedAt?: number;
  /** Epoch ms when a shelf expires and the alarm comes back by itself. */
  shelvedUntil?: number;
  /** How many times it has gone active. Chattering alarms show up here. */
  count: number;
  /** Set while an on-delay is counting down, so it survives across scans. */
  pendingSince?: number;
}

export interface AlarmEvent {
  at: number;
  alarmId: string;
  kind: "raised" | "cleared" | "acked" | "shelved" | "unshelved";
  message: string;
  priority: AlarmPriority;
}

export function newRuntime(id: string): AlarmRuntime {
  return { id, state: "NORMAL", count: 0 };
}

/** Whether an alarm in this state is a live process condition. */
export function isActive(state: AlarmState): boolean {
  return state === "UNACK" || state === "ACK";
}

/** Whether it should still be on the summary: active, or waiting to be seen. */
export function isOutstanding(state: AlarmState): boolean {
  return isActive(state) || state === "RTN_UNACK";
}

/** Whether the operator has anything to do about it. */
export function needsAck(state: AlarmState): boolean {
  return state === "UNACK" || state === "RTN_UNACK";
}

export const PRIORITY_ORDER: AlarmPriority[] = ["critical", "high", "medium", "low", "journal"];

export function priorityRank(p: AlarmPriority): number {
  const i = PRIORITY_ORDER.indexOf(p);
  return i === -1 ? PRIORITY_ORDER.length : i;
}

/**
 * Is the raw condition true right now, ignoring delays and state?
 *
 * The deadband is asymmetric on purpose. A hi alarm at 80 with a deadband of 2
 * trips at 80 and clears at 78; a lo alarm at 20 with the same deadband trips
 * at 20 and clears at 22. Applying it the same way round for both is a common
 * bug and produces an alarm that will not clear.
 */
export function conditionMet(def: AlarmDef, value: number, wasActive: boolean): boolean {
  const db = Math.abs(def.deadband ?? 0);
  const sp = def.setpoint ?? 0;

  switch (def.condition) {
    case "digital": {
      const on = value !== 0;
      return def.trueIsAlarm === false ? !on : on;
    }
    case "hi":
    case "hihi":
      // Once active, hold until it falls back through the deadband.
      return wasActive ? value > sp - db : value >= sp;
    case "lo":
    case "lolo":
      return wasActive ? value < sp + db : value <= sp;
    case "deviation":
      return wasActive ? Math.abs(value) > Math.abs(sp) - db : Math.abs(value) >= Math.abs(sp);
    case "roc":
      // Rate of change arrives already differentiated by the caller.
      return wasActive ? Math.abs(value) > Math.abs(sp) - db : Math.abs(value) >= Math.abs(sp);
    default:
      return false;
  }
}

/**
 * Advance one alarm by one evaluation.
 *
 * `now` is passed rather than read so the whole thing stays pure and a test
 * can drive an on-delay without waiting for a clock.
 */
export function stepAlarm(
  def: AlarmDef,
  rt: AlarmRuntime,
  value: number,
  now: number,
): { runtime: AlarmRuntime; events: AlarmEvent[] } {
  const events: AlarmEvent[] = [];
  const emit = (kind: AlarmEvent["kind"]) =>
    events.push({ at: now, alarmId: def.id, kind, message: def.message, priority: def.priority });

  // Out of service and suppressed are engineering decisions, not process
  // states: nothing the value does moves them.
  if (rt.state === "OUT_OF_SERVICE" || rt.state === "SUPPRESSED") return { runtime: rt, events };

  if (!def.enabled) {
    return { runtime: { ...rt, state: "NORMAL", pendingSince: undefined }, events };
  }

  // A shelf expires by itself. Coming back to NORMAL rather than to the old
  // state is deliberate: the condition is re-evaluated from scratch below on
  // the next call, so a shelf that outlived the problem does not re-announce it.
  if (rt.state === "SHELVED") {
    if (rt.shelvedUntil !== undefined && now >= rt.shelvedUntil) {
      emit("unshelved");
      return {
        runtime: { ...rt, state: "NORMAL", shelvedUntil: undefined, pendingSince: undefined },
        events,
      };
    }
    return { runtime: rt, events };
  }

  const wasActive = isActive(rt.state);
  const met = conditionMet(def, value, wasActive);

  // On-delay. Held in the runtime so a condition that flickers below the
  // delay never raises, which is most of what a delay is for.
  const delayMs = Math.max(0, (def.onDelay ?? 0) * 1000);
  let pendingSince = rt.pendingSince;
  let confirmed = met;
  if (met && !wasActive && delayMs > 0) {
    if (pendingSince === undefined) pendingSince = now;
    confirmed = now - pendingSince >= delayMs;
  }
  if (!met) pendingSince = undefined;

  if (confirmed && !wasActive) {
    emit("raised");
    return {
      runtime: {
        ...rt,
        state: "UNACK",
        raisedAt: now,
        clearedAt: undefined,
        count: rt.count + 1,
        pendingSince: undefined,
      },
      events,
    };
  }

  if (!met && wasActive) {
    // Acknowledged before it cleared: nothing outstanding, so it goes quiet.
    // Never acknowledged: it waits in RTN_UNACK to be found.
    const next: AlarmState = rt.state === "ACK" ? "NORMAL" : "RTN_UNACK";
    emit("cleared");
    return { runtime: { ...rt, state: next, clearedAt: now, pendingSince: undefined }, events };
  }

  // Re-arming from RTN_UNACK: the condition came back before anybody looked.
  if (confirmed && rt.state === "RTN_UNACK") {
    emit("raised");
    return {
      runtime: {
        ...rt,
        state: "UNACK",
        raisedAt: now,
        count: rt.count + 1,
        pendingSince: undefined,
      },
      events,
    };
  }

  return { runtime: { ...rt, pendingSince }, events };
}

/**
 * Acknowledge.
 *
 * An active alarm becomes ACK and stays on the list. One that had already
 * returned to normal has nothing left to show, so it goes to NORMAL. Anything
 * else is not acknowledgeable and is left alone rather than forced.
 */
export function acknowledge(rt: AlarmRuntime, now: number): AlarmRuntime {
  if (rt.state === "UNACK") return { ...rt, state: "ACK", ackedAt: now };
  if (rt.state === "RTN_UNACK") return { ...rt, state: "NORMAL", ackedAt: now };
  return rt;
}

/**
 * Shelve, with an expiry.
 *
 * ISA-18.2 wants shelving to be temporary and tracked, so there is no way to
 * shelve something forever from here: that is what out-of-service is for, and
 * it is a maintenance decision with a different audit trail.
 */
export function shelve(rt: AlarmRuntime, minutes: number, now: number): AlarmRuntime {
  const mins = Math.max(1, Math.min(minutes, 24 * 60));
  return { ...rt, state: "SHELVED", shelvedUntil: now + mins * 60_000 };
}

export function unshelve(rt: AlarmRuntime): AlarmRuntime {
  if (rt.state !== "SHELVED") return rt;
  return { ...rt, state: "NORMAL", shelvedUntil: undefined };
}

export function setOutOfService(rt: AlarmRuntime, out: boolean): AlarmRuntime {
  if (out) return { ...rt, state: "OUT_OF_SERVICE" };
  return rt.state === "OUT_OF_SERVICE" ? { ...rt, state: "NORMAL" } : rt;
}

/**
 * The summary, ordered the way an operator reads it.
 *
 * Unacknowledged first regardless of priority, because the point of the list
 * is what has not been seen; then by priority; then newest first.
 */
export function sortForSummary(
  rows: { runtime: AlarmRuntime; def: AlarmDef }[],
): { runtime: AlarmRuntime; def: AlarmDef }[] {
  return [...rows].sort((a, b) => {
    const ackA = needsAck(a.runtime.state) ? 0 : 1;
    const ackB = needsAck(b.runtime.state) ? 0 : 1;
    if (ackA !== ackB) return ackA - ackB;
    const p = priorityRank(a.def.priority) - priorityRank(b.def.priority);
    if (p !== 0) return p;
    return (b.runtime.raisedAt ?? 0) - (a.runtime.raisedAt ?? 0);
  });
}
