/**
 * How a sidebar looks, in one place.
 *
 * The Studio runs on the web and on the desktop, and a person moving between
 * them is looking at the same product. When each surface carried its own
 * sidebar the desktop drifted: four of its tools had no sidebar at all, and
 * the ones that did were a different width, a different type scale and a
 * different active state.
 *
 * Class strings rather than components, because the two surfaces need their
 * own link element and their own idea of what is active, and the part that has
 * to match is the appearance. Nothing here imports from a framework, so it
 * belongs to both.
 */

/*
 * The pane, with no line down the side of it.
 *
 * A rule between the sidebar and the work is the first thing to go when you
 * look at what the tools people actually use every day do: neither ChatGPT nor
 * Claude draws one. The pane is a slightly different ground, and that is
 * enough to say where it ends. The line only added weight.
 */

/** The pane itself, expanded. */
export const SIDEBAR_ASIDE = "flex w-64 shrink-0 flex-col bg-ink-50/60";

/** The pane collapsed to icons. */
export const SIDEBAR_ASIDE_COLLAPSED = "flex w-14 shrink-0 flex-col items-center bg-ink-50/60 py-3";

/** Brand block at the top, and the control that collapses the pane. */
export const SIDEBAR_BRAND = "flex items-center justify-between px-4 py-3.5";
export const SIDEBAR_BRAND_LINK = "flex flex-col items-start gap-0.5";
export const SIDEBAR_BRAND_SUB =
  "pl-[1px] font-mono text-[9.5px] uppercase leading-none tracking-[0.34em] text-ink-400";
export const SIDEBAR_COLLAPSE_BUTTON =
  "flex h-7 w-7 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-700";
export const SIDEBAR_EXPAND_BUTTON =
  "mb-3 flex h-9 w-9 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900";

/** The scrolling middle. */
export const SIDEBAR_BODY = "flex-1 overflow-y-auto px-3 pb-3";

/** The account block pinned to the foot. No rule above it, for the same reason. */
export const SIDEBAR_FOOT = "p-3";

/** A labelled group of rows. */
/*
 * Groups are separated by space and a quiet label, never by a rule.
 *
 * The label is set in the body face rather than the mono one and is no longer
 * shouting in uppercase with letter spacing: at ten pixels that treatment reads
 * as a row of its own competing with the rows under it, which is the opposite
 * of what a group label is for.
 */
export const SIDEBAR_SECTION = "mb-5";
export const SIDEBAR_SECTION_LABEL = "mb-1 px-2 text-[11.5px] font-medium text-ink-400";
export const SIDEBAR_SECTION_ROWS = "space-y-px";

/**
 * One row.
 *
 * Active is a filled panel rather than an inverted one. The old treatment
 * painted the current row solid ink and its label white, which is heavier than
 * anything else on the pane and made the thing you are already looking at the
 * loudest object on screen. A raised fill says "here" quite well enough.
 */
export function sidebarRowClass(opts: { active: boolean; indent?: boolean }): string {
  return `flex items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-colors ${
    opts.indent ? "pl-8 pr-2" : "px-2"
  } ${
    opts.active
      ? "bg-white font-medium text-ink-900 shadow-[0_1px_2px_rgb(var(--ink-900)/0.06)]"
      : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
  }`;
}

export function sidebarIconClass(active: boolean): string {
  return `h-3.5 w-3.5 shrink-0 ${active ? "text-ink-900" : "text-ink-400"}`;
}

export function sidebarCountClass(active: boolean): string {
  return `shrink-0 text-[11px] tabular-nums ${active ? "text-ink-500" : "text-ink-400"}`;
}
