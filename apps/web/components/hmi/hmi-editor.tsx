"use client";

import WidgetView, { type LiveData } from "@/components/hmi/widget-view";
import {
  type AlarmRuntime,
  acknowledge,
  isOutstanding,
  needsAck,
  newRuntime,
  sortForSummary,
  stepAlarm,
} from "@/lib/hmi/alarms";
import { PANEL_GROUPS, PANEL_PRESETS, presetFor } from "@/lib/hmi/panels";
import {
  type TagSpace,
  TrendBuffer,
  buildTagSpace,
  capacityFor,
  makeContext,
  resolveNumber,
  writeTag,
} from "@/lib/hmi/runtime";
import { SYMBOL_CATEGORIES, symbolsIn } from "@/lib/hmi/symbols";
import type { Action, HmiDoc, Screen, Widget, WidgetKind } from "@/lib/hmi/types";
import { type LadxProgram, type Tag, scan } from "@ladx/studio";
import { Bell, Loader2, Maximize2, Play, Plus, Save, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The HMI builder.
 *
 * Design and run are one screen with a toggle rather than two applications,
 * because the whole value of building an HMI beside a simulator is pressing
 * run and watching your own logic drive your own graphic. Run mode steps the
 * same scan engine the ladder simulator uses, so a button writes a tag, the
 * scan solves the rungs, and the lamp lights. Nothing is mocked.
 */

const GRID = 8;

export interface HmiEditorProps {
  id: string;
  initialDoc: HmiDoc;
  initialName: string;
  /** The project's ladder program, which is where the PLC tags come from. */
  program: LadxProgram | null;
  projectName: string | null;
}

export default function HmiEditor({
  id,
  initialDoc,
  initialName,
  program,
  projectName,
}: HmiEditorProps) {
  const [doc, setDoc] = useState<HmiDoc>(initialDoc);
  const [name, setName] = useState(initialName);
  const [screenId, setScreenId] = useState(initialDoc.screens[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<"palette" | "screens" | "tags" | "alarms">("palette");
  /**
   * Zoom.
   *
   * A panel is a fixed number of pixels and the editor chrome takes some of
   * the window, so a 1920-wide screen never fits at 1:1 on a laptop. "Fit" is
   * the default because the first thing anybody wants is to see the whole
   * glass; the fixed steps are there for placing something precisely, where
   * being shown the real pixels matters.
   */
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitScale, setFitScale] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);

  const screen = doc.screens.find((s) => s.id === screenId) ?? doc.screens[0];

  /* ── the live tag space, and the scan loop that drives it ── */

  const plcTags = useMemo<Tag[]>(() => (program?.tags ?? []).map((t) => ({ ...t })), [program]);
  const [liveTags, setLiveTags] = useState<Tag[]>(plcTags);
  const [space, setSpace] = useState<TagSpace>(() => buildTagSpace(plcTags, initialDoc.tags));
  const [alarmState, setAlarmState] = useState<Record<string, AlarmRuntime>>({});

  // Refs, because the scan loop runs on a timer and must not close over a
  // stale render. The same reason Monitor holds its tags in a ref.
  const tagsRef = useRef<Tag[]>(plcTags);
  const spaceRef = useRef<TagSpace>(space);
  const edgesRef = useRef<Record<string, boolean>>({});
  const alarmRef = useRef<Record<string, AlarmRuntime>>({});
  /**
   * One ring per trend, kept in a ref.
   *
   * A ring rather than an array that is shifted: a trend left open all shift
   * would otherwise grow without bound and cost O(n) a sample, inside the scan
   * loop of all places.
   */
  const trendsRef = useRef<Map<string, TrendBuffer>>(new Map());
  const lastSampleRef = useRef<Map<string, number>>(new Map());
  const [trendTick, setTrendTick] = useState(0);
  spaceRef.current = space;
  alarmRef.current = alarmState;

  const ctx = useMemo(() => makeContext(space, liveTags), [space, liveTags]);

  /** One scan: solve the ladder, fold in HMI writes, then evaluate alarms. */
  const step = useCallback(
    (dtMs: number) => {
      const now = Date.now();

      // HMI writes to PLC tags are applied before the scan, which is exactly
      // where a real HMI's writes land: the controller reads them at the top
      // of its cycle, not part way through solving.
      let tags = tagsRef.current.map((t) => {
        const v = spaceRef.current.plc.get(t.name);
        return v !== undefined && v !== t.value ? { ...t, value: v } : t;
      });

      if (program) {
        const result = scan(program, tags, edgesRef.current, dtMs);
        tags = result.tags;
        edgesRef.current = result.edges;
      }
      tagsRef.current = tags;

      const nextSpace = buildTagSpace(
        tags,
        doc.tags.map((t) => ({
          ...t,
          value: spaceRef.current.hmi.get(t.name) ?? t.value,
        })),
      );
      spaceRef.current = nextSpace;

      // Alarms read the post-scan values, so an alarm never reports a state
      // the logic already moved past.
      const evalCtx = makeContext(nextSpace, tags);
      const nextAlarms: Record<string, AlarmRuntime> = {};
      for (const def of doc.alarms) {
        const rt = alarmRef.current[def.id] ?? newRuntime(def.id);
        const v = resolveNumber(
          def.target.source === "plc"
            ? { kind: "plc", tag: def.target.tag }
            : { kind: "hmi", tag: def.target.tag },
          evalCtx,
        );
        nextAlarms[def.id] = stepAlarm(def, rt, v ?? 0, now).runtime;
      }
      alarmRef.current = nextAlarms;

      // Trends sample at their configured interval rather than every scan: a
      // 100 ms scan into a 5 minute window would be 3000 points of which the
      // eye can use about 300.
      for (const tr of doc.trends) {
        const last = lastSampleRef.current.get(tr.id) ?? 0;
        if (now - last < Math.max(50, tr.interval)) continue;
        lastSampleRef.current.set(tr.id, now);
        let ring = trendsRef.current.get(tr.id);
        const want = capacityFor(tr.span, tr.interval);
        if (!ring || ring.capacity !== want) {
          ring = new TrendBuffer(want);
          trendsRef.current.set(tr.id, ring);
        }
        ring.push({
          t: now,
          v: tr.pens.map((pen) =>
            resolveNumber(
              pen.target.source === "plc"
                ? { kind: "plc", tag: pen.target.tag }
                : { kind: "hmi", tag: pen.target.tag },
              evalCtx,
            ),
          ),
        });
      }
      setTrendTick((n) => n + 1);

      setLiveTags(tags);
      setSpace(nextSpace);
      setAlarmState(nextAlarms);
    },
    [program, doc.alarms, doc.tags, doc.trends],
  );

  useEffect(() => {
    if (!running) return;
    const period = 100;
    const timer = setInterval(() => step(period), period);
    return () => clearInterval(timer);
  }, [running, step]);

  // Leaving run mode puts the tags back where they started, so a design
  // session is not polluted by a test that latched something on.
  useEffect(() => {
    if (running) return;
    tagsRef.current = plcTags;
    edgesRef.current = {};
    trendsRef.current.clear();
    lastSampleRef.current.clear();
    setLiveTags(plcTags);
    setSpace(buildTagSpace(plcTags, doc.tags));
  }, [running, plcTags, doc.tags]);

  // Recomputed on resize as well as on screen change: the panes either side
  // are fixed, but the window is not.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !screen) return;
    const measure = () => {
      const pad = 48;
      const sx = (el.clientWidth - pad) / screen.size.width;
      const sy = (el.clientHeight - pad) / screen.size.height;
      setFitScale(Math.max(0.15, Math.min(1, Math.min(sx, sy))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [screen]);

  const scale = zoom === "fit" ? fitScale : zoom;

  /* ── editing ── */

  const update = useCallback((fn: (d: HmiDoc) => HmiDoc) => {
    setDoc((d) => fn(structuredClone(d)));
    setDirty(true);
  }, []);

  const patchWidget = useCallback(
    (wid: string, patch: Partial<Widget>) => {
      update((d) => {
        const sc = d.screens.find((s) => s.id === screenId);
        const w = sc?.widgets.find((x) => x.id === wid);
        if (w) Object.assign(w, patch);
        return d;
      });
    },
    [update, screenId],
  );

  const addWidget = useCallback(
    (kind: WidgetKind, symbol?: string) => {
      const wid = `w${Math.random().toString(36).slice(2, 9)}`;
      const size = defaultSize(kind);
      update((d) => {
        const sc = d.screens.find((s) => s.id === screenId);
        sc?.widgets.push({
          id: wid,
          kind,
          symbol,
          rect: { x: 40, y: 40, w: size.w, h: size.h },
          fill: "#D8DCDF",
          stroke: "#3A4550",
          strokeWidth: 1.5,
          fontSize: 14,
          text: kind === "button" ? "Button" : kind === "text" ? "Text" : undefined,
          min: 0,
          max: 100,
        });
        return d;
      });
      setSelected(wid);
    },
    [update, screenId],
  );

  /* ── dragging on the canvas ── */

  const canvasRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  function startDrag(e: React.PointerEvent, w: Widget) {
    if (running) return;
    e.preventDefault();
    setSelected(w.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Divided by the scale: the rect is in screen pixels but the widget is
    // positioned in panel pixels, and forgetting this makes a zoomed canvas
    // drag at the wrong speed.
    dragRef.current = {
      id: w.id,
      dx: (e.clientX - rect.left) / scaleRef.current - w.rect.x,
      dy: (e.clientY - rect.top) / scaleRef.current - w.rect.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!d || !rect || !screen) return;
    // Snapped to the grid, and clamped inside the panel: a widget dragged off
    // the edge of a fixed-size screen is gone on the real hardware.
    const x = Math.round(((e.clientX - rect.left) / scaleRef.current - d.dx) / GRID) * GRID;
    const y = Math.round(((e.clientY - rect.top) / scaleRef.current - d.dy) / GRID) * GRID;
    const w = screen.widgets.find((x2) => x2.id === d.id);
    if (!w) return;
    patchWidget(d.id, {
      rect: {
        ...w.rect,
        x: Math.max(0, Math.min(x, screen.size.width - w.rect.w)),
        y: Math.max(0, Math.min(y, screen.size.height - w.rect.h)),
      },
    });
  }

  const endDrag = () => {
    dragRef.current = null;
  };

  /* ── actions from a control in run mode ── */

  const fire = useCallback(
    (actions: Action[] | undefined) => {
      if (!actions || !running) return;
      let next = spaceRef.current;
      for (const a of actions) {
        switch (a.kind) {
          case "setTag": {
            const v = resolveNumber(a.value, makeContext(next, tagsRef.current)) ?? 0;
            next = writeTag(next, a.target, v).space;
            break;
          }
          case "toggleTag": {
            const cur = (a.target.source === "plc" ? next.plc : next.hmi).get(a.target.tag) ?? 0;
            next = writeTag(next, a.target, cur === 0 ? 1 : 0).space;
            break;
          }
          case "ackAll": {
            const now = Date.now();
            const acked: Record<string, AlarmRuntime> = {};
            for (const [k, rt] of Object.entries(alarmRef.current)) acked[k] = acknowledge(rt, now);
            alarmRef.current = acked;
            setAlarmState(acked);
            break;
          }
          case "goToScreen": {
            const target = doc.screens.find((s) => s.slug === a.slug);
            if (target) setScreenId(target.id);
            break;
          }
          default:
            break;
        }
      }
      spaceRef.current = next;
      setSpace(next);
    },
    [running, doc.screens],
  );

  /* ── save ── */

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/hmi/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, doc }),
      });
      if (res.ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
      if (e.key === "Escape" && focus) setFocus(false);
      if (e.key === "Delete" && selected && !running) {
        update((d) => {
          const sc = d.screens.find((s) => s.id === screenId);
          if (sc) sc.widgets = sc.widgets.filter((w) => w.id !== selected);
          return d;
        });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sel = screen?.widgets.find((w) => w.id === selected) ?? null;

  const outstanding = useMemo(
    () =>
      sortForSummary(
        doc.alarms
          .map((def) => ({ def, runtime: alarmState[def.id] ?? newRuntime(def.id) }))
          .filter((r) => isOutstanding(r.runtime.state)),
      ),
    [doc.alarms, alarmState],
  );
  const unacked = outstanding.filter((r) => needsAck(r.runtime.state)).length;

  /**
   * What a data widget needs, chosen by which one it is.
   *
   * trendTick is read so this recomputes as samples arrive; without it the
   * chart would be drawn once and then sit still while the process moved.
   */
  const liveData = (w: Widget): LiveData | undefined => {
    void trendTick;
    if (w.kind === "trend") {
      const id = (w.config?.trendId as string) ?? doc.trends[0]?.id;
      const def = doc.trends.find((t) => t.id === id) ?? doc.trends[0];
      if (!def) return undefined;
      return { samples: trendsRef.current.get(def.id)?.toArray() ?? [] };
    }
    if (w.kind === "alarmSummary" || w.kind === "alarmHistory") {
      return {
        alarms: outstanding.map((r) => ({
          id: r.def.id,
          message: r.def.message,
          priority: r.def.priority,
          state: r.runtime.state,
          needsAck: needsAck(r.runtime.state),
          raisedAt: r.runtime.raisedAt,
        })),
      };
    }
    return undefined;
  };

  if (!screen)
    return <p className="p-6 text-[13px] text-ink-500">This application has no screens.</p>;

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${focus ? "fixed inset-0 z-50 bg-white" : ""}`}>
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="w-52 rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
        />

        <select
          value={screenId}
          onChange={(e) => setScreenId(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none"
        >
          {doc.screens.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <span className="font-mono text-[11px] text-ink-400">
          {screen.size.width}×{screen.size.height}
          {presetFor(screen.size) ? ` · ${presetFor(screen.size)?.label}` : ""}
        </span>

        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          disabled={!program}
          title={program ? undefined : "This project has no ladder program to run against."}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors disabled:opacity-40 ${
            running ? "bg-[#B4531A] text-white" : "bg-ink-900 text-white"
          }`}
        >
          {running ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {running ? "Stop" : "Run"}
        </button>

        {running && (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-500">
            <Bell className={`h-3 w-3 ${unacked > 0 ? "text-[#B4531A]" : "text-ink-300"}`} />
            {outstanding.length} alarm{outstanding.length === 1 ? "" : "s"}
            {unacked > 0 ? `, ${unacked} unacknowledged` : ""}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {projectName && (
            <span className="font-mono text-[11px] text-ink-400">
              {plcTags.length} PLC tags · {projectName}
            </span>
          )}
          <select
            value={zoom === "fit" ? "fit" : String(zoom)}
            onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
            title="Zoom"
            className="rounded-md border border-ink-200 bg-white px-1.5 py-1 text-[11.5px] outline-none"
          >
            <option value="fit">Fit · {Math.round(fitScale * 100)}%</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="1.5">150%</option>
          </select>
          <button
            type="button"
            onClick={() => setFocus((f) => !f)}
            title="Full screen"
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-ink-600 hover:border-ink-400"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-md bg-ink-900 px-3 py-1 text-[12.5px] font-medium text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left: palette, screens, tags, alarms */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-ink-100">
          <div className="flex shrink-0 border-b border-ink-100">
            {(["palette", "screens", "tags", "alarms"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-[11.5px] capitalize transition-colors ${
                  tab === t
                    ? "border-b-2 border-teal-600 text-ink-900"
                    : "text-ink-400 hover:text-ink-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {tab === "palette" && <Palette onAdd={addWidget} />}
            {tab === "screens" && (
              <ScreenList doc={doc} current={screenId} onSelect={setScreenId} onChange={update} />
            )}
            {tab === "tags" && <TagList plc={liveTags} hmi={doc.tags} space={space} />}
            {tab === "alarms" && (
              <AlarmList
                rows={outstanding}
                onAck={() => fire([{ kind: "ackAll" }])}
                running={running}
              />
            )}
          </div>
        </aside>

        {/* centre: the panel */}
        <div ref={stageRef} className="min-h-0 flex-1 overflow-auto bg-ink-100/50 p-6">
          <div
            style={{
              width: screen.size.width * scale,
              height: screen.size.height * scale,
              margin: "0 auto",
            }}
          >
            <div
              ref={canvasRef}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              style={{
                width: screen.size.width,
                height: screen.size.height,
                background: screen.background,
                position: "relative",
                boxShadow: "0 2px 18px rgba(15,26,36,0.18)",
                // A real panel bezel, so the drawing area is unmistakably the
                // glass rather than an infinite canvas.
                outline: "6px solid #2B3138",
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              {!running && <GridOverlay w={screen.size.width} h={screen.size.height} />}
              {[...screen.widgets]
                .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
                .map((w) => (
                  <div key={w.id}>
                    {/* The grab handle is the widget's own box. It used to be
                        inset:0, which covers the whole panel, so a click
                        anywhere selected whichever widget happened to render
                        last rather than the one under the pointer. In run mode
                        it steps aside entirely so the control beneath takes
                        the press. */}
                    {!running && (
                      <div
                        onPointerDown={(e) => startDrag(e, w)}
                        style={{
                          position: "absolute",
                          left: w.rect.x,
                          top: w.rect.y,
                          width: w.rect.w,
                          height: w.rect.h,
                          zIndex: 2,
                          cursor: "move",
                        }}
                      />
                    )}
                    <div>
                      <WidgetView
                        widget={w}
                        ctx={ctx}
                        live={running}
                        data={liveData(w)}
                        onPress={() => fire(w.onPress)}
                        onRelease={() => fire(w.onRelease)}
                      />
                    </div>
                    {!running && selected === w.id && (
                      <div
                        style={{
                          position: "absolute",
                          left: w.rect.x - 2,
                          top: w.rect.y - 2,
                          width: w.rect.w + 4,
                          height: w.rect.h + 4,
                          border: "1.5px solid #3FBFB5",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* right: properties */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-ink-100 p-3">
          {sel ? (
            <Properties
              widget={sel}
              plc={liveTags}
              hmi={doc.tags}
              screens={doc.screens}
              onChange={(patch) => patchWidget(sel.id, patch)}
              onDelete={() => {
                update((d) => {
                  const sc = d.screens.find((s) => s.id === screenId);
                  if (sc) sc.widgets = sc.widgets.filter((w) => w.id !== sel.id);
                  return d;
                });
                setSelected(null);
              }}
            />
          ) : (
            <p className="text-[12.5px] leading-relaxed text-ink-400">
              Nothing selected. Pick an object on the panel, or add one from the palette.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────────────────────────── pieces ─────────────────────────────── */

function GridOverlay({ w, h }: { w: number; h: number }) {
  return (
    <svg
      width={w}
      height={h}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.35 }}
      aria-hidden="true"
    >
      <title>Grid</title>
      <defs>
        <pattern id="hmi-grid" width={GRID * 4} height={GRID * 4} patternUnits="userSpaceOnUse">
          <path
            d={`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`}
            fill="none"
            stroke="#9AA7B2"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#hmi-grid)" />
    </svg>
  );
}

const BASIC: { kind: WidgetKind; label: string }[] = [
  { kind: "rect", label: "Rectangle" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "line", label: "Line" },
  { kind: "text", label: "Text" },
  { kind: "numeric", label: "Numeric" },
  { kind: "lamp", label: "Lamp" },
  { kind: "bar", label: "Bar" },
  { kind: "gauge", label: "Gauge" },
  { kind: "multistate", label: "Multi-state" },
  { kind: "button", label: "Button" },
  { kind: "toggle", label: "Toggle" },
  { kind: "trend", label: "Trend" },
  { kind: "alarmSummary", label: "Alarms" },
];

function defaultSize(kind: WidgetKind): { w: number; h: number } {
  switch (kind) {
    case "lamp":
      return { w: 32, h: 32 };
    case "bar":
      return { w: 40, h: 120 };
    case "gauge":
      return { w: 120, h: 120 };
    case "trend":
      return { w: 280, h: 140 };
    case "alarmSummary":
    case "alarmHistory":
      return { w: 320, h: 120 };
    case "text":
      return { w: 120, h: 24 };
    case "numeric":
      return { w: 96, h: 28 };
    case "line":
      return { w: 120, h: 8 };
    case "button":
    case "toggle":
      return { w: 96, h: 36 };
    default:
      return { w: 96, h: 72 };
  }
}

function Palette({ onAdd }: { onAdd: (k: WidgetKind, symbol?: string) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
          Objects
        </p>
        <div className="grid grid-cols-2 gap-1">
          {BASIC.map((b) => (
            <button
              key={b.kind}
              type="button"
              onClick={() => onAdd(b.kind)}
              className="rounded-sm border border-ink-200 bg-white px-1.5 py-1 text-left text-[11.5px] text-ink-700 transition-colors hover:border-teal-500"
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {SYMBOL_CATEGORIES.map((cat) => (
        <div key={cat}>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
            {cat}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {symbolsIn(cat).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onAdd("symbol", s.id)}
                title={s.name}
                className="truncate rounded-sm border border-ink-200 bg-white px-1.5 py-1 text-left text-[11.5px] text-ink-700 transition-colors hover:border-teal-500"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScreenList({
  doc,
  current,
  onSelect,
  onChange,
}: {
  doc: HmiDoc;
  current: string;
  onSelect: (id: string) => void;
  onChange: (fn: (d: HmiDoc) => HmiDoc) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          onChange((d) => {
            const n = d.screens.length + 1;
            d.screens.push({
              id: `s${Math.random().toString(36).slice(2, 8)}`,
              name: `Screen ${n}`,
              slug: `screen-${n}`,
              size: d.defaultSize,
              background: "#E8EAEC",
              widgets: [],
            });
            return d;
          })
        }
        className="mb-2 flex w-full items-center gap-1.5 rounded-sm border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 hover:border-teal-500"
      >
        <Plus className="h-3 w-3" />
        New screen
      </button>
      <ul className="space-y-0.5">
        {doc.screens.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={`w-full truncate rounded-sm px-2 py-1 text-left text-[12px] ${
                s.id === current ? "bg-teal-50 text-ink-900" : "text-ink-600 hover:bg-ink-50"
              }`}
            >
              {s.name}
              <span className="ml-1.5 font-mono text-[10px] text-ink-400">{s.widgets.length}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagList({ plc, hmi, space }: { plc: Tag[]; hmi: HmiDoc["tags"]; space: TagSpace }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
          PLC tags · {plc.length}
        </p>
        {plc.length === 0 ? (
          <p className="text-[11.5px] leading-snug text-ink-400">
            No ladder program on this project yet. Write one and its tags appear here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {plc.map((t) => (
              <li key={t.name} className="flex items-baseline gap-1.5 text-[11.5px]">
                <span className="min-w-0 flex-1 truncate text-ink-700">{t.name}</span>
                <span className="font-mono text-[10px] text-ink-400">{t.address ?? t.type}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-ink-900">
                  {space.plc.get(t.name) ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
          HMI tags · {hmi.length}
        </p>
        {hmi.length === 0 ? (
          <p className="text-[11.5px] leading-snug text-ink-400">
            None. These are the HMI's own: setpoint buffers, screen state.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {hmi.map((t) => (
              <li key={t.name} className="flex items-baseline gap-1.5 text-[11.5px]">
                <span className="min-w-0 flex-1 truncate text-ink-700">{t.name}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-ink-900">
                  {space.hmi.get(t.name) ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AlarmList({
  rows,
  onAck,
  running,
}: {
  rows: { def: { id: string; message: string; priority: string }; runtime: AlarmRuntime }[];
  onAck: () => void;
  running: boolean;
}) {
  if (!running) {
    return (
      <p className="text-[11.5px] leading-snug text-ink-400">
        Press Run. Alarms are evaluated against live tags, so nothing is outstanding at rest.
      </p>
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={onAck}
        className="mb-2 w-full rounded-sm border border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-700 hover:border-teal-500"
      >
        Acknowledge all
      </button>
      {rows.length === 0 ? (
        <p className="text-[11.5px] text-ink-400">Nothing outstanding.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.def.id}
              className={`rounded-sm border px-1.5 py-1 text-[11.5px] ${
                needsAck(r.runtime.state)
                  ? "border-[#B4531A] bg-[#B4531A]/10 text-ink-900"
                  : "border-ink-200 text-ink-600"
              }`}
            >
              <span className="block truncate">{r.def.message}</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-400">
                {r.def.priority} · {r.runtime.state.replace("_", " ").toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Properties({
  widget: w,
  plc,
  hmi,
  screens,
  onChange,
  onDelete,
}: {
  widget: Widget;
  plc: Tag[];
  hmi: HmiDoc["tags"];
  screens: Screen[];
  onChange: (patch: Partial<Widget>) => void;
  onDelete: () => void;
}) {
  const tagNames = [...plc.map((t) => t.name), ...hmi.map((t) => t.name)];
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="font-display text-[13px] font-bold text-ink-900">{w.kind}</h3>
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          className="ml-auto text-ink-300 hover:text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Row label="Position">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <input
            key={k}
            type="number"
            value={w.rect[k]}
            onChange={(e) => onChange({ rect: { ...w.rect, [k]: Number(e.target.value) || 0 } })}
            className={numBox}
          />
        ))}
      </Row>

      {(w.kind === "text" || w.kind === "button" || w.kind === "toggle" || w.kind === "symbol") && (
        <Row label={w.kind === "symbol" ? "Label" : "Caption"}>
          <input
            value={w.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            className={`${numBox} w-full`}
          />
        </Row>
      )}

      <Row label="Colours">
        <input
          type="color"
          value={w.fill ?? "#D8DCDF"}
          onChange={(e) => onChange({ fill: e.target.value })}
          className="h-6 w-10"
        />
        <input
          type="color"
          value={w.stroke ?? "#3A4550"}
          onChange={(e) => onChange({ stroke: e.target.value })}
          className="h-6 w-10"
        />
      </Row>

      {(w.kind === "bar" || w.kind === "gauge" || w.kind === "symbol" || w.kind === "numeric") && (
        <Row label="Range">
          <input
            type="number"
            value={w.min ?? 0}
            onChange={(e) => onChange({ min: Number(e.target.value) })}
            className={numBox}
          />
          <input
            type="number"
            value={w.max ?? 100}
            onChange={(e) => onChange({ max: Number(e.target.value) })}
            className={numBox}
          />
          <input
            type="number"
            value={w.decimals ?? 0}
            title="Decimal places"
            onChange={(e) => onChange({ decimals: Number(e.target.value) })}
            className={numBox}
          />
        </Row>
      )}

      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
          Value
        </span>
        <select
          value={w.value?.kind === "plc" ? w.value.tag : w.value?.kind === "expr" ? "__expr" : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) onChange({ value: undefined });
            else if (v === "__expr") onChange({ value: { kind: "expr", source: "{Tag} > 0" } });
            else onChange({ value: { kind: "plc", tag: v } });
          }}
          className={`${numBox} w-full`}
        >
          <option value="">not bound</option>
          {tagNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="__expr">expression…</option>
        </select>
        {w.value?.kind === "expr" && (
          <input
            value={w.value.source}
            onChange={(e) => onChange({ value: { kind: "expr", source: e.target.value } })}
            placeholder="{Level} > 80"
            className={`${numBox} mt-1 w-full font-mono`}
          />
        )}
      </div>

      {(w.kind === "button" || w.kind === "toggle") && (
        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
            On press
          </span>
          <select
            value={(w.onPress?.[0] as { target?: { tag: string } })?.target?.tag ?? ""}
            onChange={(e) => {
              const tag = e.target.value;
              if (!tag) return onChange({ onPress: [], onRelease: [] });
              // Momentary by default, which is what a physical pushbutton is.
              onChange({
                onPress: [
                  {
                    kind: "setTag",
                    target: { source: "plc", tag },
                    value: { kind: "const", value: 1 },
                  },
                ],
                onRelease:
                  w.kind === "button"
                    ? [
                        {
                          kind: "setTag",
                          target: { source: "plc", tag },
                          value: { kind: "const", value: 0 },
                        },
                      ]
                    : [],
              });
            }}
            className={`${numBox} w-full`}
          >
            <option value="">does nothing</option>
            {plc.map((t) => (
              <option key={t.name} value={t.name}>
                write {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-snug text-ink-400">
            {w.kind === "button"
              ? "Momentary: 1 while held, 0 on release, like a pushbutton."
              : "Maintained: stays where you put it."}
          </p>
        </div>
      )}

      {screens.length > 1 && (
        <div>
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
            Navigate to
          </span>
          <select
            value={
              (w.onPress?.find((a) => a.kind === "goToScreen") as { slug?: string })?.slug ?? ""
            }
            onChange={(e) =>
              onChange({
                onPress: e.target.value ? [{ kind: "goToScreen", slug: e.target.value }] : [],
              })
            }
            className={`${numBox} w-full`}
          >
            <option value="">no</option>
            {screens.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
          Colour when
        </span>
        <input
          value={(w.animations?.[0]?.when as { source?: string })?.source ?? ""}
          onChange={(e) =>
            onChange({
              animations: e.target.value
                ? [
                    {
                      id: "a1",
                      when: { kind: "expr", source: e.target.value },
                      fill: w.animations?.[0]?.fill ?? "#B4531A",
                    },
                  ]
                : [],
            })
          }
          placeholder="{Level} > 80"
          className={`${numBox} w-full font-mono`}
        />
        {w.animations?.[0] && (
          <input
            type="color"
            value={w.animations[0].fill ?? "#B4531A"}
            onChange={(e) => {
              const first = w.animations?.[0];
              if (!first) return;
              onChange({ animations: [{ ...first, fill: e.target.value }] });
            }}
            className="mt-1 h-6 w-10"
          />
        )}
        <p className="mt-1 text-[11px] leading-snug text-ink-400">
          ISA-101: grey at rest, colour only when something has deviated.
        </p>
      </div>
    </div>
  );
}

const numBox =
  "rounded-sm border border-ink-200 bg-white px-1.5 py-0.5 text-[11.5px] outline-none focus:border-ink-500";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
        {label}
      </span>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

export { PANEL_PRESETS, PANEL_GROUPS };
