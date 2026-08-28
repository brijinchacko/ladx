/**
 * What the assistant is called, and the mark it carries.
 *
 * **LADX AI.** It says whose it is and what it is, and it needs no explaining
 * to somebody who has just arrived. A cleverer name buys recognition among
 * people who already use the product and costs it with everybody else, which
 * is the wrong way round for a thing most people meet on their first visit.
 *
 * One constant, so renaming is one edit rather than a hunt across five tools
 * and the marketing site.
 */

export const ASSISTANT = {
  /** The name on its own. */
  name: "LADX AI",
  full: "LADX AI",
  blurb: "Writes, draws and changes what you are working on.",
} as const;

/**
 * What it says it is doing, per tool.
 *
 * Named after the work rather than after itself, because the name alone in five
 * different tools tells nobody what it will do there, and a name plus a verb
 * does.
 */
export const RELAY_TITLES = {
  ladder: "LADX AI, write logic",
  cad: "LADX AI, draw",
  hmi: "LADX AI, build a screen",
  convert: "LADX AI, this conversion",
  monitor: "LADX AI, the logic",
  planner: "LADX AI, the plan",
} as const;

export type RelayTool = keyof typeof RELAY_TITLES;
