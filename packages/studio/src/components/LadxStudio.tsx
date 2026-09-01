"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronLeft,
  Compass,
  ExternalLink,
  GitBranch,
  Hammer,
  HelpCircle,
  Loader2,
  MonitorCog,
  Play,
  Radio,
  RotateCcw,
  Square,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { areaFor, assignMissingAddresses, nextFreeAddress, parseAddress } from "../lib/addressing";
import {
  type Clip,
  type DragPayload,
  clearDrag,
  cloneElement,
  cloneRung,
  getClipboard,
  setClipboard,
  setDrag,
  takeDrag,
} from "../lib/drag";
import { resetTags, scan, seedPresets, validate } from "../lib/engine";
import { type LogMessage, type MessageLevel, pushMessage } from "../lib/messages";
import {
  DEFAULT_LAYOUT,
  type Layout,
  PANELS,
  type PanelId,
  loadLayout,
  saveLayout,
} from "../lib/panels";
import { buildExport, parseImport } from "../lib/portable";
import { emptyProgram } from "../lib/starters";
import { type StudioStorage, localStorageStorage } from "../lib/storage";
import { brand, ink, line, radius, state, surface } from "../lib/theme";
import { tourSeen } from "../lib/tour";
import {
  type ElNode,
  type LadderNode,
  type Path,
  addLeg,
  branchSpan,
  dedupeRungIds,
  elNode,
  everyElement,
  extendBranch,
  insertAt,
  moveNode,
  nodeAt,
  pathOfId,
  removeById,
  rungLogic,
  series,
  shrinkBranch,
  unwrapBranch,
  updateElementById,
} from "../lib/tree";
import {
  DEVICE_LABEL,
  type Element,
  type ElementType,
  INPUT_DEVICES,
  INSTRUCTIONS,
  INSTRUCTION_BY_TYPE,
  type LadxProgram,
  OUTPUT_DEVICES,
  type Rung,
  type Tag,
  defaultDevice,
  programRoutines,
} from "../lib/types";
import ContextMenu, { type MenuItem, type MenuState } from "./ContextMenu";
import FloatingWindow from "./FloatingWindow";
import GoOnlineOverlay from "./GoOnlineOverlay";
import HelpDialog from "./HelpDialog";
import InstructionBar, { type BarAction } from "./InstructionBar";
import LadxLogo from "./LadxLogo";
import MenuBar, { type Menu } from "./MenuBar";
import MessageLog from "./MessageLog";
import Panel, { Resizer } from "./Panel";
import PanelDock from "./PanelDock";
import Popover from "./Popover";
import ProjectTree from "./ProjectTree";
import RungView from "./RungView";
import SimPanel from "./SimPanel";
import TagTable from "./TagTable";
import Tip from "./Tip";
import Tour from "./Tour";
import TransferOverlay, { type TransferKind } from "./TransferOverlay";
import css from "./ladx.module.css";

/**
 * LADX Mini, the studio.
 *
 * Editing and running are the same screen on purpose. In real PLC work you
 * change a rung, go online and watch it; splitting that into two modes is what
 * makes simulators feel like homework rather than practice.
 *
 * The scan loop runs on an interval and measures the real elapsed time between
 * ticks, so a 10-second timer takes 10 seconds even when the browser throttles
 * a background tab. State lives in a ref during the loop, putting every scan
 * through React state at 10 Hz would re-render the whole ladder continuously.
 */

const LIVE = "#35B6BB";
const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Take a stored program's ids out of circulation, repairing any that clash.
 *
 * Two jobs, one walk, because they are the same problem seen from either end.
 * The counter restarts at zero on every page load, so ids handed out after
 * opening a saved project are the ones handed out while writing it; reserving
 * stops that happening again. Programs written before the reservation existed
 * already carry duplicates, so those are renumbered here rather than left to
 * misbehave: the engine keys its per-instruction edge memory on the id, and a
 * shared id makes two instructions share one one-shot.
 */
function reserveAndRepair(program: LadxProgram): LadxProgram {
  const seen = new Set<string>();
  const routines = programRoutines(program).map((routine) => ({
    ...routine,
    rungs: routine.rungs.map((rung) => dedupeRungIds(rung, seen)),
  }));

  // programRoutines migrates a legacy flat program into a single Main, so the
  // repaired routines are written back the same way round.
  const [main] = routines;
  return {
    ...program,
    routines,
    rungs: main ? main.rungs : (program.rungs ?? []),
  };
}

type Exercise = {
  id: string;
  title: string;
  brief: string;
  marks: number;
  passPercent: number;
};

type Props = {
  projectId: string;
  exercises?: Exercise[];
  /**
   * Where this project is loaded from and saved to. Defaults to the browser,
   * so Studio runs with no backend at all; the web app passes an HTTP-backed
   * one and the desktop app a filesystem-backed one. See lib/storage.ts.
   */
  storage?: StudioStorage;
  /** Leaving the studio. Optional: a standalone canvas has nowhere to go. */
  onBack?: () => void;
  /**
   * A panel docked under the canvas, rendered by the host.
   *
   * A render prop rather than a component, because the thing that goes here is
   * the web app's AI box and this package must not learn about the web app's
   * API routes. What it needs is the program and a way to hand one back, which
   * is exactly what it is given.
   *
   * `load` goes through the same mutate the editor's own edits use, so a
   * generated program lands on the undo stack and History takes it straight
   * back out. That is the whole safety property: nothing a model writes is
   * harder to remove than anything a person typed.
   */
  bottomDock?: (ctx: {
    program: LadxProgram | null;
    load: (next: LadxProgram) => void;
  }) => React.ReactNode;
  /**
   * The other tools that work on this same program.
   *
   * Shown as a Tools menu and as one button on the toolbar. Hrefs rather than
   * components, because this package must not learn the host's routes; the
   * host knows where its own HMI editor is mounted and this does not.
   *
   * Every one of them saves before it navigates. The HMI binds to this
   * program's tag table by name, so arriving there before the autosave
   * debounce has fired shows a tag table missing the tag you added thirty
   * seconds ago, with nothing on screen to say why.
   */
  crossLinks?: { label: string; href: string; hint?: string }[];
  /**
   * How this host leaves for another tool.
   *
   * Injected, because the two surfaces navigate differently and only the host
   * knows which it is. The default is a full page load, which is right on the
   * web: the destination reads this program back from the server, so a fresh
   * document is exactly what is wanted.
   *
   * It is wrong on a static export. There every route is a file, an
   * extensionless path matches nothing, and a full load of "/hmi" lands on a
   * 404 with no shell around it. The sidebar is the only navigation the
   * desktop has, so that page is a dead end: the app looks like it has lost
   * its furniture and there is no way back out. A host that routes client side
   * passes its router here instead.
   */
  navigate?: (href: string) => void;
  /**
   * Looking the open program over, when the surface can.
   *
   * Injected, because the analysis runs in Rust and the two surfaces reach it
   * differently. Absent means this surface cannot, or the capability is off,
   * and no menu item appears rather than one that explains why it does nothing.
   *
   * Findings go to the output window rather than a panel of their own. That is
   * where an engineer already looks when something is not behaving, and it
   * keeps what LADX found beside what the compiler and the simulator said
   * instead of in a third place.
   */
  analyse?: {
    label: string;
    run: (program: LadxProgram) => Promise<AnalysisOutcome>;
    /**
     * Working backwards from one tag to what would have to be true.
     *
     * Offered on the element the person right-clicked, because that is when
     * they are asking: they are looking at a coil that is not coming on. A
     * menu somewhere else would be the same answer to a question nobody is
     * holding in their head at the time.
     */
    why?: (program: LadxProgram, tag: string) => Promise<TraceOutcome>;
  };
};

/**
 * What an analysis found, in terms this component can show.
 *
 * Deliberately not the IR's own report type: this package should not have to
 * know how the analysis is modelled, only how to say what it found.
 */
/** What a trace found, in terms this component can show. */
export interface TraceOutcome {
  /** Said instead of the steps when there is nothing to trace. */
  note?: string | null;
  lines: string[];
}

export interface AnalysisOutcome {
  findings: {
    severity: "critical" | "warning" | "suggestion" | "information";
    title: string;
    detail: string;
    /** Rungs or tags, already written for a person: "Main/r14". */
    at: string[];
  }[];
  /** Anything the analysis did not look at, so silence is not read as a pass. */
  notChecked: string[];
}

export default function LadxStudio({
  projectId,
  exercises = [],
  storage,
  onBack,
  bottomDock,
  crossLinks = [],
  navigate,
  analyse,
}: Props) {
  // Held in a ref, not recreated per render: the default builds a new object
  // each call, and a changing storage identity would re-trigger the load effect
  // on every render.
  const storageRef = useRef<StudioStorage>(storage ?? localStorageStorage());
  if (storage && storageRef.current !== storage) storageRef.current = storage;
  const [submitTo, setSubmitTo] = useState<Exercise | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [program, setProgram] = useState<LadxProgram | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [power, setPower] = useState<Record<string, boolean>>({});
  const [rungPower, setRungPower] = useState<Record<string, boolean>>({});
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const [scanCount, setScanCount] = useState(0);

  const [picker, setPicker] = useState<{ rungId: string; where: number | "output" } | null>(null);
  const [editing, setEditing] = useState<Element | null>(null);
  // Where the instruction bar inserts. Placing a contact needs a "here", and
  // the last thing you touched is the only sensible one.
  const [cursor, setCursor] = useState<{ rungId: string; where: number | "output" } | null>(null);
  /*
   * The selection is a list, and `selectedId` is the last thing added to it.
   *
   * Deriving the single value keeps every existing read working, the editor,
   * the branch tools, the toolbar all want "the one thing you are working on"
   *, while delete, copy and cut can act on the whole set. Ctrl or Cmd-click
   * adds and removes; a plain click starts again.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds[selectedIds.length - 1] ?? null;

  /** Kept call-compatible with the single-selection setter it replaced. */
  const setSelectedId = useCallback(
    (next: string | null | ((cur: string | null) => string | null)) => {
      setSelectedIds((cur) => {
        const one = cur[cur.length - 1] ?? null;
        const value = typeof next === "function" ? next(one) : next;
        return value === null ? [] : [value];
      });
    },
    [],
  );

  /** Ctrl or Cmd-click: add to the selection, or take it back out. */
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);
  /** Mirrors the module clipboard so the menus can grey themselves out. */
  const [clipLabel, setClipLabel] = useState<string | null>(null);
  /**
   * A one-line explanation for a gesture that was refused. A drag that simply
   * does nothing is indistinguishable from a broken drag, which is the single
   * most common thing reported about editors like this.
   */
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [transfer, setTransfer] = useState<TransferKind>(null);
  /** The going-online sequence, between pressing Simulate and the first scan. */
  const [goingOnline, setGoingOnline] = useState(false);
  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);
  const [compile, setCompile] = useState<{ at: number; problems: string[] } | null>(null);
  // The simulator lives in its own window so the ladder stays fully visible
  // while the panel is driven, watching the rung light up IS the lesson.
  /**
   * The simulator is a dockable panel like everything else now, so it closes
   * to the dock and comes back from the View menu the same way the others do.
   * simOpen reads through to the layout rather than being a second source of
   * truth that could disagree with it.
   */
  /**
   * What is actually IN the virtual controller.
   *
   * A PLC runs what was downloaded to it, not what is on the screen. Modelling
   * that is not pedantry: "I changed the rung and nothing happened" is the
   * commissioning mistake every engineer makes once, and it is far better made
   * here than on a live machine.
   */
  const [plcProgram, setPlcProgram] = useState<LadxProgram | null>(null);

  /**
   * Confirmations and prompts, in-app.
   *
   * window.confirm, window.prompt and window.alert all DROP THE PAGE OUT OF
   * FULLSCREEN in Chrome, the browser will not paint its own dialog over a
   * fullscreen element, so it leaves fullscreen to show it. That is why
   * deleting a network kicked the editor back to a small window. Every one of
   * them is now a dialog we render ourselves.
   */
  const [ask, setAsk] = useState<{
    title: string;
    body?: string;
    /** Present for a prompt; absent for a plain confirmation. */
    input?: { label: string; value: string };
    confirmLabel: string;
    danger?: boolean;
    onConfirm: (value: string) => void;
  } | null>(null);

  /**
   * A short-lived status line under the toolbar.
   *
   * Compile results used to appear only in the panel at the foot of the page,
   * which in fullscreen is below the fold, so a student pressed Compile and
   * saw nothing at all. Download said nothing either. Feedback now appears
   * where the button that caused it is.
   */
  const [flash, setFlash] = useState<{ tone: "ok" | "warn" | "info"; text: string } | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);
  const plcRef = useRef<LadxProgram | null>(null);

  /**
   * The insertion point: the gap a clicked instruction lands in. Clicking the
   * wire between two contacts sets it, which is what "select the rung in
   * between the contacts" asks for, without it the only place a click could
   * add an instruction was the end of the chain.
   */
  const [caret, setCaret] = useState<{
    rungId: string;
    seriesId: string;
    index: number;
    path: Path;
  } | null>(null);

  /** First end of a branch being drawn by clicking. */
  const [branchHint, setBranchHint] = useState<string | null>(null);
  /** Networks can be selected as a whole, collapsed, renamed and deleted. */
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null);
  /** Which page of the program is on screen. routines[0] is Main. */
  const [activeRoutineId, setActiveRoutineId] = useState<string | null>(null);

  /**
   * The routines that are open, as tabs.
   *
   * A program of any size is several routines, and following a JSR meant
   * losing the page you came from, click Conveyor in the tree, read it,
   * click Main again, and hunt for where you were. Tabs keep both open, which
   * is how anybody reads code that calls out to somewhere else.
   *
   * Main is never closed: it is the routine the controller executes, and a
   * program with nothing open is a blank screen with no obvious way back.
   */
  const [openRoutineIds, setOpenRoutineIds] = useState<string[]>([]);

  /**
   * Routines in their own window.
   *
   * A popped-out routine leaves the tab strip, the same way the simulator
   * leaves the panel column, one routine in one place, so there is never a
   * question about which copy an edit went to. Two views of the same rungs is
   * how you end up typing into the wrong one.
   *
   * Editing a popped-out routine is safe because every mutation now resolves
   * its target from the rung or instruction being changed rather than from
   * whichever routine happens to be on screen. See mutateRungs.
   */
  const [poppedRoutineIds, setPoppedRoutineIds] = useState<string[]>([]);
  /** Read inside popOutRoutine, which must not be rebuilt on every change. */
  const poppedRoutineIdsRef = useRef<string[]>([]);
  useEffect(() => {
    poppedRoutineIdsRef.current = poppedRoutineIds;
  }, [poppedRoutineIds]);

  const popOutRoutine = useCallback((id: string) => {
    setPoppedRoutineIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    setOpenRoutineIds((cur) => cur.filter((x) => x !== id));
    /*
     * Hand the canvas back to something else.
     *
     * Popping a routine out only removes it from the tab strip; the canvas
     * draws whatever is ACTIVE, so without this the routine appeared in its
     * new window and stayed in the canvas behind it, two views of one set of
     * rungs, which is exactly the thing this is meant to avoid.
     */
    setActiveRoutineId((active) => {
      if (active !== id) return active;
      const other = routinesRef.current.find(
        (r) => r.id !== id && !poppedRoutineIdsRef.current.includes(r.id),
      );
      return other?.id ?? routinesRef.current[0]?.id ?? null;
    });
  }, []);

  const dockRoutine = useCallback((id: string) => {
    setPoppedRoutineIds((cur) => cur.filter((x) => x !== id));
    setOpenRoutineIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    setActiveRoutineId(id);
  }, []);

  const openRoutine = useCallback((id: string) => {
    setOpenRoutineIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    setActiveRoutineId(id);
    setTreeSel("routine");
    setSelectedId(null);
    setSelectedRungId(null);
    setCaret(null);
  }, []);

  const closeRoutineTab = useCallback((id: string) => {
    setOpenRoutineIds((cur) => {
      const next = cur.filter((x) => x !== id);
      // Never leave nothing open, fall back to whatever is beside it.
      if (next.length === 0) return cur;
      setActiveRoutineId((active) => {
        if (active !== id) return active;
        const was = cur.indexOf(id);
        return next[Math.min(was, next.length - 1)] ?? active;
      });
      return next;
    });
  }, []);
  const [treeSel, setTreeSel] = useState<"routine" | "tags" | "sim">("routine");

  /* ── The window layout ─────────────────────────────────────────────
     Which panels are open and how big. Loaded in an effect rather than in
     the initialiser because localStorage does not exist during the server
     render, and a layout that differs between the two makes React throw the
     markup away and rebuild it. */
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  /**
   * Persist where the change is made, not in an effect watching the layout.
   *
   * An effect keyed on `layout` also fires on mount, with the defaults still
   * in state, because the stored layout is read back in a different effect.
   * That writes the defaults over whatever the person had arranged, so every
   * refresh silently reopened every panel they had closed. Saving at the point
   * of change has no such window: the only writes are ones somebody asked for.
   */
  const applyLayout = useCallback((fn: (l: Layout) => Layout) => {
    setLayout((cur) => {
      const next = fn(cur);
      saveLayout(next);
      return next;
    });
  }, []);

  const setPanelOpen = useCallback(
    (id: PanelId, open: boolean) => {
      applyLayout((l) => ({ ...l, [id]: { ...l[id], open } }));
    },
    [applyLayout],
  );
  const setPanelSize = useCallback(
    (id: PanelId, size: number) => {
      applyLayout((l) => ({ ...l, [id]: { ...l[id], size } }));
    },
    [applyLayout],
  );
  const resetLayout = useCallback(() => applyLayout(() => ({ ...DEFAULT_LAYOUT })), [applyLayout]);

  const simOpen = layout.sim.open;
  const setSimOpen = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) =>
      applyLayout((l) => ({
        ...l,
        sim: { ...l.sim, open: typeof v === "function" ? v(l.sim.open) : v },
      })),
    [applyLayout],
  );

  /* ── The message log ───────────────────────────────────────────────
     Everything the editor and the controller report, kept with a time so the
     message that explains the current confusion is still there. */
  const [log, setLog] = useState<LogMessage[]>([]);
  const say = useCallback((level: MessageLevel, source: string, text: string) => {
    // Stamped outside the updater: React may run an updater more than once,
    // and the log should record when the thing happened, not when React
    // happened to recompute it.
    const at = Date.now();
    setLog((l) => pushMessage(l, level, source, text, at));
  }, []);

  /** The scan loop logs through this, so logging cannot restart the loop. */
  const sayRef = useRef(say);
  useEffect(() => {
    sayRef.current = say;
  }, [say]);

  /** The manual, open at a topic. Null when closed. */
  const [helpTopic, setHelpTopic] = useState<string | null>(null);
  const openHelp = useCallback((topic: string) => setHelpTopic(topic), []);
  const [tourOpen, setTourOpen] = useState(false);
  /** Never taken the tour? The button gets a dot. It does not start itself: an editor that hijacks your first click is an editor you resent. */
  /**
   * Ladder zoom.
   *
   * A rung with a branch and four contacts is wider than a narrow canvas, and
   * a long program is taller than the screen. Zooming out to see the shape of
   * a routine and back in to edit it is how anybody actually works on one.
   * Ctrl+scroll and Ctrl+plus/minus, as everywhere else.
   */
  /**
   * Make the workspace fill whatever height is actually left.
   *
   * It was a flat 80vh, which is a guess: on a 900px window that left 90px of
   * dead space under the dock, so the strip the panels dock into floated in
   * the middle of the page instead of sitting on the floor of the editor.
   * 80vh is also wrong in the other direction inside the smaller floating
   * window, where it overflows.
   *
   * Measuring the element's own top and taking the rest of the viewport works
   * in both, and re-measures when the window changes or the toolbar wraps to
   * a second row.
   */
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [workspaceH, setWorkspaceH] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = workspaceRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      // 12px so the workspace stops just short of the edge rather than
      // butting against it.
      setWorkspaceH(Math.max(460, Math.round(window.innerHeight - top - 12)));
    };

    /*
     * Keyed on `program`, not [].
     *
     * The studio renders a loading state until the project arrives, so on
     * mount the ref is null, measure() returns having done nothing, and the
     * effect never runs again, the workspace kept the 80vh fallback and the
     * dock stayed 90px short of the bottom. Re-running once the program is
     * in place is when the element actually exists.
     */
    measure();
    window.addEventListener("resize", measure);

    // The toolbar wrapping to a second row moves the workspace down, and no
    // resize event fires for that.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    const parent = workspaceRef.current?.parentElement;
    if (ro && parent) ro.observe(parent);

    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [program]);

  const [zoom, setZoom] = useState(1);
  const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.15, 1.35, 1.6, 2];
  const zoomBy = useCallback((dir: 1 | -1) => {
    setZoom((z) => {
      const i = ZOOMS.indexOf(z);
      return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 4 : i) + dir))] ?? z;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tourOffered, setTourOffered] = useState(false);
  useEffect(() => {
    setTourOffered(!tourSeen());
  }, []);

  /**
   * The tour points at panels, and panels can be closed. Reopen whatever the
   * next step needs, so a step never highlights a gap where a panel used to
   * be. The layout the person had is restored when the tour ends: a tour
   * that quietly rearranges the workspace is a tour with a side effect.
   */
  const layoutBeforeTour = useRef<Layout | null>(null);
  const ensureVisibleForTour = useCallback((anchorName: string) => {
    const id = anchorName.startsWith("panel-") ? (anchorName.slice(6) as PanelId) : null;
    if (!id) return;
    setLayout((l) => (l[id]?.open ? l : { ...l, [id]: { ...l[id], open: true } }));
  }, []);

  const startTour = useCallback(() => {
    layoutBeforeTour.current = layout;
    setTourOpen(true);
  }, [layout]);

  const endTour = useCallback(() => {
    setTourOpen(false);
    if (layoutBeforeTour.current) {
      const before = layoutBeforeTour.current;
      layoutBeforeTour.current = null;
      applyLayout(() => before);
    }
  }, [applyLayout]);
  /**
   * The simulator can be a docked panel or its own window.
   *
   * Both, because they answer different needs: docked keeps it beside the
   * ladder on one screen, floating lets it be dragged onto a second monitor
   * or parked over the tag table while a rung is driven. It was floating-only,
   * then docked-only; neither alone was right.
   */
  const [simFloating, setSimFloating] = useState(false);

  /** Tag table in its own window rather than docked in the project column. */
  const [tagsFloating, setTagsFloating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [branchFrom, setBranchFrom] = useState<{
    rungId: string;
    seriesId: string;
    index: number;
  } | null>(null);

  // The loop reads and writes these directly, React state at 10 Hz would
  // re-render the entire ladder on every scan.
  const tagsRef = useRef<Tag[]>([]);
  const edgesRef = useRef<Record<string, boolean>>({});
  const programRef = useRef<LadxProgram | null>(null);
  const lastTick = useRef<number>(0);

  // ── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await storageRef.current.load(projectId).catch(() => null);
        if (!stored) {
          // Nothing under that id. With a server that means a stale bookmark or
          // a deleted project, and going back to the list beats stranding the
          // student on a dead screen. With browser storage it just means this
          // id is new, so start a blank project instead of reporting a failure.
          if (onBack) {
            setError("That project could not be opened. It may have been deleted.");
            setTimeout(onBack, 1200);
            return;
          }
          const blank = emptyProgram();
          setProgram(blank);
          setName(blank.name);
          programRef.current = blank;
          const seeded = seedPresets(blank, resetTags(blank.tags ?? []));
          setTags(seeded);
          tagsRef.current = seeded;
          return;
        }
        /*
         * Give every tag an address on the way in.
         *
         * Projects made before addressing existed have none, and a tag table
         * with a blank address column teaches nothing. Assigned once here,
         * stored on the next save, and editable afterwards, the student can
         * always move a signal to a different terminal.
         */
        const raw: LadxProgram = stored.program;
        const p: LadxProgram = { ...raw, tags: assignMissingAddresses(raw.tags ?? []) };
        const p2 = reserveAndRepair(p);
        setProgram(p2);
        setName(stored.name);
        programRef.current = p2;
        // Seed timer/counter presets from the instructions before the first
        // scan: after this the tag owns the preset, so a MOV into .PRE sticks.
        const fresh = seedPresets(p2, resetTags(p2.tags ?? []));
        setTags(fresh);
        tagsRef.current = fresh;
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    programRef.current = program;
  }, [program]);

  // ── The scan loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!running || !program) return;
    lastTick.current = Date.now();

    const id = setInterval(() => {
      // The controller solves what was DOWNLOADED to it, not what is on the
      // screen. Editing a rung and seeing nothing change until you download
      // again is the point, not a bug.
      const p = plcRef.current ?? programRef.current;
      if (!p) return;
      const now = Date.now();
      const dt = Math.min(1000, now - lastTick.current);
      lastTick.current = now;

      const result = scan(p, tagsRef.current, edgesRef.current, dt);
      tagsRef.current = result.tags;
      edgesRef.current = result.edges;

      setTags(result.tags);
      setPower(result.elementPower);
      setRungPower(result.rungPower);
      setRuntimeErrors(result.errors);
      // Faults go to the log too, so they survive the scan that clears them.
      // A divide-by-zero that appears and disappears in 100ms is otherwise
      // something the student sees flicker and cannot read. pushMessage
      // collapses the repeats into a count, so a fault raised on every scan
      // is one row, not six hundred.
      for (const e of result.errors) sayRef.current("error", "runtime", e);
      setScanCount((c) => c + 1);
    }, program.scanMs || 100);

    return () => clearInterval(id);
  }, [running, program]);

  // ── Actions ───────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!program) return;
    setSaving(true);
    setError(null);
    try {
      // Save the program with cold tag values, not whatever the sim left behind
      //, reopening a project should not restore a half-run machine.
      const toStore: LadxProgram = { ...program, name, tags: resetTags(program.tags) };
      try {
        await storageRef.current.save(projectId, { name, program: toStore });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
        return;
      }
      setSavedAt(Date.now());
      const note = storageRef.current.retentionNote;
      say("success", "save", note ? `Saved. ${note}` : "Saved.");
    } finally {
      setSaving(false);
    }
  }, [program, name, projectId, say]);

  /* ── Export and import ─────────────────────────────────────────────
     The way out of the three-month retention. An exported file belongs to
     the student, does not expire, and opens on any account, which is the
     only honest thing to offer alongside a policy that deletes work. */

  const exportProject = useCallback(() => {
    if (!program) return;
    // Cold tag values, as with a save: an export taken mid-simulation should
    // not carry a half-run machine into whatever opens it next.
    const portable = buildExport({
      name,
      program: { ...program, name, tags: resetTags(program.tags) },
      exportedBy: undefined,
    });
    const blob = new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(name || "ladx-project").replace(/[^\w.-]+/g, "-")}.ladx.json`;
    a.click();
    URL.revokeObjectURL(url);
    say("success", "export", `Exported “${name}”. This file does not expire.`);
    setFlash({ tone: "ok", text: `Exported “${name}”. Keep the file, it does not expire.` });
  }, [program, name, say]);

  const importProject = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const raw = await file.text();
      const result = parseImport(raw);
      if (!result.ok) {
        // Say what is wrong with the file rather than "invalid": somebody who
        // picked the wrong file needs to know that is what happened.
        say("error", "import", result.error);
        setFlash({ tone: "warn", text: result.error });
        return;
      }
      setAsk({
        title: "Replace this project?",
        body: `“${result.name}” will replace everything currently in ${name}. Export the current project first if you want to keep it.`,
        confirmLabel: "Replace",
        danger: true,
        onConfirm: () => {
          mutate(() => result.program);
          setName(result.name);
          setSelectedId(null);
          setSelectedRungId(null);
          setCaret(null);
          setActiveRoutineId(null);
          say("success", "import", `Imported “${result.name}”.`);
          setFlash({ tone: "ok", text: `Imported “${result.name}”.` });
        },
      });
    };
    input.click();
  }, [name, mutate, say]);

  /*
   * Autosave.
   *
   * The home screen has always told students "your projects save
   * automatically to your account". Nothing ever called save() except Ctrl+S
   * and the File menu, so a refresh threw away everything since the last time
   * somebody thought to press it: and nobody presses save in an editor that
   * has promised not to need it.
   *
   * Debounced rather than saved on every keystroke: a rung is edited in
   * bursts, and a PATCH per character would be a request per character.
   *
   * Held off while the simulator is running. Saving mid-scan would store
   * whatever the sim had left in the tags, and reopening a project should not
   * restore a half-run machine.
   */
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  const programSignature = program
    ? JSON.stringify({
        r: programRoutines(program).map((x) => x.rungs),
        t: program.tags.map((t) => ({
          n: t.name,
          ty: t.type,
          d: t.device,
          i: t.isInput,
          o: t.isOutput,
        })),
        n: name,
      })
    : "";

  useEffect(() => {
    if (!program || loading) return;
    // The first signature after load is the saved state, not an edit.
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return;
    }
    setDirty(true);
    if (running) return;

    const t = setTimeout(() => {
      void save().then(() => setDirty(false));
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programSignature, running, loading]);

  /*
   * A last attempt on the way out, for the case the debounce has not fired.
   *
   * sendBeacon rather than fetch: the tab is closing, and a normal request is
   * cancelled with it. This is best-effort by nature, the debounce above is
   * what actually keeps the work.
   */
  useEffect(() => {
    function onLeave() {
      if (!dirty || !program) return;
      try {
        const body = JSON.stringify({
          name,
          program: { ...program, name, tags: resetTags(program.tags) },
        });
        navigator.sendBeacon?.(
          `/api/student/ladx/${projectId}/beacon`,
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        /* leaving anyway */
      }
    }
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [dirty, program, name, projectId]);

  async function submitExercise(ex: Exercise) {
    if (!program) return;
    setSubmitting(true);
    setError(null);
    try {
      // Submit the program as authored, with cold tag values: a snapshot of
      // the logic, not of a machine mid-run.
      const res = await fetch(`/api/student/ladx-exercises/${ex.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program: { ...program, name, tags: resetTags(program.tags) } }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Could not submit.");
        return;
      }
      setSubmitTo(null);
      setSubmitMsg(`Submitted "${ex.title}". Your trainer has been notified.`);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Compile.
   *
   * Real editors make you compile before you can go online, and it is a habit
   * worth building: the check catches an undeclared tag or a duplicate coil at
   * a desk rather than on a running machine.
   */
  /**
   * Report a compile into the message log.
   *
   * Each problem gets its own row rather than being folded into a count. A
   * summary saying "3 warnings" is exactly as useful as no message at all
   * when the person needs to know which three.
   */
  const reportCompile = useCallback(
    (problems: string[]) => {
      if (problems.length === 0) {
        say("success", "compile", "Compiled, no problems found.");
        return;
      }
      for (const w of problems) say("warning", "compile", w);
      say(
        "info",
        "compile",
        `Compiled with ${problems.length} warning${problems.length === 1 ? "" : "s"}.`,
      );
    },
    [say],
  );

  function runCompile(): boolean {
    if (!program) return false;

    /*
     * Open Messages before compiling, not after.
     *
     * The results land in a panel that may be closed, and a compile that
     * finishes in twenty milliseconds looks exactly like a button that does
     * nothing. Opening the panel first means the person is already looking at
     * the place the answer appears, and the "Compiling…" line gives the press
     * something to have caused.
     */
    setPanelOpen("messages", true);
    say("info", "compile", `Compiling ${name}…`);

    const problems = validate(program);
    setCompile({ at: Date.now(), problems });
    reportCompile(problems);
    setFlash(
      problems.length
        ? {
            tone: "warn",
            text: `Compiled with ${problems.length} warning${problems.length === 1 ? "" : "s"}, see Messages.`,
          }
        : { tone: "ok", text: "Compiled, no problems found." },
    );
    return problems.length === 0;
  }

  function downloadToPlc() {
    if (!programRef.current) return;
    setPanelOpen("messages", true);
    const problems = validate(programRef.current);
    setCompile({ at: Date.now(), problems });
    reportCompile(problems);
    /*
     * Shown as a sequence rather than done instantly.
     *
     * It used to be a state assignment and a toast, which students read as
     * nothing having happened. On real hardware a download is something you
     * watch: the processor goes to PROGRAM, the project is compiled and sent,
     * memory is verified, and only then does it run again. That sequence is
     * the thing worth learning, so it is shown and it takes long enough to
     * read. The transfer itself still happens here, immediately; the overlay
     * is what takes the time.
     */
    setTransfer("download");
    // Warnings do not block a transfer: a half-built program should still be
    // downloadable so a student can watch what the missing piece does.
    setPlcProgram(programRef.current);
    plcRef.current = programRef.current;
    stopAndReset();
    say("success", "download", "Program transferred into the controller.");
    setFlash({
      tone: "ok",
      text: "Program downloaded to the controller. Press Simulate to run it.",
    });
  }

  function uploadFromPlc() {
    if (!plcProgram) return;
    setAsk({
      title: "Upload from the controller?",
      body: "What is on screen will be replaced by the program held in the controller.",
      confirmLabel: "Upload",
      onConfirm: () => {
        setTransfer("upload");
        setProgram(plcProgram);
        programRef.current = plcProgram;
        setRunning(false);
        say("info", "upload", "Read the program back from the controller.");
        setFlash({ tone: "info", text: "Uploaded from the controller." });
      },
    });
  }

  /**
   * Press Simulate and the handshake runs first; the scan starts when it ends.
   *
   * Splitting it this way means the overlay is not decoration over something
   * that has already happened, the controller genuinely is not scanning
   * until the sequence finishes, so cancelling it leaves the program offline.
   */
  function startSimulation() {
    if (running) return;
    setPanelOpen("messages", true);
    runCompile();
    setGoingOnline(true);
  }

  /** The first scan, once the handshake has finished. */
  function beginScanning() {
    // Put every normally-closed device in its rest state before the first
    // scan, or the program starts with its stop circuit apparently pressed.
    const rested = tagsRef.current.map((t) =>
      (t.device ?? defaultDevice(t)) === "PUSHBUTTON_NC" ? { ...t, value: 1 } : t,
    );
    tagsRef.current = rested;
    setTags(rested);
    setSimOpen(true);
    if (!plcProgram) {
      setPlcProgram(programRef.current);
      plcRef.current = programRef.current;
    }
    say("info", "simulator", "Controller running.");
    setRunning(true);
  }

  /**
   * Hand back a way to operate a tag from the rung itself, or undefined if it
   * is not something a person can drive.
   *
   * Only inputs: an internal bit is set by the program, a timer by the clock,
   * and an output by the controller. Offering to "press" any of those would
   * teach that a PLC output is something you set by hand.
   *
   * A pushbutton is momentary and a selector latches, exactly as on the panel
   *, the rung and the panel must never disagree about what a device does.
   */
  /**
   * The terminal for a tag name, for printing under a contact or coil.
   *
   * Handles a dotted member, RunTimer.DN is addressed by its timer, T0, * because the contact on the rung says RunTimer.DN and the address list
   * says T0, and the student needs to see that those are the same thing.
   */
  const addressOf = useCallback(
    (tagName: string) => {
      if (!tagName) return undefined;
      const base = tagName.split(".")[0] ?? tagName;
      return tagsRef.current.find((t) => t.name === base)?.address;
      // Reads through a ref, so it does not need to be rebuilt when tags
      // change, the rung re-renders for its own reasons and picks up the
      // current value then.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [tags],
  );

  const driveTag = useCallback((tagName: string) => {
    const base = tagName.split(".")[0] ?? tagName;
    const t = tagsRef.current.find((x) => x.name === base);
    if (!t || !t.isInput) return undefined;
    const kind = t.device ?? defaultDevice(t);
    if (kind === "PUSHBUTTON_NO" || kind === "PUSHBUTTON_NC") {
      return (down: boolean) => holdInput(base, down);
    }
    // Maintained devices flip on the press and stay put.
    return (down: boolean) => {
      if (down) toggleInput(base);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleInput(tagName: string) {
    const next = tagsRef.current.map((t) =>
      t.name === tagName ? { ...t, value: t.value ? 0 : 1 } : t,
    );
    tagsRef.current = next;
    setTags(next);
  }

  /**
   * A momentary device, held down.
   *
   * An NC pushbutton sits at 1 and goes to 0 while pressed, pressing STOP
   * BREAKS the rung, which is the whole point of fail-safe wiring and the
   * thing a latching toggle can never teach.
   */
  function holdInput(tagName: string, down: boolean) {
    const next = tagsRef.current.map((t) => {
      if (t.name !== tagName) return t;
      const nc = (t.device ?? defaultDevice(t)) === "PUSHBUTTON_NC";
      return { ...t, value: down ? (nc ? 0 : 1) : nc ? 1 : 0 };
    });
    tagsRef.current = next;
    setTags(next);
  }

  function setAnalog(tagName: string, v: number) {
    const next = tagsRef.current.map((t) => (t.name === tagName ? { ...t, value: v } : t));
    tagsRef.current = next;
    setTags(next);
  }

  function stopAndReset() {
    setRunning(false);
    if (!program) return;
    const fresh = seedPresets(program, resetTags(program.tags));
    tagsRef.current = fresh;
    edgesRef.current = {};
    setTags(fresh);
    setPower({});
    setRungPower({});
    setRuntimeErrors([]);
    setScanCount(0);
  }

  /**
   * Undo history.
   *
   * Every edit already returns a whole new program, the rung tree is
   * immutable, so history is a stack of past states rather than a diff
   * engine. Cheap, and it cannot drift out of step with the document the way a
   * hand-written inverse-operation list does.
   *
   * Depth is capped: a student who has made two hundred edits does not want
   * the first one back, and keeping every state alive would hold the whole
   * session in memory.
   */
  const [past, setPast] = useState<LadxProgram[]>([]);
  const [future, setFuture] = useState<LadxProgram[]>([]);
  const HISTORY_DEPTH = 60;

  function mutate(fn: (p: LadxProgram) => LadxProgram) {
    setProgram((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      setPast((h) => [...h.slice(-(HISTORY_DEPTH - 1)), prev]);
      setFuture([]);
      programRef.current = next;
      // Editing while running would leave the live tag list out of step with
      // the program's, so any structural change stops the scan.
      setRunning(false);
      return next;
    });
  }

  // ── The active routine ────────────────────────────────────────────────
  // Every edit below works on ONE page of the program. Reading and writing go
  // through here so that adding pages did not mean auditing nineteen separate
  // uses of program.rungs: and so a single-page program, which has no
  // routines array at all, still behaves exactly as before.
  const routines = program ? programRoutines(program) : [];
  /** For callbacks that must not be rebuilt whenever the program changes. */
  const routinesRef = useRef<ReturnType<typeof programRoutines>>([]);
  routinesRef.current = routines;
  const activeRoutine = routines.find((r) => r.id === activeRoutineId) ?? routines[0] ?? null;
  const activeRungs = activeRoutine?.rungs ?? [];

  /** Whatever is genuinely open, in program order, with Main guaranteed. */
  const openRoutines = routines.filter(
    (r) =>
      (openRoutineIds.includes(r.id) || r.id === routines[0]?.id) &&
      !poppedRoutineIds.includes(r.id),
  );
  const poppedRoutines = routines.filter((r) => poppedRoutineIds.includes(r.id));
  const totalRungs = routines.reduce((n, r) => n + r.rungs.length, 0);

  /** Rewrite the rungs of the routine currently on screen. */
  /**
   * Edit the rungs of one routine.
   *
   * The routine is worked out from the rung being edited, not from whichever
   * routine happens to be on screen. That distinction only started mattering
   * when routines could be open in more than one place at once: with the
   * target taken from "the active routine", typing into a popped-out window
   * wrote the change into whatever tab was selected behind it.
   *
   * Resolution order:
   *   1. an explicit routineId, for things that add a rung and so have no
   *      rung to point at yet;
   *   2. the routine that actually contains rungId;
   *   3. the active routine, which is the right answer for anything the
   *      canvas does to whatever it is showing.
   */
  function mutateRungs(
    fn: (rungs: Rung[]) => Rung[],
    opts?: { rungId?: string; routineId?: string; elementId?: string },
  ) {
    mutate((p) => {
      const rs = programRoutines(p);

      let idx = -1;
      if (opts?.routineId) idx = rs.findIndex((r) => r.id === opts.routineId);
      if (idx < 0 && opts?.rungId)
        idx = rs.findIndex((r) => r.rungs.some((x) => x.id === opts.rungId));
      if (idx < 0 && opts?.elementId) {
        // Editing or deleting an instruction: find the routine holding it.
        // Both the condition side and the output rail have to be searched,
        // because a coil is an element too.
        const id = opts.elementId;
        idx = rs.findIndex((r) =>
          r.rungs.some(
            (x) => !!pathOfId(rungLogic(x), id) || x.outputs.some((o: Element) => o.id === id),
          ),
        );
      }
      if (idx < 0) idx = rs.findIndex((r) => r.id === (activeRoutine?.id ?? rs[0]?.id));
      idx = Math.max(0, idx);

      const next = rs.map((r, i) => (i === idx ? { ...r, rungs: fn(r.rungs) } : r));
      // `rungs` is kept as a mirror of Main so anything still reading the old
      // field, saved payloads, the exercise preview, stays correct.
      return { ...p, routines: next, rungs: next[0]?.rungs ?? [] };
    });
  }

  /** Add a page. Named for what it is, so a JSR can find it by name. */
  function addRoutine() {
    const base = "Routine";
    let n = 1;
    while (routines.some((r) => r.name === `${base}${n}`)) n += 1;
    const id = uid();
    mutate((p) => ({
      ...p,
      routines: [...programRoutines(p), { id, name: `${base}${n}`, rungs: [] }],
    }));
    setActiveRoutineId(id);
  }

  function renameRoutine(id: string) {
    const current = routines.find((r) => r.id === id);
    setAsk({
      title: "Rename routine",
      input: { label: "Routine name", value: current?.name ?? "" },
      confirmLabel: "Rename",
      onConfirm: (raw) => {
        const next = raw.trim();
        if (!next) return;
        if (routines.some((r) => r.id !== id && r.name.toLowerCase() === next.toLowerCase())) {
          setFlash({
            tone: "warn",
            text: "Another routine has that name. JSR finds a routine by name, so they must be unique.",
          });
          return;
        }
        mutate((p) => ({
          ...p,
          routines: programRoutines(p).map((r) => (r.id === id ? { ...r, name: next } : r)),
        }));
      },
    });
  }

  function deleteRoutine(id: string) {
    const r = routines.find((x) => x.id === id);
    if (!r || routines[0]?.id === id) return;
    const drop = () => {
      mutate((p) => ({ ...p, routines: programRoutines(p).filter((x) => x.id !== id) }));
      if (activeRoutineId === id) setActiveRoutineId(null);
    };
    if (r.rungs.length === 0) {
      drop();
      return;
    }
    setAsk({
      title: `Delete "${r.name}"?`,
      body: `It holds ${r.rungs.length} network${r.rungs.length === 1 ? "" : "s"}, which go with it.`,
      confirmLabel: "Delete routine",
      danger: true,
      onConfirm: drop,
    });
  }

  function undo() {
    setPast((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setProgram((cur) => {
        if (cur) setFuture((f) => [cur, ...f].slice(0, HISTORY_DEPTH));
        programRef.current = prev;
        return prev;
      });
      setRunning(false);
      setSelectedId(null);
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      const next = f[0];
      if (!next) return f;
      setProgram((cur) => {
        if (cur) setPast((h) => [...h, cur].slice(-HISTORY_DEPTH));
        programRef.current = next;
        return next;
      });
      setRunning(false);
      setSelectedId(null);
      return f.slice(1);
    });
  }

  function removeRung(id: string) {
    const rung = activeRungs.find((r) => r.id === id);
    const populated =
      !!rung && (everyElement(rungLogic(rung)).length > 0 || rung.outputs.length > 0);
    const drop = () => {
      mutateRungs((rungs) => rungs.filter((r) => r.id !== id));
      setSelectedRungId((cur) => (cur === id ? null : cur));
    };
    if (!populated) {
      drop();
      return;
    }
    setAsk({
      title: "Delete this network?",
      body: "Everything on it goes with it.",
      confirmLabel: "Delete network",
      danger: true,
      onConfirm: drop,
    });
  }

  function addRung(routineId?: string) {
    mutateRungs(
      (rungs) => [...rungs, { id: uid(), branches: [], logic: series([]) as never, outputs: [] }],
      { routineId },
    );
  }

  /** Rewrite one rung's condition tree. */
  function setLogic(
    rungId: string,
    fn: (root: ReturnType<typeof rungLogic>) => ReturnType<typeof rungLogic>,
  ) {
    mutateRungs(
      (rungs) =>
        rungs.map((r) =>
          r.id === rungId ? { ...r, logic: fn(rungLogic(r)) as never, branches: [] } : r,
        ),
      { rungId },
    );
  }

  function newElement(type: ElementType): Element {
    const spec = INSTRUCTION_BY_TYPE.get(type);
    return {
      id: uid(),
      type,
      tag: "",
      ...(spec?.needsPreset ? { preset: type === "TON" || type === "TOF" ? 5000 : 10 } : {}),
    };
  }

  /** Drop an instruction into a gap. Outputs are sent to the output side. */
  function insertInstruction(rungId: string, parentPath: Path, index: number, type: ElementType) {
    const spec = INSTRUCTION_BY_TYPE.get(type);
    if (spec?.side === "output") {
      addOutput(rungId, type);
      return;
    }

    const el = newElement(type);
    const node = elNode(type, "", el.preset !== undefined ? { preset: el.preset } : {});
    setLogic(rungId, (root) => insertAt(root, parentPath, index, node) as never);
    setSelectedId(node.id);
    setEditing({
      id: node.id,
      type,
      tag: "",
      ...(node.preset !== undefined ? { preset: node.preset } : {}),
    });
  }

  /* ── Moving what is already on the rungs ─────────────────────────── */

  /**
   * Drop something that is already on a rung into a gap.
   *
   * Four cases, because a contact and a coil do not live in the same place: a
   * contact is a node in the condition tree, a coil is an entry in
   * rung.outputs. Within one rung the tree can move it itself and keep the
   * arithmetic right; across two rungs it has to be lifted out of one and put
   * into the other.
   */
  function dropElementInGap(
    drag: Extract<DragPayload, { kind: "element" }>,
    targetRungId: string,
    parentPath: Path,
    index: number,
  ) {
    // A coil belongs on the right-hand rail wherever it is let go, the same
    // rule the palette already follows, so the gesture means one thing.
    if (drag.isOutput) {
      moveOutputToRung(drag, targetRungId);
      return;
    }

    if (drag.rungId === targetRungId) {
      setLogic(targetRungId, (root) => {
        const from = pathOfId(root, drag.elementId);
        if (!from) return root;
        return moveNode(root, from, parentPath, index) as never;
      });
      setSelectedId(drag.elementId);
      return;
    }

    // Across networks: read the node out of the source before it is removed,
    // because after the removal there is nothing left to read.
    mutateRungs((rungs) => {
      const source = rungs.find((r) => r.id === drag.rungId);
      if (!source) return rungs;
      const sourceRoot = rungLogic(source);
      const from = pathOfId(sourceRoot, drag.elementId);
      if (!from) return rungs;
      const node = nodeAt(sourceRoot, from) as LadderNode | null;
      if (!node) return rungs;

      return rungs.map((r) => {
        if (r.id === drag.rungId) {
          return { ...r, logic: removeById(rungLogic(r), drag.elementId) as never, branches: [] };
        }
        if (r.id === targetRungId) {
          return {
            ...r,
            logic: insertAt(rungLogic(r), parentPath, index, node) as never,
            branches: [],
          };
        }
        return r;
      });
    });
    setSelectedId(drag.elementId);
  }

  /** Move a coil to another network's output rail. */
  function moveOutputToRung(drag: Extract<DragPayload, { kind: "element" }>, targetRungId: string) {
    if (drag.rungId === targetRungId && drag.isOutput) return;

    mutateRungs((rungs) => {
      const source = rungs.find((r) => r.id === drag.rungId);
      if (!source) return rungs;

      const el = drag.isOutput
        ? source.outputs.find((o: Element) => o.id === drag.elementId)
        : null;
      if (!el) return rungs;

      return rungs.map((r) => {
        if (r.id === drag.rungId) {
          return { ...r, outputs: r.outputs.filter((o: Element) => o.id !== drag.elementId) };
        }
        if (r.id === targetRungId) {
          return { ...r, outputs: [...r.outputs, el] };
        }
        return r;
      });
    });
    setSelectedId(drag.elementId);
  }

  /**
   * Something dropped on a network's output rail.
   *
   * A contact cannot become a coil, XIC on the right-hand rail is not a thing
   * a controller has, so this refuses and says why rather than silently
   * ignoring the gesture.
   */
  function dropOnOutputRail(drag: DragPayload, targetRungId: string) {
    if (drag.kind === "new") {
      addOutput(targetRungId, drag.type);
      return;
    }
    if (drag.kind === "rung") return;

    if (!drag.isOutput) {
      setNotice("A contact cannot go on the output side. Drop it between the rails instead.");
      return;
    }
    moveOutputToRung(drag, targetRungId);
  }

  /** Reorder networks. `before` is the index the network should end up at. */
  function moveRung(rungId: string, before: number) {
    mutateRungs(
      (rungs) => {
        const from = rungs.findIndex((r) => r.id === rungId);
        const moved = rungs[from];
        if (from === -1 || !moved) return rungs;
        // The same arithmetic as moving a contact: removing shifts everything
        // after it down one, so a target captured beforehand is one too far.
        if (before === from || before === from + 1) return rungs;
        const without = rungs.filter((_, i) => i !== from);
        const at = from < before ? before - 1 : before;
        return [...without.slice(0, at), moved, ...without.slice(at)];
      },
      { rungId },
    );
  }

  /* ── Cut, copy, paste ────────────────────────────────────────────── */

  function copyRung(rungId: string) {
    const r = activeRungs.find((x: Rung) => x.id === rungId);
    if (!r) return;
    setClipboard({ kind: "rung", rung: r });
    setClipLabel(`Network ${activeRungs.findIndex((x: Rung) => x.id === rungId) + 1}`);
    setNotice("Network copied.");
  }

  function cutRung(rungId: string) {
    const r = activeRungs.find((x: Rung) => x.id === rungId);
    if (!r) return;
    setClipboard({ kind: "rung", rung: r });
    setClipLabel(`Network ${activeRungs.findIndex((x: Rung) => x.id === rungId) + 1}`);
    mutateRungs((list) => list.filter((x) => x.id !== rungId), { rungId });
    setNotice("Network cut. Paste it wherever you need it.");
  }

  function copyElement(rungId: string, elementId: string) {
    const r = activeRungs.find((x: Rung) => x.id === rungId);
    if (!r) return;
    const out = r.outputs.find((o: Element) => o.id === elementId);
    if (out) {
      setClipboard({ kind: "element", element: out, isOutput: true });
    } else {
      const node = everyElement(rungLogic(r)).find((e) => e.id === elementId);
      if (!node) return;
      setClipboard({
        kind: "element",
        element: {
          id: node.id,
          type: node.type,
          tag: node.tag,
          preset: node.preset,
          operand: node.operand,
          dest: node.dest,
        },
        isOutput: false,
      });
    }
    setClipLabel("Instruction");
    setNotice("Instruction copied.");
  }

  /**
   * Paste after a network, or at the end.
   *
   * Everything is cloned with fresh ids on the way in, see lib/ladx/drag. Two
   * nodes sharing an id is not a visible fault at the moment it happens; it
   * surfaces later as one-shots sharing a memory and the selection picking two
   * things at once.
   */
  function pasteAfter(rungId: string | null) {
    const c: Clip | null = getClipboard();
    if (!c) {
      setNotice("Nothing has been copied yet.");
      return;
    }

    if (c.kind === "rung") {
      const copy = cloneRung(c.rung);
      mutateRungs((list) => {
        const at = rungId ? list.findIndex((r) => r.id === rungId) + 1 : list.length;
        return [...list.slice(0, at), copy, ...list.slice(at)];
      });
      setNotice("Network pasted.");
      return;
    }

    const target = rungId ?? activeRungs[activeRungs.length - 1]?.id;
    if (!target) {
      setNotice("Add a network first.");
      return;
    }

    const el = cloneElement(c.element);
    if (c.isOutput) {
      mutateRungs(
        (list) => list.map((r) => (r.id === target ? { ...r, outputs: [...r.outputs, el] } : r)),
        { rungId: target },
      );
    } else {
      setLogic(
        target,
        (root) =>
          insertAt(
            root,
            [],
            (root as { children: unknown[] }).children.length,
            elNode(el.type, el.tag, el.preset !== undefined ? { preset: el.preset } : {}),
          ) as never,
      );
    }
    setNotice("Instruction pasted.");
  }

  function duplicateRung(rungId: string) {
    const r = activeRungs.find((x: Rung) => x.id === rungId);
    if (!r) return;
    const copy = cloneRung(r);
    mutateRungs((list) => {
      const at = list.findIndex((x) => x.id === rungId) + 1;
      return [...list.slice(0, at), copy, ...list.slice(at)];
    });
    setNotice("Network duplicated.");
  }

  /* ── Right-click ─────────────────────────────────────────────────── */

  /**
   * Every menu opens by saying what it is about.
   *
   * A menu of bare verbs makes you check what you clicked before you dare use
   * it. "XIC · Start_PB · Network 2" at the top means the next line can just
   * say "Delete" and be safe.
   */
  /**
   * The instructions offered directly in a right-click menu.
   *
   * Seven, not twenty. A context menu listing every instruction is a palette
   * with a worse layout, and the palette is two inches away. These are the
   * ones most rungs are made of; anything else is a click on the bar.
   */
  const QUICK_INPUTS: ElementType[] = ["XIC", "XIO", "ONS"];
  const QUICK_OUTPUTS: ElementType[] = ["OTE", "OTL", "OTU", "TON"];

  const label = (t: ElementType) => INSTRUCTION_BY_TYPE.get(t)?.label ?? t;

  /**
   * Insert next to a particular instruction, not at the end of the rung.
   *
   * The point of right-clicking a contact is that you mean that spot. An
   * "insert" that appended to the end would technically work and would make
   * the menu pointless, since the toolbar already does that.
   */
  function insertBeside(rungId: string, elementId: string, isOutput: boolean): MenuItem[] {
    if (isOutput) {
      return QUICK_OUTPUTS.map((t) => ({
        kind: "item" as const,
        label: `Add ${label(t)} coil`,
        hint: t,
        onClick: () => addOutput(rungId, t),
      }));
    }

    const r = activeRungs.find((x: Rung) => x.id === rungId) as Rung | undefined;
    const at = r ? pathOfId(rungLogic(r), elementId) : null;
    const parent = at ? at.slice(0, -1) : [];
    const i = at?.[at.length - 1] ?? 0;

    return [
      ...QUICK_INPUTS.map((t) => ({
        kind: "item" as const,
        label: `Insert ${label(t)} before`,
        hint: t,
        onClick: () => insertInstruction(rungId, parent, i, t),
      })),
      ...QUICK_INPUTS.map((t) => ({
        kind: "item" as const,
        label: `Insert ${label(t)} after`,
        hint: t,
        onClick: () => insertInstruction(rungId, parent, i + 1, t),
      })),
    ];
  }

  function elementMenuItems(
    rungId: string,
    el: {
      id: string;
      type: ElementType;
      tag: string;
      preset?: number;
      operand?: string;
      dest?: string;
    },
    isOutput: boolean,
  ): MenuItem[] {
    const spec = INSTRUCTION_BY_TYPE.get(el.type);
    const n = activeRungs.findIndex((r: Rung) => r.id === rungId) + 1;
    const bits = [el.tag || "no tag"];
    if (el.preset !== undefined) bits.push(`preset ${el.preset}`);
    if (el.operand) bits.push(`with ${el.operand}`);
    if (el.dest) bits.push(`into ${el.dest}`);

    return [
      {
        kind: "heading",
        label: `${spec?.label ?? el.type} · ${el.type}`,
        detail: `${bits.join(" · ")} · Network ${n}`,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Edit…",
        hint: "double-click",
        onClick: () => {
          setSelectedId(el.id);
          setEditing({
            id: el.id,
            type: el.type,
            tag: el.tag,
            preset: el.preset,
            operand: el.operand,
            dest: el.dest,
          });
        },
      },
      ...(analyse?.why && el.tag.trim()
        ? ([
            {
              kind: "item",
              label: `Why won't ${el.tag} come on?`,
              onClick: () => void runWhy(el.tag),
            },
            { kind: "separator" },
          ] as MenuItem[])
        : []),
      { kind: "item", label: "Copy", hint: "Ctrl+C", onClick: () => copyElement(rungId, el.id) },
      {
        kind: "item",
        label: "Cut",
        hint: "Ctrl+X",
        onClick: () => {
          copyElement(rungId, el.id);
          removeElement(el.id);
        },
      },
      {
        kind: "item",
        label: "Paste",
        hint: "Ctrl+V",
        disabled: !getClipboard(),
        onClick: () => pasteAfter(rungId),
      },
      { kind: "separator" },
      ...insertBeside(rungId, el.id, isOutput),
      { kind: "separator" },
      {
        kind: "item",
        label: isOutput ? "Delete this coil" : "Delete this instruction",
        danger: true,
        onClick: () => removeElement(el.id),
      },
    ];
  }

  /**
   * A branch has two sensible ways to go, and only one of them is usually meant.
   *
   * Removing the parallel takes every contact in every leg with it, which is
   * right when the branch itself was the mistake. Far more often the contacts
   * are the ones wanted and the branch was drawn around the wrong span: a
   * branch is normally the last thing added, so keeping them is offered
   * first and named for what it does.
   */
  function branchMenuItems(rungId: string, branchId: string, path: Path): MenuItem[] {
    const r = activeRungs.find((x: Rung) => x.id === rungId) as Rung | undefined;
    const node = r ? nodeAt(rungLogic(r), path) : null;
    const legs = node && node.kind === "parallel" ? node.children.length : 0;
    const inside = node ? everyElement(node as LadderNode).length : 0;

    return [
      {
        kind: "heading",
        label: "Branch",
        detail: `${legs} leg${legs === 1 ? "" : "s"} · ${inside} instruction${inside === 1 ? "" : "s"} inside`,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Remove the branch, keep the contacts",
        hint: "Del",
        onClick: () => {
          setLogic(rungId, (root) => unwrapBranch(root, path) as never);
          setSelectedIds([]);
        },
      },
      {
        kind: "item",
        label: `Delete the branch and its ${inside} instruction${inside === 1 ? "" : "s"}`,
        danger: true,
        onClick: () => {
          /*
           * Asked first when it is more than a token amount.
           *
           * A branch that wraps the whole rung takes the whole rung with it,
           * and the dashed outline around "the branch" looks the same whether
           * it holds two contacts or twelve. Naming the count in the question
           * is the difference between a decision and an accident.
           */
          const go = () => {
            setLogic(rungId, (root) => removeById(root, branchId) as never);
            setSelectedIds([]);
            say(
              "info",
              "edit",
              `Branch deleted with ${inside} instruction${inside === 1 ? "" : "s"}.`,
            );
          };
          if (inside <= 2) {
            go();
            return;
          }
          setAsk({
            title: `Delete ${inside} instructions?`,
            body: `Everything inside this branch goes with it: ${everyElement(
              nodeAt(rungLogic(activeRungs.find((x: Rung) => x.id === rungId)!), path)!,
            )
              .map((e) => e.tag || e.type)
              .join(", ")}. To keep them, use "Remove the branch, keep the contacts" instead.`,
            confirmLabel: `Delete ${inside}`,
            danger: true,
            onConfirm: go,
          });
        },
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Add a leg to this branch",
        onClick: () => setLogic(rungId, (root) => addLeg(root, path) as never),
      },
    ];
  }

  function rungMenuItems(rungId: string): MenuItem[] {
    const i = activeRungs.findIndex((r: Rung) => r.id === rungId);
    const r = activeRungs[i] as Rung | undefined;
    if (!r) return [];
    const contacts = everyElement(rungLogic(r)).length;
    const clip = getClipboard();

    return [
      {
        kind: "heading",
        label: `Network ${i + 1}${r.comment ? `, ${r.comment}` : ""}`,
        detail: `${contacts} instruction${contacts === 1 ? "" : "s"} · ${r.outputs.length} coil${r.outputs.length === 1 ? "" : "s"}`,
      },
      { kind: "separator" },
      { kind: "item", label: "Cut", hint: "Ctrl+X", onClick: () => cutRung(rungId) },
      { kind: "item", label: "Copy", hint: "Ctrl+C", onClick: () => copyRung(rungId) },
      {
        kind: "item",
        label: clip
          ? clip.kind === "rung"
            ? "Paste network below"
            : "Paste instruction here"
          : "Paste",
        hint: "Ctrl+V",
        disabled: !clip,
        onClick: () => pasteAfter(rungId),
      },
      { kind: "item", label: "Duplicate", hint: "Ctrl+D", onClick: () => duplicateRung(rungId) },
      { kind: "separator" },
      ...QUICK_INPUTS.map((t) => ({
        kind: "item" as const,
        label: `Add ${label(t)} to this network`,
        hint: t,
        onClick: () => insertInstruction(rungId, [], everyElement(rungLogic(r)).length, t),
      })),
      ...QUICK_OUTPUTS.map((t) => ({
        kind: "item" as const,
        label: `Add ${label(t)} coil`,
        hint: t,
        onClick: () => addOutput(rungId, t),
      })),
      { kind: "separator" },
      {
        kind: "item",
        label: "Add a network below",
        onClick: () => {
          mutateRungs((list) => {
            const at = list.findIndex((x) => x.id === rungId) + 1;
            const fresh = { id: uid(), branches: [], logic: series([]) as never, outputs: [] };
            return [...list.slice(0, at), fresh, ...list.slice(at)];
          });
        },
      },
      { kind: "item", label: "Move up", disabled: i === 0, onClick: () => moveRung(rungId, i - 1) },
      {
        kind: "item",
        label: "Move down",
        disabled: i >= activeRungs.length - 1,
        onClick: () => moveRung(rungId, i + 2),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Delete this network",
        danger: true,
        onClick: () => removeRung(rungId),
      },
    ];
  }

  /** Right-click on one routine in the project tree. */
  function routineMenuItems(routineId: string, index: number): MenuItem[] {
    const r = routines.find((x) => x.id === routineId);
    if (!r) return [];
    const isMain = index === 0;

    return [
      {
        kind: "heading",
        label: r.name,
        detail: `${r.rungs.length} network${r.rungs.length === 1 ? "" : "s"}${isMain ? " · entry point" : ""}`,
      },
      { kind: "separator" },
      { kind: "item", label: "Open", onClick: () => setActiveRoutineId(routineId) },
      {
        kind: "item",
        label: "Add a network",
        onClick: () => {
          setActiveRoutineId(routineId);
          addRung();
        },
      },
      { kind: "separator" },
      { kind: "item", label: "Rename…", onClick: () => renameRoutine(routineId) },
      {
        kind: "item",
        label: "Delete this routine",
        danger: true,
        // Main is the entry point. Deleting it would leave the controller with
        // nothing to execute, so it is offered nowhere.
        disabled: isMain,
        onClick: () => deleteRoutine(routineId),
      },
    ];
  }

  /** Right-click on the project tree, away from any row. */
  function treeMenuItems(): MenuItem[] {
    return [
      {
        kind: "heading",
        label: name || "Untitled project",
        detail: `${routines.length} routine${routines.length === 1 ? "" : "s"} · ${totalRungs} networks`,
      },
      { kind: "separator" },
      { kind: "item", label: "Add a routine", onClick: addRoutine },
      { kind: "item", label: "Open the tag table", onClick: () => setTreeSel("tags") },
      { kind: "separator" },
      { kind: "item", label: "Save now", hint: "Ctrl+S", onClick: () => void save() },
      {
        kind: "item",
        label: "Export as PDF",
        onClick: async () => {
          await save();
          setDirty(false);
          window.open(`/api/student/ladx/${projectId}/pdf`, "_blank");
        },
      },
    ];
  }

  function canvasMenuItems(): MenuItem[] {
    const clip = getClipboard();
    return [
      {
        kind: "heading",
        label: activeRoutine?.name ?? "Main",
        detail: `${activeRungs.length} network${activeRungs.length === 1 ? "" : "s"}`,
      },
      { kind: "separator" },
      { kind: "item", label: "Add a network", onClick: addRung },
      {
        kind: "item",
        label: clip?.kind === "rung" ? "Paste network at the end" : "Paste",
        disabled: !clip,
        onClick: () => pasteAfter(null),
      },
    ];
  }

  function addOutput(rungId: string, type: ElementType) {
    const el = newElement(type);
    mutateRungs(
      (rungs) => rungs.map((r) => (r.id === rungId ? { ...r, outputs: [...r.outputs, el] } : r)),
      { rungId },
    );
    setSelectedId(el.id);
    setEditing(el);
  }

  function updateElement(updated: Element) {
    mutateRungs(
      (rungs) =>
        rungs.map((r) => ({
          ...r,
          logic: updateElementById(rungLogic(r), updated.id, {
            type: updated.type,
            tag: updated.tag,
            preset: updated.preset,
            operand: updated.operand,
            dest: updated.dest,
          }) as never,
          branches: [],
          outputs: r.outputs.map((e: Element) => (e.id === updated.id ? updated : e)),
        })),
      { elementId: updated.id },
    );
  }

  /** Remove several instructions in one edit, so undo returns them together. */
  /**
   * Is this id a branch rather than an instruction?
   *
   * Clicking a branch selects the branch NODE, so its id ends up in
   * selectedIds beside ordinary instruction ids. They have to be told apart
   * before anything is deleted, because removing a branch by id takes
   * everything inside it with it.
   */
  function branchLocation(id: string): { rungId: string; path: number[] } | null {
    for (const r of activeRungs) {
      const root = rungLogic(r);
      const path = pathOfId(root, id);
      if (!path) continue;
      const node = nodeAt(root, path);
      if (node && node.kind === "parallel") return { rungId: r.id, path };
    }
    return null;
  }

  /**
   * Delete, on a selected branch, means take the branch away, not take away
   * everything that was inside it.
   *
   * It used to mean the second thing. Selecting a branch put its node id into
   * selectedIds, Delete called removeById, and the whole subtree went: on a
   * rung whose outermost node is a parallel, that is the entire rung, with no
   * warning and nothing to say it was about to happen.
   *
   * Unwrapping is the reading that matches the word. Deleting the contents as
   * well is still available, from the right-click item that says how many
   * instructions it is about to take.
   */
  function deleteSelection(ids: string[]) {
    if (ids.length === 0) return;
    const branches = ids.map((id) => ({ id, at: branchLocation(id) })).filter((x) => x.at);
    const plain = ids.filter((id) => !branchLocation(id));

    for (const b of branches) {
      setLogic(b.at!.rungId, (root) => unwrapBranch(root, b.at!.path) as never);
    }
    if (plain.length) removeElements(plain);
    else setSelectedIds([]);

    if (branches.length) {
      say(
        "info",
        "edit",
        branches.length === 1
          ? "Branch removed. The instructions that were inside it are still on the rung."
          : `${branches.length} branches removed. Their instructions are still on the rung.`,
      );
    }
  }

  function removeElements(ids: string[]) {
    if (ids.length === 0) return;
    const set = new Set(ids);
    mutateRungs(
      (rungs) =>
        rungs.map((r) => ({
          ...r,
          logic: ids.reduce<LadderNode>((root, id) => removeById(root, id), rungLogic(r)) as never,
          branches: [],
          outputs: r.outputs.filter((e: Element) => !set.has(e.id)),
        })),
      { elementId: ids[0] },
    );
    setSelectedIds([]);
    setEditing((cur) => (cur && set.has(cur.id) ? null : cur));
  }

  function removeElement(id: string) {
    mutateRungs((rungs) =>
      rungs.map((r) => ({
        ...r,
        logic: removeById(rungLogic(r), id) as never,
        branches: [],
        outputs: r.outputs.filter((e: Element) => e.id !== id),
      })),
    );
    setSelectedId((cur) => (cur === id ? null : cur));
    setEditing((cur) => (cur && cur.id === id ? null : cur));
  }

  /** The rung that currently has the selection, or the last one. */
  function activeRungId(): string | null {
    if (!program || activeRungs.length === 0) return null;
    if (selectedId) {
      const hit = activeRungs.find(
        (r) => pathOfId(rungLogic(r), selectedId) || r.outputs.some((o) => o.id === selectedId),
      );
      if (hit) return hit.id;
    }
    return cursor?.rungId ?? activeRungs[activeRungs.length - 1]?.id ?? null;
  }

  /** Branch around whatever is selected, the toolbar route to a branch. */
  function branchAroundSelection() {
    if (!program || !selectedId) return;
    // An output lives beside the rung, not in its condition tree, so there is
    // nothing to branch around. Say so rather than doing nothing.
    const isOutput = activeRungs.some((r) => r.outputs.some((o) => o.id === selectedId));
    if (isOutput) {
      setBranchHint(
        "A coil cannot be branched. Select a contact on the left of the rung, then press Branch.",
      );
      return;
    }
    for (const r of activeRungs) {
      const root = rungLogic(r);
      const path = pathOfId(root, selectedId);
      if (!path || path.length === 0) continue;
      const parentPath = path.slice(0, -1);
      const index = path[path.length - 1];
      if (index === undefined) continue;
      setLogic(r.id, (cur) => branchSpan(cur, parentPath, index, index) as never);
      // branchSpan puts the enclosed span in leg 0 and an empty leg 1.
      setSelectedId(null);
      setCaret({
        rungId: r.id,
        seriesId: "",
        index: 0,
        path: [...parentPath, index, 1],
      });
      setBranchHint("Branch added. The next instruction you place goes into it.");
      return;
    }
  }

  /** One entry point for the toolbar and the keyboard. */
  function handleBarAction(a: BarAction) {
    if (!program) return;

    if (a.kind === "rung") {
      addRung();
      return;
    }
    if (a.kind === "delete") {
      if (selectedId) removeElement(selectedId);
      return;
    }

    if (a.kind === "branch") {
      // Around the selected element if there is one, that is the fast path
      // for "branch this contact". Otherwise arm the two-click mode, seeded
      // from the insertion point when the student has already placed it.
      setBranchHint(null);
      if (selectedId) {
        branchAroundSelection();
        return;
      }
      if (branchFrom) {
        setBranchFrom(null);
        return;
      }
      if (caret) {
        setBranchFrom({ rungId: caret.rungId, seriesId: caret.seriesId, index: caret.index });
        setBranchHint("Now click the wire at the other end of the branch.");
      } else {
        setBranchHint(
          "Select a contact and press Branch to branch around it, or click the wire where the branch should start, press Branch, then click where it should end.",
        );
      }
      return;
    }

    const rungId = activeRungId();
    if (!rungId) {
      addRung();
      return;
    }

    const spec = INSTRUCTION_BY_TYPE.get(a.type);
    if (spec?.side === "output") {
      addOutput(rungId, a.type);
      return;
    }

    // Click-to-place lands after the selected element, or at the end.
    const rung = activeRungs.find((r) => r.id === rungId)!;
    const root = rungLogic(rung);

    // The caret wins: the student put it there on purpose.
    if (caret && caret.rungId === rungId) {
      insertInstruction(rungId, caret.path, caret.index, a.type);
      setCaret({ ...caret, index: caret.index + 1 });
      return;
    }
    const path = selectedId ? pathOfId(root, selectedId) : null;
    const after = path?.[path.length - 1];
    if (path && after !== undefined) {
      insertInstruction(rungId, path.slice(0, -1), after + 1, a.type);
    } else {
      insertInstruction(rungId, [], root.children.length, a.type);
    }
  }

  /** Is this name already declared, allowing for Timer.DN style members? */
  function tagExists(name: string): boolean {
    if (!program || !name.trim()) return false;
    const base = name.includes(".") ? name.slice(0, name.indexOf(".")) : name;
    return program.tags.some((t) => t.name === base);
  }

  /**
   * Declare a tag from the element editor.
   *
   * Placing a contact used to leave the tag undeclared, so the program compiled
   * with "unknown tag" warnings and the simulator had nothing to switch. The
   * editor now offers to declare it on the spot, defaulted from the instruction
   * that is asking: a contact wants an input, a coil wants an output, a timer
   * wants a TIMER. The student still chooses the device, because only they know
   * whether Start_PB is a pushbutton or a selector.
   */
  function declareTag(name: string, patch: Partial<Tag>) {
    const base = name.includes(".") ? name.slice(0, name.indexOf(".")) : name;
    if (!base.trim() || tagExists(base)) return;
    mutate((p) => ({
      ...p,
      tags: [
        ...p.tags,
        {
          name: base.trim(),
          type: patch.type ?? "BOOL",
          value: patch.device === "PUSHBUTTON_NC" ? 1 : 0,
          ...patch,
        } as Tag,
      ],
    }));
  }

  function addTag() {
    const base = "NewTag";
    let n = 1;
    while (program?.tags.some((t) => t.name === `${base}${n}`)) n++;
    mutate((p) => {
      const fresh: Tag = { name: `${base}${n}`, type: "BOOL", value: 0 };
      fresh.address = nextFreeAddress(fresh, [...p.tags, fresh]);
      return { ...p, tags: [...p.tags, fresh] };
    });
  }

  function updateTag(index: number, patch: Partial<Tag>) {
    /*
     * Ticking "output" on a tag addressed I0.2 has to move it to Q-something:
     * the address says which terminal, and an input terminal cannot drive a
     * lamp. Only re-assigned when the area actually changes, so a hand-picked
     * address is never quietly overwritten.
     */
    const movesArea =
      patch.isInput !== undefined || patch.isOutput !== undefined || patch.type !== undefined;
    mutate((p) => ({
      ...p,
      tags: p.tags.map((t, i) => {
        if (i !== index) return t;
        const next = { ...t, ...patch };
        if (movesArea && patch.address === undefined) {
          const wanted = areaFor(next);
          const has = next.address ? parseAddress(next.address)?.area : undefined;
          if (has !== wanted) {
            next.address = nextFreeAddress(
              next,
              p.tags.map((x, j) => (j === index ? next : x)),
            );
          }
        }
        return next;
      }),
    }));
    // Keep the live copy in step so the I/O panel does not lag the table.
    const next = program!.tags.map((t, i) => (i === index ? { ...t, ...patch } : t));
    tagsRef.current = resetTags(next);
    setTags(tagsRef.current);
  }

  function removeTag(index: number) {
    mutate((p) => ({ ...p, tags: p.tags.filter((_, i) => i !== index) }));
  }

  // Keep the runtime tag list in step with the declared one while stopped.
  // Signature rather than object identity: mutate() replaces the tag array on
  // every edit, and resyncing on identity would restart the list mid-scan.
  const tagSignature = program
    ? program.tags
        .map(
          (t) =>
            `${t.name}:${t.type}:${t.isInput ? 1 : 0}${t.isOutput ? 1 : 0}:${t.device ?? ""}:${t.preset ?? ""}`,
        )
        .join("|")
    : "";
  useEffect(() => {
    if (running || !programRef.current) return;
    const fresh = resetTags(programRef.current.tags);
    tagsRef.current = fresh;
    setTags(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagSignature, running]);

  // Shortcuts, but never while someone is typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // F1 works even mid-typing: it is the key people hit precisely when a
      // field has them stuck, and swallowing it there would be perverse.
      if (e.key === "F1") {
        e.preventDefault();
        setHelpTopic((cur) => (cur ? null : "start"));
        return;
      }

      /*
       * Typing wins, always.
       *
       * This test used to sit below the Ctrl+Z branch, so pressing undo while
       * renaming a tag undid the whole program instead of the two characters
       * just typed, the field kept the text and the ladder jumped backwards,
       * which is a genuinely alarming thing to watch.
       */
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;

      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        // Zoom the ladder, not the browser.
        if (k === "=" || k === "+") {
          e.preventDefault();
          zoomBy(1);
          return;
        }
        if (k === "-" || k === "_") {
          e.preventDefault();
          zoomBy(-1);
          return;
        }
        if (k === "0") {
          e.preventDefault();
          setZoom(1);
          return;
        }
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }

        /*
         * Cut, copy and paste. The right-click menus advertise these, and a
         * menu that names a shortcut nothing listens for is worse than a menu
         * with no shortcut on it at all.
         *
         * An instruction wins over a network when both are selected, because
         * selecting an instruction is the more deliberate act, you clicked
         * the thing itself rather than its header.
         */
        const rungId = selectedRungId ?? activeRungId();
        if (k === "c") {
          if (selectedId) {
            e.preventDefault();
            const r = activeRungId();
            if (r) copyElement(r, selectedId);
          } else if (selectedRungId) {
            e.preventDefault();
            copyRung(selectedRungId);
          }
          return;
        }
        if (k === "x") {
          if (selectedId) {
            e.preventDefault();
            const r = activeRungId();
            if (r) {
              copyElement(r, selectedId);
              removeElement(selectedId);
            }
          } else if (selectedRungId) {
            e.preventDefault();
            cutRung(selectedRungId);
          }
          return;
        }
        if (k === "v") {
          e.preventDefault();
          pasteAfter(rungId);
          return;
        }
        if (k === "d") {
          if (selectedRungId) {
            e.preventDefault();
            duplicateRung(selectedRungId);
          }
          return;
        }
        return;
      }

      if (e.altKey) return;
      if (picker || editing || submitTo) return;

      const map: Record<string, BarAction> = {
        a: { kind: "instruction", type: "XIC" },
        s: { kind: "instruction", type: "XIO" },
        d: { kind: "instruction", type: "OTE" },
        b: { kind: "branch" },
        n: { kind: "rung" },
      };
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length) {
          e.preventDefault();
          // Every selected instruction, in one edit, so undo takes them all
          // back together rather than one keystroke at a time. A selected
          // branch is unwrapped rather than emptied, see deleteSelection.
          deleteSelection(selectedIds);
          return;
        }
        if (selectedRungId) {
          e.preventDefault();
          removeRung(selectedRungId);
        }
        return;
      }
      // Escape clears everything transient, the insertion caret included, // it is the key people reach for when the rung looks cluttered.
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedRungId(null);
        setBranchFrom(null);
        setCaret(null);
        setBranchHint(null);
        return;
      }

      const action = map[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        handleBarAction(action);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /**
   * Whether an analysis is running.
   *
   * Declared here rather than beside the function that uses it, which is where
   * it was: below the two early returns underneath this. React counts hooks by
   * call order, so on the first render, before a program has loaded, the
   * component returned early and called ninety eight of them, and on the next
   * render it got past the return and called ninety nine. That is "Rendered
   * more hooks than during the previous render", and it took the whole editor
   * down with a client side exception rather than degrading.
   *
   * It is why /ladder, the free editor the site leads with, showed nothing but
   * an error page.
   */
  const [analysing, setAnalysing] = useState(false);

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" /> Opening…
      </p>
    );
  }
  if (!program) {
    return <p className="py-10 text-sm text-danger">{error ?? "Project not found."}</p>;
  }

  const inputs = tags.filter((t) => t.isInput);
  const outputs = tags.filter((t) => t.isOutput);

  // ── Menus ─────────────────────────────────────────────────────────────
  // The order and the contents are the ones every PLC IDE uses, because a
  // student who learns that saving is under File carries that to TIA and
  // Studio 5000 unchanged. Nothing is listed that does not work.
  /**
   * Leave for another tool, having saved first.
   *
   * How it leaves is the host's to decide, see `navigate`. Saving first is
   * not: the destination binds to this program's tag table by name, and
   * arriving before the debounce has fired shows a table missing the tag that
   * was just added.
   */
  const followCrossLink = async (href: string) => {
    if (program) {
      await save();
      setDirty(false);
    }
    if (navigate) navigate(href);
    else window.location.assign(href);
  };

  /**
   * Look the open program over and say what came back.
   *
   * Everything goes to the output window, including the case where there is
   * nothing to say. An analysis that reports nothing and shows nothing is
   * indistinguishable from one that did not run, and the difference matters:
   * "I checked and it is fine" is a result.
   */
  const runAnalysis = async () => {
    if (!analyse || !program) return;
    setAnalysing(true);
    setPanelOpen("messages", true);
    try {
      const out = await analyse.run(program);

      for (const f of out.findings) {
        const level: MessageLevel =
          f.severity === "critical" ? "error" : f.severity === "warning" ? "warning" : "info";
        const at = f.at.length ? ` (${f.at.join(", ")})` : "";
        say(level, "Analyse", `${f.title}${at}. ${f.detail}`);
      }

      // Said after the findings, so it is the line left at the bottom.
      if (out.findings.length === 0) {
        say("success", "Analyse", "Nothing to report.");
      } else {
        const critical = out.findings.filter((f) => f.severity === "critical").length;
        const warnings = out.findings.filter((f) => f.severity === "warning").length;
        say(
          critical > 0 ? "error" : warnings > 0 ? "warning" : "info",
          "Analyse",
          `${out.findings.length} finding${out.findings.length === 1 ? "" : "s"}: ` +
            `${critical} critical, ${warnings} to check.`,
        );
      }

      for (const n of out.notChecked) {
        say("info", "Analyse", `Not examined: ${n}`);
      }
    } catch (err) {
      say("error", "Analyse", err instanceof Error ? err.message : "The analysis did not run.");
    } finally {
      setAnalysing(false);
    }
  };

  const runWhy = async (tag: string) => {
    if (!analyse?.why || !program || !tag.trim()) return;
    setPanelOpen("messages", true);
    say("info", "Analyse", `What has to be true for ${tag} to come on:`);
    try {
      const out = await analyse.why(program, tag);
      if (out.note) {
        say("info", "Analyse", out.note);
        return;
      }
      if (out.lines.length === 0) {
        say("info", "Analyse", `Nothing in this program drives ${tag}.`);
        return;
      }
      for (const line of out.lines) {
        say("info", "Analyse", line);
      }
    } catch (err) {
      say("error", "Analyse", err instanceof Error ? err.message : "Could not trace that.");
    }
  };

  const menus: Menu[] = program
    ? [
        {
          label: "File",
          items: [
            { label: "Save project", shortcut: "Ctrl+S", onSelect: () => void save() },
            { label: "Download to controller", onSelect: downloadToPlc, separator: true },
            { label: "Upload from controller", onSelect: uploadFromPlc, disabled: !plcProgram },
            { label: "Add routine", onSelect: addRoutine, separator: true },
            {
              label: "Export as PDF",
              /*
               * Saved first, because the PDF is built on the server from what
               * is stored. Exporting before the debounce has fired would hand
               * somebody a document missing the last thing they drew, and they
               * would have no way of knowing.
               */
              onSelect: async () => {
                await save();
                setDirty(false);
                window.open(`/api/student/ladx/${projectId}/pdf`, "_blank");
              },
              separator: true,
            },
            { label: "Export project…", onSelect: exportProject, separator: true },
            { label: "Import project…", onSelect: importProject },
            { label: "Close project", onSelect: onBack, separator: true },
          ],
        },
        {
          label: "Edit",
          items: [
            { label: "Undo", shortcut: "Ctrl+Z", onSelect: undo, disabled: past.length === 0 },
            {
              label: "Redo",
              shortcut: "Shift+Ctrl+Z",
              onSelect: redo,
              disabled: future.length === 0,
            },
            {
              label: "Delete selection",
              shortcut: "Del",
              separator: true,
              disabled: !selectedId && !selectedRungId,
              onSelect: () => {
                if (selectedId) removeElement(selectedId);
                else if (selectedRungId) removeRung(selectedRungId);
              },
            },
            { label: "Add network", shortcut: "N", onSelect: addRung, separator: true },
            {
              label: "Branch around selection",
              shortcut: "B",
              onSelect: () => handleBarAction({ kind: "branch" }),
            },
          ],
        },
        {
          label: "View",
          items: [
            // Every panel, listed with a tick, so this menu is the complete
            // answer to "where did that go?", including a panel closed so
            // long ago that the person has forgotten it existed.
            ...PANELS.map((def) => ({
              label: `${layout[def.id].open ? "✓ " : "   "}${def.title}`,
              onSelect: () => setPanelOpen(def.id, !layout[def.id].open),
            })),
            {
              label: "Tag table",
              separator: true,
              onSelect: () => {
                setPanelOpen("tree", true);
                setTreeSel("tags");
              },
            },
            {
              label: "Program",
              onSelect: () => {
                setPanelOpen("tree", true);
                setTreeSel("routine");
              },
            },
            {
              label: "Show every panel",
              separator: true,
              onSelect: () =>
                applyLayout((l) => {
                  const next = { ...l };
                  for (const def of PANELS) next[def.id] = { ...next[def.id], open: true };
                  return next;
                }),
            },
            {
              label: simFloating ? "Dock the simulator back" : "Simulator in its own window",
              separator: true,
              onSelect: () => {
                if (simFloating) setSimFloating(false);
                else {
                  setPanelOpen("sim", true);
                  setSimFloating(true);
                }
              },
            },
            { label: "Reset layout", separator: true, onSelect: resetLayout },
          ],
        },
        {
          label: "History",
          items: [
            { label: `${past.length} step${past.length === 1 ? "" : "s"} to undo`, disabled: true },
            { label: `${future.length} to redo`, disabled: true },
            {
              label: "Clear history",
              separator: true,
              disabled: past.length === 0 && future.length === 0,
              onSelect: () => {
                setPast([]);
                setFuture([]);
              },
            },
          ],
        },
        ...(crossLinks.length || analyse
          ? [
              {
                label: "Tools",
                items: [
                  ...(analyse
                    ? [
                        {
                          label: analysing ? "Looking…" : analyse.label,
                          disabled: analysing,
                          onSelect: () => void runAnalysis(),
                        },
                      ]
                    : []),
                  // The rule on a separator here is that it goes before the
                  // item, so it belongs on the first cross link rather than on
                  // Analyse, which would put a line above the top of the menu.
                  ...crossLinks.map((l, i) => ({
                    label: l.label,
                    separator: i === 0 && Boolean(analyse),
                    onSelect: () => void followCrossLink(l.href),
                  })),
                ],
              },
            ]
          : []),
        {
          label: "Help",
          items: [
            { label: "Open the manual", shortcut: "F1", onSelect: () => openHelp("start") },
            { label: "Take the guided tour", onSelect: startTour },
            // Straight to the pages people actually look for, rather than
            // making them find the contents first.
            { label: "Getting started", separator: true, onSelect: () => openHelp("start") },
            { label: "Instruction reference", onSelect: () => openHelp("instructions") },
            { label: "Addresses, I0.0, Q0.1, T0", onSelect: () => openHelp("addressing") },
            { label: "Timer and counter members", onSelect: () => openHelp("members") },
            { label: "Branches", onSelect: () => openHelp("branches") },
            { label: "Keyboard shortcuts", onSelect: () => openHelp("editing") },
            { label: "Panels and layout", onSelect: () => openHelp("screen") },
            { label: "Saving, export and import", onSelect: () => openHelp("saving") },
            {
              label: "When something does not work",
              separator: true,
              onSelect: () => openHelp("troubleshooting"),
            },
          ],
        },
      ]
    : [];

  /**
   * One routine's networks.
   *
   * A function rather than a component so it keeps closing over the editing
   * handlers it already had, extracting it into a component would mean
   * threading two dozen callbacks through props for no gain. It takes the
   * rungs it is drawing, so the same code renders the docked canvas and a
   * routine popped out into its own window.
   */
  function renderRungs(rungs: Rung[], routineId?: string) {
    return (
      <>
        {rungs.length === 0 ? (
          <div
            onContextMenu={(e) => openMenu(e, canvasMenuItems())}
            className="rounded border border-dashed border-ink-400 bg-white px-5 py-10 text-center"
          >
            <p className="text-[13px] text-ink-700">No networks yet.</p>
            <button
              type="button"
              onClick={() => addRung()}
              className="mt-2 px-3 h-8 rounded-lg text-[12.5px] font-bold text-on-accent"
              style={{ background: LIVE }}
            >
              Add the first network
            </button>
          </div>
        ) : (
          rungs.map((r, i) => (
            <div key={r.id}>
              {/*
                  A strip between networks that only exists while a network is
                  being carried. Without a target between the cards there is
                  nowhere to say "here", the drop would have to land on a card
                  and guess above or below from the pointer, which is the kind
                  of guess that puts a network in the wrong place.
                */}
              <RungDropStrip index={i} onDropRung={moveRung} />
              <RungView
                rung={r}
                logic={rungLogic(r)}
                index={i}
                power={power}
                rungPowered={!!rungPower[r.id]}
                running={running}
                onDriveTag={driveTag}
                addressOf={addressOf}
                selectedId={selectedId}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelected}
                onBranchMenu={(e, branchId, path) =>
                  openMenu(e, branchMenuItems(r.id, branchId, path))
                }
                onSelect={(id) => {
                  setSelectedId(id);
                  setCursor(id ? { rungId: r.id, where: 0 } : null);
                }}
                onOpen={(el: ElNode) => {
                  setSelectedId(el.id);
                  setEditing({
                    id: el.id,
                    type: el.type,
                    tag: el.tag,
                    ...(el.preset !== undefined ? { preset: el.preset } : {}),
                    ...(el.operand !== undefined ? { operand: el.operand } : {}),
                    ...(el.dest !== undefined ? { dest: el.dest } : {}),
                  });
                }}
                onInsert={(parentPath, index, type) =>
                  insertInstruction(r.id, parentPath, index, type)
                }
                onBranch={(seriesPath, from, to) =>
                  setLogic(r.id, (cur) => branchSpan(cur, seriesPath, from, to) as never)
                }
                onOpenOutput={(el) => {
                  setSelectedId(el.id);
                  setEditing(el);
                }}
                onAddOutput={() => setPicker({ rungId: r.id, where: "output" })}
                onDropOutput={(type) => addOutput(r.id, type)}
                caret={
                  caret && caret.rungId === r.id ? { path: caret.path, index: caret.index } : null
                }
                selected={selectedRungId === r.id}
                collapsed={collapsed.has(r.id)}
                onSelectRung={() => {
                  setSelectedRungId(r.id);
                  setSelectedId(null);
                  setCaret(null);
                }}
                onToggleCollapse={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
                onRename={(title) =>
                  mutateRungs((rungs) =>
                    rungs.map((x) => (x.id === r.id ? { ...x, comment: title || undefined } : x)),
                  )
                }
                onDeleteRung={() => removeRung(r.id)}
                onPickUp={(el: ElNode) =>
                  setDrag({
                    kind: "element",
                    rungId: r.id,
                    elementId: el.id,
                    type: el.type,
                    isOutput: r.outputs.some((o: Element) => o.id === el.id),
                  })
                }
                onPickUpRung={() => setDrag({ kind: "rung", rungId: r.id })}
                onElementMenu={(e, el) =>
                  openMenu(
                    e,
                    elementMenuItems(
                      r.id,
                      el,
                      r.outputs.some((o: Element) => o.id === el.id),
                    ),
                  )
                }
                onOutputMenu={(e, el) => openMenu(e, elementMenuItems(r.id, el, true))}
                onRungMenu={(e) => openMenu(e, rungMenuItems(r.id))}
                onDropPayload={(parentPath, index) => {
                  const d = takeDrag();
                  clearDrag();
                  if (!d || d.kind !== "element") return false;
                  if (parentPath === "output") dropOnOutputRail(d, r.id);
                  else dropElementInGap(d, r.id, parentPath, index);
                  return true;
                }}
                onEdge={(parallelPath, side, grow) =>
                  setLogic(
                    r.id,
                    (cur) =>
                      (grow
                        ? extendBranch(cur, parallelPath, side)
                        : shrinkBranch(cur, parallelPath, side)) as never,
                  )
                }
                onGapClick={(seriesPath, index, seriesId) => {
                  // Clicking the wire between two contacts puts the insertion
                  // point there, and is also how a branch is drawn: the first
                  // click sets one end, the second click closes it.
                  if (
                    branchFrom &&
                    branchFrom.rungId === r.id &&
                    branchFrom.seriesId === seriesId
                  ) {
                    const a = Math.min(branchFrom.index, index);
                    const b = Math.max(branchFrom.index, index);
                    setBranchFrom(null);
                    setBranchHint(null);
                    if (b > a) {
                      setLogic(r.id, (cur) => branchSpan(cur, seriesPath, a, b - 1) as never);
                      setSelectedId(null);
                      setCaret({
                        rungId: r.id,
                        seriesId: "",
                        index: 0,
                        path: [...seriesPath, a, 1],
                      });
                      setBranchHint("Branch added. The next instruction you place goes into it.");
                      return;
                    }
                  }
                  // Clicking the gap the caret is already on puts it away.
                  // Without this the blue insertion line, once placed, stayed
                  // on the rung for ever with no way to dismiss it, including
                  // the one dropped into a new branch leg, which looked like
                  // leftover branch-drawing rather than an insertion point.
                  const sameGap =
                    caret &&
                    caret.rungId === r.id &&
                    caret.index === index &&
                    JSON.stringify(caret.path) === JSON.stringify(seriesPath);
                  setCaret(sameGap ? null : { rungId: r.id, seriesId, index, path: seriesPath });
                  setCursor({ rungId: r.id, where: 0 });
                  setSelectedId(null);
                }}
              />
            </div>
          ))
        )}

        {/* The last position, so a network can be moved to the end. */}
        {rungs.length > 0 && <RungDropStrip index={rungs.length} onDropRung={moveRung} />}

        {rungs.length > 0 && (
          <button
            type="button"
            onClick={() => addRung(routineId)}
            className="w-full h-9 rounded border border-dashed border-ink-400 bg-white text-[12.5px] font-semibold text-ink-700 hover:border-teal-500 hover:text-teal-500"
          >
            + Add network
          </button>
        )}
      </>
    );
  }

  return (
    <div className={`space-y-3 p-3 ${css.root}`}>
      {/* ── Menu bar, then toolbar, then palette ─────────────────────
          The order every PLC IDE uses, top to bottom. */}
      <div className="rounded-lg border border-ink-200 bg-white relative" style={{ zIndex: 30 }}>
        <MenuBar
          menus={menus}
          title={
            <span className="flex items-center gap-1.5 min-w-0">
              <LadxLogo size={11} tone="dark" />
              <span style={{ color: line.base }}>/</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                title="The project name. Click to rename."
                aria-label="Project name"
                className={css.projectName}
                size={Math.max(6, Math.min(30, name.length || 6))}
              />
            </span>
          }
        />

        {/* ── Toolbar ──────────────────────────────────────────────────
          One row, and no button explains itself in print.

          It used to be two rows of bordered boxes, each with a caption set
          underneath, "check for problems", "editor → PLC", which is a
          manual page pretending to be a toolbar. Twenty-odd bordered
          rectangles all competing at the same weight is why it read as busy
          however carefully the colours were chosen.

          Now: one line, one filled button (the one that commits), everything
          else quiet until you point at it. The captions moved into the hover
          cards, which can say more than a caption ever could and cost nothing
          when you are not asking. Separators are hairlines rather than filled
          trays, because a tray is another box.
      */}
        <div className={css.toolbar} data-tour="toolbar">
          {/* Save comes first.
            The project name has moved to the window header, where the name of
            the thing you are looking at belongs; a toolbar is for acting on
            it. That leaves Save at the left edge, which is where every editor
            puts it and where the hand goes without looking. */}
          <span data-tour="save-group">
            <Tip
              label={saving ? "Saving now" : dirty ? "Not saved yet" : "Saved"}
              text={
                saving
                  ? "Saving your changes."
                  : dirty
                    ? "Your work saves itself a moment after you stop editing. Click to save now."
                    : savedAt
                      ? // The reader's own clock, not the author's: this used to be
                        // pinned to Asia/Kolkata, which told a German engineer the
                        // wrong time. And retention is whatever the store says it
                        // is, see lib/storage.ts.
                        `Last saved ${new Date(savedAt).toLocaleTimeString()}.${
                          storageRef.current.retentionNote
                            ? ` ${storageRef.current.retentionNote}`
                            : ""
                        }`
                      : "Your work saves itself as you go."
              }
              topic="saving"
              onOpenHelp={openHelp}
            >
              <button
                type="button"
                onClick={save}
                disabled={saving}
                aria-label="Save now"
                className={css.saveState}
                data-state={saving ? "saving" : dirty ? "dirty" : "saved"}
              >
                {saving ? (
                  <Loader2 size={9} className="animate-spin" />
                ) : (
                  <span className={css.saveDot} />
                )}
                {saving ? "Saving" : dirty ? "Unsaved" : "Saved"}
              </button>
            </Tip>
          </span>

          <Tip
            label="Projects"
            text="Back to your list of projects."
            topic="saving"
            onOpenHelp={openHelp}
          >
            <button
              type="button"
              onClick={onBack}
              className={css.backBtn}
              aria-label="Back to your projects"
            >
              <ChevronLeft size={15} />
            </button>
          </Tip>

          {/* The other tools on this same program. One button each: there are
              two of them, and a menu for two items is a menu nobody opens. */}
          {crossLinks.map((l) => (
            <Tip
              key={l.href}
              label={l.label}
              text={l.hint ?? `Open ${l.label} on this program.`}
              topic="saving"
              onOpenHelp={openHelp}
            >
              <button
                type="button"
                onClick={() => void followCrossLink(l.href)}
                className={css.backBtn}
                aria-label={l.label}
              >
                <MonitorCog size={14} />
              </button>
            </Tip>
          ))}

          <span className={css.sep} />

          {/* Build and transfer. */}
          <span data-tour="transfer-group" className={css.group}>
            <Tip
              label="Compile"
              text="Check the program for problems without running it. Anything found is listed in Messages."
              topic="transfer"
              onOpenHelp={openHelp}
            >
              <button type="button" onClick={runCompile} className={css.tbtn}>
                <Hammer size={13} /> Compile
              </button>
            </Tip>

            <Tip
              label="Download"
              text="Send this program into the controller. Editor → PLC, this is the direction that catches everybody out."
              topic="transfer"
              onOpenHelp={openHelp}
            >
              <button
                type="button"
                onClick={downloadToPlc}
                className={css.tbtn}
                data-primary="true"
              >
                <ArrowDownToLine size={13} /> Download
              </button>
            </Tip>

            <Tip
              label="Upload"
              text={
                plcProgram
                  ? "Read back the program the controller is holding. PLC → editor."
                  : "Nothing has been downloaded yet, so there is nothing to read back."
              }
              topic="transfer"
              onOpenHelp={openHelp}
            >
              <button
                type="button"
                onClick={uploadFromPlc}
                disabled={!plcProgram}
                className={css.tbtn}
              >
                <ArrowUpFromLine size={13} /> Upload
              </button>
            </Tip>

            {/* The controller's own state, as a lamp. No wording, the tooltip
              carries it, and "PLC LOADED" in a coloured box was one more
              rectangle shouting at the same volume as the buttons. */}
            <Tip
              label={plcProgram ? "Controller loaded" : "Controller empty"}
              text={
                plcProgram
                  ? "The controller is holding a program. Press Simulate to run it."
                  : "Nothing has been downloaded yet. Press Download to transfer your program in."
              }
              topic="transfer"
              onOpenHelp={openHelp}
            >
              <span
                className={css.plcLamp}
                data-loaded={plcProgram ? "true" : "false"}
                aria-label={plcProgram ? "PLC loaded" : "PLC empty"}
              >
                <span className={css.plcDot} />
                PLC
              </span>
            </Tip>
          </span>

          <span className={css.sep} />

          {/* Run. */}
          <span className={css.group}>
            {running ? (
              <button
                type="button"
                onClick={() => setRunning(false)}
                className={`${css.tbtn} ${css.stopBtn}`}
              >
                <Square size={12} /> Stop
              </button>
            ) : (
              <Tip
                label="Simulate"
                text="Run the program and watch power flow through the rungs."
                topic="simulator"
                onOpenHelp={openHelp}
              >
                <button
                  type="button"
                  onClick={startSimulation}
                  className={`${css.tbtn} ${css.startBtn}`}
                >
                  <Play size={12} /> Simulate
                </button>
              </Tip>
            )}

            <Tip
              label="Reset"
              text="Stop, and clear every output, timer and counter back to zero."
              topic="simulator"
              onOpenHelp={openHelp}
            >
              <button
                type="button"
                onClick={stopAndReset}
                aria-label="Reset"
                className={css.iconOnly}
              >
                <RotateCcw size={13} />
              </button>
            </Tip>

            <Tip
              label="Scan rate"
              text="How long the controller takes over one pass of the program. Slow it down to watch what is happening."
              topic="simulator"
              onOpenHelp={openHelp}
            >
              <select
                value={program.scanMs}
                onChange={(e) => mutate((p) => ({ ...p, scanMs: Number(e.target.value) }))}
                aria-label="Scan rate"
                className={css.scanSelect}
              >
                <option value={20}>20 ms</option>
                <option value={50}>50 ms</option>
                <option value={100}>100 ms</option>
                <option value={250}>250 ms</option>
                <option value={500}>500 ms</option>
              </select>
            </Tip>

            {running && (
              <span className={css.runBadge}>
                <Radio size={9} className={css.scanPulse} />
                {scanCount}
              </span>
            )}
          </span>

          <span className={css.spacer} />

          {exercises.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const ex = exercises.find((x) => x.id === e.target.value);
                if (ex) setSubmitTo(ex);
              }}
              className={css.scanSelect}
              title="Submit this program as an answer to an exercise"
            >
              <option value="">Submit to exercise…</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.marks} marks)
                </option>
              ))}
            </select>
          )}

          {/* Reached for when you are stuck, not when you are working, so they
            sit apart, icon-only, and stay out of the way. */}
          <Tip
            label="Take the tour"
            text="A short guided walk through the editor. You can leave at any point."
            topic="start"
            onOpenHelp={openHelp}
          >
            <button
              type="button"
              onClick={() => {
                setTourOffered(false);
                startTour();
              }}
              data-tour="tour-button"
              aria-label="Take the guided tour"
              className={css.iconOnly}
              data-flag={tourOffered ? "true" : "false"}
            >
              <Compass size={14} />
            </button>
          </Tip>

          <Tip
            label="Help"
            text="Every instruction drawn and explained, every panel, and the mistakes people usually make. F1 anywhere."
            topic="start"
            onOpenHelp={openHelp}
          >
            <button
              type="button"
              onClick={() => openHelp("start")}
              aria-label="Open the manual"
              className={css.iconOnly}
            >
              <HelpCircle size={14} />
            </button>
          </Tip>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-danger">
            <AlertTriangle size={13} /> {error}
          </p>
        )}
        {submitMsg && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-neon-green">
            <CheckCircle2 size={13} /> {submitMsg}
          </p>
        )}
        {runtimeErrors.map((e) => (
          <p key={e} className="flex items-center gap-1.5 text-[12.5px] text-danger">
            <AlertTriangle size={13} /> {e}
          </p>
        ))}
      </div>

      {/* Feedback lands here, directly under the button that caused it. The
          compiler panel at the foot of the page is below the fold in
          fullscreen, so pressing Compile appeared to do nothing at all. */}
      {flash && (
        <p
          className="flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11.5px]"
          style={
            flash.tone === "ok"
              ? { borderColor: "#16A34A55", background: "#F0FDF4", color: "#15803D" }
              : flash.tone === "warn"
                ? { borderColor: "#F59E0B66", background: "#FFFBEB", color: "#B45309" }
                : { borderColor: "#2891FF55", background: "#2891FF10", color: "#1d4ed8" }
          }
        >
          {flash.tone === "ok" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          <span className="flex-1">{flash.text}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            className="text-ink-500 hover:text-ink-900"
          >
            ×
          </button>
        </p>
      )}

      {/* ── The workspace ───────────────────────────────────────────
          Panels around a canvas. Each one closes to the dock along the
          bottom rather than vanishing, resizes by the seam beside it, and
          comes back from the dock or the View menu. The canvas holds the
          middle and is never closable, there would be nothing left. */}
      <div
        ref={workspaceRef}
        className="flex flex-col gap-1 rounded-lg bg-ink-100 p-2"
        style={{ height: workspaceH ?? "80vh", minHeight: 460 }}
      >
        {/* Instructions run the full width above the work area, which is
            where a real IDE puts its instruction toolbar. */}
        {layout.instructions.open && (
          <>
            <div className="shrink-0 min-h-0 flex" style={{ height: layout.instructions.size }}>
              <Panel
                id="instructions"
                onClose={(id) => setPanelOpen(id, false)}
                onHelp={openHelp}
                bodyClass="flex-1 min-h-0 overflow-auto"
                style={{ flex: 1 }}
              >
                <InstructionBar
                  canDelete={!!selectedId}
                  branchArmed={!!branchFrom}
                  onAction={handleBarAction}
                  onHelp={openHelp}
                  disabled={!program}
                  hint={
                    cursor
                      ? cursor.where === "output"
                        ? "Inserting on the output side"
                        : `Inserting into branch ${(cursor.where as number) + 1}`
                      : "Click a + on a network to choose where instructions go"
                  }
                />
              </Panel>
            </div>
            <Resizer
              id="instructions"
              axis="y"
              size={layout.instructions.size}
              onSize={setPanelSize}
            />
          </>
        )}

        {/* The three columns.
            Scrolls sideways rather than crushing the canvas. With every panel
            open on a 1024px screen the ladder was being squeezed to 185px, narrower than a single rung, because flex happily shrinks the one
            child that has no minimum. The canvas now has a floor and this row
            scrolls past it, which is honest: the work area stays usable and
            closing a panel (or dragging a seam in) makes the scroll go away. */}
        <div className="flex-1 min-h-0 flex overflow-x-auto">
          {layout.tree.open && (
            <>
              <div className="shrink-0 min-w-0 flex" style={{ width: layout.tree.size }}>
                <Panel
                  id="tree"
                  onClose={(id) => setPanelOpen(id, false)}
                  onHelp={openHelp}
                  bodyClass="flex-1 min-h-0 overflow-auto flex flex-col"
                  style={{ flex: 1 }}
                >
                  <ProjectTree
                    onRoutineMenu={(e, id, i) => openMenu(e, routineMenuItems(id, i))}
                    onTreeMenu={(e) => {
                      // Only when the click was on the panel itself. A row handles
                      // its own, and both firing would show the wrong menu.
                      if (e.target !== e.currentTarget) return;
                      openMenu(e, treeMenuItems());
                    }}
                    projectName={name}
                    routines={routines}
                    tagCount={program.tags.length}
                    simFloating={simOpen}
                    tagsFloating={tagsFloating}
                    selection={
                      treeSel === "tags"
                        ? { kind: "tags" }
                        : treeSel === "sim"
                          ? { kind: "sim" }
                          : { kind: "routine", id: activeRoutine?.id ?? "" }
                    }
                    onSelect={(sel) => {
                      if (sel.kind === "routine") {
                        openRoutine(sel.id);
                      } else if (sel.kind === "sim") {
                        setTreeSel("sim");
                        setSimOpen(true);
                      } else {
                        setTreeSel("tags");
                      }
                    }}
                    onAddRoutine={addRoutine}
                    onRenameRoutine={renameRoutine}
                    onDeleteRoutine={deleteRoutine}
                    onPopOut={(what) => {
                      // The tree's pop-out icon means "in its own window", for both.
                      if (what === "sim") {
                        setPanelOpen("sim", true);
                        setSimFloating(true);
                      } else setTagsFloating((v) => !v);
                    }}
                  />

                  {/* The tag table opens inside the project column, where a
                controller keeps it and where every IDE shows it. */}
                  {treeSel === "tags" && !tagsFloating && (
                    <div
                      className="border-t border-ink-200 flex-1 min-h-0 flex flex-col"
                      style={{ minHeight: "16rem" }}
                    >
                      <button
                        type="button"
                        onClick={() => setTagsFloating(true)}
                        className="flex items-center gap-1 px-2 shrink-0 self-end"
                        style={{ height: 20, fontSize: 9.5, color: ink.faint }}
                        title="Open the tag table in its own window, it is wider than this column"
                      >
                        <ExternalLink size={10} /> Pop out
                      </button>
                      <TagTable
                        tags={program.tags}
                        onChange={updateTag}
                        onAdd={addTag}
                        onRemove={removeTag}
                        disabled={running}
                      />
                    </div>
                  )}
                </Panel>
              </div>
              <Resizer id="tree" axis="x" size={layout.tree.size} onSize={setPanelSize} />
            </>
          )}

          {/* ── Ladder ──────────────────────────────────────────────
              Always present. Everything else can be put away; the rungs
              cannot, because they are what the editor is. */}
          <div
            className="flex-1 min-w-0 flex flex-col"
            style={{
              minWidth: 360,
              border: `1px solid ${running ? state.live : line.base}`,
              boxShadow: running ? `0 0 0 2px ${state.live}22` : "none",
              borderRadius: radius.md,
              background: surface.raised,
              overflow: "hidden",
              transition:
                "border-color 160ms cubic-bezier(0.2,0,0,1), box-shadow 160ms cubic-bezier(0.2,0,0,1)",
            }}
          >
            {/* Zoom, sitting with the routine name rather than in the toolbar:
                it acts on this view, not on the program. */}
            {/* ── Routine tabs ───────────────────────────────────
                Several routines open at once, so following a JSR does not
                cost you the page you came from. Main cannot be closed, it is the one the controller runs. */}
            {openRoutines.length > 1 && (
              <div className={css.tabStrip}>
                {openRoutines.map((r, i) => (
                  <span
                    key={r.id}
                    className={css.tab}
                    data-active={r.id === activeRoutine?.id ? "true" : "false"}
                  >
                    <button
                      type="button"
                      onClick={() => openRoutine(r.id)}
                      className={css.tabLabel}
                      title={`${r.rungs.length} network${r.rungs.length === 1 ? "" : "s"}`}
                    >
                      {r.name}
                      <span className={css.tabCount}>{r.rungs.length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        popOutRoutine(r.id);
                      }}
                      className={css.tabClose}
                      aria-label={`Pop out ${r.name}`}
                      title={`Open ${r.name} in its own window, drag it beside the routine that calls it`}
                    >
                      <ExternalLink size={9} />
                    </button>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeRoutineTab(r.id);
                        }}
                        className={css.tabClose}
                        aria-label={`Close ${r.name}`}
                        title={`Close ${r.name}, the routine stays in the project`}
                      >
                        <X size={9} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            <div
              className="flex items-center gap-1.5 px-2 shrink-0"
              style={{
                height: 24,
                borderBottom: `1px solid ${running ? state.live : line.soft}`,
                background: running ? state.liveWash : surface.subtle,
              }}
            >
              {/* Online, and saying so where the rungs are, not only on a
                  toolbar the eye has left behind. */}
              {running && (
                <span className={css.onlineBadge}>
                  <span className={`${css.onlineDot} ${css.scanPulse}`} />
                  ONLINE
                </span>
              )}
              <span style={{ fontSize: 10, color: running ? state.live : ink.muted }}>
                {running ? "Watching " : "Editing "}
                <b style={{ color: running ? state.live : ink.strong }}>
                  {activeRoutine?.name ?? "Main"}
                </b>
                {running ? (
                  <span style={{ color: state.live }}> · click an input contact to operate it</span>
                ) : (
                  routines.length > 1 && (
                    <span style={{ color: ink.faint }}>
                      {" "}
                      · {routines.length} routines · call one with a JSR
                    </span>
                  )
                )}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => zoomBy(-1)}
                disabled={zoom === ZOOMS[0]}
                title="Zoom out  ·  Ctrl −"
                aria-label="Zoom out"
                className={css.iconBtn}
              >
                <ZoomOut size={12} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Back to 100%  ·  Ctrl 0"
                aria-label="Reset zoom"
                className="px-1 tabular-nums"
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  minWidth: 32,
                  color: zoom === 1 ? ink.faint : brand.tealInk,
                }}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => zoomBy(1)}
                disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                title="Zoom in  ·  Ctrl +"
                aria-label="Zoom in"
                className={css.iconBtn}
              >
                <ZoomIn size={12} />
              </button>
            </div>

            <div
              data-tour="canvas"
              className="flex-1 overflow-auto px-2.5 py-2 space-y-2.5"
              onWheel={(e) => {
                // Ctrl+wheel is the zoom gesture everywhere, including the
                // trackpad pinch, which browsers report as a ctrl-wheel.
                if (!e.ctrlKey && !e.metaKey) return;
                e.preventDefault();
                zoomBy(e.deltaY < 0 ? 1 : -1);
              }}
              style={{
                // Scaled rather than re-laid-out, so a zoomed rung is the same
                // rung, nothing reflows, nothing moves under the pointer.
                zoom,
              }}
            >
              {renderRungs(activeRungs, activeRoutine?.id)}
            </div>
          </div>

          {/* ── I/O, tags and the simulator ──────────────────────── */}
          {layout.io.open && (
            <>
              <Resizer id="io" axis="x" invert size={layout.io.size} onSize={setPanelSize} />
              <div className="shrink-0 min-w-0 flex" style={{ width: layout.io.size }}>
                <Panel
                  id="io"
                  onClose={(id) => setPanelOpen(id, false)}
                  onHelp={openHelp}
                  bodyClass="flex-1 min-h-0 overflow-auto p-2 space-y-2.5"
                  style={{ flex: 1 }}
                >
                  <div className="rounded border border-ink-200 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">
                      Inputs
                    </p>
                    {inputs.length === 0 ? (
                      <p className="text-[11.5px] text-ink-500">
                        Tick &ldquo;input&rdquo; on a tag to get a switch here.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {inputs.map((t) =>
                          t.type === "INT" ? (
                            <div key={t.name}>
                              <span className="flex justify-between text-[11.5px]">
                                <span className="font-medium text-ink-900">
                                  {t.name}
                                  {t.address && (
                                    <span
                                      className="ml-1.5 font-mono font-normal"
                                      style={{ fontSize: 9, color: brand.tealInk }}
                                    >
                                      {t.address}
                                    </span>
                                  )}
                                </span>
                                <span className="font-mono font-bold" style={{ color: "#16A34A" }}>
                                  {t.value}
                                </span>
                              </span>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={t.value}
                                onChange={(e) => setAnalog(t.name, Number(e.target.value))}
                                className="w-full accent-teal-500"
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              key={t.name}
                              onClick={() => toggleInput(t.name)}
                              className="w-full flex items-center gap-2 px-2 h-9 rounded border bg-white hover:bg-ink-50 transition-colors"
                              style={{ borderColor: t.value ? "#16A34A" : "#C9D2DC" }}
                              title={`${t.name}, click to toggle`}
                            >
                              {/* A switch that looks like a switch: track and knob. */}
                              <span
                                className="relative shrink-0 rounded-full transition-colors"
                                style={{
                                  width: 30,
                                  height: 16,
                                  background: t.value ? "#16A34A" : "#94A3B8",
                                }}
                              >
                                <span
                                  className="absolute rounded-full bg-white shadow transition-all"
                                  style={{ width: 12, height: 12, top: 2, left: t.value ? 16 : 2 }}
                                />
                              </span>
                              <span className="flex-1 min-w-0 text-left">
                                <span className="block text-[11.5px] font-medium text-ink-900 truncate">
                                  {t.name}
                                </span>
                                {/* The terminal. A student who only ever sees the name
                            cannot find the signal on a real panel. */}
                                {t.address && (
                                  <span
                                    className="block text-[9px] font-mono"
                                    style={{ color: brand.tealInk }}
                                  >
                                    {t.address}
                                  </span>
                                )}
                              </span>
                              <span
                                className="text-[9.5px] font-mono font-bold shrink-0"
                                style={{ color: t.value ? "#16A34A" : "#94A3B8" }}
                              >
                                {t.value ? "1" : "0"}
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded border border-ink-200 bg-white p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">
                      Outputs
                    </p>
                    {outputs.length === 0 ? (
                      <p className="text-[11.5px] text-ink-500">
                        Tick &ldquo;output&rdquo; on a tag to get a lamp here.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {outputs.map((t) => (
                          <div
                            key={t.name}
                            className="flex items-center gap-2 px-2 h-9 rounded border bg-white"
                            style={{ borderColor: t.value ? "#16A34A" : "#E2E8F0" }}
                          >
                            <span
                              className="w-4 h-4 rounded-full shrink-0 border-2 transition-all"
                              style={{
                                background: t.value ? "#22C55E" : "#E2E8F0",
                                borderColor: t.value ? "#15803D" : "#C9D2DC",
                                boxShadow: t.value ? "0 0 9px rgba(34,197,94,0.75)" : "none",
                              }}
                            />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[11.5px] font-medium text-ink-900 truncate">
                                {t.name}
                              </span>
                              {t.address && (
                                <span
                                  className="block text-[9px] font-mono"
                                  style={{ color: brand.tealInk }}
                                >
                                  {t.address}
                                </span>
                              )}
                            </span>
                            <span
                              className="text-[9.5px] font-mono font-bold"
                              style={{ color: t.value ? "#16A34A" : "#94A3B8" }}
                            >
                              {t.value ? "1" : "0"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded border border-ink-200 bg-white p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                        Tags
                      </p>
                      <button
                        type="button"
                        onClick={addTag}
                        // The text-safe teal, not the fill teal: at 11px the
                        // brighter one measured 2.45 to 1 on white, and this
                        // is a control somebody is meant to find and press.
                        className="text-[11px] font-semibold text-teal-700"
                      >
                        + Add
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {program.tags.map((t, i) => (
                        <div
                          key={i}
                          className="rounded border border-ink-100 bg-ink-50 p-1.5 space-y-1"
                        >
                          <div className="flex items-center gap-1">
                            <input
                              value={t.name}
                              onChange={(e) => updateTag(i, { name: e.target.value })}
                              className="flex-1 min-w-0 bg-transparent text-[11.5px] font-mono text-ink-900 outline-none"
                            />
                            <select
                              value={t.type}
                              onChange={(e) =>
                                updateTag(i, { type: e.target.value as Tag["type"] })
                              }
                              className="bg-white border border-ink-200 rounded text-[10px] text-ink-700 px-0.5"
                            >
                              <option value="BOOL">BOOL</option>
                              <option value="INT">INT</option>
                              <option value="TIMER">TIMER</option>
                              <option value="COUNTER">COUNTER</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeTag(i)}
                              className="text-ink-400 hover:text-danger"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-ink-700">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!t.isInput}
                                onChange={(e) => updateTag(i, { isInput: e.target.checked })}
                                className="accent-teal-500"
                              />
                              input
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!t.isOutput}
                                onChange={(e) => updateTag(i, { isOutput: e.target.checked })}
                                className="accent-teal-500"
                              />
                              output
                            </label>
                            {(t.isInput || t.isOutput) && (
                              <select
                                value={t.device ?? defaultDevice(t)}
                                onChange={(e) =>
                                  updateTag(i, { device: e.target.value as Tag["device"] })
                                }
                                title="What this tag is wired to. It decides how the simulator control behaves."
                                className="bg-white border border-ink-200 rounded text-[10px] text-ink-700 px-0.5 max-w-[8.5rem]"
                              >
                                {(t.isOutput ? OUTPUT_DEVICES : INPUT_DEVICES).map((d) => (
                                  <option key={d} value={d}>
                                    {DEVICE_LABEL[d]}
                                  </option>
                                ))}
                              </select>
                            )}
                            {(t.type === "TIMER" || t.type === "COUNTER") && (
                              <input
                                type="number"
                                value={t.preset ?? 0}
                                onChange={(e) => updateTag(i, { preset: Number(e.target.value) })}
                                title={
                                  t.type === "TIMER" ? "Preset in milliseconds" : "Preset count"
                                }
                                className="ml-auto w-16 bg-white border border-ink-200 rounded px-1 text-[10px] text-ink-900"
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              </div>
            </>
          )}

          {/* The simulator, docked. It used to be a floating window that had
              to be dragged out of the way; as a panel it closes to the dock
              like everything else and cannot end up lost behind the page. */}
          {layout.sim.open && !simFloating && (
            <>
              <Resizer id="sim" axis="x" invert size={layout.sim.size} onSize={setPanelSize} />
              <div className="shrink-0 min-w-0 flex" style={{ width: layout.sim.size }}>
                <Panel
                  id="sim"
                  onClose={(id) => {
                    setPanelOpen(id, false);
                    setRunning(false);
                  }}
                  onHelp={openHelp}
                  bodyClass="flex-1 min-h-0 overflow-auto"
                  style={{ flex: 1 }}
                  actions={
                    <Tip
                      label="Pop out"
                      text="Move the simulator into its own window, drag it anywhere, or onto a second screen."
                      topic="simulator"
                      onOpenHelp={openHelp}
                      place="bottom"
                    >
                      <button
                        type="button"
                        onClick={() => setSimFloating(true)}
                        aria-label="Pop the simulator out into its own window"
                        className={css.iconBtn}
                      >
                        <ExternalLink size={11} />
                      </button>
                    </Tip>
                  }
                >
                  <SimPanel
                    tags={tags}
                    running={running}
                    scanCount={scanCount}
                    errors={runtimeErrors}
                    onStart={startSimulation}
                    onStop={() => setRunning(false)}
                    onReset={stopAndReset}
                    plc={{
                      powered: simOpen,
                      downloaded: !!plcProgram,
                      running,
                      faulted: (compile?.problems.length ?? 0) > 0 && !running,
                    }}
                    handlers={{ hold: holdInput, toggle: toggleInput, setValue: setAnalog }}
                  />
                </Panel>
              </div>
            </>
          )}
        </div>

        {/* ── Messages ────────────────────────────────────────────────
            Full width along the foot, where every IDE puts its output
            window, and where the eye goes after pressing Compile. */}
        {layout.messages.open && (
          <>
            <Resizer
              id="messages"
              axis="y"
              invert
              size={layout.messages.size}
              onSize={setPanelSize}
            />
            <div className="shrink-0 min-h-0 flex" style={{ height: layout.messages.size }}>
              <Panel
                id="messages"
                onClose={(id) => setPanelOpen(id, false)}
                onHelp={openHelp}
                bodyClass="flex-1 min-h-0"
                style={{ flex: 1 }}
              >
                <MessageLog log={log} onClear={() => setLog([])} />
              </Panel>
            </div>
          </>
        )}

        {/* Whatever has been closed, and the way back.
            shrink-0 and last in the column, so it stays pinned to the foot of
            the workspace however tall the panels above it get. */}
        <PanelDock
          layout={layout}
          onOpen={(id) => setPanelOpen(id, true)}
          onReset={resetLayout}
          onHelp={openHelp}
        />

        {bottomDock?.({
          program,
          load: (next) =>
            mutate(() => {
              // Whatever comes back is a whole program. Routines are dropped
              // rather than merged: a generated program is a flat list of
              // rungs, and programRoutines migrates that into Main on read,
              // which is the same path a legacy saved program takes.
              const { routines: _dropped, ...flat } = next as LadxProgram & {
                routines?: unknown;
              };
              return flat as LadxProgram;
            }),
        })}
      </div>

      {branchHint && (
        <p
          className="flex items-start gap-1.5 rounded border px-2.5 py-1.5 text-[11.5px]"
          style={{ borderColor: "#2891FF55", background: "#2891FF10", color: "#1d4ed8" }}
        >
          <GitBranch size={12} className="mt-0.5 shrink-0" />
          <span className="flex-1">{branchHint}</span>
          <button
            type="button"
            onClick={() => setBranchHint(null)}
            className="text-ink-500 hover:text-ink-900"
          >
            ×
          </button>
        </p>
      )}

      {/* ── Routines in their own windows ───────────────────────────
          The reason to want this is a JSR: the routine that calls and the
          routine that runs, side by side, instead of one behind the other.
          FloatingWindow brings minimise and dock-back with it. */}
      {poppedRoutines.map((r) => (
        <FloatingWindow
          key={r.id}
          storageKey={`ladx-routine-${r.id}`}
          title={`LADX Mini, ${r.name}`}
          onClose={() => dockRoutine(r.id)}
          onDock={() => dockRoutine(r.id)}
          defaultWidth={640}
          defaultHeight={460}
        >
          <div
            className="flex-1 min-h-0 overflow-auto px-2.5 py-2 space-y-2.5"
            style={{ background: surface.raised }}
            onContextMenu={(e) => {
              if (e.target === e.currentTarget) openMenu(e, canvasMenuItems());
            }}
          >
            {renderRungs(r.rungs, r.id)}
          </div>
        </FloatingWindow>
      ))}

      {/* The simulator in its own window. Same component, same state, only
          the frame around it differs, so popping in and out never loses what
          the controller is doing. */}
      {layout.sim.open && simFloating && (
        <FloatingWindow
          storageKey="ladx-sim"
          title="LADX Mini, Simulator"
          onClose={() => {
            setSimFloating(false);
            setPanelOpen("sim", false);
            setRunning(false);
          }}
          defaultWidth={360}
          defaultHeight={560}
          onDock={() => setSimFloating(false)}
        >
          <SimPanel
            tags={tags}
            running={running}
            scanCount={scanCount}
            errors={runtimeErrors}
            onStart={startSimulation}
            onStop={() => setRunning(false)}
            onReset={stopAndReset}
            plc={{
              powered: layout.sim.open,
              downloaded: !!plcProgram,
              running,
              faulted: (compile?.problems.length ?? 0) > 0 && !running,
            }}
            handlers={{ hold: holdInput, toggle: toggleInput, setValue: setAnalog }}
          />
        </FloatingWindow>
      )}

      {tagsFloating && (
        <FloatingWindow
          storageKey="ladx-tags"
          title="LADX Mini, Tag table"
          onClose={() => setTagsFloating(false)}
          onDock={() => setTagsFloating(false)}
          defaultWidth={620}
          defaultHeight={460}
        >
          <TagTable
            tags={program.tags}
            onChange={updateTag}
            onAdd={addTag}
            onRemove={removeTag}
            disabled={running}
          />
        </FloatingWindow>
      )}

      {ask && (
        <Modal onClose={() => setAsk(null)} title={ask.title}>
          {ask.body && <p className="text-[12.5px] text-text-secondary mb-3">{ask.body}</p>}
          {ask.input && (
            <input
              autoFocus
              defaultValue={ask.input.value}
              id="ladx-ask-input"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = (e.target as HTMLInputElement).value;
                  ask.onConfirm(v);
                  setAsk(null);
                }
              }}
              className="w-full h-9 px-2.5 mb-3 rounded-lg bg-dark-primary border border-white/10 text-[13px] text-text-primary"
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAsk(null)}
              className="px-3 h-9 rounded-lg border border-white/[0.12] text-[12.5px] font-semibold text-text-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const v = ask.input
                  ? ((document.getElementById("ladx-ask-input") as HTMLInputElement | null)
                      ?.value ?? "")
                  : "";
                ask.onConfirm(v);
                setAsk(null);
              }}
              className="px-3 h-9 rounded-lg text-[12.5px] font-bold"
              style={
                ask.danger
                  ? { background: "#B3382C", color: "#fff" }
                  : { background: LIVE, color: "#08201f" }
              }
            >
              {ask.confirmLabel}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Submit to an exercise ───────────────────────────────── */}
      {submitTo && (
        <Modal onClose={() => setSubmitTo(null)} title="Submit as your answer">
          <p className="text-[13px] font-semibold text-text-primary mb-1">{submitTo.title}</p>
          <p className="text-[12.5px] text-text-secondary whitespace-pre-wrap leading-relaxed mb-3">
            {submitTo.brief}
          </p>
          <p className="text-[12px] text-text-muted mb-4">
            Your program is sent as it stands, {totalRungs} network
            {totalRungs === 1 ? "" : "s"}, worth {submitTo.marks} marks, pass {submitTo.passPercent}
            %. You can keep editing afterwards; it will not change what was submitted.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submitExercise(submitTo)}
              disabled={submitting || totalRungs === 0}
              className="flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13px] font-bold text-on-accent disabled:opacity-40"
              style={{ background: LIVE }}
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              Submit for marking
            </button>
            <button
              type="button"
              onClick={() => setSubmitTo(null)}
              className="px-4 h-9 rounded-lg text-[13px] font-semibold text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Instruction picker ──────────────────────────────────── */}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />

      <TransferOverlay kind={transfer} projectName={name} onDone={() => setTransfer(null)} />

      {notice && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            maxWidth: 460,
            padding: "9px 14px",
            borderRadius: 6,
            background: "#0F2030",
            color: "#F1F5F9",
            fontSize: 12.5,
            boxShadow: "0 8px 24px rgba(15,32,48,0.3)",
          }}
        >
          {notice}
        </div>
      )}

      {picker && (
        <Popover
          anchorSelector={`[data-rung-id="${cssEscape(picker.rungId)}"]`}
          onClose={() => setPicker(null)}
          title="Add an instruction"
          width={320}
        >
          {(["Bit", "Timer/Counter", "Compare", "Move/Math"] as const).map((group) => {
            const items = INSTRUCTIONS.filter(
              (i) =>
                i.group === group &&
                (picker.where === "output" ? i.side === "output" : i.side === "input"),
            );
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  {group}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map((i) => (
                    <button
                      type="button"
                      key={i.type}
                      onClick={() => {
                        if (picker.where === "output") addOutput(picker.rungId, i.type);
                        else insertInstruction(picker.rungId, [], 999, i.type);
                        setPicker(null);
                      }}
                      className="text-left px-2.5 py-1.5 rounded-lg border border-white/[0.1] hover:border-teal-500/50 hover:bg-teal-500/[0.06]"
                    >
                      <span className="block text-[12px] font-bold text-text-primary">
                        {i.type}
                      </span>
                      <span className="block text-[10.5px] text-text-muted">{i.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </Popover>
      )}

      {/* ── Element editor ──────────────────────────────────────── */}
      {editing && (
        <Popover
          anchorSelector={`[data-el-id="${cssEscape(editing.id)}"]`}
          onClose={() => setEditing(null)}
          title={`${editing.type}, ${INSTRUCTION_BY_TYPE.get(editing.type)?.label ?? ""}`}
        >
          <p className="text-[12px] text-text-muted mb-3">
            {INSTRUCTION_BY_TYPE.get(editing.type)?.help}
          </p>

          {editing.type === "JSR" ? (
            <label className="block mb-2.5">
              <span className="block text-[11px] font-semibold text-text-muted mb-1">
                Routine to call
              </span>
              <select
                value={editing.tag}
                onChange={(e) => {
                  const next = { ...editing, tag: e.target.value };
                  setEditing(next);
                  updateElement(next);
                }}
                className="w-full h-9 px-2.5 rounded-lg bg-dark-primary border border-white/10 text-[13px] text-text-primary"
              >
                <option value="">Choose a routine…</option>
                {routines
                  // Calling Main from inside the program would recurse; the
                  // engine catches it, but there is no reason to offer it.
                  .filter((r, i) => i > 0)
                  .map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
              </select>
              {routines.length < 2 && (
                <span className="block text-[11.5px] text-warning mt-1">
                  There are no other routines yet. Add one with + in the project tree.
                </span>
              )}
            </label>
          ) : (
            <label className="block mb-2.5">
              <span className="block text-[11px] font-semibold text-text-muted mb-1">Tag</span>
              <input
                list="ladx-tags"
                value={editing.tag}
                onChange={(e) => {
                  const next = { ...editing, tag: e.target.value };
                  setEditing(next);
                  updateElement(next);
                }}
                placeholder="Start_PB, or T1.DN"
                className="w-full h-9 px-2.5 rounded-lg bg-dark-primary border border-white/10 text-[13px] font-mono text-text-primary"
              />
            </label>
          )}

          {/* Declare-on-the-spot. A contact whose tag was never declared
              compiles with an "unknown tag" warning and gives the simulator
              nothing to switch, which is a dead end a beginner cannot read
              their way out of. */}
          {INSTRUCTION_BY_TYPE.get(editing.type)?.side === "input" && (
            <button
              type="button"
              onClick={() => {
                setSelectedId(editing.id);
                setEditing(null);
                // Defer so the modal has closed and the selection is settled
                // before the tree is rewritten underneath it.
                setTimeout(() => branchAroundSelection(), 0);
              }}
              className="w-full mb-3 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-teal-500/40 bg-teal-500/[0.08] text-[12.5px] font-bold text-teal-500"
            >
              <GitBranch size={13} /> Branch around this contact
            </button>
          )}

          {/* A JSR names a routine, not a tag, so it must not be offered
              a place in the tag table. */}
          {editing.type !== "JSR" &&
            editing.tag.trim() !== "" &&
            !tagExists(editing.tag) &&
            (() => {
              const spec = INSTRUCTION_BY_TYPE.get(editing.type);
              const isOutputSide = spec?.side === "output";
              const wantsTimer = editing.type === "TON" || editing.type === "TOF";
              const wantsCounter = editing.type === "CTU" || editing.type === "CTD";
              const dataType: Tag["type"] = wantsTimer
                ? "TIMER"
                : wantsCounter
                  ? "COUNTER"
                  : "BOOL";
              const devices = isOutputSide ? OUTPUT_DEVICES : INPUT_DEVICES;

              return (
                <div className="rounded-lg border border-teal-500/40 bg-teal-500/[0.06] p-3 mb-3">
                  <p className="text-[12px] font-bold text-text-primary">
                    &ldquo;{editing.tag.includes(".") ? editing.tag.split(".")[0] : editing.tag}
                    &rdquo; is not declared yet.
                  </p>
                  <p className="text-[11.5px] text-text-muted mt-0.5 mb-2">
                    {dataType === "BOOL"
                      ? `Add it to the tag table as ${isOutputSide ? "an output" : "an input"} and say what it is wired to.`
                      : `Add it to the tag table as a ${dataType.toLowerCase()}.`}
                  </p>

                  {dataType === "BOOL" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {devices.map((d) => (
                        <button
                          type="button"
                          key={d}
                          onClick={() =>
                            declareTag(editing.tag, {
                              type: d === "VALUE" ? "INT" : "BOOL",
                              device: d,
                              ...(isOutputSide ? { isOutput: true } : { isInput: true }),
                            })
                          }
                          className="px-2.5 h-8 rounded-lg border border-white/[0.12] bg-white/[0.04] text-[12px] font-semibold text-text-secondary hover:border-teal-500 hover:text-text-primary"
                        >
                          {DEVICE_LABEL[d]}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        declareTag(editing.tag, {
                          type: dataType,
                          preset: editing.preset ?? (dataType === "TIMER" ? 5000 : 10),
                        })
                      }
                      className="px-3 h-8 rounded-lg text-[12px] font-bold text-on-accent"
                      style={{ background: LIVE }}
                    >
                      Add {dataType.toLowerCase()} to the tag table
                    </button>
                  )}
                </div>
              );
            })()}

          {INSTRUCTION_BY_TYPE.get(editing.type)?.needsPreset && (
            <label className="block mb-2.5">
              <span className="block text-[11px] font-semibold text-text-muted mb-1">
                Preset{" "}
                {editing.type === "TON" || editing.type === "TOF" ? "(milliseconds)" : "(counts)"}
              </span>
              <input
                type="number"
                value={editing.preset ?? 0}
                onChange={(e) => {
                  const next = { ...editing, preset: Number(e.target.value) };
                  setEditing(next);
                  updateElement(next);
                }}
                className="w-full h-9 px-2.5 rounded-lg bg-dark-primary border border-white/10 text-[13px] text-text-primary"
              />
            </label>
          )}

          {/*
            One list for every field in this dialog.
            
            It used to live inside the tag field's block and offered only .DN
            and .ACC, so the destination box, which is where a timer preset is
            actually needed, suggested nothing and .PRE appeared nowhere in
            the product. "There is no preset variable available at the
            destination address" was exactly right.
          */}
          <datalist id="ladx-tags">
            {program.tags.map((t) => (
              <option key={t.name} value={t.name} />
            ))}
            {program.tags
              .filter((t) => t.type === "TIMER" || t.type === "COUNTER")
              .flatMap((t) => [
                {
                  v: `${t.name}.PRE`,
                  hint: t.type === "TIMER" ? "preset, in milliseconds" : "preset count",
                },
                { v: `${t.name}.ACC`, hint: "accumulated value" },
                { v: `${t.name}.DN`, hint: "done bit" },
              ])
              .map(({ v, hint }) => (
                <option key={v} value={v} label={hint} />
              ))}
          </datalist>

          {INSTRUCTION_BY_TYPE.get(editing.type)?.needsOperand && (
            <label className="block mb-2.5">
              <span className="block text-[11px] font-semibold text-text-muted mb-1">
                {INSTRUCTION_BY_TYPE.get(editing.type)?.group === "Move/Math"
                  ? "Second value (a tag, a member like T1.ACC, or a number)"
                  : "Compare with (a tag, a member like T1.ACC, or a number)"}
              </span>
              <input
                list="ladx-tags"
                value={editing.operand ?? ""}
                onChange={(e) => {
                  const next = { ...editing, operand: e.target.value };
                  setEditing(next);
                  updateElement(next);
                }}
                className="w-full h-9 px-2.5 rounded-lg bg-dark-primary border border-white/10 text-[13px] font-mono text-text-primary"
              />
            </label>
          )}

          {INSTRUCTION_BY_TYPE.get(editing.type)?.needsDest && (
            <label className="block mb-2.5">
              <span className="block text-[11px] font-semibold text-text-muted mb-1">
                Destination
              </span>
              <input
                list="ladx-tags"
                placeholder="Count_1, or T1.PRE"
                value={editing.dest ?? ""}
                onChange={(e) => {
                  const next = { ...editing, dest: e.target.value };
                  setEditing(next);
                  updateElement(next);
                }}
                className="w-full h-9 px-2.5 rounded-lg bg-dark-primary border border-white/10 text-[13px] font-mono text-text-primary"
              />
              <span className="mt-1 block text-[10px] leading-relaxed text-text-muted">
                A timer or counter needs the part you mean: <code>.PRE</code> for the preset,{" "}
                <code>.ACC</code> for the accumulator. Timer presets are in milliseconds, so 5000 is
                five seconds.
              </span>
            </label>
          )}

          <button
            type="button"
            onClick={() => setEditing(null)}
            className="w-full h-9 rounded-lg text-[13px] font-bold text-on-accent"
            style={{ background: LIVE }}
          >
            Done
          </button>
        </Popover>
      )}

      {/* ── Help and the tour ───────────────────────────────────────
          Both above everything else, and both leave you exactly where you
          were. */}
      <GoOnlineOverlay
        open={goingOnline}
        projectName={name}
        scanMs={program?.scanMs ?? 100}
        onLog={(text) => say("info", "online", text)}
        onDone={() => {
          setGoingOnline(false);
          beginScanning();
        }}
        onCancel={() => {
          setGoingOnline(false);
          say("info", "online", "Cancelled, the controller is still offline.");
        }}
      />

      <HelpDialog topic={helpTopic} onClose={() => setHelpTopic(null)} />
      <Tour
        open={tourOpen}
        onClose={endTour}
        onHelp={openHelp}
        onEnsureVisible={ensureVisibleForTour}
      />
    </div>
  );
}

/**
 * Safe inside an attribute selector.
 *
 * Element ids are generated here, so they are tame in practice, but a selector
 * built by concatenation is a habit worth not having. CSS.escape is missing in
 * older runtimes and in server rendering, hence the fallback.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-2xl border border-white/[0.12] bg-dark-secondary p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13.5px] font-bold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The landing strip between two networks.
 *
 * It is invisible and zero-height until a network is actually being carried,
 * because a permanent gap between every card would push the whole program
 * apart to serve a gesture nobody is making. While a drag is in flight it
 * opens up and lights, so there is somewhere obvious to aim.
 */
function RungDropStrip({
  index,
  onDropRung,
}: {
  index: number;
  onDropRung: (rungId: string, before: number) => void;
}) {
  const [over, setOver] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const on = () => setArmed(takeDrag()?.kind === "rung");
    const off = () => {
      setArmed(false);
      setOver(false);
    };
    window.addEventListener("dragstart", on);
    window.addEventListener("dragend", off);
    window.addEventListener("drop", off);
    return () => {
      window.removeEventListener("dragstart", on);
      window.removeEventListener("dragend", off);
      window.removeEventListener("drop", off);
    };
  }, []);

  if (!armed) return null;

  return (
    <div
      onDragOver={(e) => {
        if (takeDrag()?.kind !== "rung") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const d = takeDrag();
        setOver(false);
        if (d?.kind !== "rung") return;
        e.preventDefault();
        e.stopPropagation();
        clearDrag();
        onDropRung(d.rungId, index);
      }}
      style={{
        height: over ? 26 : 14,
        margin: "2px 0",
        borderRadius: 4,
        border: `2px dashed ${over ? "#35B6BB" : "#C9D2DC"}`,
        background: over ? "rgba(53,182,187,0.12)" : "transparent",
        transition: "height 90ms ease",
      }}
    />
  );
}

/**
 * A toolbar action with its meaning under it.
 *
 * "Download" is the most misread word in a PLC editor: a good half of
 * students expect it to fetch a program rather than send one, so the
 * direction is written on the control rather than left to a tooltip nobody
 * hovers.
 */
function ToolButton({
  onClick,
  icon,
  label,
  caption,
  title,
  tone,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  caption: string;
  title?: string;
  tone?: "primary";
  disabled?: boolean;
}) {
  const primary = tone === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-2 pl-2.5 pr-3 disabled:cursor-default ${css.control} ${css.toolBtn}`}
      data-primary={primary ? "true" : "false"}
    >
      <span style={{ display: "grid", placeItems: "center" }}>{icon}</span>

      <span style={{ display: "grid", lineHeight: 1.05, textAlign: "left" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 8.5, opacity: primary ? 0.85 : 0.6, letterSpacing: 0.2 }}>
          {caption}
        </span>
      </span>
    </button>
  );
}
