import { type Entity, type Point, newId } from "./types";

/**
 * The symbol library.
 *
 * A generic line tool can draw anything and therefore helps with nothing. What
 * makes a drafting tool useful on an automation job is that the things you draw
 * over and over are already drawn, to the right size, on the right layer, with
 * the right terminal spacing.
 *
 * Two families, because automation projects produce two kinds of drawing and
 * the conventions differ:
 *
 *   Schematic  the circuit as logic: contacts, coils, motors, fuses, isolators.
 *              Drawn to IEC 60617 shapes, which is what an electrician in
 *              Europe or Asia expects to read. Sized on a 10 mm grid so
 *              symbols land on grid snap without fighting it.
 *
 *   Panel      the enclosure as built: DIN rail, terminals, breakers,
 *              contactors, PLC modules, glands, trunking. Drawn to the real
 *              millimetre sizes of the parts, because the whole point of a
 *              panel layout is finding out that the parts do not fit before
 *              somebody drills the plate. A 22.5 mm contactor is 22.5 mm here.
 *
 * Every symbol is plain entities: lines, rectangles, circles and text. No block
 * or group concept, deliberately. A group would have to survive DXF round trips
 * through packages that flatten blocks anyway, and the difference in practice
 * is that a symbol is editable the moment it lands rather than needing to be
 * exploded first.
 *
 * `origin` is the insertion point, and for schematic symbols it is the left
 * connection point at wire level, so a symbol dropped on a wire lands on it.
 */

export type SymbolFamily = "schematic" | "panel";

export interface CadSymbol {
  id: string;
  name: string;
  family: SymbolFamily;
  /** What it is for, in the words an engineer would use. */
  note: string;
  /** Nominal size in millimetres, shown in the picker. */
  size: string;
  /** The layer it belongs on, unless the user has chosen another. */
  layer: string;
  build: (at: Point) => Entity[];
}

/* ── builders ─────────────────────────────────────────────────────────── */

const L = (layer: string, a: Point, b: Point): Entity => ({
  id: newId("s"),
  type: "line",
  layer,
  a,
  b,
});

const R = (layer: string, a: Point, b: Point): Entity => ({
  id: newId("s"),
  type: "rect",
  layer,
  a,
  b,
});

const C = (layer: string, c: Point, r: number): Entity => ({
  id: newId("s"),
  type: "circle",
  layer,
  c,
  r,
});

const T = (layer: string, at: Point, text: string, height = 2.5): Entity => ({
  id: newId("s"),
  type: "text",
  layer,
  at,
  text,
  height,
});

const A = (layer: string, c: Point, r: number, start: number, end: number): Entity => ({
  id: newId("s"),
  type: "arc",
  layer,
  c,
  r,
  start,
  end,
});

/* ── schematic, IEC 60617 ─────────────────────────────────────────────── */

const WIRE = "WIRING";
const PANEL = "PANEL";
const TEXT = "TEXT";

/** Contact width, and the lead either side. Keeps every symbol on one pitch. */
const CW = 10;
const LEAD = 5;

function contactNO(at: Point): Entity[] {
  const x0 = at.x;
  const y = at.y;
  return [
    L(WIRE, { x: x0, y }, { x: x0 + LEAD, y }),
    L(WIRE, { x: x0 + LEAD, y: y - 4 }, { x: x0 + LEAD, y: y + 4 }),
    L(WIRE, { x: x0 + LEAD + CW, y: y - 4 }, { x: x0 + LEAD + CW, y: y + 4 }),
    L(WIRE, { x: x0 + LEAD + CW, y }, { x: x0 + LEAD * 2 + CW, y }),
  ];
}

function contactNC(at: Point): Entity[] {
  const x0 = at.x;
  const y = at.y;
  return [
    ...contactNO(at),
    // The slash that says normally closed. Getting this wrong on a stop button
    // is the single most consequential drawing error in this field.
    L(WIRE, { x: x0 + LEAD - 2, y: y + 5 }, { x: x0 + LEAD + CW + 2, y: y - 5 }),
  ];
}

function coil(at: Point): Entity[] {
  const x0 = at.x;
  const y = at.y;
  return [
    L(WIRE, { x: x0, y }, { x: x0 + LEAD, y }),
    A(WIRE, { x: x0 + LEAD + CW / 2, y }, CW / 2, 90, 270),
    A(WIRE, { x: x0 + LEAD + CW / 2, y }, CW / 2, 270, 90),
    L(WIRE, { x: x0 + LEAD + CW, y }, { x: x0 + LEAD * 2 + CW, y }),
  ];
}

/* ── panel, real millimetres ──────────────────────────────────────────── */

/**
 * DIN rail, TS35.
 *
 * Drawn as the 35 mm profile seen from the front, which is how a layout is
 * drawn: a strip you mount things along. Length is the nominal 500 mm; trim it
 * with the endpoints once it is down.
 */
function dinRail(at: Point): Entity[] {
  return [
    R(PANEL, at, { x: at.x + 500, y: at.y + 35 }),
    L(PANEL, { x: at.x, y: at.y + 7.5 }, { x: at.x + 500, y: at.y + 7.5 }),
    L(PANEL, { x: at.x, y: at.y + 27.5 }, { x: at.x + 500, y: at.y + 27.5 }),
    T(TEXT, { x: at.x + 2, y: at.y + 15 }, "TS35 DIN rail", 4),
  ];
}

/** Feed-through terminal, 6 mm pitch, the common 4 mm2 size. */
function terminal(at: Point): Entity[] {
  return [
    R(PANEL, at, { x: at.x + 6, y: at.y + 50 }),
    C(PANEL, { x: at.x + 3, y: at.y + 10 }, 1.6),
    C(PANEL, { x: at.x + 3, y: at.y + 40 }, 1.6),
  ];
}

/** MCB, one pole, 17.5 mm, the standard modular width. */
function mcb(at: Point): Entity[] {
  return [
    R(PANEL, at, { x: at.x + 17.5, y: at.y + 80 }),
    R(PANEL, { x: at.x + 4, y: at.y + 30 }, { x: at.x + 13.5, y: at.y + 50 }),
    T(TEXT, { x: at.x + 2, y: at.y + 60 }, "MCB", 4),
  ];
}

/** Contactor, 45 mm frame, up to about 25 A. */
function contactor(at: Point): Entity[] {
  return [
    R(PANEL, at, { x: at.x + 45, y: at.y + 80 }),
    L(PANEL, { x: at.x, y: at.y + 55 }, { x: at.x + 45, y: at.y + 55 }),
    T(TEXT, { x: at.x + 3, y: at.y + 62 }, "KM", 5),
  ];
}

/** PLC module, 8-slot rack width, drawn as one card with its terminals. */
function plcModule(at: Point): Entity[] {
  const out: Entity[] = [R(PANEL, at, { x: at.x + 35, y: at.y + 130 })];
  // Sixteen terminals down the face, which is what a 16-channel card presents.
  for (let i = 0; i < 16; i++) {
    const y = at.y + 8 + i * 7.5;
    out.push(C(PANEL, { x: at.x + 8, y }, 1.4));
    out.push(C(PANEL, { x: at.x + 27, y }, 1.4));
  }
  out.push(T(TEXT, { x: at.x + 3, y: at.y + 132 }, "I/O module", 4));
  return out;
}

/** Cable gland, M20, the size that takes most control cable. */
function gland(at: Point): Entity[] {
  return [C(PANEL, at, 10), C(PANEL, at, 6.5)];
}

/** Trunking, 40 x 60, drawn as the run with its slotted face. */
function trunking(at: Point): Entity[] {
  const out: Entity[] = [R(PANEL, at, { x: at.x + 400, y: at.y + 60 })];
  for (let x = at.x + 10; x < at.x + 395; x += 15) {
    out.push(L(PANEL, { x, y: at.y + 6 }, { x, y: at.y + 54 }));
  }
  return out;
}

/* ── the library ──────────────────────────────────────────────────────── */

export const SYMBOLS: CadSymbol[] = [
  {
    id: "contact-no",
    name: "Contact, NO",
    family: "schematic",
    note: "Normally open. Closes when its coil energises.",
    size: "20 mm",
    layer: WIRE,
    build: contactNO,
  },
  {
    id: "contact-nc",
    name: "Contact, NC",
    family: "schematic",
    note: "Normally closed. The correct symbol for a stop button and an E-stop.",
    size: "20 mm",
    layer: WIRE,
    build: contactNC,
  },
  {
    id: "coil",
    name: "Coil",
    family: "schematic",
    note: "Relay or contactor coil. The output end of a rung.",
    size: "20 mm",
    layer: WIRE,
    build: coil,
  },
  {
    id: "lamp",
    name: "Indicator lamp",
    family: "schematic",
    note: "Panel lamp. The cross distinguishes it from a plain circle.",
    size: "12 mm",
    layer: WIRE,
    build: (at) => {
      const c = { x: at.x + LEAD + 6, y: at.y };
      return [
        L(WIRE, at, { x: at.x + LEAD, y: at.y }),
        C(WIRE, c, 6),
        L(WIRE, { x: c.x - 4.2, y: c.y - 4.2 }, { x: c.x + 4.2, y: c.y + 4.2 }),
        L(WIRE, { x: c.x - 4.2, y: c.y + 4.2 }, { x: c.x + 4.2, y: c.y - 4.2 }),
        L(WIRE, { x: c.x + 6, y: c.y }, { x: c.x + 6 + LEAD, y: c.y }),
      ];
    },
  },
  {
    id: "motor",
    name: "Motor",
    family: "schematic",
    note: "Three-phase motor. Label it with the tag and the kW.",
    size: "16 mm",
    layer: WIRE,
    build: (at) => {
      const c = { x: at.x + LEAD + 8, y: at.y };
      return [
        L(WIRE, at, { x: at.x + LEAD, y: at.y }),
        C(WIRE, c, 8),
        T(TEXT, { x: c.x - 2.5, y: c.y - 1.5 }, "M", 5),
      ];
    },
  },
  {
    id: "fuse",
    name: "Fuse",
    family: "schematic",
    note: "Rectangle with the line through it, per IEC 60617.",
    size: "20 mm",
    layer: WIRE,
    build: (at) => [
      L(WIRE, at, { x: at.x + LEAD, y: at.y }),
      R(WIRE, { x: at.x + LEAD, y: at.y - 3 }, { x: at.x + LEAD + CW, y: at.y + 3 }),
      L(WIRE, { x: at.x + LEAD, y: at.y }, { x: at.x + LEAD + CW, y: at.y }),
      L(WIRE, { x: at.x + LEAD + CW, y: at.y }, { x: at.x + LEAD * 2 + CW, y: at.y }),
    ],
  },
  {
    id: "isolator",
    name: "Isolator",
    family: "schematic",
    note: "Manual disconnect. The blade breaks the circuit.",
    size: "20 mm",
    layer: WIRE,
    build: (at) => [
      L(WIRE, at, { x: at.x + LEAD, y: at.y }),
      C(WIRE, { x: at.x + LEAD, y: at.y }, 1),
      L(WIRE, { x: at.x + LEAD, y: at.y }, { x: at.x + LEAD + CW, y: at.y + 7 }),
      C(WIRE, { x: at.x + LEAD + CW, y: at.y }, 1),
      L(WIRE, { x: at.x + LEAD + CW, y: at.y }, { x: at.x + LEAD * 2 + CW, y: at.y }),
    ],
  },
  {
    id: "estop",
    name: "E-stop",
    family: "schematic",
    note: "Mushroom head, latching, NC. Shown with the actuator.",
    size: "24 mm",
    layer: WIRE,
    build: (at) => [
      ...contactNC(at),
      L(WIRE, { x: at.x + LEAD + CW / 2, y: at.y + 5 }, { x: at.x + LEAD + CW / 2, y: at.y + 12 }),
      A(WIRE, { x: at.x + LEAD + CW / 2, y: at.y + 12 }, 4, 0, 180),
    ],
  },

  {
    id: "din-rail",
    name: "DIN rail",
    family: "panel",
    note: "TS35, 500 mm. Trim the ends to the plate.",
    size: "500 x 35 mm",
    layer: PANEL,
    build: dinRail,
  },
  {
    id: "terminal",
    name: "Terminal",
    family: "panel",
    note: "Feed-through, 4 mm2, 6 mm pitch. Copy along the rail.",
    size: "6 x 50 mm",
    layer: PANEL,
    build: terminal,
  },
  {
    id: "mcb",
    name: "MCB, 1 pole",
    family: "panel",
    note: "One modular width. Three of these side by side is a 3-pole.",
    size: "17.5 x 80 mm",
    layer: PANEL,
    build: mcb,
  },
  {
    id: "contactor",
    name: "Contactor",
    family: "panel",
    note: "45 mm frame, to about 25 A. Check the real part before you commit.",
    size: "45 x 80 mm",
    layer: PANEL,
    build: contactor,
  },
  {
    id: "plc-module",
    name: "I/O module",
    family: "panel",
    note: "16-channel card with its terminal rows.",
    size: "35 x 130 mm",
    layer: PANEL,
    build: plcModule,
  },
  {
    id: "gland",
    name: "Cable gland",
    family: "panel",
    note: "M20, takes most control cable.",
    size: "M20",
    layer: PANEL,
    build: gland,
  },
  {
    id: "trunking",
    name: "Trunking",
    family: "panel",
    note: "40 x 60 slotted, 400 mm run.",
    size: "400 x 60 mm",
    layer: PANEL,
    build: trunking,
  },
];

export function symbolsByFamily(family: SymbolFamily): CadSymbol[] {
  return SYMBOLS.filter((s) => s.family === family);
}

export function getSymbol(id: string): CadSymbol | undefined {
  return SYMBOLS.find((s) => s.id === id);
}
