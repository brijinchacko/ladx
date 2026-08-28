import { type DockLayout, type DockPanelDef, createDock } from "@ladx/studio";

/**
 * The HMI window layout.
 *
 * This used to carry its own copy of the load, save, clamp and reset logic,
 * written a second time from the ladder editor's. CAD was about to make it a
 * third, so the rules moved to `@ladx/studio`'s dock and this file is now only
 * the list of panels the builder has. What remains here is the part that is
 * genuinely about the HMI; what left was the part that was about panels, and
 * that is the half where a forgotten clamp leaves somebody with a pane one
 * pixel wide.
 *
 * The names below are kept as they were so the rest of the builder does not
 * need to know this changed.
 */

export type PanelId = "tree" | "tools" | "properties" | "assist";
export type PanelDef = DockPanelDef<PanelId>;
export type Layout = DockLayout<PanelId>;
export interface PanelState {
  open: boolean;
  size: number;
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
    sides: ["left", "right"],
  },
  {
    id: "tools",
    title: "Tools",
    side: "right",
    size: 250,
    min: 190,
    max: 420,
    blurb: "Objects and the symbol library, by category.",
    sides: ["right", "left"],
  },
  {
    id: "properties",
    title: "Properties",
    side: "bottom",
    size: 200,
    min: 120,
    max: 420,
    blurb: "Everything about the selected object: binding, colours, actions.",
    // Under the glass by default, because that is where a properties pane
    // belongs on a drawing surface, and beside it for anybody who would rather
    // have the height.
    sides: ["bottom", "right", "left"],
  },
  {
    id: "assist",
    title: "Assist",
    side: "right",
    size: 300,
    min: 240,
    max: 480,
    blurb:
      "Draw a screen from a description, or straight from the tag table. It floats, and remembers where you put it.",
    /*
     * Not open to begin with.
     *
     * Everything a builder needs to draw is; three panes plus a chat column is
     * more chrome than canvas on a laptop, and a pane you did not ask for is
     * one you close before you use it once.
     */
    defaultOpen: false,
  },
];

export const hmiDock = createDock<PanelId>(PANELS, "ladx.hmi.layout.v1");

export const DEFAULT_LAYOUT: Layout = hmiDock.defaults;

export const loadLayout = hmiDock.load;
export const saveLayout = hmiDock.save;
export const isMoved = hmiDock.isMoved;
export const panel = hmiDock.def;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
