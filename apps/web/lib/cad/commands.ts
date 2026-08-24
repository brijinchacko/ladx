import type { Point } from "./types";

/**
 * The command line, and typed coordinates.
 *
 * Every CAD package has one, and it is not a legacy affordance: a draughtsman
 * who knows the aliases works faster than one reaching for a toolbar, and the
 * commands people type are overwhelmingly the same handful. Trim, copy and
 * offset alone account for roughly forty percent of typed commands in real 2D
 * work, which is why they are aliased to two letters and not buried in a menu.
 *
 * Coordinate entry follows the same convention every package uses, because a
 * different one would be actively worse than none:
 *
 *   40,25     absolute. The point 40 across, 25 up, from the origin.
 *   @30,0     relative. Thirty to the right of the last point.
 *   50<45     polar. Fifty away from the last point, at forty five degrees.
 *   35        while drawing, a bare number is a distance along the current
 *             direction, which is how a wall of exactly 35 mm gets drawn.
 *
 * Nothing here touches the canvas. It parses, and the editor decides.
 */

export type CommandId =
  | "line"
  | "rect"
  | "circle"
  | "arc"
  | "ellipse"
  | "polyline"
  | "point"
  | "text"
  | "dimension"
  | "leader"
  | "hatch"
  | "measure"
  | "select"
  | "offset"
  | "fillet"
  | "trim"
  | "extend"
  | "move"
  | "copy"
  | "erase"
  | "array"
  | "polararray"
  | "rotate"
  | "mirror"
  | "scale"
  | "undo"
  | "redo"
  | "zoomfit"
  | "zoomselection"
  | "save"
  | "ortho"
  | "grid"
  | "osnap"
  | "help";

export interface CommandSpec {
  id: CommandId;
  /** The full name, as it is typed and echoed. */
  name: string;
  /** Short forms, in the order a package would list them. */
  aliases: string[];
  /** What it does, one line, for the help listing. */
  hint: string;
  group: "Draw" | "Modify" | "Annotate" | "View" | "File";
}

export const COMMANDS: CommandSpec[] = [
  {
    id: "line",
    name: "LINE",
    aliases: ["L"],
    hint: "A straight segment between two points.",
    group: "Draw",
  },
  {
    id: "rect",
    name: "RECTANGLE",
    aliases: ["REC", "RECT"],
    hint: "A rectangle from two opposite corners.",
    group: "Draw",
  },
  {
    id: "circle",
    name: "CIRCLE",
    aliases: ["C"],
    hint: "Centre, then a point on the circumference.",
    group: "Draw",
  },
  { id: "arc", name: "ARC", aliases: ["A"], hint: "Centre, then start, then end.", group: "Draw" },
  {
    id: "ellipse",
    name: "ELLIPSE",
    aliases: ["EL"],
    hint: "Centre, then a corner of its box.",
    group: "Draw",
  },
  {
    id: "polyline",
    name: "PLINE",
    aliases: ["PL"],
    hint: "A chain of segments. Enter finishes it.",
    group: "Draw",
  },
  {
    id: "point",
    name: "POINT",
    aliases: ["PO"],
    hint: "A snap target you place deliberately.",
    group: "Draw",
  },
  {
    id: "hatch",
    name: "HATCH",
    aliases: ["H"],
    hint: "Shade a closed region. Enter closes it.",
    group: "Draw",
  },

  {
    id: "trim",
    name: "TRIM",
    aliases: ["TR"],
    hint: "Cut a line back to what crosses it.",
    group: "Modify",
  },
  {
    id: "extend",
    name: "EXTEND",
    aliases: ["EX"],
    hint: "Stretch a line until it meets something.",
    group: "Modify",
  },
  {
    id: "offset",
    name: "OFFSET",
    aliases: ["O"],
    hint: "A parallel copy at a distance.",
    group: "Modify",
  },
  {
    id: "fillet",
    name: "FILLET",
    aliases: ["F"],
    hint: "Round a corner. Radius zero closes it.",
    group: "Modify",
  },
  {
    id: "copy",
    name: "COPY",
    aliases: ["CO", "CP"],
    hint: "Duplicate the selection.",
    group: "Modify",
  },
  {
    id: "move",
    name: "MOVE",
    aliases: ["M"],
    hint: "Drag the selection. Alt drag copies.",
    group: "Modify",
  },
  {
    id: "erase",
    name: "ERASE",
    aliases: ["E", "DEL"],
    hint: "Delete the selection.",
    group: "Modify",
  },
  {
    id: "array",
    name: "ARRAY",
    aliases: ["AR"],
    hint: "Rows and columns of the selection.",
    group: "Modify",
  },
  {
    id: "polararray",
    name: "POLARARRAY",
    aliases: ["ARP"],
    hint: "Copies of the selection round a centre.",
    group: "Modify",
  },
  {
    id: "rotate",
    name: "ROTATE",
    aliases: ["RO"],
    hint: "Turn the selection ninety degrees.",
    group: "Modify",
  },
  { id: "mirror", name: "MIRROR", aliases: ["MI"], hint: "Flip the selection.", group: "Modify" },
  { id: "scale", name: "SCALE", aliases: ["SC"], hint: "Resize the selection.", group: "Modify" },
  {
    id: "select",
    name: "SELECT",
    aliases: ["S", "ESC"],
    hint: "Back to the pointer.",
    group: "Modify",
  },

  {
    id: "text",
    name: "TEXT",
    aliases: ["T", "DT"],
    hint: "A single line of text.",
    group: "Annotate",
  },
  {
    id: "dimension",
    name: "DIM",
    aliases: ["D", "DIMLINEAR"],
    hint: "A measured dimension between two points.",
    group: "Annotate",
  },
  {
    id: "leader",
    name: "LEADER",
    aliases: ["LE"],
    hint: "An arrow pointing at something, with a note.",
    group: "Annotate",
  },
  {
    id: "measure",
    name: "MEASURE",
    aliases: ["DI", "DIST"],
    hint: "Distance and angle. Draws nothing.",
    group: "Annotate",
  },

  {
    id: "zoomfit",
    name: "ZOOMFIT",
    aliases: ["ZE", "ZA"],
    hint: "Frame everything.",
    group: "View",
  },
  {
    id: "zoomselection",
    name: "ZOOMSELECTION",
    aliases: ["ZS"],
    hint: "Frame the selection.",
    group: "View",
  },
  {
    id: "ortho",
    name: "ORTHO",
    aliases: ["OR", "F8"],
    hint: "Constrain to the angle step.",
    group: "View",
  },
  { id: "grid", name: "GRIDSNAP", aliases: ["SN", "F9"], hint: "Snap to the grid.", group: "View" },
  {
    id: "osnap",
    name: "OSNAP",
    aliases: ["OS", "F3"],
    hint: "Snap to existing geometry.",
    group: "View",
  },

  { id: "undo", name: "UNDO", aliases: ["U"], hint: "Step back.", group: "File" },
  { id: "redo", name: "REDO", aliases: ["RE"], hint: "Step forward.", group: "File" },
  { id: "save", name: "SAVE", aliases: ["QSAVE"], hint: "Save this sheet.", group: "File" },
  { id: "help", name: "HELP", aliases: ["?"], hint: "List every command.", group: "File" },
];

const BY_WORD = new Map<string, CommandSpec>();
for (const c of COMMANDS) {
  BY_WORD.set(c.name, c);
  for (const a of c.aliases) BY_WORD.set(a, c);
}

export function findCommand(word: string): CommandSpec | undefined {
  return BY_WORD.get(word.trim().toUpperCase());
}

/** Commands whose name or alias starts with what has been typed. */
export function suggestCommands(partial: string, limit = 6): CommandSpec[] {
  const q = partial.trim().toUpperCase();
  if (!q) return [];
  const out: CommandSpec[] = [];
  for (const c of COMMANDS) {
    if (out.includes(c)) continue;
    if (c.name.startsWith(q) || c.aliases.some((a) => a.startsWith(q))) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/* ────────────────────────── coordinate entry ────────────────────────── */

export type CoordinateInput =
  | { kind: "absolute"; point: Point }
  | { kind: "relative"; delta: Point }
  | { kind: "polar"; distance: number; angle: number }
  | { kind: "distance"; distance: number };

/**
 * Parse a typed coordinate.
 *
 * Returns null rather than throwing for anything unrecognised, because the
 * same box takes commands and the caller tries this first.
 */
export function parseCoordinate(raw: string): CoordinateInput | null {
  const text = raw.trim();
  if (!text) return null;

  // Polar: 50<45
  const polar = /^(-?[\d.]+)\s*<\s*(-?[\d.]+)$/.exec(text);
  if (polar) {
    const distance = Number(polar[1]);
    const angle = Number(polar[2]);
    if (!Number.isFinite(distance) || !Number.isFinite(angle)) return null;
    return { kind: "polar", distance, angle };
  }

  // Relative: @30,0
  const relative = /^@\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(text);
  if (relative) {
    const x = Number(relative[1]);
    const y = Number(relative[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { kind: "relative", delta: { x, y } };
  }

  // Absolute, with or without the leading hash AutoCAD uses to force it.
  const absolute = /^#?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(text);
  if (absolute) {
    const x = Number(absolute[1]);
    const y = Number(absolute[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { kind: "absolute", point: { x, y } };
  }

  // A bare number is a distance along whatever direction is current.
  const bare = /^(-?[\d.]+)$/.exec(text);
  if (bare) {
    const distance = Number(bare[1]);
    if (!Number.isFinite(distance)) return null;
    return { kind: "distance", distance };
  }

  return null;
}

/**
 * Turn a parsed coordinate into a point.
 *
 * `last` is the previous click, which relative and polar are measured from and
 * without which they mean nothing. `towards` is where the pointer is, which is
 * the direction a bare distance runs in.
 */
export function resolveCoordinate(
  input: CoordinateInput,
  last: Point | null,
  towards: Point | null,
): Point | null {
  switch (input.kind) {
    case "absolute":
      return input.point;

    case "relative":
      if (!last) return null;
      return { x: last.x + input.delta.x, y: last.y + input.delta.y };

    case "polar": {
      if (!last) return null;
      const rad = (input.angle * Math.PI) / 180;
      return {
        x: last.x + Math.cos(rad) * input.distance,
        y: last.y + Math.sin(rad) * input.distance,
      };
    }

    case "distance": {
      if (!last || !towards) return null;
      const dx = towards.x - last.x;
      const dy = towards.y - last.y;
      const len = Math.hypot(dx, dy);
      // With the pointer sitting exactly on the last point there is no
      // direction to run in, and guessing one would put the line somewhere the
      // user did not indicate.
      if (len === 0) return null;
      return {
        x: last.x + (dx / len) * input.distance,
        y: last.y + (dy / len) * input.distance,
      };
    }
  }
}
