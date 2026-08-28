/**
 * Panels that can be moved, resized, closed and got back again.
 *
 * The ladder editor grew one of these, the HMI builder grew a second copy of
 * it, and CAD was about to get a third. They already disagreed in small ways,
 * which is how this always goes: the rules are simple enough that rewriting
 * them looks cheaper than sharing them, and then one of the copies forgets to
 * clamp a stored width and somebody has a pane one pixel wide.
 *
 * So the rules live here once, and a tool supplies only its own panel list and
 * a storage key.
 *
 * The rules, each learned from a way this normally goes wrong:
 *
 *   A closed panel stays visible as something. A pane that disappears
 *   completely reads as destroyed, and people conclude the feature deleted
 *   their work, so closed panels become labelled chips in a strip along the
 *   bottom.
 *
 *   The layout survives a refresh, or it is a setting nobody makes twice.
 *
 *   A stored layout outlives the code that wrote it. A panel that no longer
 *   exists, a width from a wider monitor, a value edited by hand: every field
 *   is checked against the definition rather than trusted.
 *
 *   There is one obvious way back. Reset restores every default in one action,
 *   so no arrangement is a trap.
 */

export type Side = "left" | "right" | "bottom";

export interface DockPanelDef<Id extends string = string> {
  id: Id;
  title: string;
  /** Where it sits by default. The canvas always holds the centre. */
  side: Side;
  /** Starting size in px: width for a side, height for the bottom. */
  size: number;
  min: number;
  max: number;
  /** What it is for, shown on hover and in the dock strip. */
  blurb: string;
  /**
   * Where it may be moved to, including where it starts.
   *
   * Not every panel makes sense everywhere. A command line is a line of text
   * and belongs along the bottom; a layer list is a column. Offering a move
   * that produces something unusable is worse than not offering it, so the
   * definition says what is allowed rather than the control assuming.
   */
  sides?: Side[];
  /** Whether it starts open. */
  defaultOpen?: boolean;
}

export interface DockPanelState {
  open: boolean;
  size: number;
  /** Where it currently is, when moved from its default. */
  side?: Side;
}

export type DockLayout<Id extends string = string> = Record<Id, DockPanelState>;

export interface Dock<Id extends string> {
  panels: DockPanelDef<Id>[];
  def: (id: Id) => DockPanelDef<Id>;
  defaults: DockLayout<Id>;
  load: () => DockLayout<Id>;
  save: (layout: DockLayout<Id>) => void;
  /** Where a panel is now, taking any move into account. */
  sideOf: (layout: DockLayout<Id>, id: Id) => Side;
  /** The next side in the panel's allowed list, for a move control. */
  nextSide: (layout: DockLayout<Id>, id: Id) => Side | null;
  clampSize: (id: Id, size: number) => number;
  /** Whether anything differs from the default, so Reset is offered only when it matters. */
  isMoved: (layout: DockLayout<Id>) => boolean;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export function createDock<Id extends string>(
  panels: DockPanelDef<Id>[],
  storageKey: string,
): Dock<Id> {
  const byId = new Map(panels.map((p) => [p.id, p]));
  const def = (id: Id) => byId.get(id) as DockPanelDef<Id>;

  const defaults = Object.fromEntries(
    panels.map((p) => [p.id, { open: p.defaultOpen ?? true, size: p.size }]),
  ) as DockLayout<Id>;

  const allowed = (p: DockPanelDef<Id>): Side[] => (p.sides?.length ? p.sides : [p.side]);

  const sideOf = (layout: DockLayout<Id>, id: Id): Side => {
    const p = def(id);
    const want = layout[id]?.side;
    // A stored side is honoured only if the definition still permits it. A
    // panel moved to the right in an older build, then restricted to the
    // bottom, must not come back somewhere it no longer fits.
    return want && allowed(p).includes(want) ? want : p.side;
  };

  const nextSide = (layout: DockLayout<Id>, id: Id): Side | null => {
    const p = def(id);
    const options = allowed(p);
    if (options.length < 2) return null;
    const at = options.indexOf(sideOf(layout, id));
    return options[(at + 1) % options.length] ?? null;
  };

  const clampSize = (id: Id, size: number) => {
    const p = def(id);
    if (!p) return size;
    return clamp(Math.round(size), p.min, p.max);
  };

  const load = (): DockLayout<Id> => {
    if (typeof window === "undefined") return { ...defaults };
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return { ...defaults };
      const saved = JSON.parse(raw) as Partial<Record<Id, Partial<DockPanelState>>>;
      const out = {} as DockLayout<Id>;
      for (const p of panels) {
        const s = saved?.[p.id];
        out[p.id] = {
          open: typeof s?.open === "boolean" ? s.open : (p.defaultOpen ?? true),
          size:
            typeof s?.size === "number" && Number.isFinite(s.size)
              ? clamp(s.size, p.min, p.max)
              : p.size,
          side: s?.side && allowed(p).includes(s.side) ? s.side : undefined,
        };
      }
      return out;
    } catch {
      return { ...defaults };
    }
  };

  const save = (layout: DockLayout<Id>) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // Private browsing, or a full quota. A layout that cannot be remembered
      // is never worth an error in front of somebody drawing.
    }
  };

  const isMoved = (layout: DockLayout<Id>) =>
    panels.some(
      (p) =>
        layout[p.id]?.open !== defaults[p.id].open ||
        layout[p.id]?.size !== defaults[p.id].size ||
        sideOf(layout, p.id) !== p.side,
    );

  return { panels, def, defaults, load, save, sideOf, nextSide, clampSize, isMoved };
}
