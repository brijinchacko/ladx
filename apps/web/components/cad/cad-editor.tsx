"use client";

import { readDxf, writeDxf } from "@/lib/cad/dxf";
import { type Drawing, type Entity, type Point, drawingBounds, newId } from "@/lib/cad/types";
import {
  Circle as CircleIcon,
  Download,
  Grid3x3,
  Minus,
  MousePointer2,
  Redo2,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tool = "select" | "line" | "rect" | "circle" | "polyline" | "text";

const TOOLS: { id: Tool; label: string; icon: typeof Minus; key: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, key: "V" },
  { id: "line", label: "Line", icon: Minus, key: "L" },
  { id: "rect", label: "Rectangle", icon: Square, key: "R" },
  { id: "circle", label: "Circle", icon: CircleIcon, key: "C" },
  { id: "polyline", label: "Polyline", icon: Spline, key: "P" },
  { id: "text", label: "Text", icon: TypeIcon, key: "T" },
];

interface View {
  /** Drawing units per screen pixel. */
  scale: number;
  /** Drawing-space point at the canvas origin. */
  ox: number;
  oy: number;
}

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
}: {
  drawingId: string;
  initial: Drawing;
  name: string;
  projectName?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [drawing, setDrawing] = useState<Drawing>(initial);
  const [name, setName] = useState(initialName);
  const [tool, setTool] = useState<Tool>("select");
  const [layer, setLayer] = useState(initial.layers[0]?.name ?? "0");
  const [view, setView] = useState<View>({ scale: 1, ox: 0, oy: 0 });
  const [snap, setSnap] = useState(true);
  const [grid] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // In-progress geometry: the points clicked so far for the active tool.
  const [pending, setPending] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);

  const [history, setHistory] = useState<Drawing[]>([initial]);
  const [historyAt, setHistoryAt] = useState(0);

  const commit = useCallback(
    (next: Drawing) => {
      setDrawing(next);
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

  const snapPoint = useCallback(
    (p: Point): Point =>
      snap ? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid } : p,
    [snap, grid],
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
    setView({
      scale,
      ox: b.min.x - pad * scale,
      oy: b.max.y + pad * scale,
    });
  }, []);

  /* ── rendering ── */

  const layerOf = useCallback(
    (n: string) => drawing.layers.find((l) => l.name === n),
    [drawing.layers],
  );

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

    // Entities.
    for (const e of drawing.entities) {
      const l = layerOf(e.layer);
      if (l && !l.visible) continue;
      const isSel = selected.includes(e.id);
      ctx.strokeStyle = isSel ? "#2C9A9E" : `#${l?.color ?? "0F1A24"}`;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = isSel ? 2.5 : 1.4;
      drawEntity(ctx, e, toScreen, view.scale);
    }

    // The shape being drawn right now, plus a rubber band to the cursor.
    if (pending.length > 0 && cursor) {
      ctx.strokeStyle = "#2C9A9E";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.4;
      const preview = previewEntity(tool, pending, cursor, layer);
      if (preview) drawEntity(ctx, preview, toScreen, view.scale);
      ctx.setLineDash([]);
    }
  }, [drawing, view, selected, pending, cursor, tool, layer, grid, toScreen, toWorld, layerOf]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint]);

  /* ── interaction ── */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const world = snapPoint(toWorld(e.clientX - rect.left, e.clientY - rect.top));

    if (tool === "select") {
      const hit = hitTest(drawing, world, view.scale * 6, layerOf);
      setSelected(hit ? [hit] : []);
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

    // Two-point tools complete on the second click; polyline keeps going until
    // Enter or Escape.
    if (tool !== "polyline" && next.length === 2) {
      const entity = makeEntity(tool, next, layer);
      if (entity) commit({ ...drawing, entities: [...drawing.entities, entity] });
      setPending([]);
      return;
    }
    setPending(next);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor(snapPoint(toWorld(e.clientX - rect.left, e.clientY - rect.top)));

    // Middle button or space-drag pans.
    if (e.buttons === 4) {
      setView((v) => ({
        ...v,
        ox: v.ox - e.movementX * v.scale,
        oy: v.oy + e.movementY * v.scale,
      }));
    }
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

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
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
      const found = TOOLS.find((x) => x.key.toLowerCase() === ev.key.toLowerCase());
      if (found) {
        setTool(found.id);
        setPending([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, tool, finishPolyline, deleteSelected]);

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

  const exportDxf = () => {
    const blob = new Blob([writeDxf(drawing)], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, "-") || "drawing"}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(
    () => ({ entities: drawing.entities.length, layers: drawing.layers.length }),
    [drawing],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-44 rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
        />

        <div className="flex items-center gap-0.5 rounded-md border border-ink-200 bg-white p-0.5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                title={`${t.label} (${t.key})`}
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
          onClick={() => setSnap((s) => !s)}
          title="Snap to grid"
          className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors ${
            snap
              ? "border-teal-400 bg-teal-50 text-teal-700"
              : "border-ink-200 bg-white text-ink-500"
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
          {grid}mm
        </button>

        <div className="flex items-center gap-0.5">
          <IconBtn title="Undo" onClick={undo} disabled={historyAt <= 0}>
            <Undo2 className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn title="Redo" onClick={redo} disabled={historyAt >= history.length - 1}>
            <Redo2 className="h-3.5 w-3.5" />
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
            Import DXF
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
            className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400"
          >
            <Download className="h-3.5 w-3.5" />
            Export DXF
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

      {/* canvas */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onWheel={onWheel}
          onDoubleClick={() => tool === "polyline" && finishPolyline(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (tool === "polyline") finishPolyline(true);
          }}
          className={`h-full w-full ${tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
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
          {selected.length > 0 && <span className="text-teal-700">{selected.length} selected</span>}
          {tool === "polyline" && pending.length > 0 && (
            <span className="text-teal-700">
              Enter to finish · right click to close · Esc to cancel
            </span>
          )}
          {projectName && <span className="ml-auto">{projectName}</span>}
        </div>
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
  const [a, b] = pts as [Point, Point];
  switch (tool) {
    case "line":
      return { id: newId("l"), type: "line", layer, a, b };
    case "rect":
      return { id: newId("r"), type: "rect", layer, a, b };
    case "circle":
      return {
        id: newId("c"),
        type: "circle",
        layer,
        c: a,
        r: Math.hypot(b.x - a.x, b.y - a.y),
      };
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
  return makeEntity(tool, [first, cursor], layer);
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  toScreen: (p: Point) => Point,
  scale: number,
) {
  ctx.beginPath();
  switch (e.type) {
    case "line": {
      const a = toScreen(e.a);
      const b = toScreen(e.b);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    }
    case "rect": {
      const a = toScreen(e.a);
      const b = toScreen(e.b);
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.stroke();
      break;
    }
    case "circle": {
      const c = toScreen(e.c);
      ctx.arc(c.x, c.y, Math.max(e.r / scale, 0.5), 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "arc": {
      const c = toScreen(e.c);
      // Canvas angles run clockwise with Y down; DXF runs counter-clockwise with
      // Y up, so both angles are negated to land in the same place.
      ctx.arc(
        c.x,
        c.y,
        Math.max(e.r / scale, 0.5),
        (-e.end * Math.PI) / 180,
        (-e.start * Math.PI) / 180,
      );
      ctx.stroke();
      break;
    }
    case "polyline": {
      e.points.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      if (e.closed) ctx.closePath();
      ctx.stroke();
      break;
    }
    case "text": {
      const s = toScreen(e.at);
      const px = e.height / scale;
      if (px < 3) break; // unreadable at this zoom, and expensive to draw
      ctx.font = `${px}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(e.text, s.x, s.y);
      break;
    }
  }
}

/** Nearest entity within `tol` drawing units of `p`, or null. */
function hitTest(
  drawing: Drawing,
  p: Point,
  tol: number,
  layerOf: (n: string) => { visible: boolean; locked: boolean } | undefined,
): string | null {
  let best: { id: string; d: number } | null = null;

  const consider = (id: string, d: number) => {
    if (d <= tol && (!best || d < best.d)) best = { id, d };
  };

  for (const e of drawing.entities) {
    const l = layerOf(e.layer);
    if (l && (!l.visible || l.locked)) continue;

    switch (e.type) {
      case "line":
        consider(e.id, distToSegment(p, e.a, e.b));
        break;
      case "rect": {
        const c = [
          { x: e.a.x, y: e.a.y },
          { x: e.b.x, y: e.a.y },
          { x: e.b.x, y: e.b.y },
          { x: e.a.x, y: e.b.y },
        ];
        let d = Number.POSITIVE_INFINITY;
        for (let i = 0; i < 4; i++) {
          d = Math.min(d, distToSegment(p, c[i] as Point, c[(i + 1) % 4] as Point));
        }
        consider(e.id, d);
        break;
      }
      case "circle":
      case "arc":
        consider(e.id, Math.abs(Math.hypot(p.x - e.c.x, p.y - e.c.y) - e.r));
        break;
      case "polyline": {
        let d = Number.POSITIVE_INFINITY;
        for (let i = 0; i < e.points.length - 1; i++) {
          d = Math.min(d, distToSegment(p, e.points[i] as Point, e.points[i + 1] as Point));
        }
        if (e.closed && e.points.length > 2) {
          d = Math.min(
            d,
            distToSegment(p, e.points[e.points.length - 1] as Point, e.points[0] as Point),
          );
        }
        consider(e.id, d);
        break;
      }
      case "text":
        consider(e.id, Math.hypot(p.x - e.at.x, p.y - e.at.y));
        break;
    }
  }
  return best ? (best as { id: string }).id : null;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
