/**
 * What the assistant is called.
 *
 * **Relay.**
 *
 * A relay is the oldest thing in this trade: the component every ladder diagram
 * is a picture of, and the reason a rung is drawn the way it is. It also means
 * to pass something along, which is what the assistant does. Somebody who has
 * wired a panel reads it as belonging here; somebody who has not still reads it
 * as a name rather than as a category.
 *
 * The alternatives were worse in specific ways. "LADX Copilot" borrows a name
 * that now means a particular product from a particular company, and every
 * third tool has one. "Assistant" and "AI" are labels, not names, and nobody
 * says "I asked Assistant". "Rung" and "Coil" are as on-brand but read as
 * jargon to the half of the audience who arrive from a search rather than from
 * a panel shop.
 *
 * One constant, so renaming it is one edit rather than a search across five
 * tools and the marketing site.
 */

export const ASSISTANT = {
  /** The name on its own. Used in the header and anywhere it is addressed. */
  name: "Relay",
  /** When it needs to be clear whose it is: first mention on a page. */
  full: "LADX Relay",
  /** What it is, in a few words, for a tooltip or a first meeting. */
  blurb: "The assistant that writes, draws and changes what you are working on.",
} as const;

/**
 * What it says it is doing, per tool.
 *
 * The title in the panel header. Named after the work rather than after itself,
 * because "Relay" alone in five different tools tells nobody what it will do
 * there, and a name plus a verb does.
 */
export const RELAY_TITLES = {
  ladder: "Relay, write logic",
  cad: "Relay, draw",
  hmi: "Relay, build a screen",
  convert: "Relay, about this conversion",
  monitor: "Relay, about the logic",
  planner: "Relay, change the plan",
} as const;

export type RelayTool = keyof typeof RELAY_TITLES;
