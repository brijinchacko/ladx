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

/** The pane itself, expanded. */
export const SIDEBAR_ASIDE = "flex w-64 shrink-0 flex-col border-r border-ink-100 bg-ink-50/40";

/** The pane collapsed to icons. */
export const SIDEBAR_ASIDE_COLLAPSED =
  "flex w-14 shrink-0 flex-col items-center border-r border-ink-100 bg-ink-50/40 py-3";

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

/** The account block pinned to the foot. */
export const SIDEBAR_FOOT = "border-t border-ink-100 p-3";

/** A labelled group of rows. */
export const SIDEBAR_SECTION = "mb-4";
export const SIDEBAR_SECTION_LABEL =
  "mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-300";
export const SIDEBAR_SECTION_ROWS = "space-y-px";

/**
 * One row.
 *
 * Active is a filled dark row rather than a tint, because a tint at this type
 * size is not reliably visible on a plant floor laptop with the brightness
 * turned down.
 */
export function sidebarRowClass(opts: { active: boolean; indent?: boolean }): string {
  return `flex items-center gap-2.5 rounded-md py-1.5 text-[13px] transition-colors ${
    opts.indent ? "pl-8 pr-2" : "px-2"
  } ${opts.active ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100"}`;
}

export function sidebarIconClass(active: boolean): string {
  return `h-3.5 w-3.5 shrink-0 ${active ? "text-white" : "text-ink-400"}`;
}

export function sidebarCountClass(active: boolean): string {
  return `shrink-0 font-mono text-[10.5px] tabular-nums ${active ? "text-white/70" : "text-ink-300"}`;
}
