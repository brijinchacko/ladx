/**
 * The output window's log.
 *
 * Every PLC IDE has one, and it is the first place an engineer looks when
 * something is not behaving. LADX Mini had compile results in a panel that was
 * replaced by the next compile, transient flashes that vanished after three
 * seconds, and runtime errors nowhere at all — so "it said something and then
 * it went" was an accurate description of the diagnostics.
 *
 * A log rather than a status line: what happened two minutes ago is usually
 * what explains what is happening now, and a student who pressed three things
 * quickly needs to see which of them complained.
 */

export type MessageLevel = "error" | "warning" | "info" | "success";

export type LogMessage = {
  id: string;
  at: number;
  level: MessageLevel;
  /** Where it came from: Compile, Download, Simulation, Project. */
  source: string;
  text: string;
  /** Repeated identical messages collapse into one with a count. */
  count: number;
};

/** Kept short enough to stay readable and long enough to cover a session. */
export const MAX_MESSAGES = 200;

let seq = 0;
function nextId(): string {
  seq += 1;
  return `m${seq}`;
}

/**
 * Add a message, collapsing an immediate repeat into a count.
 *
 * A scanning simulator can produce the same runtime error ten times a second.
 * Without this the log is one message repeated four hundred times and the
 * thing that happened before it is off the bottom of the screen.
 */
export function pushMessage(
  log: LogMessage[],
  level: MessageLevel,
  source: string,
  text: string,
  at: number,
): LogMessage[] {
  const last = log[0];
  if (last && last.level === level && last.source === source && last.text === text) {
    return [{ ...last, count: last.count + 1, at }, ...log.slice(1)];
  }
  return [{ id: nextId(), at, level, source, text, count: 1 }, ...log].slice(0, MAX_MESSAGES);
}

export function countBy(log: LogMessage[], level: MessageLevel): number {
  return log.reduce((n, m) => (m.level === level ? n + m.count : n), 0);
}

/**
 * "14:32:07" on the reader's own clock.
 *
 * The log is read against the clock on the wall, so it has to be *their* wall.
 * This was pinned to Asia/Kolkata, which is right for one office and wrong for
 * every other reader. 24-hour is kept deliberately: a controller log is scanned
 * for ordering and duration, and am/pm makes that harder in every locale.
 */
export function stamp(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const LEVEL_STYLE: Record<MessageLevel, { colour: string; bg: string; label: string }> = {
  error: { colour: "#B3382C", bg: "#FBEAE8", label: "Error" },
  warning: { colour: "#96690A", bg: "#FBF1DF", label: "Warning" },
  info: { colour: "#3C4A57", bg: "#EEF2F6", label: "Info" },
  success: { colour: "#15803D", bg: "#E7F5EC", label: "OK" },
};
