/**
 * The LADX Mini design system.
 *
 * There were eighty-four distinct hex values across these components, four of
 * them greens, and no rule about which meant what. That is the reason the
 * editor read as busy: not any single choice, but the absence of a system, so
 * nothing on screen could be identified by its colour alone.
 *
 * The palette is derived from what LADX already is rather than invented: the
 * teal from the wordmark's X, the blue the portal uses for actions, and the
 * slate ramp the chrome was already mostly built from.
 *
 * ── The one rule that matters ──────────────────────────────────────
 *
 * GREEN MEANS ENERGISED. Nothing else may be green.
 *
 * On a real panel a green lamp means current is flowing, and a student reads
 * this screen the same way. A green "Saved" tick, a green success toast and a
 * green live rung on the same screen teach that green means nothing in
 * particular, which is worse than no colour at all, because the one green
 * that carries the lesson stops being noticed. Saves confirm in teal, faults
 * in red, warnings in amber, and green is left to mean power.
 */

/* ── Neutrals ────────────────────────────────────────────────────────
   A slate ramp. Every border, every panel, every piece of text that is not
   carrying a state comes from here. */
export const ink = {
  /** Headings, tag names, anything that must be read first. */
  strong: "#0F172A",
  /** Body text. */
  base: "#334155",
  /** Labels and secondary text. */
  muted: "#64748B",
  /** Hints, placeholders, disabled. The lightest text that still passes. */
  faint: "#94A3B8",
} as const;

export const surface = {
  /** Panels, cards, the ladder itself. */
  raised: "#FFFFFF",
  /** Panel title bars and toolbars: a half-step down from white. */
  subtle: "#F7F9FB",
  /** Grouped toolbar clusters and inactive tabs. */
  sunken: "#EEF2F6",
  /** The workspace behind the panels. */
  ground: "#E9EDF2",
} as const;

export const line = {
  /** The standard border. Panels, buttons, inputs. */
  base: "#C9D2DC",
  /** Rules inside a panel, between rows, under a header. */
  soft: "#E2E8F0",
  /** The faintest divider, for dense lists. */
  hairline: "#F1F5F9",
} as const;

/* ── Brand ───────────────────────────────────────────────────────────
   Teal is LADX's own colour and marks what is yours: the current selection,
   the focused control, the thing you just did. Blue is the portal's action
   colour and marks what the software will do for you. */
export const brand = {
  /** The X in the wordmark. Selection, focus, confirmation. */
  teal: "#35B6BB",
  /** Teal text on a light background, dark enough to read. */
  tealInk: "#1B7F84",
  /** Teal fills, selected rows, focus rings, gentle highlights. */
  tealWash: "#E8F6F7",
  /** Primary actions. Download, Next, anything that commits. */
  blue: "#2891FF",
  /** Blue text and pressed states. */
  blueInk: "#1D4ED8",
  /** Blue fills, the insertion caret, hovered drop targets. */
  blueWash: "#E8F2FE",
} as const;

/* ── State ───────────────────────────────────────────────────────────
   Reserved meanings. Each appears in exactly one situation. */
export const state = {
  /** POWER. A conducting rung, a closed contact, an energised coil, a lit
      lamp, the controller in RUN. Nothing else. */
  live: "#16A34A",
  liveWash: "#DCFCE7",
  /** A lamp or an LED that is drawing the eye, brighter than `live`, for
      small glowing objects rather than text. */
  liveGlow: "#22C55E",

  /** Something will run but probably not as meant. */
  warn: "#B45309",
  warnEdge: "#F0C36D",
  warnWash: "#FFFBEB",

  /** Something is wrong and will not work. */
  fault: "#B3382C",
  faultEdge: "#E9A69E",
  faultWash: "#FBEAE8",

  /** De-energised. A dark lamp, an open contact, a stopped controller. */
  idle: "#94A3B8",
  idleWash: "#F1F5F9",
} as const;

/* ── Motion ──────────────────────────────────────────────────────────
 *
 * Animation here has one job: to show that a thing moved from A to B, so the
 * eye does not have to re-find it. It is not decoration, and on a screen
 * somebody stares at for an hour decoration becomes irritation.
 *
 * So: short durations, no bounce, and nothing animates on a loop unless it is
 * reporting live state (a running scan, current in a wire). Everything else
 * settles and stops.
 */
export const motion = {
  /** Hover and press feedback. Below ~100ms reads as instant. */
  instant: 90,
  /** The default. Panels opening, tooltips, menus. */
  quick: 160,
  /** Something crossing the screen: a panel docking, a dialog arriving. */
  settled: 240,
  /** Deliberately slow, to be watched: a download transferring. */
  narrated: 420,

  /** Decelerate. Things arrive quickly and land softly. */
  ease: "cubic-bezier(0.2, 0, 0, 1)",
  /** For something leaving: accelerate away. */
  easeOut: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/** A CSS transition string. `trans("opacity", "quick")`. */
export function trans(
  props: string,
  speed: keyof Pick<typeof motion, "instant" | "quick" | "settled" | "narrated"> = "quick",
): string {
  return props
    .split(",")
    .map((p) => `${p.trim()} ${motion[speed]}ms ${motion.ease}`)
    .join(", ");
}

/* ── Shape ───────────────────────────────────────────────────────────
   Two radii and one shadow scale. More than that and nothing looks related. */
export const radius = {
  /** Chips, small buttons, tabs. */
  sm: 3,
  /** Buttons, inputs, panels. The default. */
  md: 5,
  /** Dialogs and floating surfaces. */
  lg: 9,
} as const;

export const shadow = {
  /** A menu or tooltip, sitting just above the page. */
  pop: "0 4px 14px rgba(15, 23, 42, 0.13), 0 1px 3px rgba(15, 23, 42, 0.08)",
  /** A dialog, clearly above everything. */
  dialog: "0 18px 48px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.10)",
  /** A focus ring, in brand teal. */
  focus: `0 0 0 3px ${brand.teal}40`,
  /** A focus ring on a primary action. */
  focusAction: `0 0 0 3px ${brand.blue}40`,
} as const;

/** Every token, for the places that want one object. */
export const T = { ink, surface, line, brand, state, motion, radius, shadow, trans } as const;
