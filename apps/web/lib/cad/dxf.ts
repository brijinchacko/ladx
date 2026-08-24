import {
  DEFAULT_LAYERS,
  type Drawing,
  type Entity,
  type Point,
  dimensionGeometry,
  emptyDrawing,
  newId,
} from "./types";

/**
 * DXF in and out.
 *
 * DXF is a flat list of (group code, value) pairs. Codes carry the meaning: 0
 * starts an entity, 8 is the layer, 10/20 are the first X/Y, and so on. That
 * regularity is why a focused reader is practical: it walks pairs and starts a
 * new entity every time it sees a 0.
 *
 * The writer emits R12 ASCII, deliberately. R12 is the most widely readable DXF
 * revision in existence, understood by AutoCAD, LibreCAD, QCAD, DraftSight,
 * Inkscape, Fusion and everything else with an import menu. Later revisions add
 * features this editor does not use and reduce the number of programs that can
 * open the file.
 *
 * Unsupported entity types are skipped rather than guessed at, and the count is
 * reported so the user is told what did not come across instead of quietly
 * receiving a partial drawing.
 */

export interface DxfReadResult {
  drawing: Drawing;
  /** Entity types present in the file that this editor does not model. */
  skipped: { type: string; count: number }[];
}

type Pair = { code: number; value: string };

function tokenise(text: string): Pair[] {
  // DXF pairs are two lines: the code, then the value. Line endings vary, and
  // trailing whitespace is common in files written by hand.
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt((lines[i] ?? "").trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: (lines[i + 1] ?? "").trim() });
  }
  return pairs;
}

/** AutoCAD colour index to hex, for the handful that appear in practice. */
const ACI: Record<number, string> = {
  1: "FF0000",
  2: "FFFF00",
  3: "00FF00",
  4: "00FFFF",
  5: "0000FF",
  6: "FF00FF",
  7: "0F1A24",
  8: "808080",
  9: "C0C0C0",
};

const SUPPORTED = new Set(["LINE", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "TEXT", "MTEXT"]);

export function readDxf(text: string): DxfReadResult {
  const pairs = tokenise(text);
  const drawing = emptyDrawing();
  drawing.layers = [];
  const skipped = new Map<string, number>();

  let section = "";
  let current: { type: string; codes: Map<number, string[]> } | null = null;

  const flush = () => {
    if (!current) return;
    const entity = buildEntity(current.type, current.codes);
    if (entity) drawing.entities.push(entity);
    else if (
      // Only geometry can be "skipped". Records in the TABLES section are
      // structure, and LAYER records in particular are read into drawing.layers
      // a few lines below, so counting them here reported six layers dropped on
      // an import that had in fact kept every one of them. A message whose only
      // job is to say what was lost has to be right about it.
      section === "ENTITIES" &&
      !SUPPORTED.has(current.type) &&
      current.type !== "SEQEND"
    ) {
      skipped.set(current.type, (skipped.get(current.type) ?? 0) + 1);
    }
    current = null;
  };

  for (let i = 0; i < pairs.length; i++) {
    const { code, value } = pairs[i] as Pair;

    if (code === 0) {
      flush();
      if (value === "SECTION") {
        const next = pairs[i + 1];
        section = next?.code === 2 ? next.value : "";
        continue;
      }
      if (value === "ENDSEC") {
        section = "";
        continue;
      }
      if (section === "ENTITIES") current = { type: value, codes: new Map() };
      if (section === "TABLES" && value === "LAYER") current = { type: "LAYER", codes: new Map() };
      continue;
    }

    if (!current) continue;
    const list = current.codes.get(code) ?? [];
    list.push(value);
    current.codes.set(code, list);

    // A layer definition ends at the next 0, which flush() handles; capture it
    // here because layers live in TABLES rather than ENTITIES.
    if (current.type === "LAYER" && code === 2) {
      const name = value;
      const colorCode = Number.parseInt(current.codes.get(62)?.[0] ?? "7", 10);
      if (name && !drawing.layers.some((l) => l.name === name)) {
        drawing.layers.push({
          name,
          color: ACI[Math.abs(colorCode)] ?? "0F1A24",
          visible: colorCode >= 0, // negative index means the layer is off
          locked: false,
        });
      }
    }
  }
  flush();

  if (drawing.layers.length === 0) drawing.layers = DEFAULT_LAYERS.map((l) => ({ ...l }));

  // Any layer referenced by an entity but missing from the table still needs to
  // exist, or those entities become invisible and unselectable.
  for (const e of drawing.entities) {
    if (!drawing.layers.some((l) => l.name === e.layer)) {
      drawing.layers.push({ name: e.layer, color: "0F1A24", visible: true, locked: false });
    }
  }

  return {
    drawing,
    skipped: [...skipped.entries()].map(([type, count]) => ({ type, count })),
  };
}

function num(codes: Map<number, string[]>, code: number, at = 0): number {
  return Number.parseFloat(codes.get(code)?.[at] ?? "0") || 0;
}

function buildEntity(type: string, codes: Map<number, string[]>): Entity | null {
  const layer = codes.get(8)?.[0] || "0";

  switch (type) {
    case "LINE":
      return {
        id: newId("l"),
        type: "line",
        layer,
        a: { x: num(codes, 10), y: num(codes, 20) },
        b: { x: num(codes, 11), y: num(codes, 21) },
      };

    case "CIRCLE":
      return {
        id: newId("c"),
        type: "circle",
        layer,
        c: { x: num(codes, 10), y: num(codes, 20) },
        r: num(codes, 40),
      };

    case "ARC":
      return {
        id: newId("a"),
        type: "arc",
        layer,
        c: { x: num(codes, 10), y: num(codes, 20) },
        r: num(codes, 40),
        start: num(codes, 50),
        end: num(codes, 51),
      };

    case "LWPOLYLINE":
    case "POLYLINE": {
      // Vertices arrive as parallel lists of 10s and 20s.
      const xs = codes.get(10) ?? [];
      const ys = codes.get(20) ?? [];
      const points: Point[] = [];
      for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
        points.push({
          x: Number.parseFloat(xs[i] as string) || 0,
          y: Number.parseFloat(ys[i] as string) || 0,
        });
      }
      if (points.length < 2) return null;
      const flags = Number.parseInt(codes.get(70)?.[0] ?? "0", 10);
      return {
        id: newId("p"),
        type: "polyline",
        layer,
        points,
        closed: (flags & 1) === 1,
      };
    }

    case "TEXT":
    case "MTEXT": {
      const raw = codes.get(1)?.join("") ?? "";
      // MTEXT carries inline formatting codes; strip the common ones so the
      // text is readable rather than full of \pxq and \f directives.
      const text = raw
        .replace(/\\[A-Za-z][^;]*;/g, "")
        .replace(/[{}]/g, "")
        .replace(/\\P/g, " ")
        .trim();
      if (!text) return null;
      return {
        id: newId("t"),
        type: "text",
        layer,
        at: { x: num(codes, 10), y: num(codes, 20) },
        text,
        height: num(codes, 40) || 2.5,
      };
    }

    default:
      return null;
  }
}

/* ────────────────────────────── writing ────────────────────────────── */

function pair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

/**
 * Write R12 ASCII DXF.
 *
 * Rectangles become closed LWPOLYLINEs because DXF has no rectangle entity,
 * which is also how every CAD package stores one.
 */
export function writeDxf(drawing: Drawing): string {
  let out = "";

  // Header: just enough for readers that insist on a version.
  out += pair(0, "SECTION") + pair(2, "HEADER");
  out += pair(9, "$ACADVER") + pair(1, "AC1009");
  out += pair(9, "$INSUNITS") + pair(70, 4); // millimetres
  out += pair(0, "ENDSEC");

  // Layer table.
  out += pair(0, "SECTION") + pair(2, "TABLES");
  out += pair(0, "TABLE") + pair(2, "LAYER") + pair(70, drawing.layers.length);
  for (const layer of drawing.layers) {
    out += pair(0, "LAYER");
    out += pair(2, layer.name);
    out += pair(70, 0);
    out += pair(62, layer.visible ? aciFor(layer.color) : -aciFor(layer.color));
    out += pair(6, "CONTINUOUS");
  }
  out += pair(0, "ENDTAB") + pair(0, "ENDSEC");

  // Entities.
  out += pair(0, "SECTION") + pair(2, "ENTITIES");
  for (const e of drawing.entities) out += entityToDxf(e);
  out += pair(0, "ENDSEC");

  out += pair(0, "EOF");
  return out;
}

function aciFor(hex: string): number {
  const found = Object.entries(ACI).find(([, v]) => v.toLowerCase() === hex.toLowerCase());
  return found ? Number.parseInt(found[0], 10) : 7;
}

function entityToDxf(e: Entity): string {
  const head = (type: string) => pair(0, type) + pair(8, e.layer);

  switch (e.type) {
    case "line":
      return (
        head("LINE") +
        pair(10, e.a.x) +
        pair(20, e.a.y) +
        pair(30, 0) +
        pair(11, e.b.x) +
        pair(21, e.b.y) +
        pair(31, 0)
      );

    case "circle":
      return head("CIRCLE") + pair(10, e.c.x) + pair(20, e.c.y) + pair(30, 0) + pair(40, e.r);

    case "arc":
      return (
        head("ARC") +
        pair(10, e.c.x) +
        pair(20, e.c.y) +
        pair(30, 0) +
        pair(40, e.r) +
        pair(50, e.start) +
        pair(51, e.end)
      );

    case "rect": {
      const x1 = Math.min(e.a.x, e.b.x);
      const y1 = Math.min(e.a.y, e.b.y);
      const x2 = Math.max(e.a.x, e.b.x);
      const y2 = Math.max(e.a.y, e.b.y);
      let s = head("LWPOLYLINE") + pair(90, 4) + pair(70, 1);
      for (const [x, y] of [
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2],
      ]) {
        s += pair(10, x as number) + pair(20, y as number);
      }
      return s;
    }

    case "polyline": {
      let s = head("LWPOLYLINE") + pair(90, e.points.length) + pair(70, e.closed ? 1 : 0);
      for (const p of e.points) s += pair(10, p.x) + pair(20, p.y);
      return s;
    }

    case "text":
      return (
        head("TEXT") +
        pair(10, e.at.x) +
        pair(20, e.at.y) +
        pair(30, 0) +
        pair(40, e.height) +
        pair(1, e.text)
      );

    // Exploded into the lines and text it is drawn from.
    //
    // DXF does have a DIMENSION entity, but it references a block for the
    // graphics and a DIMSTYLE table for the appearance, and readers disagree
    // about both, so a dimension written that way lands looking different in
    // every package that opens it. Lines and text land identically everywhere.
    // The cost is that the measurement stops being live once it leaves here,
    // which is the correct trade for an interchange file.
    case "dimension": {
      const g = dimensionGeometry(e);
      let s = "";
      const seg = (a: Point, b: Point) =>
        pair(0, "LINE") +
        pair(8, e.layer) +
        pair(10, a.x) +
        pair(20, a.y) +
        pair(30, 0) +
        pair(11, b.x) +
        pair(21, b.y) +
        pair(31, 0);

      for (const [a, b] of g.witness) s += seg(a, b);
      s += seg(g.line[0], g.line[1]);
      for (const [a, b] of g.arrows) s += seg(a, b);

      s +=
        pair(0, "TEXT") +
        pair(8, e.layer) +
        pair(10, g.text.at.x) +
        pair(20, g.text.at.y) +
        pair(30, 0) +
        pair(40, e.height) +
        pair(50, g.text.angle) +
        pair(1, g.text.value);
      return s;
    }
  }
}
