import { SYMBOLS, getSymbol } from "./symbols";
import { type SheetSize, type TitleBlockFields, buildTitleBlock, getSheet } from "./titleblock";
import { type Entity, type Point, newId } from "./types";

/**
 * The drawing set a control panel actually ships with.
 *
 * A blank sheet is not a starting point. What an engineer needs is the sheet
 * they were going to draw anyway, already numbered, already laid out, with the
 * rails and the conventions on it, so the work is filling in the circuit rather
 * than rebuilding the page.
 *
 * The set and its numbering follow the structure a control panel package
 * conventionally uses, which exists because a technician holding a print at
 * three in the morning needs to know where to look:
 *
 *   000-009  front matter: cover, drawing index, symbols and legend
 *   010-049  power distribution, high voltage then low
 *   050-069  PLC and I/O
 *   070-079  safety circuits
 *   300-399  panel layouts
 *   600-699  termination schedules
 *
 * Every template here is a working sample rather than a frame with a title on
 * it. The DI sheet has eight channels drawn with their terminals, fuses and
 * field devices; the safety sheet has a dual channel E-stop through a safety
 * relay with both contactors and the feedback loop. They are drawn to be
 * corrected, which is faster than drawing them, and they teach the convention
 * to somebody who has not seen a set laid out properly.
 *
 * The cover sheet carries the wire colour and numbering conventions, because
 * the absence of that page is the documented cause of field errors: a
 * technician who cannot tell whether brown is 24 V DC or a live phase is
 * guessing at something that will hurt them.
 */

export interface DrawingTemplate {
  id: string;
  /** Sheet number, as it appears on the drawing. */
  sheet: string;
  name: string;
  /** What the sheet is for and when you need it. */
  note: string;
  /** Which part of the set it belongs to, for grouping the picker. */
  section: "Front matter" | "Power" | "Control and I/O" | "Safety" | "Layout" | "Schedules";
  /** Default sheet size. A schematic is A3; a panel layout wants A2. */
  sheetSize: string;
  /**
   * Whether the sheet frame is drawn around it.
   *
   * A schematic is composed on the page: the rails, the columns and the title
   * block are all positioned in sheet millimetres, so the frame belongs in the
   * drawing. A panel layout is not. It is the back plate at full size, because
   * the entire reason to draw one is to find out that a 45 mm contactor does
   * not fit the 40 mm you left, and a 1200 mm plate shrunk to fit A2 measures
   * 1200 mm of nothing. Those are drawn at 1:1 with no frame, and the PDF
   * export picks a drafting scale and prints it on the sheet, which is what a
   * paper space viewport does in a full CAD package.
   */
  modelSpace?: boolean;
  build: (ctx: TemplateContext) => Entity[];
}

export interface TemplateContext {
  sheet: SheetSize;
  fields: TitleBlockFields;
}

/* ─────────────────────────── drawing helpers ─────────────────────────── */

const L = (layer: string, a: Point, b: Point): Entity => ({
  id: newId("t"),
  type: "line",
  layer,
  a,
  b,
});
const R = (layer: string, a: Point, b: Point): Entity => ({
  id: newId("t"),
  type: "rect",
  layer,
  a,
  b,
});
const C = (layer: string, c: Point, r: number): Entity => ({
  id: newId("t"),
  type: "circle",
  layer,
  c,
  r,
});
const T = (layer: string, at: Point, text: string, height = 3): Entity => ({
  id: newId("t"),
  type: "text",
  layer,
  at,
  text,
  height,
});

const WIRE = "WIRING";
const PANEL = "PANEL";
const TEXT = "TEXT";
const NOTE = "NOTES";

/** Place a library symbol at a point. */
function sym(id: string, at: Point): Entity[] {
  return getSymbol(id)?.build(at) ?? [];
}

/**
 * The two vertical rails a schematic hangs between.
 *
 * Control schematics are drawn between a positive rail at the top and the
 * common at the bottom, with each circuit as a vertical drop between them and
 * a column reference along the top edge. The references are what a
 * cross-reference like "see 052.4" points at.
 */
function ladderFrame(
  sheetSize: SheetSize,
  topLabel: string,
  bottomLabel: string,
  columns: number,
): Entity[] {
  const left = 30;
  const right = sheetSize.w - 20;
  const top = sheetSize.h - 40;
  const bottom = 90;
  const out: Entity[] = [
    L(WIRE, { x: left, y: top }, { x: right, y: top }),
    L(WIRE, { x: left, y: bottom }, { x: right, y: bottom }),
    T(TEXT, { x: left, y: top + 4 }, topLabel, 3.5),
    T(TEXT, { x: left, y: bottom - 7 }, bottomLabel, 3.5),
  ];

  // Column references along the top, and tick marks so a drop can be numbered.
  const step = (right - left) / columns;
  for (let i = 0; i < columns; i++) {
    const x = left + step * (i + 0.5);
    out.push(T(TEXT, { x: x - 2, y: top + 10 }, String(i + 1), 3));
    out.push(L(NOTE, { x, y: top }, { x, y: top + 6 }));
  }
  return out;
}

/** A terminal with its number, on a horizontal run. */
function terminal(at: Point, label: string): Entity[] {
  return [C(PANEL, at, 1.6), T(TEXT, { x: at.x - 3, y: at.y + 4 }, label, 2.5)];
}

/* ───────────────────────────── the templates ───────────────────────────── */

export const DRAWING_TEMPLATES: DrawingTemplate[] = [
  {
    id: "cover",
    sheet: "000",
    name: "Cover sheet",
    section: "Front matter",
    sheetSize: "A3",
    note: "Project, client, panel, and the wire colour and numbering conventions the whole set is read against. The sheet whose absence causes field errors.",
    build: ({ sheet, fields }) => {
      const x = 35;
      let y = sheet.h - 55;
      const out: Entity[] = [];

      out.push(T(TEXT, { x, y }, (fields.company ?? "").toUpperCase(), 9));
      y -= 16;
      out.push(T(TEXT, { x, y }, "CONTROL PANEL DRAWING SET", 7));
      y -= 12;
      out.push(L(NOTE, { x, y: y + 4 }, { x: sheet.w - 30, y: y + 4 }));
      y -= 8;

      const row = (label: string, value: string) => {
        out.push(T(TEXT, { x, y }, label, 3));
        out.push(T(TEXT, { x: x + 45, y }, value || "-", 3.5));
        y -= 8;
      };
      row("PROJECT", fields.projectName ?? "");
      row("PROJECT No.", fields.projectNumber ?? "");
      row("CLIENT", fields.client ?? "");
      row("PANEL / MACHINE", "");
      row("LOCATION", "");
      row("PANEL BUILDER", fields.company ?? "");
      row("DATE", fields.date ?? "");

      y -= 6;
      out.push(T(TEXT, { x, y }, "WIRE COLOURS", 4.5));
      y -= 8;
      for (const [colour, meaning] of [
        ["BLACK", "Three phase power, 400 V AC"],
        ["RED", "Control, 230 V AC"],
        ["ORANGE", "Foreign voltage. Live with the isolator open."],
        ["BLUE (dark)", "24 V DC positive"],
        ["BLUE/WHITE", "24 V DC common, 0 V"],
        ["GREEN/YELLOW", "Protective earth"],
      ] as const) {
        out.push(T(TEXT, { x: x + 4, y }, colour, 3));
        out.push(T(TEXT, { x: x + 46, y }, meaning, 3));
        y -= 6;
      }

      y -= 6;
      out.push(T(TEXT, { x, y }, "WIRE NUMBERING", 4.5));
      y -= 8;
      out.push(
        T(
          TEXT,
          { x: x + 4, y },
          "Every conductor carries the number of the sheet and column it originates on.",
          3,
        ),
      );
      y -= 6;
      out.push(
        T(TEXT, { x: x + 4, y }, "Example: 052.4 is sheet 052, column 4. Both ends agree.", 3),
      );
      y -= 6;
      out.push(
        T(TEXT, { x: x + 4, y }, "Cross references are shown as /sheet.column at the break.", 3),
      );

      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "index",
    sheet: "001",
    name: "Drawing index",
    section: "Front matter",
    sheetSize: "A3",
    note: "Every sheet in the set, by number and title. Mandatory once a set passes ten sheets; finished last, when the numbers have stopped moving.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [];
      const x = 35;
      let y = sheet.h - 50;

      out.push(T(TEXT, { x, y }, "DRAWING INDEX", 7));
      y -= 12;

      const cols = [x, x + 22, x + 130, x + 165];
      const header = ["SHEET", "TITLE", "REV", "DATE"];
      out.push(L(NOTE, { x, y: y + 5 }, { x: sheet.w - 30, y: y + 5 }));
      header.forEach((h, i) => out.push(T(TEXT, { x: cols[i] as number, y }, h, 3)));
      y -= 3;
      out.push(L(NOTE, { x, y }, { x: sheet.w - 30, y }));
      y -= 7;

      // Seeded with the set this library produces, so the index is right the
      // moment the sheets are added and only needs the ones you did not use
      // deleting.
      for (const t of DRAWING_TEMPLATES) {
        out.push(T(TEXT, { x: cols[0] as number, y }, t.sheet, 3));
        out.push(T(TEXT, { x: cols[1] as number, y }, t.name, 3));
        out.push(T(TEXT, { x: cols[2] as number, y }, "0", 3));
        out.push(T(TEXT, { x: cols[3] as number, y }, fields.date ?? "", 3));
        y -= 6.5;
      }

      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "legend",
    sheet: "003",
    name: "Symbols and legend",
    section: "Front matter",
    sheetSize: "A3",
    note: "Only the symbols this set actually uses, with the device tag letters. Drawn from the same library the schematics are drawn with, so it cannot disagree with them.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [];
      out.push(T(TEXT, { x: 35, y: sheet.h - 50 }, "SYMBOLS AND LEGEND", 7));

      const schematic = SYMBOLS.filter((s) => s.family === "schematic");
      let x = 40;
      let y = sheet.h - 75;
      for (const s of schematic) {
        out.push(...s.build({ x, y }));
        out.push(T(TEXT, { x, y: y - 14 }, s.name, 3));
        y -= 34;
        if (y < 110) {
          y = sheet.h - 75;
          x += 95;
        }
      }

      // The tag letters, which are the other half of reading a schematic.
      let ty = sheet.h - 75;
      const tx = sheet.w - 130;
      out.push(T(TEXT, { x: tx, y: ty + 12 }, "DEVICE TAGS", 4.5));
      for (const [letter, meaning] of [
        ["Q", "Circuit breaker, isolator"],
        ["F", "Fuse, protective device"],
        ["K", "Relay"],
        ["KM", "Contactor"],
        ["M", "Motor"],
        ["S", "Switch, pushbutton"],
        ["B", "Sensor, transducer"],
        ["H", "Indicator, beacon"],
        ["T", "Transformer, power supply"],
        ["A", "Assembly: PLC, drive, safety relay"],
        ["X", "Terminal"],
        ["W", "Cable"],
      ] as const) {
        out.push(T(TEXT, { x: tx, y: ty }, letter, 3.5));
        out.push(T(TEXT, { x: tx + 14, y: ty }, meaning, 3));
        ty -= 7;
      }

      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "power",
    sheet: "010",
    name: "Power distribution",
    section: "Power",
    sheetSize: "A3",
    note: "Incomer, main isolator, three phase distribution and the control transformer. A worked three phase feed with a motor starter drawn out.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [...ladderFrame(sheet, "L1 L2 L3  400V 3ph 50Hz", "PE", 8)];
      const top = sheet.h - 40;

      // Incoming isolator and the three phases running down.
      const x0 = 55;
      for (let ph = 0; ph < 3; ph++) {
        const x = x0 + ph * 8;
        out.push(L(WIRE, { x, y: top }, { x, y: top - 22 }));
      }
      out.push(R(PANEL, { x: x0 - 6, y: top - 34 }, { x: x0 + 22, y: top - 22 }));
      out.push(T(TEXT, { x: x0 - 4, y: top - 30 }, "-Q1  MAIN ISOLATOR  63A", 3));
      for (let ph = 0; ph < 3; ph++) {
        const x = x0 + ph * 8;
        out.push(L(WIRE, { x, y: top - 34 }, { x, y: 150 }));
      }

      // A motor feed: MCB, contactor, overload, motor.
      const mx = 130;
      out.push(...sym("fuse", { x: mx, y: top - 60 }));
      out.push(T(TEXT, { x: mx, y: top - 50 }, "-Q2  C16", 3));
      out.push(...sym("contact-no", { x: mx, y: top - 90 }));
      out.push(T(TEXT, { x: mx, y: top - 80 }, "-KM1", 3));
      out.push(...sym("motor", { x: mx, y: top - 125 }));
      out.push(T(TEXT, { x: mx, y: top - 112 }, "-M1  4.0 kW", 3));
      out.push(L(WIRE, { x: mx + 25, y: top - 60 }, { x: mx + 25, y: top - 90 }));
      out.push(L(WIRE, { x: mx + 25, y: top - 90 }, { x: mx + 25, y: top - 125 }));

      // Control supply: transformer to 230 V, then a 24 V DC PSU.
      const cx = 240;
      out.push(R(PANEL, { x: cx, y: top - 70 }, { x: cx + 40, y: top - 40 }));
      out.push(T(TEXT, { x: cx + 2, y: top - 56 }, "-T1  400/230V  500VA", 3));
      out.push(R(PANEL, { x: cx, y: top - 120 }, { x: cx + 40, y: top - 90 }));
      out.push(T(TEXT, { x: cx + 2, y: top - 108 }, "-T2  230VAC/24VDC  10A", 3));
      out.push(L(WIRE, { x: cx + 20, y: top - 70 }, { x: cx + 20, y: top - 90 }));
      out.push(T(TEXT, { x: cx + 46, y: top - 105 }, "24V DC  ->  /030.1", 3));

      out.push(
        T(NOTE, { x: 35, y: 70 }, "Prospective fault level and cable sizes to be confirmed.", 3),
      );
      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "control-supply",
    sheet: "030",
    name: "Control supply, 24 V DC",
    section: "Power",
    sheetSize: "A3",
    note: "The 24 V distribution, its protective devices and the UPS. Every card and field circuit on the set is fed from this sheet.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [...ladderFrame(sheet, "+24V DC   /010.6", "0V", 8)];
      const top = sheet.h - 40;
      const bottom = 90;

      // Four protected outgoing ways, which is what a small panel has.
      const ways: [string, string][] = [
        ["-F1  2A", "PLC and I/O"],
        ["-F2  2A", "Field sensors"],
        ["-F3  4A", "Field outputs, valves"],
        ["-F4  2A", "Safety circuit  /070.1"],
      ];
      ways.forEach(([tag, use], i) => {
        const x = 70 + i * 60;
        out.push(...sym("fuse", { x, y: top - 25 }));
        out.push(L(WIRE, { x: x + 10, y: top }, { x: x + 10, y: top - 25 }));
        out.push(T(TEXT, { x, y: top - 15 }, tag, 3));
        out.push(L(WIRE, { x: x + 10, y: top - 25 }, { x: x + 10, y: bottom }));
        out.push(T(TEXT, { x: x - 2, y: bottom + 6 }, use, 2.8));
      });

      // UPS, on the CPU way.
      out.push(R(PANEL, { x: 300, y: top - 70 }, { x: 350, y: top - 40 }));
      out.push(T(TEXT, { x: 302, y: top - 57 }, "-G1  24V UPS  20 min", 3));

      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "plc-di",
    sheet: "050",
    name: "PLC digital inputs",
    section: "Control and I/O",
    sheetSize: "A3",
    note: "Eight channels drawn out: field device, terminal, card input and the address, with the spare channels shown so nobody wires over them.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [...ladderFrame(sheet, "+24V DC   /030.1", "0V", 8)];
      const top = sheet.h - 40;
      const bottom = 90;

      const channels: [string, string, string][] = [
        ["-S1", "Start pushbutton", "I0.0"],
        ["-S2", "Stop pushbutton NC", "I0.1"],
        ["-S3", "E-stop healthy /070.2", "I0.2"],
        ["-B1", "Guard closed", "I0.3"],
        ["-B2", "Bottle present", "I0.4"],
        ["-B3", "Low level float", "I0.5"],
        ["", "SPARE", "I0.6"],
        ["", "SPARE", "I0.7"],
      ];

      channels.forEach(([tag, desc, addr], i) => {
        const x = 55 + i * 42;
        // Field device down from the positive rail.
        out.push(L(WIRE, { x, y: top }, { x, y: top - 30 }));
        if (tag) {
          out.push(...sym(i === 1 ? "contact-nc" : "contact-no", { x: x - 10, y: top - 40 }));
          out.push(T(TEXT, { x: x - 12, y: top - 26 }, tag, 3));
          out.push(T(TEXT, { x: x - 12, y: top - 55 }, desc, 2.5));
        } else {
          out.push(T(TEXT, { x: x - 8, y: top - 45 }, desc, 3));
        }
        out.push(L(WIRE, { x, y: top - 45 }, { x, y: top - 75 }));
        // Terminal, then the card.
        out.push(...terminal({ x, y: top - 75 }, `X1:${i + 1}`));
        out.push(L(WIRE, { x, y: top - 77 }, { x, y: top - 100 }));
        out.push(T(TEXT, { x: x - 8, y: top - 112 }, addr, 3));
      });

      // The card itself, drawn under the channels.
      out.push(R(PANEL, { x: 40, y: top - 125 }, { x: sheet.w - 30, y: top - 100 }));
      out.push(T(TEXT, { x: 44, y: top - 122 }, "-A2  DI 8x24VDC   ET 200SP", 3.5));
      out.push(L(WIRE, { x: 45, y: top - 125 }, { x: 45, y: bottom }));
      out.push(T(TEXT, { x: 48, y: bottom + 6 }, "card common", 2.8));

      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "plc-do",
    sheet: "055",
    name: "PLC digital outputs",
    section: "Control and I/O",
    sheetSize: "A3",
    note: "Output card to interposing relay to load, which is how an output that drives anything real is wired. Suppression shown on the coils.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [...ladderFrame(sheet, "+24V DC   /030.1", "0V", 6)];
      const top = sheet.h - 40;
      const bottom = 90;

      out.push(R(PANEL, { x: 40, y: top - 35 }, { x: sheet.w - 30, y: top - 12 }));
      out.push(T(TEXT, { x: 44, y: top - 30 }, "-A3  DO 8x24VDC 0.5A   ET 200SP", 3.5));

      const channels: [string, string, string][] = [
        ["-K1", "Filler drive run", "Q0.0"],
        ["-K2", "Infeed conveyor", "Q0.1"],
        ["-K3", "Reject solenoid", "Q0.2"],
        ["-H1", "Running beacon", "Q0.3"],
        ["-H2", "Fault beacon", "Q0.4"],
        ["", "SPARE", "Q0.5"],
      ];

      channels.forEach(([tag, desc, addr], i) => {
        const x = 65 + i * 55;
        out.push(T(TEXT, { x: x - 8, y: top - 8 }, addr, 3));
        out.push(L(WIRE, { x, y: top - 35 }, { x, y: top - 60 }));
        out.push(...terminal({ x, y: top - 60 }, `X2:${i + 1}`));
        if (tag) {
          out.push(...sym(tag.startsWith("-H") ? "lamp" : "coil", { x: x - 12, y: top - 85 }));
          out.push(L(WIRE, { x, y: top - 62 }, { x, y: top - 85 }));
          out.push(T(TEXT, { x: x - 14, y: top - 72 }, tag, 3));
          out.push(T(TEXT, { x: x - 14, y: top - 98 }, desc, 2.5));
          out.push(L(WIRE, { x, y: top - 85 }, { x, y: bottom }));
        } else {
          out.push(T(TEXT, { x: x - 8, y: top - 80 }, desc, 3));
        }
      });

      out.push(
        T(
          NOTE,
          { x: 35, y: 70 },
          "Every relay coil and solenoid to carry a suppression diode across it.",
          3,
        ),
      );
      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "plc-analog",
    sheet: "060",
    name: "PLC analogue I/O",
    section: "Control and I/O",
    sheetSize: "A3",
    note: "Two wire and four wire transmitters wired correctly, with the screen earthed at one end only, plus the ranges beside each channel.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [...ladderFrame(sheet, "+24V DC   /030.1", "0V", 4)];
      const top = sheet.h - 40;

      out.push(R(PANEL, { x: 40, y: top - 140 }, { x: sheet.w - 30, y: top - 115 }));
      out.push(T(TEXT, { x: 44, y: top - 137 }, "-A4  AI 4x4-20mA   ET 200SP", 3.5));

      const loops: [string, string, string][] = [
        ["-B10", "Tank level, 0 to 100%", "IW64"],
        ["-B11", "Line pressure, 0 to 10 bar", "IW66"],
        ["-B12", "Product temperature, 0 to 120 C", "IW68"],
        ["", "SPARE", "IW70"],
      ];

      loops.forEach(([tag, desc, addr], i) => {
        const x = 70 + i * 85;
        if (tag) {
          out.push(C(WIRE, { x, y: top - 45 }, 9));
          out.push(T(TEXT, { x: x - 6, y: top - 47 }, tag, 3));
          out.push(T(TEXT, { x: x - 22, y: top - 62 }, desc, 2.5));
          // Two wire loop: supply down through the transmitter into the card.
          out.push(L(WIRE, { x: x - 4, y: top }, { x: x - 4, y: top - 36 }));
          out.push(L(WIRE, { x: x + 4, y: top - 54 }, { x: x + 4, y: top - 90 }));
          out.push(...terminal({ x: x + 4, y: top - 90 }, `X3:${i * 2 + 1}`));
          out.push(L(WIRE, { x: x + 4, y: top - 92 }, { x: x + 4, y: top - 115 }));
          out.push(T(TEXT, { x: x - 6, y: top - 108 }, addr, 3));
        } else {
          out.push(T(TEXT, { x: x - 8, y: top - 60 }, desc, 3));
        }
      });

      out.push(
        T(
          NOTE,
          { x: 35, y: 70 },
          "Screens earthed at the panel end only. Do not earth at the field device.",
          3,
        ),
      );
      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "safety",
    sheet: "070",
    name: "Safety circuit",
    section: "Safety",
    sheetSize: "A3",
    note: "Dual channel E-stop and guard interlock into a safety relay, with both contactors and the feedback loop that makes the category 3 architecture actually category 3.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [...ladderFrame(sheet, "+24V DC   /030.4", "0V", 6)];
      const top = sheet.h - 40;
      const bottom = 90;

      // Two channels of E-stop, side by side, which is the whole point.
      out.push(...sym("estop", { x: 55, y: top - 30 }));
      out.push(T(TEXT, { x: 53, y: top - 16 }, "-S10  E-STOP  ch1", 3));
      out.push(L(WIRE, { x: 55, y: top }, { x: 55, y: top - 30 }));

      out.push(...sym("estop", { x: 120, y: top - 30 }));
      out.push(T(TEXT, { x: 118, y: top - 16 }, "-S10  E-STOP  ch2", 3));
      out.push(L(WIRE, { x: 120, y: top }, { x: 120, y: top - 30 }));

      // Guard interlock, in series on both channels.
      out.push(...sym("contact-nc", { x: 55, y: top - 60 }));
      out.push(T(TEXT, { x: 53, y: top - 46 }, "-B20  GUARD  ch1", 3));
      out.push(...sym("contact-nc", { x: 120, y: top - 60 }));
      out.push(T(TEXT, { x: 118, y: top - 46 }, "-B20  GUARD  ch2", 3));

      // The safety relay.
      out.push(R(PANEL, { x: 45, y: top - 115 }, { x: 165, y: top - 80 }));
      out.push(T(TEXT, { x: 49, y: top - 92 }, "-A10  SAFETY RELAY  PLd cat 3", 3.5));
      out.push(L(WIRE, { x: 75, y: top - 60 }, { x: 75, y: top - 80 }));
      out.push(L(WIRE, { x: 140, y: top - 60 }, { x: 140, y: top - 80 }));

      // Two contactors in series, and the feedback loop back to the relay.
      out.push(...sym("coil", { x: 200, y: top - 45 }));
      out.push(T(TEXT, { x: 198, y: top - 31 }, "-KM10", 3));
      out.push(...sym("coil", { x: 265, y: top - 45 }));
      out.push(T(TEXT, { x: 263, y: top - 31 }, "-KM11", 3));
      out.push(L(WIRE, { x: 165, y: top - 97 }, { x: 200, y: top - 97 }));
      out.push(L(WIRE, { x: 200, y: top - 97 }, { x: 200, y: top - 45 }));

      out.push(...sym("contact-nc", { x: 200, y: top - 130 }));
      out.push(...sym("contact-nc", { x: 265, y: top - 130 }));
      out.push(T(TEXT, { x: 198, y: top - 145 }, "-KM10 and -KM11 feedback", 3));
      out.push(L(WIRE, { x: 330, y: top - 130 }, { x: 330, y: bottom }));

      out.push(
        T(
          NOTE,
          { x: 35, y: 74 },
          "Category 3 requires both channels and the feedback loop. Removing either voids the assessment.",
          3,
        ),
      );
      out.push(T(NOTE, { x: 35, y: 68 }, "Stop category 0 to the drive. Reference RA.", 3));

      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },

  {
    id: "panel-ga",
    sheet: "300",
    name: "Panel general arrangement",
    section: "Layout",
    sheetSize: "A2",
    modelSpace: true,
    note: "The back plate at real size, with rails, trunking, breakers, contactors and the I/O rack laid out. Drawn to millimetres so it tells you when the parts do not fit.",
    build: ({ fields }) => {
      const out: Entity[] = [];
      const x0 = 0;
      const y0 = 0;
      // The back plate at full size, in millimetres. Not scaled to the sheet:
      // see modelSpace above.
      const w = 1200;
      const h = 800;

      out.push(R(PANEL, { x: x0, y: y0 }, { x: x0 + w, y: y0 + h }));
      out.push(T(TEXT, { x: x0, y: y0 + h + 12 }, "BACK PLATE  1200 x 800", 12));

      // Three rails with trunking between them.
      for (let i = 0; i < 3; i++) {
        const y = y0 + 120 + i * 220;
        out.push(...sym("din-rail", { x: x0 + 60, y }));
        out.push(...sym("trunking", { x: x0 + 60, y: y + 70 }));
      }

      // Incomer and distribution on the top rail.
      let x = x0 + 70;
      for (let i = 0; i < 6; i++) {
        out.push(...sym("mcb", { x, y: y0 + 560 }));
        x += 20;
      }
      out.push(...sym("contactor", { x: x + 10, y: y0 + 560 }));
      out.push(...sym("contactor", { x: x + 60, y: y0 + 560 }));

      // The I/O rack on the middle rail.
      for (let i = 0; i < 4; i++) {
        out.push(...sym("plc-module", { x: x0 + 70 + i * 40, y: y0 + 200 }));
      }

      // Terminals along the bottom rail.
      for (let i = 0; i < 40; i++) {
        out.push(...sym("terminal", { x: x0 + 70 + i * 6, y: y0 + 130 }));
      }

      // Glands along the bottom edge of the enclosure.
      for (let i = 0; i < 8; i++) {
        out.push(...sym("gland", { x: x0 + 150 + i * 90, y: y0 - 30 }));
      }

      out.push(T(NOTE, { x: x0, y: y0 - 60 }, "Gland plate, 8 x M20", 10));
      out.push(
        T(
          NOTE,
          { x: x0, y: y0 + h + 40 },
          `${fields.projectName ?? ""}  ${fields.projectNumber ?? ""}  |  300 PANEL GENERAL ARRANGEMENT  |  ${fields.company ?? ""}`,
          14,
        ),
      );
      out.push(
        T(NOTE, { x: x0, y: y0 + h + 24 }, "Drawn 1:1 in millimetres. Scale set at plot.", 10),
      );
      return out;
    },
  },

  {
    id: "terminals",
    sheet: "600",
    name: "Termination schedule",
    section: "Schedules",
    sheetSize: "A3",
    note: "The table a wireman works from: terminal, wire number, colour, size, destination and the sheet the circuit is drawn on.",
    build: ({ sheet, fields }) => {
      const out: Entity[] = [];
      const x = 30;
      let y = sheet.h - 48;
      out.push(T(TEXT, { x, y }, "TERMINATION SCHEDULE  -X1", 7));
      y -= 12;

      const cols = [x, x + 22, x + 50, x + 78, x + 100, x + 150, x + 250];
      const header = ["TERM", "WIRE No.", "COLOUR", "mm2", "DEVICE", "DESCRIPTION", "SHEET"];
      out.push(L(NOTE, { x, y: y + 5 }, { x: sheet.w - 20, y: y + 5 }));
      header.forEach((h, i) => out.push(T(TEXT, { x: cols[i] as number, y }, h, 2.8)));
      y -= 3;
      out.push(L(NOTE, { x, y }, { x: sheet.w - 20, y }));
      y -= 6;

      const rows: string[][] = [
        ["1", "050.1", "DK BLUE", "1.0", "-S1", "Start pushbutton", "050"],
        ["2", "050.2", "DK BLUE", "1.0", "-S2", "Stop pushbutton NC", "050"],
        ["3", "050.3", "DK BLUE", "1.0", "-S10", "E-stop healthy", "070"],
        ["4", "050.4", "DK BLUE", "1.0", "-B1", "Guard closed", "050"],
        ["5", "050.5", "DK BLUE", "1.0", "-B2", "Bottle present", "050"],
        ["6", "050.6", "DK BLUE", "1.0", "-B3", "Low level float", "050"],
        ["7", "", "", "", "", "SPARE", ""],
        ["8", "", "", "", "", "SPARE", ""],
        ["9", "030.9", "BLUE/WHT", "1.0", "", "0 V common", "030"],
        ["10", "030.9", "BLUE/WHT", "1.0", "", "0 V common", "030"],
      ];
      for (const r of rows) {
        r.forEach((cell, i) => out.push(T(TEXT, { x: cols[i] as number, y }, cell || "", 2.6)));
        y -= 5.5;
        out.push(L(NOTE, { x, y: y + 2 }, { x: sheet.w - 20, y: y + 2 }));
      }

      // The column rules, so it reads as a table rather than as rows of text.
      const tableTop = sheet.h - 63;
      for (const cx of cols.slice(1)) {
        out.push(L(NOTE, { x: cx - 2, y: tableTop }, { x: cx - 2, y: y + 2 }));
      }

      return [...buildTitleBlock(sheet, fields), ...out];
    },
  },
];

export function getDrawingTemplate(id: string): DrawingTemplate | undefined {
  return DRAWING_TEMPLATES.find((t) => t.id === id);
}

export const TEMPLATE_SECTIONS = [
  "Front matter",
  "Power",
  "Control and I/O",
  "Safety",
  "Layout",
  "Schedules",
] as const;

/** Build a template into a complete drawing, sheet and title block included. */
export function buildDrawingFromTemplate(
  template: DrawingTemplate,
  fields: TitleBlockFields,
): Entity[] {
  const sheet = getSheet(template.sheetSize) ?? (getSheet("A3") as SheetSize);
  return template.build({
    sheet,
    fields: { ...fields, drawingNumber: template.sheet, drawingTitle: template.name },
  });
}

/** Sheets composed on the page, as opposed to drawn at full size. */
export function isPaperSpace(template: DrawingTemplate): boolean {
  return template.modelSpace !== true;
}
