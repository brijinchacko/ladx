/**
 * The HMI window layout, built on the same rules as the ladder editor's.
 *
 * A builder is a workshop, not a page: the panel canvas holds the centre and
 * everything else is a pane you can shut when you are not using it. The three
 * rules are the ones the ladder editor learned:
 *
 *   A closed panel stays visible as something. Panes that vanish entirely get
 *   lost and people conclude the feature deleted their work, so closed panels
 *   become labelled tabs in a strip along the bottom.
 *
 *   The layout survives a refresh, or it is a setting nobody makes twice.
 *
 *   There is one obvious way back. Reset restores every default in one action,
 *   so no arrangement is a trap.
 */

export type PanelId = "tree" | "tools" | "properties";

export interface PanelDef {
  id: PanelId;
  title: string;
  side: "left" | "right" | "bottom";
  /** Starting size in px: width for a side, height for the bottom. */
  size: number;
  min: number;
  max: number;
  blurb: string;
}

export const PANELS: PanelDef[] = [
  {
    id: "tree",
    title: "Project",
    side: "left",
    size: 210,
    min: 160,
    max: 400,
    blurb: "Screens, tags, alarms and trends, as a tree.",
  },
  {
    id: "tools",
    title: "Tools",
    side: "right",
    size: 250,
    min: 190,
    max: 420,
    blurb: "Objects and the symbol library, by category.",
  },
  {
    id: "properties",
    title: "Properties",
    side: "bottom",
    size: 200,
    min: 120,
    max: 420,
    blurb: "Everything about the selected object: binding, colours, actions.",
  },
];

export interface PanelState {
  open: boolean;
  size: number;
}
export type Layout = Record<PanelId, PanelState>;

export const DEFAULT_LAYOUT: Layout = Object.fromEntries(
  PANELS.map((p) => [p.id, { open: true, size: p.size }]),
) as Layout;

const KEY = "ladx.hmi.layout.v1";

/**
 * Read the saved layout, defensively.
 *
 * Stored sizes are clamped rather than trusted: a panel dragged to 4000px in
 * an older build, or a hand-edited value, must not leave the canvas with no
 * room. A bad entry falls back to its default rather than taking the editor
 * down on load.
 */
export function loadLayout(): Layout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<Record<PanelId, Partial<PanelState>>>;
    const out = { ...DEFAULT_LAYOUT };
    for (const p of PANELS) {
      const got = parsed?.[p.id];
      if (!got) continue;
      out[p.id] = {
        open: typeof got.open === "boolean" ? got.open : true,
        size: clamp(typeof got.size === "number" ? got.size : p.size, p.min, p.max),
      };
    }
    return out;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(layout: Layout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Private browsing, or a full quota. A layout that cannot be remembered is
    // not worth an error in front of somebody drawing a screen.
  }
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export function panel(id: PanelId): PanelDef {
  return PANELS.find((p) => p.id === id) as PanelDef;
}

/** Whether the layout differs from the default, so Reset is offered only when it does. */
export function isMoved(layout: Layout): boolean {
  return PANELS.some(
    (p) =>
      layout[p.id].open !== DEFAULT_LAYOUT[p.id].open ||
      layout[p.id].size !== DEFAULT_LAYOUT[p.id].size,
  );
}
