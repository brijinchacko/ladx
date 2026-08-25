import type { SymbolDef, SymbolProps } from "./symbols";

/**
 * The rest of the library.
 *
 * Split from symbols.tsx only because one file of a hundred-odd drawings is
 * unreadable, not because these are second class. Same 100x100 grid, same
 * conventions: ISA-5.1 where it defines a shape, ISO 10628 process convention
 * where it does not, and greyscale so the animation layer owns colour.
 *
 * Drawn rather than licensed. Symbol Factory and the other commercial sets are
 * per-machine products that cannot be bundled into an HMI somebody sells, so
 * these are ours to ship. Anyone who licences one of those sets can bring it
 * in through the SVG import instead.
 */

const S = (p: SymbolProps) => ({
  fill: p.fill,
  stroke: p.stroke,
  strokeWidth: p.strokeWidth,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
});
const L = (p: SymbolProps) => ({
  fill: "none",
  stroke: p.stroke,
  strokeWidth: p.strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});
const T = (p: SymbolProps, size = 20) => ({
  textAnchor: "middle" as const,
  fontSize: size,
  fill: p.stroke,
  fontFamily: "ui-monospace, monospace",
});

/** The two-triangle body every inline valve is built from. */
const BOWTIE = "M14 26 L50 50 L14 74 Z M86 26 L50 50 L86 74 Z";

export const EXTRA_SYMBOLS: SymbolDef[] = [
  /* ─────────────────────────── vessels ─────────────────────────── */
  {
    id: "tank-cone",
    name: "Cone-bottom tank",
    category: "Vessels",
    aspect: 0.7,
    flow: true,
    draw: (p) => (
      <>
        <title>Cone-bottom tank</title>
        <path d="M14 10 H86 V62 L54 94 H46 L14 62 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "tank-horizontal",
    name: "Horizontal vessel",
    category: "Vessels",
    aspect: 2,
    flow: true,
    draw: (p) => (
      <>
        <title>Horizontal vessel</title>
        <path d="M18 26 H82 Q96 26 96 50 Q96 74 82 74 H18 Q4 74 4 50 Q4 26 18 26 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "tank-jacketed",
    name: "Jacketed vessel",
    category: "Vessels",
    aspect: 0.8,
    flow: true,
    draw: (p) => (
      <>
        <title>Jacketed vessel</title>
        <rect x="8" y="12" width="84" height="76" rx="3" {...S(p)} />
        <rect x="18" y="20" width="64" height="60" rx="2" {...L(p)} />
      </>
    ),
  },
  {
    id: "reactor",
    name: "Reactor",
    category: "Vessels",
    aspect: 0.75,
    flow: true,
    draw: (p) => (
      <>
        <title>Reactor</title>
        <path d="M16 26 Q16 8 50 8 Q84 8 84 26 V72 Q84 92 50 92 Q16 92 16 72 Z" {...S(p)} />
        <line x1="50" y1="8" x2="50" y2="58" {...L(p)} />
        <path d="M34 58 H66" {...L(p)} />
      </>
    ),
  },
  {
    id: "bin",
    name: "Bin",
    category: "Vessels",
    aspect: 0.9,
    flow: true,
    draw: (p) => (
      <>
        <title>Bin</title>
        <path d="M12 10 H88 V64 H12 Z M12 64 L44 92 H56 L88 64" {...S(p)} />
      </>
    ),
  },

  /* ─────────────────────── pumps and fans ─────────────────────── */
  {
    id: "pump-vacuum",
    name: "Vacuum pump",
    category: "Pumps and fans",
    aspect: 1,
    flow: true,
    draw: (p) => (
      <>
        <title>Vacuum pump</title>
        <circle cx="50" cy="50" r="34" {...S(p)} />
        <path d="M32 62 L50 32 L68 62 Z" {...L(p)} />
      </>
    ),
  },
  {
    id: "pump-sump",
    name: "Sump pump",
    category: "Pumps and fans",
    aspect: 0.8,
    flow: true,
    draw: (p) => (
      <>
        <title>Sump pump</title>
        <circle cx="50" cy="70" r="22" {...S(p)} />
        <line x1="50" y1="48" x2="50" y2="12" {...L(p)} />
        <path d="M50 12 H84" {...L(p)} />
      </>
    ),
  },
  {
    id: "blower",
    name: "Blower",
    category: "Pumps and fans",
    aspect: 1.1,
    flow: true,
    draw: (p) => (
      <>
        <title>Blower</title>
        <path d="M50 16 A34 34 0 1 1 16 50 H50 Z" {...S(p)} />
        <circle cx="50" cy="50" r="8" {...L(p)} />
      </>
    ),
  },
  {
    id: "fan-axial",
    name: "Axial fan",
    category: "Pumps and fans",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Axial fan</title>
        <rect x="14" y="20" width="72" height="60" rx="3" {...S(p)} />
        <circle cx="50" cy="50" r="22" {...L(p)} />
        <path d="M50 28 L58 50 L50 72 L42 50 Z" {...L(p)} />
      </>
    ),
  },

  /* ─────────────────────────── valves ─────────────────────────── */
  {
    id: "valve-globe",
    name: "Globe valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Globe valve</title>
        <path d={BOWTIE} {...S(p)} />
        <circle cx="50" cy="50" r="12" {...S(p)} />
        <line x1="50" y1="38" x2="50" y2="18" {...L(p)} />
        <line x1="34" y1="18" x2="66" y2="18" {...L(p)} />
      </>
    ),
  },
  {
    id: "valve-needle",
    name: "Needle valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Needle valve</title>
        <path d={BOWTIE} {...S(p)} />
        <path d="M50 50 L44 20 H56 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "valve-plug",
    name: "Plug valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Plug valve</title>
        <path d={BOWTIE} {...S(p)} />
        <rect x="42" y="38" width="16" height="24" rx="2" {...S(p)} />
      </>
    ),
  },
  {
    id: "valve-diaphragm",
    name: "Diaphragm valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Diaphragm valve</title>
        <path d={BOWTIE} {...S(p)} />
        <path d="M28 34 Q50 56 72 34" {...L(p)} />
      </>
    ),
  },
  {
    id: "valve-motorised",
    name: "Motorised valve",
    category: "Valves",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Motorised valve</title>
        <path d="M14 44 L50 66 L14 88 Z M86 44 L50 66 L86 88 Z" {...S(p)} />
        <line x1="50" y1="66" x2="50" y2="42" {...L(p)} />
        <circle cx="50" cy="26" r="16" {...S(p)} />
        <text x="50" y="33" {...T(p, 18)}>
          M
        </text>
      </>
    ),
  },
  {
    id: "valve-pneumatic",
    name: "Pneumatic valve",
    category: "Valves",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Pneumatic valve</title>
        <path d="M14 44 L50 66 L14 88 Z M86 44 L50 66 L86 88 Z" {...S(p)} />
        <line x1="50" y1="66" x2="50" y2="38" {...L(p)} />
        <rect x="26" y="18" width="48" height="20" rx="3" {...S(p)} />
        <line x1="50" y1="18" x2="50" y2="8" {...L(p)} />
      </>
    ),
  },
  {
    id: "valve-4way",
    name: "Four-way valve",
    category: "Valves",
    aspect: 1,
    flow: true,
    draw: (p) => (
      <>
        <title>Four-way valve</title>
        <path
          d="M12 28 L50 50 L12 72 Z M88 28 L50 50 L88 72 Z M28 12 L50 50 L72 12 Z M28 88 L50 50 L72 88 Z"
          {...S(p)}
        />
      </>
    ),
  },
  {
    id: "valve-knife",
    name: "Knife gate valve",
    category: "Valves",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Knife gate valve</title>
        <path d={BOWTIE} {...S(p)} />
        <line x1="50" y1="20" x2="50" y2="80" {...L(p)} />
        <path d="M42 20 H58" {...L(p)} />
      </>
    ),
  },

  /* ──────────────────── mixers and agitators ──────────────────── */
  {
    id: "mixer-propeller",
    name: "Propeller mixer",
    category: "Mixers",
    aspect: 0.7,
    draw: (p) => (
      <>
        <title>Propeller mixer</title>
        <rect x="32" y="6" width="36" height="16" rx="2" {...S(p)} />
        <line x1="50" y1="22" x2="50" y2="76" {...L(p)} />
        <path d="M30 76 q20 -14 40 0 q-20 14 -40 0 z" {...S(p)} />
      </>
    ),
  },
  {
    id: "mixer-anchor",
    name: "Anchor mixer",
    category: "Mixers",
    aspect: 0.7,
    draw: (p) => (
      <>
        <title>Anchor mixer</title>
        <line x1="50" y1="8" x2="50" y2="58" {...L(p)} />
        <path d="M26 58 V84 H74 V58" {...L(p)} />
        <path d="M26 58 H74" {...L(p)} />
      </>
    ),
  },
  {
    id: "mixer-static",
    name: "Static mixer",
    category: "Mixers",
    aspect: 2.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Static mixer</title>
        <rect x="8" y="34" width="84" height="32" rx="2" {...S(p)} />
        <path d="M16 34 L34 66 M34 34 L52 66 M52 34 L70 66 M70 34 L86 66" {...L(p)} />
      </>
    ),
  },
  {
    id: "mixer-ribbon",
    name: "Ribbon blender",
    category: "Mixers",
    aspect: 1.6,
    draw: (p) => (
      <>
        <title>Ribbon blender</title>
        <path d="M10 30 H90 V56 Q90 82 50 82 Q10 82 10 56 Z" {...S(p)} />
        <path d="M18 56 q8 -16 16 0 t16 0 t16 0 t16 0" {...L(p)} />
      </>
    ),
  },

  /* ──────────────────── heat transfer ──────────────────── */
  {
    id: "heater",
    name: "Heater",
    category: "Heat transfer",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Heater</title>
        <circle cx="50" cy="50" r="34" {...S(p)} />
        <path d="M30 60 L42 40 L50 60 L58 40 L70 60" {...L(p)} />
      </>
    ),
  },
  {
    id: "boiler",
    name: "Boiler",
    category: "Heat transfer",
    aspect: 0.9,
    flow: true,
    draw: (p) => (
      <>
        <title>Boiler</title>
        <path d="M16 30 Q16 12 50 12 Q84 12 84 30 V78 H16 Z" {...S(p)} />
        <path d="M30 78 v10 M50 78 v10 M70 78 v10" {...L(p)} />
        <path d="M34 56 q8 -14 16 0 t16 0" {...L(p)} />
      </>
    ),
  },
  {
    id: "cooling-tower",
    name: "Cooling tower",
    category: "Heat transfer",
    aspect: 0.9,
    flow: true,
    draw: (p) => (
      <>
        <title>Cooling tower</title>
        <path d="M20 92 L32 34 H68 L80 92 Z" {...S(p)} />
        <path d="M26 34 H74 V18 H26 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "shell-tube",
    name: "Shell and tube exchanger",
    category: "Heat transfer",
    aspect: 1.8,
    flow: true,
    draw: (p) => (
      <>
        <title>Shell and tube exchanger</title>
        <rect x="8" y="28" width="84" height="44" rx="6" {...S(p)} />
        <line x1="24" y1="28" x2="24" y2="72" {...L(p)} />
        <line x1="76" y1="28" x2="76" y2="72" {...L(p)} />
        <path d="M24 42 H76 M24 58 H76" {...L(p)} />
      </>
    ),
  },

  /* ──────────────────── instruments ──────────────────── */
  {
    id: "transmitter",
    name: "Transmitter",
    category: "Instruments",
    aspect: 0.9,
    draw: (p) => (
      <>
        <title>Transmitter</title>
        <circle cx="50" cy="58" r="28" {...S(p)} />
        <text x="50" y="65" {...T(p, 22)}>
          {p.label ?? "PT"}
        </text>
        <line x1="50" y1="30" x2="50" y2="10" {...L(p)} />
        <path d="M36 10 H64" {...L(p)} />
      </>
    ),
  },
  {
    id: "flowmeter",
    name: "Flow meter",
    category: "Instruments",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Flow meter</title>
        <rect x="18" y="34" width="64" height="32" rx="2" {...S(p)} />
        <path d="M4 50 H18 M82 50 H96" {...L(p)} />
        <text x="50" y="58" {...T(p, 18)}>
          {p.label ?? "FE"}
        </text>
      </>
    ),
  },
  {
    id: "orifice",
    name: "Orifice plate",
    category: "Instruments",
    aspect: 0.8,
    flow: true,
    draw: (p) => (
      <>
        <title>Orifice plate</title>
        <path d="M10 50 H36 M64 50 H90" {...L(p)} />
        <path d="M36 20 V80 M64 20 V80" {...L(p)} />
      </>
    ),
  },
  {
    id: "level-switch",
    name: "Level switch",
    category: "Instruments",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Level switch</title>
        <circle cx="50" cy="50" r="30" {...S(p)} />
        <text x="50" y="57" {...T(p, 20)}>
          {p.label ?? "LS"}
        </text>
        <path d="M50 80 v12" {...L(p)} />
      </>
    ),
  },
  {
    id: "sight-glass",
    name: "Sight glass",
    category: "Instruments",
    aspect: 0.6,
    flow: true,
    draw: (p) => (
      <>
        <title>Sight glass</title>
        <rect x="30" y="14" width="40" height="72" rx="4" {...S(p)} />
        <line x1="30" y1="50" x2="70" y2="50" {...L(p)} />
      </>
    ),
  },

  /* ──────────────────── conveying and handling ──────────────────── */
  {
    id: "roller-conveyor",
    name: "Roller conveyor",
    category: "Conveying",
    aspect: 2.4,
    draw: (p) => (
      <>
        <title>Roller conveyor</title>
        <line x1="6" y1="66" x2="94" y2="66" {...L(p)} />
        {[14, 30, 46, 62, 78].map((x) => (
          <circle key={x} cx={x + 4} cy="50" r="9" {...S(p)} />
        ))}
      </>
    ),
  },
  {
    id: "vibrating-feeder",
    name: "Vibrating feeder",
    category: "Conveying",
    aspect: 2,
    draw: (p) => (
      <>
        <title>Vibrating feeder</title>
        <path d="M8 34 H92 L84 62 H16 Z" {...S(p)} />
        <path d="M28 74 l8 10 M50 74 l8 10 M72 74 l8 10" {...L(p)} />
      </>
    ),
  },
  {
    id: "diverter",
    name: "Diverter",
    category: "Conveying",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Diverter</title>
        <path d="M10 30 H50 L86 12 M50 30 L86 76" {...L(p)} />
        <path d="M10 30 V56 H50 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "palletiser",
    name: "Palletiser",
    category: "Conveying",
    aspect: 1,
    draw: (p) => (
      <>
        <title>Palletiser</title>
        <rect x="16" y="60" width="68" height="10" {...S(p)} />
        <rect x="24" y="44" width="24" height="16" {...S(p)} />
        <rect x="52" y="44" width="24" height="16" {...S(p)} />
        <rect x="24" y="28" width="52" height="16" {...S(p)} />
        <path d="M16 76 h68 M24 76 v10 M76 76 v10" {...L(p)} />
      </>
    ),
  },

  /* ──────────────────── separation ──────────────────── */
  {
    id: "cyclone",
    name: "Cyclone",
    category: "Separation",
    aspect: 0.65,
    flow: true,
    draw: (p) => (
      <>
        <title>Cyclone</title>
        <path d="M20 12 H80 V44 L56 92 H44 L20 44 Z" {...S(p)} />
        <line x1="50" y1="4" x2="50" y2="30" {...L(p)} />
      </>
    ),
  },
  {
    id: "bag-filter",
    name: "Bag filter",
    category: "Separation",
    aspect: 0.8,
    flow: true,
    draw: (p) => (
      <>
        <title>Bag filter</title>
        <rect x="14" y="12" width="72" height="60" rx="2" {...S(p)} />
        {[26, 42, 58].map((x) => (
          <path key={x} d={`M${x} 24 v34 q8 8 16 0 v-34`} {...L(p)} />
        ))}
        <path d="M14 72 L44 92 H56 L86 72" {...S(p)} />
      </>
    ),
  },
  {
    id: "screen",
    name: "Screen",
    category: "Separation",
    aspect: 1.8,
    flow: true,
    draw: (p) => (
      <>
        <title>Screen</title>
        <path d="M8 30 H92 L84 70 H16 Z" {...S(p)} />
        <path d="M20 42 H80 M18 56 H82" {...L(p)} strokeDasharray="4 4" />
      </>
    ),
  },
  {
    id: "centrifuge",
    name: "Centrifuge",
    category: "Separation",
    aspect: 1,
    flow: true,
    draw: (p) => (
      <>
        <title>Centrifuge</title>
        <circle cx="50" cy="50" r="34" {...S(p)} />
        <circle cx="50" cy="50" r="16" {...L(p)} />
        <path d="M50 16 v10 M50 74 v10 M16 50 h10 M74 50 h10" {...L(p)} />
      </>
    ),
  },

  /* ──────────────────── HVAC ──────────────────── */
  {
    id: "duct",
    name: "Duct",
    category: "HVAC",
    aspect: 2.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Duct</title>
        <rect x="4" y="34" width="92" height="32" {...S(p)} />
        <path d="M4 42 H96 M4 58 H96" {...L(p)} strokeDasharray="3 5" />
      </>
    ),
  },
  {
    id: "damper",
    name: "Damper",
    category: "HVAC",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Damper</title>
        <rect x="18" y="28" width="64" height="44" {...S(p)} />
        <path d="M26 66 L74 34" {...L(p)} />
        <path d="M26 50 L74 50" {...L(p)} strokeDasharray="3 3" />
      </>
    ),
  },
  {
    id: "ahu",
    name: "Air handling unit",
    category: "HVAC",
    aspect: 1.6,
    flow: true,
    draw: (p) => (
      <>
        <title>Air handling unit</title>
        <rect x="8" y="24" width="84" height="52" rx="2" {...S(p)} />
        <line x1="38" y1="24" x2="38" y2="76" {...L(p)} />
        <circle cx="64" cy="50" r="14" {...L(p)} />
        <path d="M20 36 v28" {...L(p)} strokeDasharray="3 3" />
      </>
    ),
  },
  {
    id: "coil",
    name: "Coil",
    category: "HVAC",
    aspect: 1.2,
    flow: true,
    draw: (p) => (
      <>
        <title>Coil</title>
        <rect x="18" y="24" width="64" height="52" {...S(p)} />
        <path
          d="M26 34 q10 16 0 32 M42 34 q10 16 0 32 M58 34 q10 16 0 32 M74 34 q10 16 0 32"
          {...L(p)}
        />
      </>
    ),
  },

  /* ──────────────────── electrical ──────────────────── */
  {
    id: "transformer",
    name: "Transformer",
    category: "Electrical",
    aspect: 0.7,
    draw: (p) => (
      <>
        <title>Transformer</title>
        <circle cx="50" cy="34" r="24" {...L(p)} />
        <circle cx="50" cy="66" r="24" {...L(p)} />
      </>
    ),
  },
  {
    id: "isolator",
    name: "Isolator",
    category: "Electrical",
    aspect: 0.8,
    draw: (p) => (
      <>
        <title>Isolator</title>
        <line x1="50" y1="6" x2="50" y2="32" {...L(p)} />
        <line x1="50" y1="68" x2="50" y2="94" {...L(p)} />
        <path d="M50 68 L72 30" {...L(p)} />
        <circle cx="50" cy="68" r="3.5" fill={p.stroke} />
        <circle cx="50" cy="32" r="3.5" fill={p.stroke} />
      </>
    ),
  },
  {
    id: "overload",
    name: "Overload relay",
    category: "Electrical",
    aspect: 0.8,
    draw: (p) => (
      <>
        <title>Overload relay</title>
        <rect x="30" y="26" width="40" height="48" {...S(p)} />
        <path d="M50 6 v20 M50 74 v20" {...L(p)} />
        <path d="M38 40 h24 v20" {...L(p)} />
      </>
    ),
  },
  {
    id: "ups",
    name: "UPS",
    category: "Electrical",
    aspect: 1.3,
    draw: (p) => (
      <>
        <title>UPS</title>
        <rect x="10" y="28" width="80" height="44" rx="3" {...S(p)} />
        <path d="M44 38 L34 54 h10 l-4 12 L58 48 H48 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "plc",
    name: "PLC",
    category: "Electrical",
    aspect: 0.9,
    draw: (p) => (
      <>
        <title>PLC</title>
        <rect x="18" y="10" width="64" height="80" rx="3" {...S(p)} />
        <line x1="18" y1="30" x2="82" y2="30" {...L(p)} />
        <text x="50" y="24" {...T(p, 13)}>
          PLC
        </text>
        {[40, 52, 64, 76].map((y) => (
          <path key={y} d={`M26 ${y} h48`} {...L(p)} />
        ))}
      </>
    ),
  },
  {
    id: "junction-box",
    name: "Junction box",
    category: "Electrical",
    aspect: 1.2,
    draw: (p) => (
      <>
        <title>Junction box</title>
        <rect x="16" y="30" width="68" height="40" rx="2" {...S(p)} />
        <path d="M16 50 H84" {...L(p)} strokeDasharray="4 4" />
      </>
    ),
  },

  /* ──────────────────── pipe and fittings ──────────────────── */
  {
    id: "pipe-h",
    name: "Pipe, horizontal",
    category: "Pipe",
    aspect: 4,
    flow: true,
    draw: (p) => (
      <>
        <title>Pipe</title>
        <line x1="0" y1="50" x2="100" y2="50" {...L(p)} strokeWidth={p.strokeWidth * 3} />
      </>
    ),
  },
  {
    id: "pipe-elbow",
    name: "Elbow",
    category: "Pipe",
    aspect: 1,
    flow: true,
    draw: (p) => (
      <>
        <title>Elbow</title>
        <path d="M0 50 H50 V100" {...L(p)} strokeWidth={p.strokeWidth * 3} />
      </>
    ),
  },
  {
    id: "pipe-tee",
    name: "Tee",
    category: "Pipe",
    aspect: 1,
    flow: true,
    draw: (p) => (
      <>
        <title>Tee</title>
        <path d="M0 50 H100 M50 50 V100" {...L(p)} strokeWidth={p.strokeWidth * 3} />
      </>
    ),
  },
  {
    id: "reducer",
    name: "Reducer",
    category: "Pipe",
    aspect: 1.6,
    flow: true,
    draw: (p) => (
      <>
        <title>Reducer</title>
        <path d="M10 28 L60 42 H90 V58 H60 L10 72 Z" {...S(p)} />
      </>
    ),
  },
  {
    id: "flange",
    name: "Flange",
    category: "Pipe",
    aspect: 0.5,
    flow: true,
    draw: (p) => (
      <>
        <title>Flange</title>
        <path d="M34 14 H66 M34 86 H66" {...L(p)} strokeWidth={p.strokeWidth * 2} />
        <line x1="50" y1="14" x2="50" y2="86" {...L(p)} strokeWidth={p.strokeWidth * 3} />
      </>
    ),
  },
  {
    id: "strainer",
    name: "Strainer",
    category: "Pipe",
    aspect: 1.4,
    flow: true,
    draw: (p) => (
      <>
        <title>Strainer</title>
        <path d="M6 50 H94" {...L(p)} strokeWidth={p.strokeWidth * 2} />
        <path d="M36 34 L64 34 L50 76 Z" {...S(p)} />
      </>
    ),
  },
];
