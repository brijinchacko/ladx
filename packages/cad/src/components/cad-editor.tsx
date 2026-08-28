"use client";

import { type Menu, MenuBar } from "@ladx/studio";
import {
  type DockLayout,
  DockPanel,
  DockStrip,
  type Side,
  focusModeLabel,
  useFocusMode,
} from "@ladx/studio";
import { type AssistRunContext, Assistant, RELAY_TITLES, useAssistant } from "@ladx/ui";
import { Download, FileText, Maximize2, Minimize2, Save, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CommandSpec, findCommand, parseCoordinate, resolveCoordinate } from "../lib/commands";
import { type DrawingTemplate, buildDrawingFromTemplate } from "../lib/drawing-templates";
import { readDxf, writeDxf } from "../lib/dxf";
import {
  arrayPolar,
  arrayRectangular,
  constrainAngle,
  extendLine,
  filletLines,
  offsetEntity,
  trimLine,
} from "../lib/operations";
import { type CadPanelId, cadDock } from "../lib/panels";
import { drawingToPdf } from "../lib/pdf";
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
} from "../lib/render";
import { type SnapHit, findSnap } from "../lib/snap";
import { type CadSymbol, getSymbol } from "../lib/symbols";
import { type CanvasTheme, THEMES, contrastColour, loadTheme, saveTheme } from "../lib/theme";
import {
  BORDER_LAYER,
  type SheetSize,
  type TitleBlockFields,
  buildTitleBlock,
} from "../lib/titleblock";
import {
  DEFAULT_LAYERS,
  type Drawing,
  type Entity,
  type Point,
  drawingBounds,
  formatLength,
  newId,
} from "../lib/types";
import CadCommandLine from "./cad-commandline";
import CadProperties from "./cad-properties";
import CadRail from "./cad-rail";
import CadSheets, { type SheetRow } from "./cad-sheets";
import CadToolbar, { ALL_TOOLS, TOOL_PANELS, type ToolId, toolSpec } from "./cad-toolbar";

/** How many clicks each tool takes before it produces something. */
const CLICKS: Partial<Record<ToolId, number>> = {
  line: 2,
  rect: 2,
  circle: 2,
  arc: 3,
  ellipse: 2,
  dimension: 3,
  leader: 2,
};

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
/**
 * Where a drawing is kept.
 *
 * A prop rather than a call, so the same editor serves the signed-in tool,
 * which PUTs to an API route against a project, and the public one at /cad,
 * which writes to the browser and has no account behind it. Returns whether it
 * landed, so the editor knows when to stop showing unsaved.
 */
export type SaveDrawing = (input: { id: string; name: string; data: Drawing }) => Promise<boolean>;

export default function CadEditor({
  drawingId,
  initial,
  name: initialName,
  projectName,
  titleFields,
  sheets = [],
  projectId = null,
  projects = [],
  onSave,
  canGenerate = true,
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
  /** Every project this user has, so a sheet can be filed without leaving. */
  projects?: { id: string; name: string }[];
  /** Defaults to the API route, which is what the signed-in editor wants. */
  onSave?: SaveDrawing;
  /**
   * Whether to offer AI drawing.
   *
   * False without an account, because generation needs a provider key that
   * belongs to a user. Offering a button that always answers "sign in" is
   * worse than not offering it.
   */
  canGenerate?: boolean;
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
  const [tool, setTool] = useState<ToolId>("select");
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
  /**
   * The panel layout, restored on mount rather than in the initial state.
   *
   * localStorage is not readable while the server renders, and seeding state
   * from it directly makes the first client render disagree with the HTML,
   * which React reports as a hydration mismatch and then throws the tree away.
   */
  const [layout, setLayout] = useState<DockLayout<CadPanelId>>(cadDock.defaults);
  useEffect(() => setLayout(cadDock.load()), []);
  const setPanel = useCallback(
    (id: CadPanelId, next: Partial<DockLayout<CadPanelId>[CadPanelId]>) => {
      setLayout((l) => {
        const out = { ...l, [id]: { ...l[id], ...next } };
        cadDock.save(out);
        return out;
      });
    },
    [],
  );
  const togglePanel = useCallback((id: CadPanelId) => {
    setLayout((l) => {
      const out = { ...l, [id]: { ...l[id], open: !l[id].open } };
      cadDock.save(out);
      return out;
    });
  }, []);

  /**
   * Focus mode.
   *
   * Everything but the drawing goes: the sheet tree, the properties, the
   * library, and the application's own sidebar. A schematic is read across its
   * whole width and a panel layout is read at scale, and on a laptop the panels
   * either side cost more than they give once the drawing is the thing being
   * thought about rather than the thing being started.
   */
  /*
   * Focus and fullscreen, from the shared hook.
   *
   * This was a boolean that hid the side panels and left the editor sitting in
   * the middle of the page, so on the public /cad page "focus mode" still had
   * the site header above it. It now fills the viewport and can go to real
   * fullscreen, which on a drawing is the whole point: a schematic is read
   * across its full width and the chrome either side is the difference between
   * a readable sheet and a scrolling one.
   */
  const screen_ = useFocusMode({ key: "ladx.cad.mode.v1" });
  const focus = screen_.immersive;

  const [theme, setTheme] = useState<CanvasTheme>(THEMES[0] as CanvasTheme);
  useEffect(() => setTheme(loadTheme()), []);

  /**
   * Ortho, and the angle it snaps to.
   *
   * The reason drawings come out square. Without it every horizontal line is a
   * fraction of a degree off, which looks fine on screen and produces a DXF
   * full of geometry that does not quite close.
   */
  const [ortho, setOrtho] = useState(false);
  const [angleStep, setAngleStep] = useState(90);

  /** Settings the modify tools ask for once rather than on every use. */
  const [offsetDistance, setOffsetDistance] = useState(10);
  const [filletRadius, setFilletRadius] = useState(0);
  /** The first line picked, while fillet waits for the second. */
  const [filletFirst, setFilletFirst] = useState<string | null>(null);
  const [measured, setMeasured] = useState<string | null>(null);
  const [hatchPattern, setHatchPattern] = useState<"solid" | "lines" | "cross">("lines");
  const [hatchSpacing, setHatchSpacing] = useState(4);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);

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
      // Ortho constrains to the angle first, then the grid rounds along it, so
      // a constrained line still lands on a round number.
      const last = pending.length > 0 ? (pending[pending.length - 1] as Point) : null;
      const constrained = ortho && last ? constrainAngle(last, raw, angleStep) : raw;

      if (gridSnap) {
        return {
          point: {
            x: Math.round(constrained.x / grid) * grid,
            y: Math.round(constrained.y / grid) * grid,
          },
          hit: null,
        };
      }
      return { point: constrained, hit: null };
    },
    [objectSnap, gridSnap, grid, drawing, view.scale, layerOf, pending, ortho, angleStep],
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
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);

    // Grid, drawn only when it would not become a solid field of lines.
    const stepPx = grid / view.scale;
    if (stepPx > 5) {
      ctx.strokeStyle = theme.grid;
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
    ctx.strokeStyle = theme.axis;
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
      // contrastColour is what keeps a near-black layer visible on a black
      // canvas and a near-white one visible on paper, without editing the
      // drawing. The file still says what the layer is.
      ctx.strokeStyle = isSel ? theme.selection : contrastColour(`#${l?.color ?? "0F1A24"}`, theme);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = isSel ? 2.5 : 1.4;
      drawEntity(ctx, e, screen);
    }

    // The shape being drawn right now, plus a rubber band to the cursor.
    if (pending.length > 0 && cursor) {
      ctx.strokeStyle = theme.selection;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.4;
      ctx.fillStyle = theme.selection;
      const preview = previewEntity(tool, pending, cursor, layer);
      if (preview) drawEntity(ctx, preview, screen);
      ctx.setLineDash([]);
    }

    // Marquee.
    if (drag.kind === "marquee") {
      const a = toScreen(drag.from);
      const b = toScreen(drag.to);
      ctx.strokeStyle = theme.selection;
      ctx.fillStyle = `${theme.selection}18`;
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
      ctx.strokeStyle = theme.snap;
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
    theme,
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

    /* ── the pick-then-act tools ── */

    if (tool === "point") {
      commit({
        ...drawing,
        entities: [...drawing.entities, { id: newId("pt"), type: "point", layer, at: world }],
      });
      return;
    }

    if (tool === "trim" || tool === "extend") {
      const hit = hitTest(drawing, raw, view.scale * 6, layerOf);
      if (!hit) return;
      const target = drawing.entities.find((x) => x.id === hit);
      if (!target) return;

      // Everything else on a visible layer is a boundary. AutoCAD asks you to
      // select boundaries first and then implies "everything" if you press
      // Enter; implying it always is the same answer with one fewer step, and
      // on a control drawing it is the answer every time.
      const boundaries = drawing.entities.filter(
        (x) => x.id !== hit && layerOf(x.layer)?.visible !== false,
      );
      const result =
        tool === "trim" ? trimLine(target, boundaries, raw) : extendLine(target, boundaries, raw);

      if (!result) {
        setStatus(
          tool === "trim"
            ? "Nothing crosses that line, so there is nothing to trim it to."
            : "That line does not reach anything if extended. Only lines can be extended.",
        );
        setTimeout(() => setStatus(null), 4000);
        return;
      }
      commit({
        ...drawing,
        entities: drawing.entities.map((x) => (x.id === hit ? result : x)),
      });
      setSelected([]);
      return;
    }

    if (tool === "hatch") {
      // Traced like a polyline, closed with Enter, because a boundary picked
      // by clicking inside a region needs a topology this model does not carry.
      setPending([...pending, world]);
      return;
    }

    if (tool === "offset") {
      // Pick a line, then the side. Offsetting is two decisions and pretending
      // otherwise means guessing which way the user meant.
      const hit = hitTest(drawing, raw, view.scale * 6, layerOf);
      if (!hit) return;
      const src = drawing.entities.find((x) => x.id === hit);
      if (!src) return;
      const copy = offsetEntity(src, offsetDistance, raw);
      if (!copy) {
        setStatus("That cannot be offset by this distance.");
        setTimeout(() => setStatus(null), 3000);
        return;
      }
      commit({ ...drawing, entities: [...drawing.entities, copy] });
      setSelected([copy.id]);
      return;
    }

    if (tool === "fillet") {
      const hit = hitTest(drawing, raw, view.scale * 6, layerOf);
      if (!hit) return;
      if (!filletFirst) {
        setFilletFirst(hit);
        setSelected([hit]);
        return;
      }
      if (hit === filletFirst) return;

      const a = drawing.entities.find((x) => x.id === filletFirst);
      const b = drawing.entities.find((x) => x.id === hit);
      setFilletFirst(null);
      if (!a || !b) return;

      const result = filletLines(a, b, filletRadius);
      if (!result) {
        setStatus("Those two will not fillet. They must be lines that meet, and fit the radius.");
        setTimeout(() => setStatus(null), 4000);
        setSelected([]);
        return;
      }
      const replaced = new Map([
        [a.id, result.lines[0]],
        [b.id, result.lines[1]],
      ]);
      commit({
        ...drawing,
        entities: [
          ...drawing.entities.map((x) => replaced.get(x.id) ?? x),
          ...(result.arc ? [result.arc] : []),
        ],
      });
      setSelected([]);
      return;
    }

    if (tool === "measure") {
      takeMeasurement([...pending, world]);
      return;
    }

    if (tool === "leader") {
      const next = [...pending, world];
      if (next.length === 2) {
        const note = window.prompt("Note");
        if (note?.trim()) {
          commit({
            ...drawing,
            entities: [
              ...drawing.entities,
              {
                id: newId("ld"),
                type: "leader",
                layer,
                from: next[0] as Point,
                to: next[1] as Point,
                text: note.trim(),
                height: 3.5,
              },
            ],
          });
        }
        setPending([]);
        return;
      }
      setPending(next);
      return;
    }

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

  /**
   * Distance, the two offsets, and the angle between two points.
   *
   * Draws nothing. A measurement is a question, and leaving a dimension behind
   * every time somebody asks one is how a sheet fills with annotation nobody
   * wanted. Shared by the click path and the typed path, so DI followed by two
   * coordinates measures exactly as clicking twice does; keeping the arithmetic
   * in the pointer handler meant typing the points silently did nothing.
   */
  const takeMeasurement = useCallback((points: Point[]) => {
    if (points.length < 2) {
      setPending(points);
      return;
    }
    const [p1, p2] = points.slice(-2) as [Point, Point];
    setMeasured(
      `${formatLength(Math.hypot(p2.x - p1.x, p2.y - p1.y))} mm  ·  dx ${formatLength(
        Math.abs(p2.x - p1.x),
      )}  dy ${formatLength(Math.abs(p2.y - p1.y))}  ·  ${(
        (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI
      ).toFixed(1)} deg`,
    );
    setPending([]);
  }, []);

  /** Close the traced boundary and shade it. */
  const finishHatch = useCallback(() => {
    if (pending.length >= 3) {
      commit({
        ...drawing,
        entities: [
          ...drawing.entities,
          {
            id: newId("hx"),
            type: "hatch",
            layer,
            points: pending,
            pattern: hatchPattern,
            spacing: hatchSpacing,
            angle: 45,
          },
        ],
      });
    } else if (pending.length > 0) {
      setStatus("A region needs at least three corners.");
      setTimeout(() => setStatus(null), 3000);
    }
    setPending([]);
  }, [pending, drawing, layer, commit, hatchPattern, hatchSpacing]);

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

  /**
   * Array the selection.
   *
   * The most useful command on a panel layout, by a distance: forty terminals
   * at 6 mm pitch along a rail is one operation. Asked for through a prompt
   * rather than a dialog, because the numbers are the whole input and a modal
   * for four numbers is more ceremony than the operation deserves.
   */
  const arraySelection = useCallback(
    (kind: "rect" | "polar") => {
      if (selectedEntities.length === 0) return;

      if (kind === "rect") {
        const cols = Number(window.prompt("Columns", "10") ?? "");
        if (!Number.isFinite(cols) || cols < 1) return;
        const dx = Number(window.prompt("Column spacing, mm", "6") ?? "");
        if (!Number.isFinite(dx)) return;
        const rows = Number(window.prompt("Rows", "1") ?? "");
        if (!Number.isFinite(rows) || rows < 1) return;
        const dy = rows > 1 ? Number(window.prompt("Row spacing, mm", "50") ?? "") : 0;
        if (!Number.isFinite(dy)) return;
        if (cols * rows > 2000) {
          setStatus("That would be more than two thousand copies. Narrow it down.");
          setTimeout(() => setStatus(null), 4000);
          return;
        }
        const copies = arrayRectangular(selectedEntities, cols, rows, dx, dy, translateEntity);
        commit({ ...drawing, entities: [...drawing.entities, ...copies] });
        setSelected(copies.map((c) => c.id));
        return;
      }

      const count = Number(window.prompt("How many, including the original", "6") ?? "");
      if (!Number.isFinite(count) || count < 2) return;
      const total = Number(window.prompt("Total angle, degrees", "360") ?? "");
      if (!Number.isFinite(total)) return;
      const rotate = window.confirm(
        "Rotate each copy as it goes round? Cancel keeps them upright.",
      );
      // The snapped point wins as the centre, which is how you array bolt holes
      // about a flange centre rather than about the selection's own middle.
      const centre = snapHit?.point ?? centreOf(selectedEntities);
      const copies = arrayPolar(
        selectedEntities,
        centre,
        count,
        total,
        rotate,
        transformEntity,
        rotateAbout,
      );
      commit({ ...drawing, entities: [...drawing.entities, ...copies] });
      setSelected(copies.map((c) => c.id));
    },
    [selectedEntities, drawing, commit, snapHit],
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
        // Cancels everything in flight, not just the points clicked so far.
        // A fillet that has had its first line picked is exactly as pending as
        // a half-drawn polyline, and leaving it set meant the next click
        // filleted against a line chosen minutes earlier.
        setPending([]);
        setSelected([]);
        setFilletFirst(null);
        setMeasured(null);
        // Leaving focus mode on Escape is handled by useFocusMode, which
        // knows whether to drop out of fullscreen first. Doing it here too
        // would skip that step.
        return;
      }
      if (ev.key === "Enter" && tool === "polyline") {
        finishPolyline(false);
        return;
      }
      if (ev.key === "Enter" && tool === "hatch") {
        finishHatch();
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
      // Single letters are not bound to tools any more: they open the command
      // line, which is where a CAD user expects a typed letter to go, and where
      // the aliases live.
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
      if (onSave) {
        const ok = await onSave({ id: drawingId, name, data: drawing });
        if (ok) {
          // The same two lines the API path does. `dirty` is computed against
          // savedRef, so clearing the flag without moving the reference makes
          // the next edit compare against a drawing from before the save and
          // report no change.
          savedRef.current = drawing;
          setDirty(false);
        }
        setStatus(ok ? "Saved" : "Could not save");
        return;
      }
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
  /* ── the command line ── */

  /**
   * One command, whatever it was typed as.
   *
   * Tools set the tool; everything else acts now. Both routes go through the
   * same handlers the menus use, so a command and a menu item cannot drift
   * apart into two behaviours with one name.
   */
  const runCommand = (spec: CommandSpec) => {
    setCmdHistory((h) => [spec.name, ...h].slice(0, 20));

    const asTool = ALL_TOOLS.find((t) => t.id === (spec.id as ToolId));
    if (asTool) {
      setTool(asTool.id);
      setPending([]);
      setMeasured(null);
      setFilletFirst(null);
      return;
    }

    switch (spec.id) {
      case "erase":
        deleteSelected();
        break;
      case "copy":
        duplicateSelected();
        break;
      case "move":
        setTool("select");
        setStatus("Drag the selection. Hold Alt to copy it.");
        setTimeout(() => setStatus(null), 3500);
        break;
      case "array":
        arraySelection("rect");
        break;
      case "polararray":
        arraySelection("polar");
        break;
      case "rotate":
        transformSelected("rotate-90");
        break;
      case "mirror":
        transformSelected("mirrorX");
        break;
      case "scale":
        transformSelected("scale", 2);
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
      case "zoomfit":
        zoomFit(false);
        break;
      case "zoomselection":
        zoomFit(true);
        break;
      case "ortho":
        setOrtho((o) => !o);
        break;
      case "grid":
        setGridSnap((g) => !g);
        break;
      case "osnap":
        setObjectSnap((o) => !o);
        break;
      case "save":
        void save();
        break;
      default:
        break;
    }
    // Not memoised, for the reason the menus are not: this closes over most of
    // the editor including plain functions that are new every render, and a
    // dependency list over that is a list somebody gets wrong. The failure is a
    // command acting on a drawing from three edits ago.
  };

  /**
   * A typed coordinate, fed to whatever is being drawn.
   *
   * Returns false when there is nothing it could mean, so the command line can
   * say so rather than swallowing it.
   */
  const runCoordinate = useCallback(
    (raw: string): boolean => {
      const parsed = parseCoordinate(raw);
      if (!parsed) return false;

      const last = pending.length > 0 ? (pending[pending.length - 1] as Point) : null;
      const point = resolveCoordinate(parsed, last, cursor);
      if (!point) return false;

      // From here it is exactly a click at that point, so the tools do not each
      // need a second way in.
      const need = CLICKS[tool];
      const next = [...pending, point];

      if (tool === "measure") {
        takeMeasurement(next);
        return true;
      }
      if (tool === "polyline" || tool === "hatch") {
        setPending(next);
        return true;
      }
      if (need && next.length === need) {
        const entity = makeEntity(tool, next, layer);
        if (entity) commit({ ...drawing, entities: [...drawing.entities, entity] });
        setPending([]);
        return true;
      }
      setPending(next);
      return true;
    },
    [pending, cursor, tool, drawing, layer, commit, takeMeasurement],
  );

  /* ── drawing from a description ── */

  /**
   * What is already on the sheet, in a sentence.
   *
   * Sent with the prompt so "add the outgoing ways beside it" means something.
   * A summary rather than the geometry: the entity list of a busy sheet is tens
   * of thousands of tokens and says less than one line describing it.
   */
  const sheetSummary = useCallback((): string => {
    if (drawing.entities.length === 0) return "";
    const b = drawingBounds(drawing);
    const byLayer = new Map<string, number>();
    for (const e of drawing.entities) byLayer.set(e.layer, (byLayer.get(e.layer) ?? 0) + 1);
    const labels = drawing.entities
      .filter((e) => e.type === "text")
      .slice(0, 25)
      .map((e) => (e.type === "text" ? e.text : ""))
      .filter(Boolean);
    return [
      `${drawing.entities.length} entities`,
      b
        ? `occupying ${Math.round(b.min.x)},${Math.round(b.min.y)} to ${Math.round(b.max.x)},${Math.round(b.max.y)} mm`
        : "",
      `by layer: ${[...byLayer].map(([n, c]) => `${n} ${c}`).join(", ")}`,
      labels.length ? `labels include: ${labels.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". ");
  }, [drawing]);

  /**
   * Drawing from a description.
   *
   * The steps are the real stages, reported as they happen: a symbol reference
   * becomes the library's own geometry rather than the model's idea of what a
   * contact looks like, anything out of range is dropped, and what lands is
   * selected so undo takes exactly it back out.
   */
  const runAssist = useCallback(
    async (prompt: string, { step, ask, model, signal }: AssistRunContext) => {
      step.start("read", "Reading the sheet");
      step.detail(
        `${drawing.entities.length} entities on ${drawing.layers.length} layers, active layer ${layer}`,
      );

      /*
       * Ask for the size rather than guessing it.
       *
       * A back plate, a rail or a gland row drawn at the wrong size looks
       * finished and is wrong by a factor nobody notices until it is ordered.
       * The question costs one click; the guess costs a panel.
       */
      let request = prompt;
      const mentionsSize = /\b\d{2,}\s*(mm|cm|m)\b|\b\d{3,}\b|\bpitch\b|\bcentres?\b/i.test(prompt);
      if (!mentionsSize && /\b(plate|rail|enclosure|panel|cabinet|gland)\b/i.test(prompt)) {
        step.start("ask", "Checking the size before drawing it");
        const answer = await ask({
          text: "What size, in millimetres? A back plate or a rail drawn at the wrong size looks finished and is wrong by a factor nobody notices until it is ordered.",
          options: ["600 by 400", "800 by 600", "1000 by 800", "Use a sensible default"],
        });
        request = `${prompt}. Size: ${answer}.`;
        step.start("asked", "Using that");
        step.detail(answer);
      }

      step.start("draw", model ? `Asking ${model}` : "Asking the model");
      const res = await fetch("/api/cad/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: request,
          layers: drawing.layers.map((l) => l.name),
          context: sheetSummary(),
          model,
        }),
        signal,
      });
      const body = (await res.json()) as {
        entities?: { type: string; symbol?: string; at?: Point; layer?: string }[];
        summary?: string;
        model?: string;
        dropped?: number;
        error?: string;
      };
      if (!res.ok || !body.entities) {
        step.fail(body.error ?? "The model did not return any geometry");
        throw new Error(body.error ?? "Could not draw that.");
      }
      step.detail(body.model ? `${body.model} replied` : "Reply received");

      step.start("build", "Building the geometry");
      // A symbol reference becomes the library's own geometry, so what lands is
      // the same shape the picker inserts rather than the model's idea of what
      // a contact looks like.
      const built: Entity[] = [];
      let fromLibrary = 0;
      for (const raw of body.entities) {
        if (raw.type === "symbol") {
          const sym = getSymbol(raw.symbol ?? "");
          if (sym && raw.at) {
            built.push(...sym.build(raw.at));
            fromLibrary++;
          }
          continue;
        }
        built.push({ ...(raw as unknown as Entity), id: newId("ai") });
      }
      if (built.length === 0) {
        step.fail("Nothing usable came back");
        throw new Error("Nothing usable came back. Try describing it more concretely.");
      }
      step.detail(
        `${built.length} entities, ${fromLibrary} from the symbol library${
          body.dropped ? `, ${body.dropped} dropped as out of range` : ""
        }`,
      );

      const missing = [...new Set(built.map((b) => b.layer))].filter(
        (n) => !drawing.layers.some((l) => l.name === n),
      );
      if (missing.length) {
        step.start("layers", "Adding the layers it used");
        step.detail(missing.join(", "));
      } else {
        step.skip("layers", "No new layers needed");
      }

      step.start("place", "Placing it on the sheet");
      commit({
        ...drawing,
        layers: [
          ...drawing.layers,
          ...missing.map((n) => ({ name: n, color: "0F1A24", visible: true, locked: false })),
        ],
        entities: [...drawing.entities, ...built],
      });
      setSelected(built.map((b) => b.id));
      step.detail("Selected, so undo takes exactly this back out");

      return {
        text: `${body.summary || "Drawn."} ${built.length} entities added. They are selected; undo takes them back out.`,
        undoable: true,
      };
    },
    [drawing, commit, sheetSummary, layer],
  );

  // Keyed to the drawing, so coming back to this sheet brings back the
  // conversation about this sheet.
  const assist = useAssistant({ run: runAssist, memoryKey: `cad:${drawingId}` });

  /* ── filing this sheet against a project ── */

  const attachToProject = useCallback(
    async (target: string) => {
      const res = await fetch(`/api/cad/${drawingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: target || null }),
      });
      if (res.ok) router.refresh();
      else {
        setStatus("Could not change the project.");
        setTimeout(() => setStatus(null), 3000);
      }
    },
    [drawingId, router],
  );

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
  /**
   * One menu's worth of tools, taken from the same panels the toolbar draws.
   *
   * Built from TOOL_PANELS rather than from a second hand-kept list, so the
   * menu bar cannot drift from the toolbar. It used to: every tool was
   * flattened into Draw, which filed Trim, Extend, Offset and Fillet as
   * drawing commands while the toolbar right above them called them Modify.
   */
  const toolItems = (panel: string) =>
    (TOOL_PANELS.find((p) => p.name === panel)?.tools ?? []).map((t) => ({
      label: t.label,
      shortcut: t.key,
      onSelect: () => {
        setTool(t.id);
        setPending([]);
      },
    }));

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
      items: toolItems("Draw"),
    },
    {
      label: "Annotate",
      items: toolItems("Annotate"),
    },
    {
      label: "Modify",
      items: [
        // The four editing tools first, because trim and offset are most of
        // what anybody reaches for, then the transforms that act on whatever
        // is already selected.
        ...toolItems("Modify"),
        {
          label: "Rotate 90 clockwise",
          separator: true,
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
          label: "Rectangular array…",
          separator: true,
          onSelect: () => arraySelection("rect"),
          disabled: selected.length === 0,
        },
        {
          label: "Polar array…",
          onSelect: () => arraySelection("polar"),
          disabled: selected.length === 0,
        },
        {
          label: `Offset distance: ${offsetDistance} mm…`,
          separator: true,
          onSelect: () => {
            const v = Number(window.prompt("Offset distance, mm", String(offsetDistance)) ?? "");
            if (Number.isFinite(v) && v > 0) setOffsetDistance(v);
          },
        },
        {
          label: `Hatch: ${hatchPattern} at ${hatchSpacing} mm…`,
          onSelect: () => {
            const pattern = window.prompt("Hatch pattern: solid, lines or cross", hatchPattern);
            if (pattern === "solid" || pattern === "lines" || pattern === "cross") {
              setHatchPattern(pattern);
            }
            const gap = Number(window.prompt("Spacing, mm", String(hatchSpacing)) ?? "");
            if (Number.isFinite(gap) && gap > 0) setHatchSpacing(gap);
          },
        },
        {
          label: `Fillet radius: ${filletRadius} mm…`,
          onSelect: () => {
            const v = Number(
              window.prompt("Fillet radius, mm. Zero closes a corner.", String(filletRadius)) ?? "",
            );
            if (Number.isFinite(v) && v >= 0) setFilletRadius(v);
          },
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
          label: ortho ? "Ortho off" : "Ortho on",
          onSelect: () => setOrtho((o) => !o),
        },
        {
          label: `Angle step: ${angleStep} deg`,
          onSelect: () => setAngleStep((a) => (a === 90 ? 45 : a === 45 ? 15 : 90)),
        },
        {
          label: focusModeLabel(screen_.mode, screen_.canFullscreen),
          shortcut: "Esc",
          separator: true,
          onSelect: screen_.cycle,
        },
        ...cadDock.panels.map((p, i) => ({
          label: `${layout[p.id].open ? "Hide" : "Show"} ${p.title.toLowerCase()}`,
          separator: i === 0,
          onSelect: () => togglePanel(p.id),
        })),
        {
          label: "Reset layout",
          separator: true,
          disabled: !cadDock.isMoved(layout),
          onSelect: () => {
            setLayout(cadDock.defaults);
            cadDock.save(cadDock.defaults);
          },
        },
      ],
    },
    {
      label: "Background",
      items: [
        ...THEMES.map((t) => ({
          label: theme.id === t.id ? `${t.name}  ·  in use` : t.name,
          onSelect: () => {
            setTheme(t);
            saveTheme(t.id);
          },
        })),
        {
          label: "Custom colour…",
          separator: true,
          onSelect: () => {
            const hex = window.prompt("Background colour, as #rrggbb", theme.background);
            if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
            saveTheme("custom", hex);
            setTheme(loadTheme());
          },
        },
      ],
    },
    {
      label: "Project",
      items: [
        {
          label: "Open the project",
          onSelect: () => router.push(`/studio/projects/${projectId}`),
          disabled: !projectId,
        },
        {
          label: "Unfile this sheet",
          separator: true,
          onSelect: () => void attachToProject(""),
          disabled: !projectId,
        },
      ],
    },
  ];

  const stats = useMemo(
    () => ({ entities: drawing.entities.length, layers: drawing.layers.length }),
    [drawing],
  );

  const activeTool = toolSpec(tool);

  /**
   * What the drawing is waiting for, in words.
   *
   * The command line echoes it, which is the thing that makes a multi-click
   * tool usable without memorising it: an arc takes three clicks and nobody
   * remembers which is which until they are told, once, each time.
   */
  const promptText = (() => {
    if (tool === "select") return selected.length > 0 ? `${selected.length} selected` : "Select";
    const need = CLICKS[tool];
    if (need && pending.length > 0) return `${activeTool?.label}: ${pending.length} of ${need}`;
    if ((tool === "polyline" || tool === "hatch") && pending.length > 0) {
      return `${activeTool?.label}: ${pending.length} points, Enter to finish`;
    }
    if (tool === "fillet") return filletFirst ? "Fillet: second line" : "Fillet: first line";
    return activeTool?.label ?? "Command";
  })();
  const measuring =
    tool === "dimension" && pending.length >= 1 && cursor
      ? formatLength(
          Math.hypot(cursor.x - (pending[0] as Point).x, cursor.y - (pending[0] as Point).y),
        )
      : null;

  /**
   * One panel's contents, by id.
   *
   * Kept as a lookup rather than four conditionals in the layout, because the
   * layout now decides where each panel goes and the same body has to render
   * on the left or the right without being written twice.
   */
  const panelBody = (id: CadPanelId) => {
    switch (id) {
      case "sheets":
        return (
          <CadSheets
            sheets={sheets}
            currentId={drawingId}
            projectId={projectId}
            projectName={projectName ?? null}
            onDirtyCheck={() => dirty}
            onOpen={(pid) => router.push(`/studio/cad/${pid}`)}
          />
        );
      case "properties":
        return (
          <div className="p-2.5">
            <CadProperties
              selected={selectedEntities}
              layers={drawing.layers}
              onChange={replaceEntity}
              onChangeLayer={moveSelectedToLayer}
            />
          </div>
        );
      case "library":
        return (
          <CadRail
            layers={drawing.layers}
            activeLayer={layer}
            onActivateLayer={setLayer}
            onLayerFlag={setLayerFlag}
            onInsertSymbol={insertSymbol}
            onInsertSheet={insertSheet}
            onInsertTemplate={insertTemplate}
          />
        );
      case "command":
        return (
          <CadCommandLine
            prompt={promptText}
            onCommand={runCommand}
            onCoordinate={runCoordinate}
            onEnter={() => {
              if (tool === "polyline") finishPolyline(false);
              else if (tool === "hatch") finishHatch();
              else if (cmdHistory[0]) {
                const repeat = findCommand(cmdHistory[0]);
                if (repeat) runCommand(repeat);
              }
            }}
            history={cmdHistory}
          />
        );
      default:
        return null;
    }
  };

  /**
   * The open panels currently docked to one side.
   *
   * Panels keep the order they are declared in, so moving one across and back
   * puts it where it was rather than at the end of whichever side it lands on.
   */
  const panelsOn = (side: Side) =>
    cadDock.panels
      .filter((p) => layout[p.id].open && cadDock.sideOf(layout, p.id) === side)
      .map((p) => (
        <DockPanel
          key={p.id}
          dock={cadDock}
          id={p.id}
          layout={layout}
          onResize={(size) => setPanel(p.id, { size })}
          onClose={() => setPanel(p.id, { open: false })}
          onMove={(to) => setPanel(p.id, { side: to })}
        >
          {panelBody(p.id)}
        </DockPanel>
      ));

  return (
    <div
      ref={screen_.ref}
      className={`flex min-h-0 flex-1 flex-col bg-white ${
        screen_.immersive ? "fixed inset-0 z-50" : ""
      }`}
    >
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

      {/* The name, the project it belongs to, and what leaves the machine. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/40 px-3 py-1.5">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="w-44 rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
        />
        <select
          value={projectId ?? ""}
          onChange={(e) => void attachToProject(e.target.value)}
          title="The project this sheet belongs to"
          className="max-w-[11rem] rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={layer}
          onChange={(e) => setLayer(e.target.value)}
          title="New geometry is drawn on this layer"
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
        >
          {drawing.layers.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          {status && <span className="font-mono text-[11.5px] text-ink-500">{status}</span>}
          <IconBtn
            title={`${focusModeLabel(screen_.mode, screen_.canFullscreen)}. Press F, or Escape to step back.`}
            onClick={screen_.cycle}
          >
            {focus ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconBtn>
          <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400">
            <Upload className="h-3.5 w-3.5" />
            DXF
            <input
              ref={importRef}
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

      <CadToolbar
        tool={tool}
        onTool={(id) => {
          setTool(id);
          setPending([]);
          setMeasured(null);
          setFilletFirst(null);
        }}
        gridSnap={gridSnap}
        objectSnap={objectSnap}
        ortho={ortho}
        grid={grid}
        angleStep={angleStep}
        canUndo={historyAt > 0}
        canRedo={historyAt < history.length - 1}
        hasSelection={selected.length > 0}
        onToggle={(which) => {
          if (which === "grid") setGridSnap((g) => !g);
          if (which === "object") setObjectSnap((o) => !o);
          if (which === "ortho") setOrtho((o) => !o);
        }}
        onUndo={undo}
        onRedo={redo}
        onDelete={deleteSelected}
        onZoom={(dir) =>
          setView((v) => ({
            ...v,
            scale: dir === "in" ? Math.max(v.scale / 1.3, 0.01) : Math.min(v.scale * 1.3, 200),
          }))
        }
      />

      <div className="flex min-h-0 flex-1">
        {panelsOn("left")}

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
            {measured && <span className="text-teal-700">{measured}</span>}
            {tool === "fillet" && (
              <span className="text-teal-700">
                {filletFirst ? "now the second line" : `pick two lines · radius ${filletRadius} mm`}
              </span>
            )}
            {tool === "offset" && <span className="text-teal-700">{offsetDistance} mm</span>}
            {ortho && <span className="text-teal-700">ortho {angleStep}</span>}
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

        {panelsOn("right")}
      </div>

      {panelsOn("bottom")}

      <DockStrip
        dock={cadDock}
        layout={layout}
        onOpen={(id) => setPanel(id, { open: true })}
        onReset={() => {
          setLayout(cadDock.defaults);
          cadDock.save(cadDock.defaults);
        }}
      />

      {/*
        Always present, and disabled without an account.

        It used to be hidden entirely, which made the same feature look like
        three different features across the tools: hidden here, absent in the
        ladder editor, disabled in the HMI builder. It now says why it cannot
        run, and starts as a bar rather than a box so it costs no canvas.
      */}
      {
        <Assistant
          toolId="cad"
          title={RELAY_TITLES.cad}
          placeholder="A DIN rail with twelve terminals at 6 mm pitch, labelled X1:1 to X1:12"
          suggestions={[
            "A 600 by 400 back plate with two DIN rails",
            "A start/stop circuit with a seal-in and a motor",
            "Eight cable glands along the bottom edge at 60 mm centres",
          ]}
          turns={assist.turns}
          busy={assist.busy}
          steps={assist.steps}
          error={assist.error}
          models={assist.models}
          question={assist.question}
          onSend={assist.send}
          onAnswer={assist.answer}
          onStop={assist.stop}
          onUndo={() => {
            undo();
            assist.markUndone();
          }}
          disabledReason={
            canGenerate
              ? null
              : "Drawing from a description needs a provider key, which belongs to an account. Sign up and connect one in Settings."
          }
          actions={[
            {
              id: "clear",
              label: "Start the conversation again",
              hint: "The drawing is untouched. Only the thread goes.",
              onSelect: assist.reset,
            },
          ]}
          footnote="LADX AI can make mistakes, and how good the result is depends heavily on the model. Check every dimension before the drawing is issued."
        />
      }
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

function makeEntity(tool: ToolId, pts: Point[], layer: string): Entity | null {
  const [a, b, c] = pts as [Point, Point, Point?];
  switch (tool) {
    case "line":
      return { id: newId("l"), type: "line", layer, a, b };
    case "rect":
      return { id: newId("r"), type: "rect", layer, a, b };
    case "circle":
      return { id: newId("c"), type: "circle", layer, c: a, r: Math.hypot(b.x - a.x, b.y - a.y) };
    case "ellipse":
      return {
        id: newId("el"),
        type: "ellipse",
        layer,
        c: a,
        rx: Math.max(Math.abs(b.x - a.x), 0.01),
        ry: Math.max(Math.abs(b.y - a.y), 0.01),
      };
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

function previewEntity(tool: ToolId, pts: Point[], cursor: Point, layer: string): Entity | null {
  if (tool === "polyline") {
    return { id: "preview", type: "polyline", layer, points: [...pts, cursor], closed: false };
  }
  const first = pts[0];
  if (!first) return null;

  if (tool === "leader" || tool === "measure") {
    return { id: "preview", type: "line", layer, a: first, b: cursor };
  }

  // Multi-click tools preview from what has been clicked plus the cursor.
  if (tool === "arc" || tool === "dimension") {
    if (pts.length === 1) {
      return { id: "preview", type: "line", layer, a: first, b: cursor };
    }
    return makeEntity(tool, [...pts, cursor], layer);
  }
  return makeEntity(tool, [first, cursor], layer);
}
