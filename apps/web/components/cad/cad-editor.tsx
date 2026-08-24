"use client";

import CadProperties from "@/components/cad/cad-properties";
import CadRail from "@/components/cad/cad-rail";
import CadSheets, { type SheetRow } from "@/components/cad/cad-sheets";
import { type DrawingTemplate, buildDrawingFromTemplate } from "@/lib/cad/drawing-templates";
import { readDxf, writeDxf } from "@/lib/cad/dxf";
import { drawingToPdf } from "@/lib/cad/pdf";
import {
  centreOf,
  drawEntity,
  hitTest,
  hitTestBox,
  mirrorAbout,
  rotateAbout,
  scaleAbout,
  transformEntity,
  translateEntity,
} from "@/lib/cad/render";
import { type SnapHit, findSnap } from "@/lib/cad/snap";
import type { CadSymbol } from "@/lib/cad/symbols";
import {
  BORDER_LAYER,
  type SheetSize,
  type TitleBlockFields,
  buildTitleBlock,
} from "@/lib/cad/titleblock";
import {
  DEFAULT_LAYERS,
  type Drawing,
  type Entity,
  type Point,
  drawingBounds,
  formatLength,
  newId,
} from "@/lib/cad/types";
import { type Menu, MenuBar } from "@ladx/studio";
import {
  Circle as CircleIcon,
  Copy,
  Download,
  FileText,
  Grid3x3,
  Magnet,
  Minus,
  MousePointer2,
  Redo2,
  Ruler,
  Save,
  Spline,
  Square,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tool = "select" | "line" | "rect" | "circle" | "arc" | "polyline" | "text" | "dimension";

const TOOLS: { id: Tool; label: string; icon: typeof Minus; key: string; hint?: string }[] = [
  {
    id: "select",
    label: "Select",
    icon: MousePointer2,
    key: "V",
    hint: "drag to move, Alt to copy",
  },
  { id: "line", label: "Line", icon: Minus, key: "L" },
  { id: "rect", label: "Rectangle", icon: Square, key: "R" },
  { id: "circle", label: "Circle", icon: CircleIcon, key: "C" },
  { id: "arc", label: "Arc", icon: Spline, key: "A", hint: "centre, then start, then end" },
  { id: "polyline", label: "Polyline", icon: Spline, key: "P" },
  { id: "text", label: "Text", icon: TypeIcon, key: "T" },
  {
    id: "dimension",
    label: "Dimension",
    icon: Ruler,
    key: "D",
    hint: "two points, then the offset",
  },
];

/** How many clicks each tool takes before it produces something. */
const CLICKS: Partial<Record<Tool, number>> = { line: 2, rect: 2, circle: 2, arc: 3, dimension: 3 };

interface View {
  /** Drawing units per screen pixel. */
  scale: number;
  /** Drawing-space point at the canvas origin. */
  ox: number;
  oy: number;
}

type Drag =
  | { kind: "none" }
  | { kind: "pan"; from: Point }
  | { kind: "marquee"; from: Point; to: Point }
  | { kind: "move"; from: Point; to: Point; copy: boolean; base: Entity[] };

/**
 * The CAD editor.
 *
 * Canvas rather than SVG, because a panel drawing reaches thousands of entities
 * and a DOM node per entity stops being interactive well before that. Canvas
 * redraws the visible set each frame at a cost that does not grow with document
 * size the way layout does.
 *
 * The world is Y-up in millimetres, matching DXF and drawing convention. The Y
 * flip happens once, in toScreen and toWorld, so no other code has to remember
 * which way up it is.
 *
 * History is whole-drawing snapshots. For a drafting tool at this scale that is
 * both simpler and more reliable than an inverse-operation undo stack, where a
 * single missed inverse corrupts the document silently.
 */
export default function CadEditor({
  drawingId,
  initial,
  name: initialName,
  projectName,
  titleFields,
  sheets = [],
  projectId = null,
}: {
  drawingId: string;
  initial: Drawing;
  name: string;
  projectName?: string;
  /** Project, client and company details, for the generated title block. */
  titleFields?: Omit<TitleBlockFields, "drawingTitle">;
  /** Every sheet in this set, for the tree. */
  sheets?: SheetRow[];
  projectId?: string | null;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Reached from both the toolbar and the File menu, so it lives here rather
  // than inside either.
  const importRef = useRef<HTMLInputElement>(null);

  /**
   * A drawing always has layers.
   *
   * One can arrive without them: created through the API with an empty set, or
   * imported from a DXF whose layer table was missing. With none, the active
   * layer picker is empty and every new entity is filed on a layer that does
   * not exist, so it cannot be hidden, locked or coloured. Backfilled on the
   * way in rather than guarded at twenty call sites.
   */
  const seeded = useMemo<Drawing>(
    () =>
      initial.layers.length > 0
        ? initial
        : { ...initial, layers: DEFAULT_LAYERS.map((l) => ({ ...l })) },
    [initial],
  );

  const [drawing, setDrawing] = useState<Drawing>(seeded);
  const [name, setName] = useState(initialName);
  const [tool, setTool] = useState<Tool>("select");
  const [layer, setLayer] = useState(seeded.layers[0]?.name ?? "0");
  const [view, setView] = useState<View>({ scale: 1, ox: 0, oy: 0 });
  const [gridSnap, setGridSnap] = useState(true);
  const [objectSnap, setObjectSnap] = useState(true);
  const [grid] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // In-progress geometry: the points clicked so far for the active tool.
  const [pending, setPending] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snapHit, setSnapHit] = useState<SnapHit | null>(null);
  const [drag, setDrag] = useState<Drag>({ kind: "none" });

  const [history, setHistory] = useState<Drawing[]>([seeded]);
  const [historyAt, setHistoryAt] = useState(0);

  /**
   * The clipboard, and whether there is unsaved work.
   *
   * The clipboard is deliberately in memory rather than the system one: what is
   * being copied is geometry, and serialising it through text to survive a
   * round trip through the OS clipboard would lose the layer assignment and the
   * entity types for no gain. Copy and paste between sheets of the same set
   * work because the editor is not remounted between them.
   */
  const clipboardRef = useRef<Entity[]>([]);
  const savedRef = useRef<Drawing>(seeded);
  const [dirty, setDirty] = useState(false);
  const [showProperties, setShowProperties] = useState(true);

  const commit = useCallback(
    (next: Drawing) => {
      setDrawing(next);
      setDirty(next !== savedRef.current);
      setHistory((h) => [...h.slice(0, historyAt + 1), next].slice(-60));
      setHistoryAt((i) => Math.min(i + 1, 59));
    },
    [historyAt],
  );

  const undo = useCallback(() => {
    if (historyAt <= 0) return;
    setHistoryAt((i) => i - 1);
    setDrawing(history[historyAt - 1] as Drawing);
    setSelected([]);
  }, [history, historyAt]);

  const redo = useCallback(() => {
    if (historyAt >= history.length - 1) return;
    setHistoryAt((i) => i + 1);
    setDrawing(history[historyAt + 1] as Drawing);
  }, [history, historyAt]);

  /* ── coordinate transforms ── */

  const toScreen = useCallback(
    (p: Point): Point => ({ x: (p.x - view.ox) / view.scale, y: (view.oy - p.y) / view.scale }),
    [view],
  );

  const toWorld = useCallback(
    (sx: number, sy: number): Point => ({
      x: sx * view.scale + view.ox,
      y: view.oy - sy * view.scale,
    }),
    [view],
  );

  const layerOf = useCallback(
    (n: string) => drawing.layers.find((l) => l.name === n),
    [drawing.layers],
  );

  /**
   * Where a click actually lands.
   *
   * Object snap wins over grid snap when it finds something, because the point
   * of it is to land exactly on existing geometry, and rounding that to the
   * nearest 10 mm afterwards would undo the whole thing.
   */
  const resolvePoint = useCallback(
    (raw: Point, exclude?: Set<string>): { point: Point; hit: SnapHit | null } => {
      if (objectSnap) {
        const hit = findSnap(drawing, raw, view.scale * 10, {
          layerVisible: (n) => layerOf(n)?.visible !== false,
          exclude,
          from: pending.length > 0 ? (pending[pending.length - 1] as Point) : null,
        });
        if (hit) return { point: hit.point, hit };
      }
      if (gridSnap) {
        return {
          point: { x: Math.round(raw.x / grid) * grid, y: Math.round(raw.y / grid) * grid },
          hit: null,
        };
      }
      return { point: raw, hit: null };
    },
    [objectSnap, gridSnap, grid, drawing, view.scale, layerOf, pending],
  );

  /* ── fit the drawing on first paint ── */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once to frame whatever was loaded; re-running on every change would fight panning.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const b = drawingBounds(initial);
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 600;
    if (!b) {
      setView({ scale: 0.5, ox: -20, oy: h * 0.5 * 0.5 });
      return;
    }
    const pad = 40;
    const sx = (b.max.x - b.min.x || 100) / Math.max(w - pad * 2, 1);
    const sy = (b.max.y - b.min.y || 100) / Math.max(h - pad * 2, 1);
    const scale = Math.max(sx, sy) * 1.1 || 0.5;
    setView({ scale, ox: b.min.x - pad * scale, oy: b.max.y + pad * scale });
  }, []);

  /* ── rendering ── */

  /** What is on screen right now, including a move that has not been committed. */
  const displayed = useMemo(() => {
    if (drag.kind !== "move") return drawing.entities;
    const dx = drag.to.x - drag.from.x;
    const dy = drag.to.y - drag.from.y;
    const moving = new Set(selected);
    const shifted = drag.base.map((e) => translateEntity(e, dx, dy));
    // A copy shows the original in place with the duplicate riding the pointer.
    return drag.copy
      ? [...drawing.entities, ...shifted]
      : [...drawing.entities.filter((e) => !moving.has(e.id)), ...shifted];
  }, [drawing.entities, drag, selected]);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);

    // Grid, drawn only when it would not become a solid field of lines.
    const stepPx = grid / view.scale;
    if (stepPx > 5) {
      ctx.strokeStyle = "#EEF2F5";
      ctx.lineWidth = 1;
      const first = toWorld(0, 0);
      const startX = Math.floor(first.x / grid) * grid;
      const startY = Math.ceil(first.y / grid) * grid;
      ctx.beginPath();
      for (let x = startX; ; x += grid) {
        const s = toScreen({ x, y: 0 });
        if (s.x > w) break;
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, h);
      }
      for (let y = startY; ; y -= grid) {
        const s = toScreen({ x: 0, y });
        if (s.y > h) break;
        ctx.moveTo(0, s.y);
        ctx.lineTo(w, s.y);
      }
      ctx.stroke();
    }

    // Origin axes, so the user can tell where 0,0 is.
    const origin = toScreen({ x: 0, y: 0 });
    ctx.strokeStyle = "#D5DCE2";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(w, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, h);
    ctx.stroke();

    const screen = { toScreen, scale: view.scale };
    for (const e of displayed) {
      const l = layerOf(e.layer);
      if (l && !l.visible) continue;
      const isSel = selected.includes(e.id);
      ctx.strokeStyle = isSel ? "#2C9A9E" : `#${l?.color ?? "0F1A24"}`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = isSel ? 2.5 : 1.4;
      drawEntity(ctx, e, screen);
    }

    // The shape being drawn right now, plus a rubber band to the cursor.
    if (pending.length > 0 && cursor) {
      ctx.strokeStyle = "#2C9A9E";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.4;
      ctx.fillStyle = "#2C9A9E";
      const preview = previewEntity(tool, pending, cursor, layer);
      if (preview) drawEntity(ctx, preview, screen);
      ctx.setLineDash([]);
    }

    // Marquee.
    if (drag.kind === "marquee") {
      const a = toScreen(drag.from);
      const b = toScreen(drag.to);
      ctx.strokeStyle = "#2C9A9E";
      ctx.fillStyle = "rgba(44,154,158,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([]);
    }

    // Snap marker: a square on the point that would be used.
    if (snapHit) {
      const s = toScreen(snapHit.point);
      ctx.strokeStyle = "#B4531A";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x - 4, s.y - 4, 8, 8);
    }
  }, [
    displayed,
    view,
    selected,
    pending,
    cursor,
    tool,
    layer,
    grid,
    drag,
    snapHit,
    toScreen,
    toWorld,
    layerOf,
  ]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint]);

  /* ── interaction ── */

  const worldAt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return toWorld(e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const raw = worldAt(e);

    // Middle button pans, from any tool.
    if (e.button === 1) {
      setDrag({ kind: "pan", from: raw });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    if (tool === "select") {
      const hit = hitTest(drawing, raw, view.scale * 6, layerOf);
      if (hit) {
        const next = e.shiftKey
          ? selected.includes(hit)
            ? selected.filter((id) => id !== hit)
            : [...selected, hit]
          : selected.includes(hit)
            ? selected
            : [hit];
        setSelected(next);
        // Grab whatever is selected so a drag moves the whole set.
        const base = drawing.entities.filter((x) => next.includes(x.id));
        const start = resolvePoint(raw, new Set(next)).point;
        setDrag({ kind: "move", from: start, to: start, copy: e.altKey, base });
      } else {
        if (!e.shiftKey) setSelected([]);
        setDrag({ kind: "marquee", from: raw, to: raw });
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const { point: world } = resolvePoint(raw);

    if (tool === "text") {
      const text = window.prompt("Text");
      if (text?.trim()) {
        commit({
          ...drawing,
          entities: [
            ...drawing.entities,
            { id: newId("t"), type: "text", layer, at: world, text: text.trim(), height: 3.5 },
          ],
        });
      }
      return;
    }

    const next = [...pending, world];
    const need = CLICKS[tool];

    // Polyline keeps going until Enter or Escape; everything else completes on
    // its own click count.
    if (need && next.length === need) {
      const entity = makeEntity(tool, next, layer);
      if (entity) commit({ ...drawing, entities: [...drawing.entities, entity] });
      setPending([]);
      return;
    }
    setPending(next);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const raw = worldAt(e);

    if (drag.kind === "pan") {
      setView((v) => ({
        ...v,
        ox: v.ox - e.movementX * v.scale,
        oy: v.oy + e.movementY * v.scale,
      }));
      return;
    }
    if (drag.kind === "marquee") {
      setDrag({ ...drag, to: raw });
      setCursor(raw);
      return;
    }
    if (drag.kind === "move") {
      const { point, hit } = resolvePoint(raw, new Set(selected));
      setSnapHit(hit);
      setDrag({ ...drag, to: point, copy: e.altKey });
      setCursor(point);
      return;
    }

    const { point, hit } = resolvePoint(raw);
    setSnapHit(tool === "select" ? null : hit);
    setCursor(point);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.kind === "marquee") {
      const ids = hitTestBox(drawing, drag.from, drag.to, layerOf);
      // A click with no movement is a deselect, not a select of nothing.
      if (ids.length > 0) setSelected((s) => (e.shiftKey ? [...new Set([...s, ...ids])] : ids));
    }

    if (drag.kind === "move") {
      const dx = drag.to.x - drag.from.x;
      const dy = drag.to.y - drag.from.y;
      if (dx !== 0 || dy !== 0) {
        const shifted = drag.base.map((x) => {
          const moved = translateEntity(x, dx, dy);
          return drag.copy ? { ...moved, id: newId("c") } : moved;
        });
        const movingIds = new Set(drag.base.map((x) => x.id));
        commit({
          ...drawing,
          entities: drag.copy
            ? [...drawing.entities, ...shifted]
            : [...drawing.entities.filter((x) => !movingIds.has(x.id)), ...shifted],
        });
        if (drag.copy) setSelected(shifted.map((x) => x.id));
      }
    }

    setDrag({ kind: "none" });
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = toWorld(sx, sy);
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const scale = Math.min(Math.max(view.scale * factor, 0.01), 200);
    // Zoom about the pointer: keep the world point under the cursor fixed.
    setView({ scale, ox: before.x - sx * scale, oy: before.y + sy * scale });
  };

  const finishPolyline = useCallback(
    (closed: boolean) => {
      if (pending.length >= 2) {
        commit({
          ...drawing,
          entities: [
            ...drawing.entities,
            { id: newId("p"), type: "polyline", layer, points: pending, closed },
          ],
        });
      }
      setPending([]);
    },
    [pending, drawing, layer, commit],
  );

  const deleteSelected = useCallback(() => {
    if (selected.length === 0) return;
    commit({ ...drawing, entities: drawing.entities.filter((e) => !selected.includes(e.id)) });
    setSelected([]);
  }, [selected, drawing, commit]);

  /** Duplicate in place, offset by one grid square so it is visible. */
  const duplicateSelected = useCallback(() => {
    if (selected.length === 0) return;
    const copies = drawing.entities
      .filter((e) => selected.includes(e.id))
      .map((e) => ({ ...translateEntity(e, grid, -grid), id: newId("c") }));
    commit({ ...drawing, entities: [...drawing.entities, ...copies] });
    setSelected(copies.map((c) => c.id));
  }, [selected, drawing, commit, grid]);

  /* ── library and sheet ── */

  const insertSymbol = useCallback(
    (sym: CadSymbol) => {
      // Dropped at the middle of the view, then dragged into place, which beats
      // asking for a click and leaving the user unsure what the tool is doing.
      const wrap = wrapRef.current;
      const at = wrap ? toWorld(wrap.clientWidth / 2, wrap.clientHeight / 2) : { x: 0, y: 0 };
      const snapped = { x: Math.round(at.x / grid) * grid, y: Math.round(at.y / grid) * grid };
      const parts = sym.build(snapped);
      // Every symbol carries its own layer, and any it names must exist.
      const missing = [...new Set(parts.map((p) => p.layer))].filter(
        (n) => !drawing.layers.some((l) => l.name === n),
      );
      commit({
        ...drawing,
        layers: [
          ...drawing.layers,
          ...missing.map((n) => ({ name: n, color: "0F1A24", visible: true, locked: false })),
        ],
        entities: [...drawing.entities, ...parts],
      });
      setSelected(parts.map((p) => p.id));
      setTool("select");
      setStatus(`${sym.name} inserted. Drag it into place.`);
      setTimeout(() => setStatus(null), 3000);
    },
    [drawing, commit, grid, toWorld],
  );

  const insertSheet = useCallback(
    (sheet: SheetSize) => {
      const parts = buildTitleBlock(sheet, {
        drawingTitle: name,
        date: new Date().toISOString().slice(0, 10),
        ...titleFields,
      });
      const hasLayer = drawing.layers.some((l) => l.name === BORDER_LAYER);
      commit({
        ...drawing,
        layers: hasLayer
          ? drawing.layers
          : [
              ...drawing.layers,
              { name: BORDER_LAYER, color: "4A5A68", visible: true, locked: false },
            ],
        // Existing geometry keeps its coordinates; the sheet is laid around the
        // origin and the drawing is moved onto it by hand, because guessing
        // where somebody wants their work on the page is worse than not.
        entities: [...parts, ...drawing.entities],
      });
      setStatus(`${sheet.name} sheet and title block added.`);
      setTimeout(() => setStatus(null), 4000);
    },
    [drawing, commit, name, titleFields],
  );

  /**
   * A whole sheet from the standard set.
   *
   * Replaces rather than appends when the drawing is empty, which it usually is
   * at this point: a template is how you start a sheet. On a drawing with work
   * on it the template is added instead, because silently discarding somebody's
   * geometry to make room for a frame would be unforgivable.
   */
  const insertTemplate = useCallback(
    (template: DrawingTemplate) => {
      const parts = buildDrawingFromTemplate(template, {
        drawingTitle: template.name,
        date: new Date().toISOString().slice(0, 10),
        ...titleFields,
      });
      const needed = [...new Set(parts.map((p) => p.layer))].filter(
        (n) => !drawing.layers.some((l) => l.name === n),
      );
      const colours: Record<string, string> = {
        SHEET: "4A5A68",
        NOTES: "7A8894",
        WIRING: "B4531A",
        PANEL: "2C9A9E",
        TEXT: "4A5A68",
      };
      commit({
        ...drawing,
        layers: [
          ...drawing.layers,
          ...needed.map((n) => ({
            name: n,
            color: colours[n] ?? "0F1A24",
            visible: true,
            locked: false,
          })),
        ],
        entities: [...drawing.entities, ...parts],
      });
      if (drawing.entities.length === 0) setName(`${template.sheet} ${template.name}`);
      setStatus(
        drawing.entities.length === 0
          ? `Sheet ${template.sheet} started.`
          : `Sheet ${template.sheet} added to this drawing.`,
      );
      setTimeout(() => setStatus(null), 4000);
      // Frame it, because a template is drawn at sheet scale and the view was
      // wherever the last piece of work left it.
      const wrap = wrapRef.current;
      if (wrap) {
        const b = drawingBounds({ ...drawing, entities: parts });
        if (b) {
          const pad = 30;
          const sx = (b.max.x - b.min.x || 100) / Math.max(wrap.clientWidth - pad * 2, 1);
          const sy = (b.max.y - b.min.y || 100) / Math.max(wrap.clientHeight - pad * 2, 1);
          const scale = Math.max(sx, sy) * 1.08;
          setView({ scale, ox: b.min.x - pad * scale, oy: b.max.y + pad * scale });
        }
      }
    },
    [drawing, commit, titleFields],
  );

  /* ── clipboard and transforms ── */

  const selectedEntities = useMemo(
    () => drawing.entities.filter((e) => selected.includes(e.id)),
    [drawing.entities, selected],
  );

  const copySelected = useCallback(() => {
    if (selectedEntities.length === 0) return;
    clipboardRef.current = selectedEntities.map((e) => ({ ...e }));
    setStatus(`${selectedEntities.length} copied.`);
    setTimeout(() => setStatus(null), 2000);
  }, [selectedEntities]);

  const cutSelected = useCallback(() => {
    if (selectedEntities.length === 0) return;
    clipboardRef.current = selectedEntities.map((e) => ({ ...e }));
    commit({ ...drawing, entities: drawing.entities.filter((e) => !selected.includes(e.id)) });
    setSelected([]);
  }, [selectedEntities, drawing, selected, commit]);

  /**
   * Paste, offset by one grid square.
   *
   * Landing a paste exactly on top of the original looks like nothing happened
   * and leaves two entities the user cannot tell apart. One grid square is
   * enough to see, and small enough to nudge back.
   */
  const paste = useCallback(() => {
    const held = clipboardRef.current;
    if (held.length === 0) return;
    const copies = held.map((e) => ({
      ...translateEntity(e, grid, -grid),
      id: newId("v"),
    }));
    // Any layer the copied geometry used must exist on this sheet, or a paste
    // between sheets silently lands on a layer that is not there.
    const missing = [...new Set(copies.map((c) => c.layer))].filter(
      (n) => !drawing.layers.some((l) => l.name === n),
    );
    commit({
      ...drawing,
      layers: [
        ...drawing.layers,
        ...missing.map((n) => ({ name: n, color: "0F1A24", visible: true, locked: false })),
      ],
      entities: [...drawing.entities, ...copies],
    });
    setSelected(copies.map((c) => c.id));
    clipboardRef.current = copies.map((c) => ({ ...c }));
  }, [drawing, commit, grid]);

  /** Rotate, mirror or scale the selection about its own centre. */
  const transformSelected = useCallback(
    (kind: "rotate90" | "rotate-90" | "mirrorX" | "mirrorY" | "scale", factor?: number) => {
      if (selectedEntities.length === 0) return;
      // The snapped cursor wins as the base point when the user has one: it is
      // how you rotate a symbol about the terminal it connects to rather than
      // about its own middle.
      const base = snapHit?.point ?? centreOf(selectedEntities);
      const ids = new Set(selected);

      const apply = (e: Entity): Entity => {
        switch (kind) {
          case "rotate90":
            return transformEntity(e, base, rotateAbout(base, 90), { angleDelta: 90 });
          case "rotate-90":
            return transformEntity(e, base, rotateAbout(base, -90), { angleDelta: -90 });
          case "mirrorX":
            return transformEntity(e, base, mirrorAbout(base, "x"), { mirrorX: true });
          case "mirrorY":
            return transformEntity(e, base, mirrorAbout(base, "y"), { mirrorX: true });
          case "scale":
            return transformEntity(e, base, scaleAbout(base, factor ?? 1), { scale: factor ?? 1 });
        }
      };

      commit({
        ...drawing,
        entities: drawing.entities.map((e) => (ids.has(e.id) ? apply(e) : e)),
      });
    },
    [selectedEntities, selected, drawing, commit, snapHit],
  );

  /** One entity replaced, from the properties panel. */
  const replaceEntity = useCallback(
    (next: Entity) => {
      commit({
        ...drawing,
        entities: drawing.entities.map((e) => (e.id === next.id ? next : e)),
      });
    },
    [drawing, commit],
  );

  const moveSelectedToLayer = useCallback(
    (target: string) => {
      const ids = new Set(selected);
      commit({
        ...drawing,
        entities: drawing.entities.map((e) => (ids.has(e.id) ? { ...e, layer: target } : e)),
      });
    },
    [drawing, selected, commit],
  );

  /* ── view ── */

  /** Frame everything, or just the selection when there is one. */
  const zoomFit = useCallback(
    (onlySelection = false) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const subject =
        onlySelection && selectedEntities.length > 0 ? selectedEntities : drawing.entities;
      const b = drawingBounds({ ...drawing, entities: subject });
      if (!b) return;
      const pad = 40;
      const sx = (b.max.x - b.min.x || 100) / Math.max(wrap.clientWidth - pad * 2, 1);
      const sy = (b.max.y - b.min.y || 100) / Math.max(wrap.clientHeight - pad * 2, 1);
      const scale = Math.max(sx, sy, 0.01) * 1.08;
      setView({ scale, ox: b.min.x - pad * scale, oy: b.max.y + pad * scale });
    },
    [drawing, selectedEntities],
  );

  const setLayerFlag = useCallback(
    (layerName: string, flag: "visible" | "locked", value: boolean) => {
      commit({
        ...drawing,
        layers: drawing.layers.map((l) => (l.name === layerName ? { ...l, [flag]: value } : l)),
      });
    },
    [drawing, commit],
  );

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && ev.key.toLowerCase() === "d") {
        ev.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && ev.key.toLowerCase() === "c") {
        ev.preventDefault();
        copySelected();
        return;
      }
      if (mod && ev.key.toLowerCase() === "x") {
        ev.preventDefault();
        cutSelected();
        return;
      }
      if (mod && ev.key.toLowerCase() === "v") {
        ev.preventDefault();
        paste();
        return;
      }
      if (mod && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        void save();
        return;
      }
      if (mod && ev.key.toLowerCase() === "a") {
        ev.preventDefault();
        setSelected(
          drawing.entities.filter((e) => layerOf(e.layer)?.locked !== true).map((e) => e.id),
        );
        return;
      }
      if (ev.key === "Escape") {
        setPending([]);
        setSelected([]);
        return;
      }
      if (ev.key === "Enter" && tool === "polyline") {
        finishPolyline(false);
        return;
      }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        ev.preventDefault();
        deleteSelected();
        return;
      }
      // Nudge, which is how a drawing gets tidied.
      const NUDGE: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      };
      const dir = NUDGE[ev.key];
      if (dir && selected.length > 0) {
        ev.preventDefault();
        const step = ev.shiftKey ? grid : 1;
        const ids = new Set(selected);
        commit({
          ...drawing,
          entities: drawing.entities.map((e) =>
            ids.has(e.id)
              ? translateEntity(e, (dir[0] as number) * step, (dir[1] as number) * step)
              : e,
          ),
        });
        return;
      }
      const found = TOOLS.find((x) => x.key.toLowerCase() === ev.key.toLowerCase());
      if (found) {
        setTool(found.id);
        setPending([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // No dependency list, deliberately. The handler closes over most of the
    // editor's state, and an incomplete list here is how a shortcut quietly
    // starts acting on a stale drawing. Re-registering one listener per render
    // costs nothing next to that.
  });

  /* ── persistence and interchange ── */

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/cad/${drawingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, data: drawing }),
      });
      if (res.ok) {
        savedRef.current = drawing;
        setDirty(false);
      }
      setStatus(res.ok ? "Saved" : "Could not save");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 2500);
    }
  };

  const importDxf = async (file: File) => {
    const text = await file.text();
    const { drawing: parsed, skipped } = readDxf(text);
    commit(parsed);
    setLayer(parsed.layers[0]?.name ?? "0");
    setStatus(
      skipped.length
        ? `Imported. Skipped ${skipped.map((s) => `${s.count} ${s.type}`).join(", ")}.`
        : `Imported ${parsed.entities.length} entities.`,
    );
    setTimeout(() => setStatus(null), 6000);
  };

  const download = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, "-") || "drawing"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDxf = () =>
    download(new Blob([writeDxf(drawing)], { type: "application/dxf" }), "dxf");

  const exportPdf = () =>
    download(
      drawingToPdf(drawing, {
        title: name,
        footer: [titleFields?.projectNumber, projectName].filter(Boolean).join("  ·  "),
      }),
      "pdf",
    );

  /**
   * The menu bar.
   *
   * The same arrangement as the ladder editor, which is the same arrangement
   * every CAD package and every PLC IDE uses. Somebody who learns that export
   * is under File and mirror is under Modify carries that to AutoCAD unchanged;
   * inventing a tidier grouping here would teach a habit that works in one
   * piece of software.
   *
   * Modify is its own menu rather than part of Edit, because that is where a
   * draughtsman looks for rotate and mirror.
   */
  /*
   * Rebuilt every render rather than memoised.
   *
   * The menus close over most of the editor: the drawing, the selection, the
   * history, the clipboard, and half a dozen handlers that are plain functions
   * and therefore new each time. A dependency list over that is a list somebody
   * will get wrong, and the failure mode is a menu item that quietly acts on a
   * drawing from three edits ago. Building five arrays of objects costs
   * nothing next to that.
   */
  const menus: Menu[] = [
    {
      label: "File",
      items: [
        { label: "New sheet", onSelect: () => router.push("/studio/cad") },
        { label: "Save", shortcut: "Cmd S", onSelect: () => void save(), disabled: saving },
        { label: "Import DXF…", separator: true, onSelect: () => importRef.current?.click() },
        { label: "Export DXF", onSelect: exportDxf },
        { label: "Export PDF", onSelect: exportPdf },
        { label: "Print", shortcut: "Cmd P", onSelect: () => window.print() },
        {
          label: "Close",
          separator: true,
          onSelect: () => router.push(projectId ? `/studio/projects/${projectId}` : "/studio/cad"),
        },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Cmd Z", onSelect: undo, disabled: historyAt <= 0 },
        {
          label: "Redo",
          shortcut: "Shift Cmd Z",
          onSelect: redo,
          disabled: historyAt >= history.length - 1,
        },
        {
          label: "Cut",
          shortcut: "Cmd X",
          separator: true,
          onSelect: cutSelected,
          disabled: selected.length === 0,
        },
        {
          label: "Copy",
          shortcut: "Cmd C",
          onSelect: copySelected,
          disabled: selected.length === 0,
        },
        {
          label: "Paste",
          shortcut: "Cmd V",
          onSelect: paste,
          disabled: clipboardRef.current.length === 0,
        },
        {
          label: "Duplicate",
          shortcut: "Cmd D",
          onSelect: duplicateSelected,
          disabled: selected.length === 0,
        },
        {
          label: "Delete",
          shortcut: "Del",
          onSelect: deleteSelected,
          disabled: selected.length === 0,
        },
        {
          label: "Select all",
          shortcut: "Cmd A",
          separator: true,
          onSelect: () =>
            setSelected(
              drawing.entities.filter((e) => layerOf(e.layer)?.locked !== true).map((e) => e.id),
            ),
        },
        { label: "Select none", shortcut: "Esc", onSelect: () => setSelected([]) },
      ],
    },
    {
      label: "Draw",
      items: TOOLS.filter((t) => t.id !== "select").map((t) => ({
        label: t.label,
        shortcut: t.key,
        onSelect: () => {
          setTool(t.id);
          setPending([]);
        },
      })),
    },
    {
      label: "Modify",
      items: [
        {
          label: "Rotate 90 clockwise",
          onSelect: () => transformSelected("rotate-90"),
          disabled: selected.length === 0,
        },
        {
          label: "Rotate 90 anticlockwise",
          onSelect: () => transformSelected("rotate90"),
          disabled: selected.length === 0,
        },
        {
          label: "Mirror horizontally",
          separator: true,
          onSelect: () => transformSelected("mirrorX"),
          disabled: selected.length === 0,
        },
        {
          label: "Mirror vertically",
          onSelect: () => transformSelected("mirrorY"),
          disabled: selected.length === 0,
        },
        {
          label: "Scale by 2",
          separator: true,
          onSelect: () => transformSelected("scale", 2),
          disabled: selected.length === 0,
        },
        {
          label: "Scale by a half",
          onSelect: () => transformSelected("scale", 0.5),
          disabled: selected.length === 0,
        },
        {
          label: "Move to active layer",
          separator: true,
          onSelect: () => moveSelectedToLayer(layer),
          disabled: selected.length === 0,
        },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Zoom to fit", shortcut: "Cmd 0", onSelect: () => zoomFit(false) },
        {
          label: "Zoom to selection",
          onSelect: () => zoomFit(true),
          disabled: selected.length === 0,
        },
        {
          label: "Zoom in",
          separator: true,
          onSelect: () => setView((v) => ({ ...v, scale: Math.max(v.scale / 1.3, 0.01) })),
        },
        {
          label: "Zoom out",
          onSelect: () => setView((v) => ({ ...v, scale: Math.min(v.scale * 1.3, 200) })),
        },
        {
          label: gridSnap ? "Grid snap off" : "Grid snap on",
          separator: true,
          onSelect: () => setGridSnap((g) => !g),
        },
        {
          label: objectSnap ? "Object snap off" : "Object snap on",
          onSelect: () => setObjectSnap((o) => !o),
        },
        {
          label: showProperties ? "Hide properties" : "Show properties",
          separator: true,
          onSelect: () => setShowProperties((p) => !p),
        },
      ],
    },
  ];

  const stats = useMemo(
    () => ({ entities: drawing.entities.length, layers: drawing.layers.length }),
    [drawing],
  );

  const activeTool = TOOLS.find((t) => t.id === tool);
  const measuring =
    tool === "dimension" && pending.length >= 1 && cursor
      ? formatLength(
          Math.hypot(cursor.x - (pending[0] as Point).x, cursor.y - (pending[0] as Point).y),
        )
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MenuBar
        menus={menus}
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[11.5px] text-ink-400">
              {projectName ?? "No project"}
            </span>
            {dirty && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#B4531A]"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
          </span>
        }
      />

      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="w-40 rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
        />

        <div className="flex items-center gap-0.5 rounded-md border border-ink-200 bg-white p-0.5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                title={`${t.label} (${t.key})${t.hint ? ` — ${t.hint}` : ""}`}
                onClick={() => {
                  setTool(t.id);
                  setPending([]);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  tool === t.id ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <select
          value={layer}
          onChange={(e) => setLayer(e.target.value)}
          title="Active layer"
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
        >
          {drawing.layers.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setGridSnap((s) => !s)}
          title="Snap to grid"
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
            gridSnap
              ? "border-teal-400 bg-teal-50 text-teal-700"
              : "border-ink-200 bg-white text-ink-500"
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          {grid}mm
        </button>

        <button
          type="button"
          onClick={() => setObjectSnap((s) => !s)}
          title="Snap to existing geometry: endpoints, midpoints, centres"
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
            objectSnap
              ? "border-teal-400 bg-teal-50 text-teal-700"
              : "border-ink-200 bg-white text-ink-500"
          }`}
        >
          <Magnet className="h-3.5 w-3.5" />
          Object
        </button>

        <div className="flex items-center gap-0.5">
          <IconBtn title="Undo (Cmd+Z)" onClick={undo} disabled={historyAt <= 0}>
            <Undo2 className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Redo (Shift+Cmd+Z)"
            onClick={redo}
            disabled={historyAt >= history.length - 1}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Duplicate (Cmd+D)"
            onClick={duplicateSelected}
            disabled={selected.length === 0}
          >
            <Copy className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Delete" onClick={deleteSelected} disabled={selected.length === 0}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Zoom in"
            onClick={() => setView((v) => ({ ...v, scale: Math.max(v.scale / 1.3, 0.01) }))}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            title="Zoom out"
            onClick={() => setView((v) => ({ ...v, scale: Math.min(v.scale * 1.3, 200) }))}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </IconBtn>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {status && <span className="font-mono text-[11.5px] text-ink-500">{status}</span>}
          <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400">
            <Upload className="h-3.5 w-3.5" />
            DXF
            <input
              type="file"
              accept=".dxf,application/dxf,text/plain"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importDxf(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={exportDxf}
            title="Export DXF, for another CAD package"
            className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400"
          >
            <Download className="h-3.5 w-3.5" />
            DXF
          </button>
          <button
            type="button"
            onClick={exportPdf}
            title="Export PDF, for a print or a handover pack"
            className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex h-7 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <CadSheets
          sheets={sheets}
          currentId={drawingId}
          projectId={projectId}
          projectName={projectName ?? null}
          onDirtyCheck={() => dirty}
          onOpen={(id) => router.push(`/studio/cad/${id}`)}
        />

        {/* canvas */}
        <div ref={wrapRef} className="relative min-h-0 flex-1 bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setSnapHit(null)}
            onWheel={onWheel}
            onDoubleClick={() => tool === "polyline" && finishPolyline(false)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (tool === "polyline") finishPolyline(true);
            }}
            className={`h-full w-full ${
              drag.kind === "move"
                ? "cursor-move"
                : tool === "select"
                  ? "cursor-default"
                  : "cursor-crosshair"
            }`}
          />

          {/* status strip */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-center gap-4 border-t border-ink-100 bg-white/90 px-3 py-1 font-mono text-[10.5px] text-ink-400">
            <span>
              {cursor ? `X ${cursor.x.toFixed(1)}  Y ${cursor.y.toFixed(1)}` : "move the pointer"}
            </span>
            <span>{(1 / view.scale).toFixed(2)}x</span>
            <span>
              {stats.entities} entities · {stats.layers} layers
            </span>
            {snapHit && <span className="text-[#B4531A]">{snapHit.kind}</span>}
            {measuring && <span className="text-teal-700">{measuring} mm</span>}
            {selected.length > 0 && (
              <span className="text-teal-700">{selected.length} selected</span>
            )}
            {tool === "polyline" && pending.length > 0 && (
              <span className="text-teal-700">
                Enter to finish · right click to close · Esc to cancel
              </span>
            )}
            {activeTool?.hint && pending.length === 0 && drag.kind === "none" && (
              <span>{activeTool.hint}</span>
            )}
            {projectName && <span className="ml-auto">{projectName}</span>}
          </div>
        </div>

        {showProperties && (
          <aside className="flex w-56 shrink-0 flex-col border-l border-ink-100 bg-ink-50/40">
            <div className="shrink-0 border-b border-ink-100 px-2.5 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                Properties
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              <CadProperties
                selected={selectedEntities}
                layers={drawing.layers}
                onChange={replaceEntity}
                onChangeLayer={moveSelectedToLayer}
              />
            </div>
          </aside>
        )}

        <CadRail
          layers={drawing.layers}
          activeLayer={layer}
          onActivateLayer={setLayer}
          onLayerFlag={setLayerFlag}
          onInsertSymbol={insertSymbol}
          onInsertSheet={insertSheet}
          onInsertTemplate={insertTemplate}
        />
      </div>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-ink-200 bg-white text-ink-500 transition-colors hover:border-ink-400 hover:text-ink-900 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/* ── geometry helpers ── */

function makeEntity(tool: Tool, pts: Point[], layer: string): Entity | null {
  const [a, b, c] = pts as [Point, Point, Point?];
  switch (tool) {
    case "line":
      return { id: newId("l"), type: "line", layer, a, b };
    case "rect":
      return { id: newId("r"), type: "rect", layer, a, b };
    case "circle":
      return { id: newId("c"), type: "circle", layer, c: a, r: Math.hypot(b.x - a.x, b.y - a.y) };
    case "arc": {
      // Centre, then a point setting the radius and the start angle, then the
      // end angle. The end click only contributes its direction, so the arc
      // cannot come out with two different radii.
      if (!c) return null;
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      const deg = (p: Point) => (Math.atan2(p.y - a.y, p.x - a.x) * 180) / Math.PI;
      return { id: newId("a"), type: "arc", layer, c: a, r, start: deg(b), end: deg(c) };
    }
    case "dimension": {
      if (!c) return null;
      // The third click sets which side the dimension sits on and how far out,
      // taken as the perpendicular distance from the measured line.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const offset = ((c.x - a.x) * -dy + (c.y - a.y) * dx) / len;
      return { id: newId("d"), type: "dimension", layer, a, b, offset, height: 3.5 };
    }
    default:
      return null;
  }
}

function previewEntity(tool: Tool, pts: Point[], cursor: Point, layer: string): Entity | null {
  if (tool === "polyline") {
    return { id: "preview", type: "polyline", layer, points: [...pts, cursor], closed: false };
  }
  const first = pts[0];
  if (!first) return null;

  // Multi-click tools preview from what has been clicked plus the cursor.
  if (tool === "arc" || tool === "dimension") {
    if (pts.length === 1) {
      return { id: "preview", type: "line", layer, a: first, b: cursor };
    }
    return makeEntity(tool, [...pts, cursor], layer);
  }
  return makeEntity(tool, [first, cursor], layer);
}
