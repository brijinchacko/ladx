"use client";
import type { LadxProgram, Tag } from "@ladx/studio";
import { DockPanel, DockStrip, type Side, focusModeLabel, useFocusMode } from "@ladx/studio";
import type { ModelsSource } from "@ladx/ui";
import {
  Bell,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Save,
  Sparkles,
  Square,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AlarmRuntime, needsAck } from "../lib/alarms";
import { buildPanelHtml, panelFileName } from "../lib/export-panel";
import { expandInstance } from "../lib/faceplates";
import type { GenContext, GenerateScreen, GeneratedScreen } from "../lib/generate";
import { defaultSize, draftScreen } from "../lib/generate";
import {
  type History,
  emptyHistory,
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  current as histCurrent,
  push as histPush,
  redo as histRedo,
  undo as histUndo,
} from "../lib/history";
import { usePanelRuntime } from "../lib/panel-runtime";
import { PANEL_GROUPS, PANEL_PRESETS, presetFor } from "../lib/panels";
import { hmiDock } from "../lib/panels-layout";
import {
  DEFAULT_LAYOUT,
  type Layout,
  PANELS as PANELS_FOR_MENU,
  type PanelId,
  loadLayout,
  saveLayout,
} from "../lib/panels-layout";
import type { TagSpace } from "../lib/runtime";
import { sanitiseSvg } from "../lib/svg-import";
import { SYMBOL_CATEGORIES, searchSymbols, symbolsIn } from "../lib/symbols";
import type { AlarmDef, HmiDoc, Widget, WidgetKind } from "../lib/types";
import AlarmPopup from "./alarm-popup";
import HistoryPanel from "./history-panel";
import HmiAi from "./hmi-ai";
import { ContextMenu, type Menu, MenuBar, ProjectTree } from "./hmi-chrome";
import HmiSetup from "./hmi-setup";
import Properties from "./properties";
import WidgetView from "./widget-view";

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

/** The eight resize grips, named the way a CSS cursor is. */
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where an application is stored.
 *
 * A prop rather than a call, because the two surfaces keep it in completely
 * different places: the web PUTs it at an API route, the desktop writes it to
 * local SQLite through Tauri and is forbidden from making an HTTP call at all.
 * Returns whether it landed, so the editor knows when to stop showing dirty.
 */
export type SaveApplication = (input: {
  id: string;
  name: string;
  doc: HmiDoc;
}) => Promise<boolean>;

export interface HmiEditorProps {
  id: string;
  initialDoc: HmiDoc;
  initialName: string;
  /** The project's ladder program, which is where the PLC tags come from. */
  program: LadxProgram | null;
  projectName: string | null;
  onSave: SaveApplication;
  /** Where File > Close goes. The two surfaces mount the list at different paths. */
  closeHref?: string;
  /**
   * Back to the ladder program these tags come from.
   *
   * Null when there is nowhere to go, which is the case for an application
   * filed against no project. A prop rather than a path, because the two
   * surfaces mount the editor at different routes.
   */
  ladderHref?: string | null;
  /**
   * Draw a screen from a description.
   *
   * Optional: the tag table layout in the Assist pane needs no model, so the
   * pane is worth having even on a surface with no provider connected.
   */
  onGenerate?: GenerateScreen;
  /** Shown in the prompt box when there is no model to talk to. */
  generateDisabledReason?: string | null;
  /**
   * Where the list of choosable models comes from.
   *
   * A URL on the web, a function on the desktop, which reads what Ollama has
   * installed. Null when there is no provider at all, in which case the
   * assistant still drafts a screen without one.
   */
  models?: ModelsSource;
  /**
   * Where an exported panel goes, when the surface has somewhere better than
   * the browser's downloads folder.
   *
   * The desktop files it into the open project, under HMI, beside the screens
   * it was built from. Omitted, it downloads as it always has.
   *
   * The label travels with the behaviour, because a menu item that says
   * "Download" and quietly writes a file somewhere is worse than either one on
   * its own. `save` returns where it went, so the editor can say so.
   */
  onExport?: {
    label: string;
    save: (html: string, filename: string) => Promise<string>;
  };
}

export default function HmiEditor({
  id,
  initialDoc,
  initialName,
  program,
  projectName,
  onSave,
  closeHref = "/studio/hmi",
  ladderHref = null,
  onGenerate,
  generateDisabledReason = null,
  models = "/api/models",
  onExport,
}: HmiEditorProps) {
  /**
   * The document, held as an undo stack.
   *
   * A drawing tool without undo is one people are afraid to use: every action
   * becomes a decision about whether it can be reversed. Whole snapshots
   * rather than inverse operations, because the alternative needs an undo
   * written for every action and fails silently the day somebody forgets one.
   */
  const [history, setHistory] = useState<History<HmiDoc>>(() => emptyHistory(initialDoc));
  const doc = histCurrent(history);
  const [name, setName] = useState(initialName);
  const [screenId, setScreenId] = useState(initialDoc.screens[0]?.id ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  /*
   * Focus and fullscreen, from the shared hook.
   *
   * This was a boolean that applied `fixed inset-0`, which is focus mode and
   * was labelled "Full screen". Real fullscreen is a different thing: it takes
   * the browser's own chrome too, which on a 1920 panel design is the
   * difference between seeing the glass at 1:1 and not. The hook also notices
   * when the browser leaves fullscreen behind our back, which a boolean cannot.
   */
  const screen_ = useFocusMode({ key: "ladx.hmi.mode.v1" });
  const focus = screen_.immersive;
  const [setupOpen, setSetupOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  /**
   * Popups the operator has closed.
   *
   * Closing dismisses the dialog, not the alarm: it stays outstanding in the
   * summary. Cleared when the alarm goes back to normal, so the same condition
   * recurring pops again rather than being silently suppressed forever.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  /**
   * Where the right-click menu is and what it is about.
   *
   * `x`/`y` are viewport pixels for placing the menu; `px`/`py` are panel
   * coordinates, kept so Paste lands where the pointer was rather than where
   * the last copy happened to be.
   */
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    id: string | null;
    px?: number;
    py?: number;
  } | null>(null);
  /** The clipboard, in memory. A copied widget survives switching screens. */
  const clipboard = useRef<Widget | null>(null);
  const [setupTab, setSetupTab] = useState<"screen" | "tags" | "alarms" | "trends" | "connection">(
    "alarms",
  );

  /**
   * The pane layout, restored on mount rather than in the initial state.
   *
   * localStorage is not available while the server renders, and seeding state
   * from it directly makes the first client render disagree with the HTML,
   * which React reports as a hydration mismatch and then throws away.
   */
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  useEffect(() => setLayout(loadLayout()), []);
  const setPanel = useCallback((id: PanelId, next: Partial<Layout[PanelId]>) => {
    setLayout((l) => {
      const out = { ...l, [id]: { ...l[id], ...next } };
      saveLayout(out);
      return out;
    });
  }, []);
  const router = useRouter();
  const svgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const openSetup = useCallback((tab: typeof setupTab) => {
    setSetupTab(tab);
    setSetupOpen(true);
  }, []);
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

  /*
   * The runtime, from the shared hook.
   *
   * All of this used to sit here, tangled up with selection, undo and zoom.
   * It moved out so the exported panel is not a second implementation of the
   * scan loop, the alarm evaluation and the trend sampling: a re-creation is
   * faithful on the day it is written and drifts every day after, and the one
   * thing a screen exported for a factory acceptance test has to be is the
   * same screen.
   */
  const rt = usePanelRuntime({
    doc,
    program,
    running,
    onGoToScreen: (slug: string) => {
      const target = doc.screens.find((s) => s.slug === slug);
      if (target) setScreenId(target.id);
    },
  });
  const {
    plcTags,
    space,
    liveTags,
    ctx,
    fire,
    outstanding,
    unacked,
    popped,
    liveData,
    ackOne,
    dismiss,
  } = rt;

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

  /**
   * Step through the zoom levels.
   *
   * From "fit" the first step starts at whatever fit currently is, so zooming
   * in from a fitted view does not jump to 100% and lose the place.
   */
  const STEPS = [0.25, 0.35, 0.5, 0.75, 1, 1.5, 2, 3];
  const nudgeZoom = useCallback(
    (dir: 1 | -1) => {
      setZoom((z) => {
        const cur = z === "fit" ? fitScale : z;
        const next =
          dir > 0
            ? STEPS.find((v) => v > cur + 0.001)
            : [...STEPS].reverse().find((v) => v < cur - 0.001);
        return next ?? cur;
      });
    },
    [fitScale],
  );

  /* ── editing ── */

  const update = useCallback((fn: (d: HmiDoc) => HmiDoc) => {
    setHistory((h) => histPush(h, fn(structuredClone(histCurrent(h)))));
    setDirty(true);
  }, []);

  const doUndo = useCallback(() => {
    setHistory((h) => {
      if (!histCanUndo(h)) return h;
      setDirty(true);
      return histUndo(h);
    });
  }, []);

  const doRedo = useCallback(() => {
    setHistory((h) => {
      if (!histCanRedo(h)) return h;
      setDirty(true);
      return histRedo(h);
    });
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

  /**
   * Everything a generator needs to know, gathered at the moment it is asked.
   *
   * A function rather than a value: it closes over the document, the screen
   * that is open and the live tag table, and handing over a snapshot taken at
   * render time is how a request ends up describing a screen from two edits
   * ago.
   */
  const genContext = useCallback(
    (): GenContext => ({
      plcTags,
      hmiTags: doc.tags,
      size: screen?.size ?? doc.defaultSize,
      existing: screen?.widgets ?? [],
      screenSlugs: doc.screens.map((s) => s.slug),
      alarms: doc.alarms,
      mode: "extend",
    }),
    [plcTags, doc, screen],
  );

  /**
   * Put a generated screen into the document.
   *
   * One `update`, so the whole thing is one entry on the undo stack and one
   * Undo removes all of it. Tags and alarms are merged rather than replaced
   * even when the widgets are: somebody who asked to redraw the graphics did
   * not ask to lose the alarm list.
   */
  const applyGenerated = useCallback(
    (result: GeneratedScreen, mode: "replace" | "extend") => {
      update((d) => {
        const sc = d.screens.find((x) => x.id === screenId);
        if (!sc) return d;
        sc.widgets = mode === "replace" ? result.widgets : [...sc.widgets, ...result.widgets];
        if (result.background) sc.background = result.background;

        const names = new Set(d.tags.map((t) => t.name));
        for (const t of result.hmiTags) if (!names.has(t.name)) d.tags.push(t);

        const ids = new Set(d.alarms.map((a) => a.id));
        for (const a of result.alarms) if (!ids.has(a.id)) d.alarms.push(a);
        return d;
      });
      setSelected(null);
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

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    update((d) => {
      const sc = d.screens.find((x) => x.id === screenId);
      if (sc) sc.widgets = sc.widgets.filter((w) => w.id !== selected);
      return d;
    });
    setSelected(null);
  }, [selected, screenId, update]);

  /** Offset from the original, so the copy is visible rather than exactly under it. */
  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const nid = `w${Math.random().toString(36).slice(2, 9)}`;
    update((d) => {
      const sc = d.screens.find((x) => x.id === screenId);
      const w = sc?.widgets.find((x) => x.id === selected);
      if (sc && w) {
        sc.widgets.push({
          ...structuredClone(w),
          id: nid,
          rect: { ...w.rect, x: w.rect.x + GRID * 2, y: w.rect.y + GRID * 2 },
        });
      }
      return d;
    });
    setSelected(nid);
  }, [selected, screenId, update]);

  /**
   * Move the selection through the stack.
   *
   * z is explicit rather than array order, so a widget can be raised without
   * disturbing anything else's relative order.
   */
  const reorder = useCallback(
    (where: "front" | "back") => {
      if (!selected) return;
      update((d) => {
        const sc = d.screens.find((x) => x.id === screenId);
        const w = sc?.widgets.find((x) => x.id === selected);
        if (!sc || !w) return d;
        const zs = sc.widgets.map((x) => x.z ?? 0);
        w.z = where === "front" ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
        return d;
      });
    },
    [selected, screenId, update],
  );

  const copySelected = useCallback(() => {
    const w = screen?.widgets.find((x) => x.id === selected);
    if (w) clipboard.current = structuredClone(w);
  }, [screen, selected]);

  /**
   * Paste onto the current screen.
   *
   * Offset from the original, and given a fresh id: pasting an object with the
   * id it was copied from would make two widgets that the selection, the
   * property pane and the renderer all treat as the same one.
   */
  const paste = useCallback(
    (at?: { x: number; y: number }) => {
      const src = clipboard.current;
      if (!src) return;
      const nid = `w${Math.random().toString(36).slice(2, 9)}`;
      update((d) => {
        const sc = d.screens.find((x) => x.id === screenId);
        sc?.widgets.push({
          ...structuredClone(src),
          id: nid,
          rect: {
            ...src.rect,
            x: at ? Math.round(at.x / GRID) * GRID : src.rect.x + GRID * 2,
            y: at ? Math.round(at.y / GRID) * GRID : src.rect.y + GRID * 2,
          },
        });
        return d;
      });
      setSelected(nid);
    },
    [screenId, update],
  );

  const addScreen = useCallback(() => {
    const id2 = `s${Math.random().toString(36).slice(2, 8)}`;
    update((d) => {
      const n = d.screens.length + 1;
      d.screens.push({
        id: id2,
        name: `Screen ${n}`,
        slug: `screen-${n}`,
        size: d.defaultSize,
        background: "#E8EAEC",
        widgets: [],
      });
      return d;
    });
    setScreenId(id2);
  }, [update]);

  /**
   * Bring in an SVG as a symbol.
   *
   * This is the escape hatch for the commercial libraries. Symbol Factory and
   * the rest are per-machine products that cannot be bundled into an HMI
   * somebody sells, so LADX ships its own drawings; anyone who has licensed
   * one of those sets exports SVG from it and imports it here, which keeps the
   * licence where it belongs, with them.
   *
   * Stored on the widget rather than in a global library, so an application
   * carries its own artwork and does not break when it moves machines.
   */
  const importSvg = useCallback(
    async (file: File) => {
      const { svg, error, removed } = sanitiseSvg(await file.text());
      if (error || !svg) {
        setImportNote(error ?? "Could not read that SVG.");
        return;
      }
      const wid = `w${Math.random().toString(36).slice(2, 9)}`;
      update((d) => {
        const sc = d.screens.find((x) => x.id === screenId);
        sc?.widgets.push({
          id: wid,
          kind: "symbol",
          name: file.name.replace(/\.svg$/i, ""),
          rect: { x: 40, y: 40, w: 96, h: 96 },
          fill: "#D8DCDF",
          stroke: "#3A4550",
          strokeWidth: 1.5,
          // Carried on the widget rather than in a global library, so an
          // application takes its own artwork with it between installs.
          config: { svg },
        });
        return d;
      });
      setSelected(wid);
      setImportNote(
        removed.length > 0
          ? `Imported ${file.name}, with ${removed.length} thing${removed.length === 1 ? "" : "s"} stripped: ${removed.slice(0, 4).join(", ")}.`
          : `Imported ${file.name}.`,
      );
    },
    [screenId, update],
  );

  /**
   * Read an exported application back.
   *
   * Replaces the whole document, which is why it goes through the undo stack:
   * importing the wrong file must be one Cmd Z away rather than a lost
   * afternoon. Checked before it is applied, because a JSON file with no
   * screens would leave the editor with nothing to draw.
   */
  const importDoc = useCallback(async (file: File) => {
    setImportNote(null);
    try {
      const parsed = JSON.parse(await file.text()) as { name?: string; doc?: HmiDoc };
      const next = parsed.doc ?? (parsed as unknown as HmiDoc);
      if (!next || !Array.isArray(next.screens) || next.screens.length === 0) {
        setImportNote("That file has no screens in it.");
        return;
      }
      setHistory((h) => histPush(h, next));
      if (parsed.name) setName(parsed.name);
      setScreenId(next.screens[0]?.id ?? "");
      setSelected(null);
      setDirty(true);
      setImportNote(
        `Imported ${file.name}: ${next.screens.length} screen${next.screens.length === 1 ? "" : "s"}. Cmd Z puts it back.`,
      );
    } catch {
      setImportNote("That is not a readable application file.");
    }
  }, []);

  /** The document as a file, so an application can be moved between installs. */
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ name, doc }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase()}.hmi.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, doc]);

  /**
   * The application as one HTML file that runs it.
   *
   * The runtime is fetched from this origin and inlined, so the file that
   * comes out fetches nothing at all: it opens from a USB stick, from a share,
   * or on a machine that has never had a network, which is the normal
   * condition of the machine it ends up on.
   *
   * Fetching it here rather than bundling it into the editor keeps 300 kB of
   * panel runtime out of every page load for the sake of a menu item most
   * people use once.
   */
  const [exporting, setExporting] = useState(false);
  const exportPanel = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch("/panel/runtime.js", { cache: "force-cache" });
      if (!res.ok) throw new Error(`runtime ${res.status}`);
      const runtime = await res.text();
      const html = buildPanelHtml({ doc, program, name, runtime });
      const filename = panelFileName(name);

      if (onExport) {
        // Reported separately from the runtime fetch above, because a save
        // that failed for its own reason must not be explained as a missing
        // runtime. Somebody chasing the wrong cause loses an afternoon.
        try {
          // Said rather than assumed: a file written into a folder the person
          // cannot see needs naming, or they press the button again wondering
          // whether it worked.
          setImportNote(`Panel saved to ${await onExport.save(html, filename)}`);
        } catch (err) {
          setImportNote(
            `The panel was built but could not be saved: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        return;
      }

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Said rather than swallowed: a menu item that does nothing is worse
      // than one that explains why, and the only cause is a build that did
      // not produce the runtime.
      setImportNote("The panel runtime could not be loaded, so nothing was exported.");
    } finally {
      setExporting(false);
    }
  }, [doc, program, name, onExport]);

  /* ── dragging on the canvas ── */

  const canvasRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const dragRef = useRef<{
    id: string;
    dx: number;
    dy: number;
    /** Null for a move; a corner for a resize. */
    handle: Handle | null;
    start: Rect;
  } | null>(null);

  function startDrag(e: React.PointerEvent, w: Widget, handle: Handle | null = null) {
    if (running) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(w.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Divided by the scale: the rect is in screen pixels but the widget is
    // positioned in panel pixels, and forgetting this makes a zoomed canvas
    // drag at the wrong speed.
    dragRef.current = {
      id: w.id,
      handle,
      start: { ...w.rect },
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
    const px = (e.clientX - rect.left) / scaleRef.current;
    const py = (e.clientY - rect.top) / scaleRef.current;
    const snap = (n: number) => Math.round(n / GRID) * GRID;

    if (!d.handle) {
      const x = snap(px - d.dx);
      const y = snap(py - d.dy);
      patchWidget(d.id, {
        rect: {
          ...d.start,
          x: Math.max(0, Math.min(x, screen.size.width - d.start.w)),
          y: Math.max(0, Math.min(y, screen.size.height - d.start.h)),
        },
      });
      return;
    }

    // Resizing from a corner. Each edge is clamped so it cannot cross the
    // opposite one, which would otherwise flip the box inside out.
    const s0 = d.start;
    let { x, y, w: bw, h: bh } = s0;
    const MIN = GRID * 2;
    if (d.handle.includes("e")) bw = Math.max(MIN, snap(px) - s0.x);
    if (d.handle.includes("s")) bh = Math.max(MIN, snap(py) - s0.y);
    if (d.handle.includes("w")) {
      const right = s0.x + s0.w;
      x = Math.min(snap(px), right - MIN);
      bw = right - x;
    }
    if (d.handle.includes("n")) {
      const bottom = s0.y + s0.h;
      y = Math.min(snap(py), bottom - MIN);
      bh = bottom - y;
    }
    patchWidget(d.id, {
      rect: {
        x: Math.max(0, x),
        y: Math.max(0, y),
        w: Math.min(bw, screen.size.width - Math.max(0, x)),
        h: Math.min(bh, screen.size.height - Math.max(0, y)),
      },
    });
  }

  const endDrag = () => {
    dragRef.current = null;
  };

  /* ── actions from a control in run mode ── */

  /* ── save ── */

  async function save() {
    setSaving(true);
    try {
      if (await onSave({ id, name, doc })) setDirty(false);
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
      // Escape is handled by useFocusMode, which knows whether to leave
      // fullscreen or focus. Handling it here as well would skip a step.
      const mod = e.metaKey || e.ctrlKey;
      // Ignored while typing, or Cmd+C in a tag name would copy the widget.
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if (mod && !typing) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) doRedo();
          else doUndo();
        }
        if (e.key === "y") {
          e.preventDefault();
          doRedo();
        }
        if (e.key === "c") copySelected();
        if (e.key === "v") paste();
        if (e.key === "d") {
          e.preventDefault();
          duplicateSelected();
        }
        if (e.key === "x") {
          copySelected();
          deleteSelected();
        }
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          nudgeZoom(1);
        }
        if (e.key === "-") {
          e.preventDefault();
          nudgeZoom(-1);
        }
        if (e.key === "0") {
          e.preventDefault();
          setZoom("fit");
        }
      }
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

  /*
   * The screen's widgets with faceplate instances expanded.
   *
   * Computed once per render rather than inside the map, because expansion
   * walks every widget of every definition and doing it per instance per
   * frame during a run is the sort of thing that makes a screen feel slow for
   * no reason anybody can see.
   *
   * The runtime iterates this too, so an alarm or an animation bound to a tag
   * inside a faceplate behaves exactly like one bound anywhere else.
   */
  const { widgets: expandedParts, expandedIds } = useMemo(() => {
    const src = screen?.widgets ?? [];
    const ids = new Set<string>();
    const out: Widget[] = [];
    for (const w of src) {
      if (w.kind !== "faceplate") continue;
      const { widgets } = expandInstance(w, doc.faceplates ?? []);
      if (widgets.length && widgets[0] !== w) {
        ids.add(w.id);
        out.push(...widgets);
      }
    }
    return { widgets: out.sort((a, b) => (a.z ?? 0) - (b.z ?? 0)), expandedIds: ids };
  }, [screen?.widgets, doc.faceplates]);

  /**
   * The menu bar.
   *
   * Rebuilt each render rather than memoised: every item closes over the
   * document, the selection and the layout, and a dependency list over that is
   * a list somebody gets wrong, with a menu item quietly acting on a screen
   * from three edits ago as the failure mode.
   */
  const menus: Menu[] = [
    {
      label: "File",
      items: [
        { label: "Save", shortcut: "Cmd S", onSelect: () => void save(), disabled: !dirty },
        { label: "Export JSON", onSelect: exportJson },
        {
          label: exporting ? "Exporting panel…" : "Export as a running panel…",
          disabled: exporting,
          onSelect: () => void exportPanel(),
        },
        { label: "Import JSON…", onSelect: () => docRef.current?.click() },
        { label: "Import symbol (SVG)…", onSelect: () => svgRef.current?.click() },
        { label: "", separator: true },
        {
          label: "Open the ladder program",
          disabled: !ladderHref,
          onSelect: () => ladderHref && router.push(ladderHref),
        },
        { label: "", separator: true },
        { label: "Close", onSelect: () => router.push(closeHref) },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Cmd Z", disabled: !histCanUndo(history), onSelect: doUndo },
        {
          label: "Redo",
          shortcut: "Shift Cmd Z",
          disabled: !histCanRedo(history),
          onSelect: doRedo,
        },
        { label: "", separator: true },
        {
          label: "Duplicate",
          shortcut: "Cmd D",
          disabled: !selected,
          onSelect: duplicateSelected,
        },
        { label: "Delete", shortcut: "Del", disabled: !selected, onSelect: deleteSelected },
        { label: "", separator: true },
        { label: "Bring to front", disabled: !selected, onSelect: () => reorder("front") },
        { label: "Send to back", disabled: !selected, onSelect: () => reorder("back") },
      ],
    },
    {
      label: "View",
      items: [
        ...PANELS_FOR_MENU.map((p) => ({
          label: p.title,
          checked: layout[p.id].open,
          onSelect: () => setPanel(p.id, { open: !layout[p.id].open }),
        })),
        { label: "", separator: true },
        { label: "Fit", onSelect: () => setZoom("fit"), checked: zoom === "fit" },
        { label: "100%", onSelect: () => setZoom(1), checked: zoom === 1 },
        {
          label: focusModeLabel(screen_.mode, screen_.canFullscreen),
          onSelect: screen_.cycle,
          checked: screen_.immersive,
        },
        {
          label: "Leave focus mode",
          disabled: !screen_.immersive,
          onSelect: screen_.collapse,
        },
        { label: "", separator: true },
        {
          label: "Schematic symbols",
          checked: (doc.symbolStyle ?? "schematic") === "schematic",
          onSelect: () => update((d) => ({ ...d, symbolStyle: "schematic" })),
        },
        {
          label: "Realistic symbols",
          checked: doc.symbolStyle === "realistic",
          onSelect: () => update((d) => ({ ...d, symbolStyle: "realistic" })),
        },
        { label: "", separator: true },
        {
          label: "Reset layout",
          onSelect: () => {
            setLayout(DEFAULT_LAYOUT);
            saveLayout(DEFAULT_LAYOUT);
          },
        },
      ],
    },
    {
      label: "Insert",
      items: [
        ...BASIC.map((b) => ({ label: b.label, onSelect: () => addWidget(b.kind) })),
        { label: "", separator: true },
        {
          label: "Draw a screen from a description…",
          onSelect: () => setPanel("assist", { open: true }),
        },
        {
          label: "Lay out this screen from the tag table",
          disabled: plcTags.length === 0,
          onSelect: () =>
            applyGenerated(draftScreen({ ...genContext(), mode: "replace" }), "replace"),
        },
      ],
    },
    {
      label: "Screen",
      items: [
        { label: "New screen", onSelect: addScreen },
        { label: "Screen settings…", onSelect: () => openSetup("screen") },
        { label: "", separator: true },
        ...doc.screens.map((sc) => ({
          label: sc.name,
          checked: sc.id === screenId,
          onSelect: () => setScreenId(sc.id),
        })),
      ],
    },
    {
      label: "Configure",
      items: [
        { label: "Tags…", onSelect: () => openSetup("tags") },
        { label: "Alarms…", onSelect: () => openSetup("alarms") },
        { label: "Trends…", onSelect: () => openSetup("trends") },
        { label: "Connection…", onSelect: () => openSetup("connection") },
      ],
    },
    {
      label: "Run",
      items: [
        {
          label: running ? "Stop" : "Start",
          disabled: !program,
          onSelect: () => setRunning((r) => !r),
        },
        {
          label: "Acknowledge all alarms",
          disabled: !running,
          onSelect: () => fire([{ kind: "ackAll" }]),
        },
        { label: "", separator: true },
        {
          label: "Recorded run\u2026",
          onSelect: () => setHistoryOpen(true),
        },
      ],
    },
  ];

  /**
   * One panel's contents, by id.
   *
   * A lookup rather than the contents being written where the panel used to
   * sit, because the layout now decides which side each one goes to and the
   * same body has to render on the left or the right without being written
   * twice.
   */
  const panelBody = (id: PanelId) => {
    switch (id) {
      case "tree":
        return (
          <ProjectTree
            doc={doc}
            appName={name}
            screenId={screenId}
            plcTagCount={plcTags.length}
            onSelectScreen={setScreenId}
            onOpenSetup={openSetup}
          />
        );
      case "tools":
        return (
          <Tools
            onAdd={addWidget}
            running={running}
            outstanding={outstanding}
            onAck={() => fire([{ kind: "ackAll" }])}
          />
        );
      case "properties":
        return sel ? (
          <div className="p-3">
            <Properties
              widget={sel}
              plc={liveTags}
              hmiTags={doc.tags}
              screens={doc.screens}
              trends={doc.trends}
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
          </div>
        ) : (
          <p className="p-3 text-[12.5px] text-ink-400 leading-relaxed">
            Nothing selected. Pick an object on the panel, or add one from Tools.
          </p>
        );
      default:
        return null;
    }
  };

  /**
   * The open panels docked to one side.
   *
   * Assist is excluded: it stopped being a docked pane when it grew its own
   * frame, and it stays in the panel list only so that closing it still leaves
   * a chip in the strip to bring it back.
   */
  const panelsOn = (side: Side) =>
    hmiDock.panels
      .filter(
        (p) => p.id !== "assist" && layout[p.id].open && hmiDock.sideOf(layout, p.id) === side,
      )
      .map((p) => (
        <DockPanel
          key={p.id}
          dock={hmiDock}
          id={p.id}
          layout={layout}
          onResize={(size) => setPanel(p.id, { size })}
          onClose={() => setPanel(p.id, { open: false })}
          onMove={(to) => setPanel(p.id, { side: to })}
          actions={
            p.id === "properties" && sel ? (
              <span className="font-mono text-[10px] text-ink-400">{sel.name ?? sel.kind}</span>
            ) : null
          }
        >
          {panelBody(p.id)}
        </DockPanel>
      ));

  if (!screen)
    return <p className="p-6 text-[13px] text-ink-500">This application has no screens.</p>;

  return (
    <div
      ref={screen_.ref}
      className={`relative flex min-h-0 flex-1 flex-col bg-white ${
        screen_.immersive ? "fixed inset-0 z-50" : ""
      }`}
    >
      <MenuBar menus={menus} />

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
          <button
            type="button"
            onClick={() => setPanel("assist", { open: !layout.assist.open })}
            title="Draw a screen from a description, or straight from the tag table."
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${
              layout.assist.open
                ? "border-teal-500 bg-teal-50 text-teal-800"
                : "border-ink-200 bg-white text-ink-700 hover:border-ink-400"
            }`}
          >
            <Sparkles className="h-3 w-3" />
            Assist
          </button>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12.5px] text-ink-700 transition-colors hover:border-ink-400"
          >
            Setup
          </button>
          <button
            type="button"
            onClick={() => nudgeZoom(-1)}
            title="Zoom out"
            className="rounded-md border border-ink-200 bg-white px-1.5 py-1 text-[12px] text-ink-700 hover:border-ink-400"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => nudgeZoom(1)}
            title="Zoom in"
            className="rounded-md border border-ink-200 bg-white px-1.5 py-1 text-[12px] text-ink-700 hover:border-ink-400"
          >
            +
          </button>
          <select
            value={zoom === "fit" ? "fit" : String(zoom)}
            onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
            title="Zoom"
            className="rounded-md border border-ink-200 bg-white px-1.5 py-1 text-[11.5px] outline-none"
          >
            <option value="fit">Fit · {Math.round(fitScale * 100)}%</option>
            {STEPS.map((v) => (
              <option key={v} value={String(v)}>
                {Math.round(v * 100)}%
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={screen_.cycle}
            title={`${focusModeLabel(screen_.mode, screen_.canFullscreen)}. Press F, or Escape to step back.`}
            className={`rounded-md border px-2 py-1 transition-colors ${
              screen_.immersive
                ? "border-teal-500 bg-teal-50 text-teal-800"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-400"
            }`}
          >
            {screen_.immersive ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
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
        {panelsOn("left")}

        {/* centre: the panel, with properties docked under it */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={stageRef}
            onWheel={(e) => {
              // Only with a modifier: a plain wheel must still scroll the stage,
              // which is what somebody panning a large panel expects.
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              nudgeZoom(e.deltaY < 0 ? 1 : -1);
            }}
            className="min-h-0 flex-1 overflow-auto bg-ink-100/50 p-6"
          >
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
                onContextMenu={(e) => {
                  if (running) return;
                  e.preventDefault();
                  const box = canvasRef.current?.getBoundingClientRect();
                  setSelected(null);
                  setCtxMenu({
                    x: e.clientX,
                    y: e.clientY,
                    id: null,
                    px: box ? (e.clientX - box.left) / scaleRef.current : undefined,
                    py: box ? (e.clientY - box.top) / scaleRef.current : undefined,
                  });
                }}
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

                {/*
                  Faceplate instances are drawn expanded and moved as one.
                  The parts come out locked, so the drag handle below still
                  belongs to the instance and dragging it moves the whole
                  thing, which is the behaviour anybody who has used a
                  template in another package expects.
                */}
                {expandedParts.map((w) => (
                  <div key={w.id} style={{ pointerEvents: running ? undefined : "none" }}>
                    <WidgetView
                      widget={w}
                      ctx={ctx}
                      live={running}
                      role={doc.role ?? "engineer"}
                      defaultStyle={doc.symbolStyle ?? "schematic"}
                      data={liveData(w)}
                      onPress={() => fire(w.onPress)}
                      onRelease={() => fire(w.onRelease)}
                    />
                  </div>
                ))}

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
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelected(w.id);
                            setCtxMenu({ x: e.clientX, y: e.clientY, id: w.id });
                          }}
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
                        {/* An expanded instance is already drawn above; what is
                            left here is its selection box and handles. */}
                        {!(w.kind === "faceplate" && expandedIds.has(w.id)) && (
                          <WidgetView
                            widget={w}
                            ctx={ctx}
                            live={running}
                            role={doc.role ?? "engineer"}
                            defaultStyle={doc.symbolStyle ?? "schematic"}
                            data={liveData(w)}
                            onPress={() => fire(w.onPress)}
                            onRelease={() => fire(w.onRelease)}
                          />
                        )}
                      </div>
                      {!running && selected === w.id && (
                        <>
                          {HANDLES.map((h) => (
                            <div
                              key={h}
                              onPointerDown={(e) => startDrag(e, w, h)}
                              style={{
                                position: "absolute",
                                left:
                                  w.rect.x +
                                  (h.includes("w")
                                    ? -4
                                    : h.includes("e")
                                      ? w.rect.w - 4
                                      : w.rect.w / 2 - 4),
                                top:
                                  w.rect.y +
                                  (h.includes("n")
                                    ? -4
                                    : h.includes("s")
                                      ? w.rect.h - 4
                                      : w.rect.h / 2 - 4),
                                width: 8,
                                height: 8,
                                background: "#fff",
                                border: "1.5px solid #3FBFB5",
                                zIndex: 4,
                                cursor: `${h}-resize`,
                              }}
                            />
                          ))}
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
                        </>
                      )}
                    </div>
                  ))}

                {running && (
                  <AlarmPopup
                    alarms={popped.map((r) => ({
                      id: r.def.id,
                      message: r.def.message,
                      priority: r.def.priority,
                      state: r.runtime.state,
                      needsAck: needsAck(r.runtime.state),
                      raisedAt: r.runtime.raisedAt,
                      response: r.def.response,
                    }))}
                    width={screen.size.width}
                    // Cleared under the topmost banner on this screen, so the
                    // dialog never covers the one thing that must stay visible.
                    bannerInset={Math.max(
                      0,
                      ...screen.widgets
                        .filter((x) => x.kind === "alarmBanner")
                        .map((x) => x.rect.y + x.rect.h),
                    )}
                    onAck={ackOne}
                    onClose={dismiss}
                  />
                )}
              </div>
            </div>
          </div>

          {panelsOn("bottom")}
        </div>

        {panelsOn("right")}
      </div>

      {/*
        The assistant, at the editor root rather than inside the column.

        It carries its own frame now: docked to the bottom by default, and
        draggable anywhere from its header. A panel welded into the layout is in
        the way exactly when the work is underneath it, which on a mimic is most
        of the time.
      */}
      {layout.assist.open && (
        <HmiAi
          // Keyed to the application, so opening this one again brings its own
          // conversation back rather than the last one you had anywhere.
          memoryKey={`hmi:${id}`}
          context={genContext}
          onGenerate={onGenerate}
          onApply={applyGenerated}
          onUndo={doUndo}
          models={onGenerate ? models : null}
          disabledReason={
            onGenerate
              ? generateDisabledReason
              : "Drawing a screen from a description needs a provider key, which belongs to an account. Sign up and connect one in Settings."
          }
        />
      )}

      <input
        ref={docRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importDoc(f);
          e.target.value = "";
        }}
      />

      <input
        ref={svgRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importSvg(f);
          e.target.value = "";
        }}
      />

      {importNote && (
        <p className="flex shrink-0 items-center gap-3 border-t border-ink-100 bg-ink-50/60 px-3 py-1 text-[12px] text-ink-600">
          {importNote}
          <button
            type="button"
            onClick={() => setImportNote(null)}
            className="ml-auto text-ink-400 hover:text-ink-900"
          >
            Dismiss
          </button>
        </p>
      )}

      {ctxMenu && !running && (
        <ContextMenu
          at={ctxMenu}
          hasSelection={Boolean(ctxMenu.id)}
          canPaste={Boolean(clipboard.current)}
          onClose={() => setCtxMenu(null)}
          items={
            ctxMenu.id
              ? [
                  {
                    label: "Cut",
                    shortcut: "Cmd X",
                    onSelect: () => {
                      copySelected();
                      deleteSelected();
                    },
                  },
                  { label: "Copy", shortcut: "Cmd C", onSelect: copySelected },
                  { label: "Duplicate", shortcut: "Cmd D", onSelect: duplicateSelected },
                  { label: "Delete", shortcut: "Del", onSelect: deleteSelected },
                  { sep: true },
                  { label: "Bring to front", onSelect: () => reorder("front") },
                  { label: "Send to back", onSelect: () => reorder("back") },
                  { sep: true },
                  {
                    label: layout.properties.open ? "Properties" : "Show properties",
                    onSelect: () => setPanel("properties", { open: true }),
                  },
                ]
              : [
                  {
                    label: "Paste",
                    shortcut: "Cmd V",
                    disabled: !clipboard.current,
                    onSelect: () =>
                      paste(
                        ctxMenu.px !== undefined && ctxMenu.py !== undefined
                          ? { x: ctxMenu.px, y: ctxMenu.py }
                          : undefined,
                      ),
                  },
                  { sep: true },
                  { label: "Screen settings…", onSelect: () => openSetup("screen") },
                  { label: "Fit to window", onSelect: () => setZoom("fit") },
                ]
          }
        />
      )}

      <DockStrip
        dock={hmiDock}
        layout={layout}
        onOpen={(id) => setPanel(id, { open: true })}
        onReset={() => {
          setLayout(DEFAULT_LAYOUT);
          saveLayout(DEFAULT_LAYOUT);
        }}
      />

      {historyOpen && (
        <HistoryPanel
          trends={doc.trends}
          historians={rt.historians}
          onClear={rt.clearRecording}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {setupOpen && (
        <HmiSetup
          doc={doc}
          plcTags={liveTags}
          screenId={screenId}
          initialTab={setupTab}
          onChange={update}
          onClose={() => setSetupOpen(false)}
        />
      )}
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
  { kind: "pipe", label: "Pipe" },
  { kind: "text", label: "Text" },
  { kind: "numeric", label: "Numeric" },
  { kind: "lamp", label: "Lamp" },
  { kind: "bar", label: "Bar" },
  { kind: "tank", label: "Tank level" },
  { kind: "thermometer", label: "Thermometer" },
  { kind: "gauge", label: "Gauge" },
  { kind: "statusStack", label: "Tower light" },
  { kind: "multistate", label: "Multi-state" },
  { kind: "steps", label: "Step sequence" },
  { kind: "button", label: "Button" },
  { kind: "toggle", label: "Toggle" },
  { kind: "checkbox", label: "Checkbox" },
  { kind: "radioGroup", label: "Radio group" },
  { kind: "numericEntry", label: "Numeric entry" },
  { kind: "textEntry", label: "Text entry" },
  { kind: "slider", label: "Slider" },
  { kind: "trend", label: "Trend" },
  { kind: "xyChart", label: "XY chart" },
  { kind: "table", label: "Value table" },
  { kind: "clock", label: "Clock" },
  { kind: "faceplate", label: "Faceplate" },
  { kind: "alarmSummary", label: "Alarm list" },
  { kind: "alarmBanner", label: "Alarm banner" },
  { kind: "alarmBadge", label: "Alarm count" },
  { kind: "alarmMarquee", label: "Alarm ticker" },
];

/**
 * The tools pane: objects, then the symbol library by category.
 *
 * Search sits at the top because eighty-seven symbols across twelve categories
 * is past the point where scanning is faster than typing. When the running
 * screen has alarms, the summary comes first: what is wrong outranks what you
 * might draw next.
 */
function Tools({
  onAdd,
  running,
  outstanding,
  onAck,
}: {
  onAdd: (k: WidgetKind, symbol?: string) => void;
  running: boolean;
  outstanding: { def: AlarmDef; runtime: AlarmRuntime }[];
  onAck: () => void;
}) {
  const [q, setQ] = useState("");
  const hits = q.trim() ? searchSymbols(q) : null;
  /**
   * Which categories are open.
   *
   * Twelve categories at once is a wall. Objects and the first two are open to
   * start, and the choice is remembered, because somebody drawing a conveyor
   * line does not want to reopen Conveying every time they come back.
   */
  /**
   * Which categories are open.
   *
   * Twelve at once is a wall, so a few start open and the choice is
   * remembered. Restored in an effect rather than seeded from localStorage in
   * the initialiser: storage does not exist while the server renders, and
   * seeding from it makes the first client render disagree with the HTML,
   * which React reports as a hydration failure and then throws the tree away.
   */
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({
    Objects: true,
    Vessels: true,
    "Pumps and fans": true,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("ladx.hmi.tools.v1");
      if (raw) setOpenCats(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // A remembered preference is not worth an error in front of somebody.
    }
  }, []);

  const toggleCat = (c: string) =>
    setOpenCats((o) => {
      const next = { ...o, [c]: !o[c] };
      try {
        window.localStorage.setItem("ladx.hmi.tools.v1", JSON.stringify(next));
      } catch {
        // as above
      }
      return next;
    });

  return (
    <div className="space-y-3 p-2">
      {running && (
        <div className="rounded-sm border border-ink-200 p-1.5">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">
              Alarms
            </span>
            <button
              type="button"
              onClick={onAck}
              className="ml-auto text-[11px] text-ink-600 hover:text-teal-700"
            >
              Ack all
            </button>
          </div>
          {outstanding.length === 0 ? (
            <p className="text-[11px] text-ink-400">Nothing outstanding.</p>
          ) : (
            <ul className="space-y-0.5">
              {outstanding.slice(0, 6).map((r) => (
                <li
                  key={r.def.id}
                  className={`truncate rounded-sm px-1 py-0.5 text-[11px] ${
                    needsAck(r.runtime.state) ? "bg-[#B4531A]/12 text-ink-900" : "text-ink-500"
                  }`}
                >
                  {r.def.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search symbols"
        className="w-full rounded-sm border border-ink-200 px-2 py-1 text-[12px] outline-none placeholder:text-ink-300 focus:border-ink-500"
      />

      <div className="flex items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={() =>
            setOpenCats(Object.fromEntries(["Objects", ...SYMBOL_CATEGORIES].map((c) => [c, true])))
          }
          className="text-ink-500 hover:text-teal-700"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setOpenCats({})}
          className="text-ink-500 hover:text-teal-700"
        >
          Collapse all
        </button>
      </div>

      {hits ? (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
            {hits.length} match{hits.length === 1 ? "" : "es"}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {hits.map((sym) => (
              <button
                key={sym.id}
                type="button"
                onClick={() => onAdd("symbol", sym.id)}
                title={`${sym.name} · ${sym.category}`}
                className="truncate rounded-sm border border-ink-200 bg-white px-1.5 py-1 text-left text-[11.5px] text-ink-700 transition-colors hover:border-teal-500"
              >
                {sym.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <Category
            name="Objects"
            count={BASIC.length}
            open={openCats.Objects !== false}
            onToggle={() => toggleCat("Objects")}
          >
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
          </Category>

          {SYMBOL_CATEGORIES.map((cat) => {
            const items = symbolsIn(cat);
            if (items.length === 0) return null;
            return (
              <Category
                key={cat}
                name={cat}
                count={items.length}
                open={Boolean(openCats[cat])}
                onToggle={() => toggleCat(cat)}
              >
                {items.map((sym) => (
                  <button
                    key={sym.id}
                    type="button"
                    onClick={() => onAdd("symbol", sym.id)}
                    title={sym.name}
                    className="truncate rounded-sm border border-ink-200 bg-white px-1.5 py-1 text-left text-[11.5px] text-ink-700 transition-colors hover:border-teal-500"
                  >
                    {sym.name}
                  </button>
                ))}
              </Category>
            );
          })}
        </>
      )}
    </div>
  );
}

/** One collapsible group in the tools pane. */
function Category({
  name,
  count,
  open,
  onToggle,
  children,
}: {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1 py-0.5 text-left"
      >
        <span className="w-3 shrink-0 font-mono text-[9px] text-ink-400">{open ? "▾" : "▸"}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
          {name}
        </span>
        <span className="ml-auto font-mono text-[9.5px] tabular-nums text-ink-300">{count}</span>
      </button>
      {open && <div className="mb-1 grid grid-cols-2 gap-1">{children}</div>}
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
