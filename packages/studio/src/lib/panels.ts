/**
 * The window layout: which panels are open, how wide, and where they go when
 * they are closed.
 *
 * Every real PLC IDE lets you shut a pane you are not using and get it back
 * later, because the useful screen area on a laptop is small and a student
 * drawing a long rung wants the rung, not the tag table. LADX Mini had one
 * fixed three-column grid and a collapse toggle on the tree.
 *
 * Three rules this is built on, each learned from the way these things
 * normally go wrong:
 *
 *   A closed panel must stay visible as something. Panels that vanish
 *   entirely get lost, and the person concludes the feature deleted their
 *   work. Closed panels go to a strip along the bottom and can be clicked
 *   back.
 *
 *   The layout must survive a refresh, or it is a setting nobody bothers to
 *   make twice.
 *
 *   There must be one obvious way back. "Reset layout" restores every default
 *   in one action, so no arrangement is a trap.
 */

export type PanelId = "tree" | "instructions" | "io" | "messages" | "sim";

export type PanelDef = {
  id: PanelId;
  title: string;
  /** Where it sits when open. The ladder canvas always holds the centre. */
  side: "left" | "right" | "bottom";
  /** Starting size in px: width for a side, height for the bottom. */
  size: number;
  min: number;
  max: number;
  /** What it is for, shown on hover and in the View menu. */
  blurb: string;
  helpTopic: string;
};

export const PANELS: PanelDef[] = [
  {
    id: "tree",
    title: "Project",
    side: "left",
    size: 200,
    min: 150,
    max: 380,
    blurb: "Routines, the tag table and the simulator, as a tree.",
    helpTopic: "project-tree",
  },
  {
    id: "instructions",
    title: "Instructions",
    side: "bottom",
    size: 108,
    min: 78,
    max: 260,
    blurb: "Contacts, coils, timers, compare and maths, drag one onto a rung.",
    helpTopic: "instructions",
  },
  {
    id: "io",
    title: "I/O and tags",
    side: "right",
    size: 272,
    min: 210,
    max: 460,
    blurb: "Switches for the inputs, lamps for the outputs, and their terminal addresses.",
    helpTopic: "addressing",
  },
  {
    id: "messages",
    title: "Messages",
    side: "bottom",
    size: 150,
    min: 90,
    max: 340,
    blurb: "Compile results, warnings, errors and what the simulator reported.",
    helpTopic: "messages",
  },
  {
    id: "sim",
    title: "Simulator",
    side: "right",
    size: 300,
    min: 240,
    max: 520,
    blurb: "The controller, its I/O, and how the field devices are wired to it.",
    helpTopic: "simulator",
  },
];

export const PANEL_BY_ID = new Map(PANELS.map((p) => [p.id, p]));

export type PanelState = { open: boolean; size: number };
export type Layout = Record<PanelId, PanelState>;

export const DEFAULT_LAYOUT: Layout = PANELS.reduce((acc, p) => {
  // The simulator starts closed: a student opening a project wants the ladder,
  // and it is one click away on the dock.
  acc[p.id] = { open: p.id !== "sim", size: p.size };
  return acc;
}, {} as Layout);

const KEY = "ladx-layout-v1";

/**
 * Read the saved layout, repairing anything that does not make sense.
 *
 * A stored layout outlives the code that wrote it. A panel that no longer
 * exists, a width from a wider monitor, a value somebody edited by hand, each
 * is a way to end up with a pane one pixel wide and no way to grab it. Every
 * field is checked against the definition rather than trusted.
 */
export function loadLayout(): Layout {
  if (typeof window === "undefined") return { ...DEFAULT_LAYOUT };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_LAYOUT };
    const saved = JSON.parse(raw) as Partial<Record<PanelId, Partial<PanelState>>>;

    const out = {} as Layout;
    for (const def of PANELS) {
      const s = saved[def.id];
      out[def.id] = {
        open: typeof s?.open === "boolean" ? s.open : DEFAULT_LAYOUT[def.id].open,
        size:
          typeof s?.size === "number" && Number.isFinite(s.size)
            ? Math.min(def.max, Math.max(def.min, s.size))
            : def.size,
      };
    }
    return out;
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveLayout(layout: Layout) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // A full or blocked localStorage must never stop somebody editing a rung.
  }
}

export function clampSize(id: PanelId, size: number): number {
  const def = PANEL_BY_ID.get(id);
  if (!def) return size;
  return Math.min(def.max, Math.max(def.min, Math.round(size)));
}
