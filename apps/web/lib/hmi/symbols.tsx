import { EXTRA_SYMBOLS } from "@/lib/hmi/symbols-extra";
import { drawRealistic, hasRealistic } from "@/lib/hmi/symbols-realistic";
import { type ReactNode, useId } from "react";

/**
 * The symbol library.
 *
 * ISA-5.1 shapes: the vocabulary a P&ID is drawn in, so an operator reading
 * the screen recognises the same pump they read on the drawing. A centrifugal
 * pump is a circle with a volute, a motor is a circle marked M, an instrument
 * is a bubble with letter codes in it. Getting these right is not decoration;
 * inventing your own pump means the screen and the drawing disagree.
 *
 * Everything is drawn on a 100x100 grid in `currentColor` with an explicit
 * fill, so one symbol serves any size and any palette. Colour is applied by
 * the animation layer, not baked in here, which is what lets ISA-101 hold:
 * grey at rest, colour only on deviation.
 *
 * `flow` marks the symbols that carry process fluid, so the editor can offer
 * to connect them with pipe rather than treating everything as a box.
 */

export type SymbolCategory =
  | "Vessels"
  | "Pumps and fans"
  | "Valves"
  | "Mixers"
  | "Motors and drives"
  | "Conveying"
  | "Separation"
  | "Heat transfer"
  | "HVAC"
  | "Instruments"
  | "Pipe"
  | "Electrical";

export interface SymbolDef {
  id: string;
  name: string;
  category: SymbolCategory;
  /** Natural aspect, so the palette can place it without squashing. */
  aspect: number;
  /** Carries process fluid, so it takes pipe connections. */
  flow?: boolean;
  draw: (p: SymbolProps) => ReactNode;
}

export interface SymbolProps {
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** 0..1, for the symbols that show a level. */
  level?: number;
  /** Letter code for an instrument bubble: LT, PIC, FT. */
  label?: string;
}

const S = (p: SymbolProps) => ({
  fill: p.fill,
  stroke: p.stroke,
  strokeWidth: p.strokeWidth,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
});
const LINE = (p: SymbolProps) => ({
  fill: "none",
  stroke: p.stroke,
  strokeWidth: p.strokeWidth,
  strokeLinecap: "round" as const,
});

/* ─────────────────────────────── vessels ─────────────────────────────── */

/**
 * A tank that shows its level.
 *
 * The fill is clipped to the shell rather than drawn as a second rectangle,
 * so a level of 1 does not overflow the outline by half a stroke width. That
 * looks like a leak, and on a screen watched all day it is the kind of detail
 * that erodes trust in the graphic.
 */
function tankBody(p: SymbolProps, path: string, clipId: string): ReactNode {
  const lv = Math.max(0, Math.min(1, p.level ?? 0));
  const top = 100 - lv * 100;
  return (
    <>
      <title>Tank</title>
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <path d={path} {...S(p)} />
      {lv > 0 && (
        <rect
          x="0"
          y={top}
          width="100"
          height={lv * 100}
          fill={p.stroke}
          opacity="0.35"
          clipPath={`url(#${clipId})`}
        />
      )}
      <path d={path} fill="none" stroke={p.stroke} strokeWidth={p.strokeWidth} />
    </>
  );
}

const SYMBOLS: SymbolDef[] = [
  {
    id: "tank",
    name: "Tank",
    category: "Vessels",
    aspect: 0.8,
    flow: true,
    draw: (p) => tankBody(p, "M10 8 H90 V92 H10 Z", "clip-tank"),
  },
  {
    id: "tank-dished",
    name: "Vessel, dished ends",
    category: "Vessels",
    aspect: 0.7,
    flow: true,
    draw: (p) =>
      tankBody(p, "M12 20 Q12 4 50 4 Q88 4 88 20 V80 Q88 96 50 96 Q12 96 12 80 Z", "clip-vessel"),
  },
  {
    id: "hopper",
    name: "Hopper",
    category: "Vessels",
    aspect: 0.9,
    flow: true,
    draw: (p) => tankBody(p, "M8 8 H92 V52 L58 94 H42 L8 52 Z", "clip-hopper"),
  },
  {
    id: "silo",
    name: "Silo",
    category: "Vessels",
    aspect: 0.6,
    flow: true,
    draw: (p) => tankBody(p, "M14 26 Q50 2 86 26 V70 L60 94 H40 L14 70 Z", "clip-silo"),
  },
  {
    id: "column",
    name: "Column",
    category: "Vessels",
    aspect: 0.45,
    flow: true,
    draw: (p) => (
      <>
        <title>Column</title>
        <path d="M22 14 Q50 2 78 14 V86 Q50 98 22 86 Z" {...S(p)} />
        {[30, 44, 58, 72].map((y) => (
          <line key={y} x1="24" y1={y} x2="76" y2={y} {...LINE(p)} />
        ))}
      </>
    ),
  },

  /* ───────────────────────── pumps and fans ───────────────────────── */

  {
    id: "pump",
    name: "Pump, centrifugal",
    category: "Pumps and fans",
    aspect: 1,
    flow: true,
    draw: (p) => (
      <>
        <title>Centrifugal pump</title>
        {/* The volute: a circle with a tangential discharge, which is what
            distinguishes it from every other circle on a P&ID. */}
        <circle cx="46" cy="56" r="34" {...S(p)} />
        <path d="M46 22 H88 V56" {...S(p)} />
        <path d="M12 56 H24" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "pump-pd",
    name: "Pump, positive displacement",
    category: "Pumps and fans",
    aspect: 1,
    flow: true,
    draw: (p) => (
      <>
        <title>Positive displacement pump</title>
        <rect x="16" y="30" width="68" height="46" rx="4" {...S(p)} />
        <path d="M28 53 h18 m8 0 h18" {...LINE(p)} />
        <circle cx="50" cy="53" r="5" {...LINE(p)} />
        <path d="M8 53 H16 M84 53 H92" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "fan",
    name: "Fan",
    category: "Pumps and fans",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Fan</title>
        <circle cx="50" cy="50" r="36" {...S(p)} />
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d="M50 50 Q66 34 50 18 Q42 34 50 50"
            {...LINE(p)}
            transform={`rotate(${a} 50 50)`}
          />
        ))}
      </>
    ),
  },
  {
    id: "compressor",
    name: "Compressor",
    category: "Pumps and fans",
    aspect: 1.1,
    flow: true,
    draw: (p) => (
      <>
        <title>Compressor</title>
        <circle cx="50" cy="50" r="34" {...S(p)} />
        <path d="M26 34 L74 42 V58 L26 66 Z" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "agitator",
    name: "Agitator",
    category: "Pumps and fans",
    aspect: 0.8,
    draw: (p) => (
      <>
        <title>Agitator</title>
        <line x1="50" y1="6" x2="50" y2="74" {...LINE(p)} />
        <rect x="34" y="10" width="32" height="12" rx="2" {...S(p)} />
        <path d="M30 74 H70 M36 86 H64" {...LINE(p)} />
      </>
    ),
  },

  /* ───────────────────────────── valves ───────────────────────────── */

  {
    id: "valve-gate",
    name: "Gate valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Gate valve</title>
        <path d="M14 26 L50 50 L14 74 Z M86 26 L50 50 L86 74 Z" {...S(p)} />
        <line x1="50" y1="50" x2="50" y2="18" {...LINE(p)} />
        <line x1="34" y1="18" x2="66" y2="18" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "valve-ball",
    name: "Ball valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Ball valve</title>
        <path d="M14 26 L50 50 L14 74 Z M86 26 L50 50 L86 74 Z" {...S(p)} />
        <circle cx="50" cy="50" r="13" {...S(p)} />
      </>
    ),
  },
  {
    id: "valve-check",
    name: "Check valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Check valve</title>
        <path d="M14 26 L50 50 L14 74 Z M86 26 L50 50 L86 74 Z" {...S(p)} />
        {/* The bar on the outlet side: flow one way only. */}
        <line x1="72" y1="24" x2="72" y2="76" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "valve-butterfly",
    name: "Butterfly valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Butterfly valve</title>
        <path d="M14 26 L50 50 L14 74 Z M86 26 L50 50 L86 74 Z" {...S(p)} />
        <line x1="36" y1="70" x2="64" y2="30" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "valve-control",
    name: "Control valve",
    category: "Valves",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Control valve</title>
        <path d="M14 44 L50 66 L14 88 Z M86 44 L50 66 L86 88 Z" {...S(p)} />
        <line x1="50" y1="66" x2="50" y2="34" {...LINE(p)} />
        {/* Diaphragm actuator: the dome is what says "this one modulates". */}
        <path d="M28 34 Q50 8 72 34 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "valve-solenoid",
    name: "Solenoid valve",
    category: "Valves",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Solenoid valve</title>
        <path d="M14 44 L50 66 L14 88 Z M86 44 L50 66 L86 88 Z" {...S(p)} />
        <line x1="50" y1="66" x2="50" y2="40" {...LINE(p)} />
        <rect x="34" y="16" width="32" height="24" rx="2" {...S(p)} />
        <text
          x="50"
          y="33"
          textAnchor="middle"
          fontSize="16"
          fill={p.stroke}
          fontFamily="ui-monospace, monospace"
        >
          S
        </text>
      </>
    ),
  },
  {
    id: "valve-relief",
    name: "Relief valve",
    category: "Valves",
    aspect: 0.9,
    flow: true,
    draw: (p) => (
      <>
        <title>Relief valve</title>
        <path d="M20 92 L56 70 L20 48 Z" {...S(p)} />
        <path d="M56 70 V34" {...LINE(p)} />
        <path d="M40 34 H72 L56 12 Z" {...S(p)} />
        <path d="M56 70 H84" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "valve-3way",
    name: "Three-way valve",
    category: "Valves",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Three-way valve</title>
        <path d="M14 30 L50 52 L14 74 Z M86 30 L50 52 L86 74 Z M28 92 L50 52 L72 92 Z" {...S(p)} />
      </>
    ),
  },

  /* ─────────────────────── motors and drives ─────────────────────── */

  {
    id: "motor",
    name: "Motor",
    category: "Motors and drives",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Motor</title>
        <circle cx="50" cy="50" r="36" {...S(p)} />
        <text
          x="50"
          y="62"
          textAnchor="middle"
          fontSize="38"
          fill={p.stroke}
          fontFamily="ui-sans-serif, system-ui"
        >
          M
        </text>
      </>
    ),
  },
  {
    id: "vfd",
    name: "Variable speed drive",
    category: "Motors and drives",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Variable speed drive</title>
        <rect x="12" y="20" width="76" height="60" rx="3" {...S(p)} />
        {/* The diagonal through the box is the drafting convention for
            "variable", the same mark a variable resistor carries. */}
        <line x1="20" y1="74" x2="80" y2="26" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "gearbox",
    name: "Gearbox",
    category: "Motors and drives",
    aspect: 1.2,
    draw: (p) => (
      <>
        <title>Gearbox</title>
        <rect x="16" y="28" width="68" height="44" rx="3" {...S(p)} />
        <circle cx="38" cy="50" r="11" {...LINE(p)} />
        <circle cx="64" cy="50" r="7" {...LINE(p)} />
      </>
    ),
  },

  /* ───────────────────────────── conveying ───────────────────────────── */

  {
    id: "conveyor",
    name: "Belt conveyor",
    category: "Conveying",
    aspect: 2.4,
    draw: (p) => (
      <>
        <title>Belt conveyor</title>
        <path d="M18 34 H82 A16 16 0 0 1 82 66 H18 A16 16 0 0 1 18 34 Z" {...S(p)} />
        <circle cx="18" cy="50" r="10" {...LINE(p)} />
        <circle cx="82" cy="50" r="10" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "screw-conveyor",
    name: "Screw conveyor",
    category: "Conveying",
    aspect: 2.4,
    draw: (p) => (
      <>
        <title>Screw conveyor</title>
        <rect x="10" y="34" width="80" height="32" rx="3" {...S(p)} />
        <path d="M16 50 q8 -14 16 0 t16 0 t16 0 t16 0" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "elevator",
    name: "Bucket elevator",
    category: "Conveying",
    aspect: 0.5,
    draw: (p) => (
      <>
        <title>Bucket elevator</title>
        <rect x="30" y="8" width="40" height="84" rx="3" {...S(p)} />
        {[24, 44, 64, 82].map((y) => (
          <path key={y} d={`M36 ${y} h12 v7 h-12 z`} {...LINE(p)} />
        ))}
      </>
    ),
  },

  /* ──────────────────────── heat transfer ──────────────────────── */

  {
    id: "heat-exchanger",
    name: "Heat exchanger",
    category: "Heat transfer",
    aspect: 1.5,
    flow: true,
    draw: (p) => (
      <>
        <title>Heat exchanger</title>
        <rect x="10" y="26" width="80" height="48" rx="4" {...S(p)} />
        <path d="M18 50 h12 q6 -16 12 0 t12 0 t12 0 h12" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "cooler",
    name: "Cooler",
    category: "Heat transfer",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Cooler</title>
        <circle cx="50" cy="50" r="34" {...S(p)} />
        <path d="M26 62 q12 -24 24 0 t24 0" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "filter",
    name: "Filter",
    category: "Heat transfer",
    aspect: 0.9,
    flow: true,
    draw: (p) => (
      <>
        <title>Filter</title>
        <path d="M16 14 H84 L58 54 V88 H42 V54 Z" {...S(p)} />
      </>
    ),
  },

  /* ───────────────────────── instruments ───────────────────────── */

  {
    id: "instrument",
    name: "Instrument, field",
    category: "Instruments",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Field instrument</title>
        <circle cx="50" cy="50" r="34" {...S(p)} />
        <text
          x="50"
          y="57"
          textAnchor="middle"
          fontSize="26"
          fill={p.stroke}
          fontFamily="ui-monospace, monospace"
        >
          {p.label ?? "XT"}
        </text>
      </>
    ),
  },
  {
    id: "instrument-panel",
    name: "Instrument, panel",
    category: "Instruments",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Panel instrument</title>
        <circle cx="50" cy="50" r="34" {...S(p)} />
        {/* The single bar is the ISA mark for "on the main panel", as against
            a plain bubble in the field. */}
        <line x1="16" y1="50" x2="84" y2="50" {...LINE(p)} />
        <text
          x="50"
          y="42"
          textAnchor="middle"
          fontSize="22"
          fill={p.stroke}
          fontFamily="ui-monospace, monospace"
        >
          {(p.label ?? "PIC").slice(0, 4)}
        </text>
      </>
    ),
  },
  {
    id: "instrument-plc",
    name: "Instrument, shared control",
    category: "Instruments",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Shared control instrument</title>
        {/* Bubble inside a square: a function in the DCS or PLC rather than a
            discrete instrument. */}
        <rect x="12" y="12" width="76" height="76" {...S(p)} />
        <circle cx="50" cy="50" r="30" {...LINE(p)} />
        <text
          x="50"
          y="57"
          textAnchor="middle"
          fontSize="22"
          fill={p.stroke}
          fontFamily="ui-monospace, monospace"
        >
          {(p.label ?? "UC").slice(0, 4)}
        </text>
      </>
    ),
  },

  /* ───────────────────────── electrical ───────────────────────── */

  {
    id: "breaker",
    name: "Circuit breaker",
    category: "Electrical",
    aspect: 0.8,
    draw: (p) => (
      <>
        <title>Circuit breaker</title>
        <line x1="50" y1="6" x2="50" y2="30" {...LINE(p)} />
        <line x1="50" y1="70" x2="50" y2="94" {...LINE(p)} />
        <path d="M50 70 L68 28" {...LINE(p)} />
        <path d="M40 24 H60" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "contactor",
    name: "Contactor",
    category: "Electrical",
    aspect: 0.8,
    draw: (p) => (
      <>
        <title>Contactor</title>
        <line x1="50" y1="6" x2="50" y2="34" {...LINE(p)} />
        <line x1="50" y1="66" x2="50" y2="94" {...LINE(p)} />
        <path d="M50 66 L70 32" {...LINE(p)} />
        <path d="M42 62 q8 -8 16 0" {...LINE(p)} />
      </>
    ),
  },
  {
    id: "estop",
    name: "Emergency stop",
    category: "Electrical",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Emergency stop</title>
        <circle cx="50" cy="50" r="38" {...S(p)} />
        <circle cx="50" cy="50" r="24" fill="none" stroke={p.stroke} strokeWidth={p.strokeWidth} />
      </>
    ),
  },
];

/** Ordered the way a process runs, not alphabetically: it is a palette to scan. */
export const SYMBOL_CATEGORIES: SymbolCategory[] = [
  "Vessels",
  "Pumps and fans",
  "Valves",
  "Pipe",
  "Mixers",
  "Motors and drives",
  "Conveying",
  "Separation",
  "Heat transfer",
  "HVAC",
  "Instruments",
  "Electrical",
];

/**
 * The whole library: the core set above plus the rest, which lives in its own
 * file only because a hundred drawings in one is unreadable.
 */
const ALL: SymbolDef[] = [...SYMBOLS, ...EXTRA_SYMBOLS];

const BY_ID = new Map(ALL.map((s) => [s.id, s]));

export function getSymbol(id: string): SymbolDef | undefined {
  return BY_ID.get(id);
}

export function symbolsIn(category: SymbolCategory): SymbolDef[] {
  return ALL.filter((s) => s.category === category);
}

export function allSymbols(): SymbolDef[] {
  return ALL;
}

/** Name or category match, for the palette's search box. */
export function searchSymbols(query: string): SymbolDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL;
  return ALL.filter(
    (s) =>
      s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.id.includes(q),
  );
}

/**
 * Render one symbol at a given box.
 *
 * preserveAspectRatio is "none" on purpose: a screen is laid out in fixed
 * pixels and a designer who stretches a tank to fit a mimic wants it stretched,
 * not letterboxed inside its own frame.
 */
/** Which drawing of a piece of equipment to use. */
export type SymbolStyle = "schematic" | "realistic";

/** Whether this symbol has a realistic drawing, so the UI can offer the choice. */
export function isRealistic(id: string): boolean {
  return hasRealistic(id);
}

export function SymbolView({
  id,
  width,
  height,
  style = "schematic",
  ...props
}: SymbolProps & {
  id: string;
  width: number;
  height: number;
  style?: SymbolStyle;
}) {
  const def = BY_ID.get(id);
  // Every gradient inside is keyed on this. Two tanks on one screen with the
  // same gradient id would both take whichever definition rendered last, so
  // one of them silently shades wrong.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!def) return null;

  // Falls back rather than drawing nothing: most of the library is schematic
  // only, and a missing realistic drawing must not leave a hole on the panel.
  const body =
    style === "realistic" && hasRealistic(id) ? drawRealistic(id, props, uid) : def.draw(props);

  return (
    <svg
      viewBox="0 0 100 100"
      width={width}
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={def.name}
    >
      {body}
    </svg>
  );
}
