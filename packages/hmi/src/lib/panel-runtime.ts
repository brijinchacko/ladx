"use client";

// By subpath, not from the package root. The root re-exports every studio
// component, and an exported panel that pulls in the ladder editor and its
// stylesheet for the sake of one function is a much larger file than it
// needs to be.
import { scan } from "@ladx/studio/lib/engine";
import type { LadxProgram, Tag } from "@ladx/studio/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AlarmRuntime,
  acknowledge,
  isOutstanding,
  needsAck,
  newRuntime,
  priorityRank,
  sortForSummary,
  stepAlarm,
} from "./alarms";
import { Historian } from "./historian";
import {
  type TagSpace,
  TrendBuffer,
  buildTagSpace,
  capacityFor,
  makeContext,
  resolveNumber,
  writeTag,
} from "./runtime";
import type { Action, AlarmPriority, HmiDoc, Widget } from "./types";

/**
 * The running panel, without the editor around it.
 *
 * Lifted out of the editor so the exported panel is not a second
 * implementation. Everything here was in `hmi-editor.tsx`, entangled with
 * selection, undo, zoom and the palette; extracting it is what lets a screen
 * exported to a browser on the plant floor behave exactly like the same screen
 * under Run, because it is running the same code rather than a re-creation of
 * it that was faithful on the day it was written.
 *
 * The hook owns the tag space, the scan loop, alarm evaluation, trend
 * sampling, the recording, and what each data widget needs to draw. It does
 * not own selection, editing, or which screen is shown: navigation arrives as
 * a callback, because the editor and the panel disagree about what changing
 * screen means.
 */

export interface PanelRuntimeOptions {
  doc: HmiDoc;
  /** The ladder that drives it. Without one the screen still draws, but nothing moves. */
  program: LadxProgram | null | undefined;
  running: boolean;
  /** A goToScreen action. The editor changes its selection; the panel navigates. */
  onGoToScreen?: (slug: string) => void;
  /** Scan period in milliseconds. */
  periodMs?: number;
}

export interface AlarmRow {
  id: string;
  message: string;
  priority: AlarmPriority;
  state: AlarmRuntime["state"];
  needsAck: boolean;
  raisedAt?: number;
}

/** Exactly what `WidgetView` accepts as `data`, kept structural to avoid a cycle. */
export interface RuntimeData {
  samples?: { t: number; v: (number | null)[] }[];
  xy?: { x: number; y: number }[];
  alarms?: AlarmRow[];
  now?: number;
}

export function usePanelRuntime({
  doc,
  program,
  running,
  onGoToScreen,
  periodMs = 100,
}: PanelRuntimeOptions) {
  const plcTags = useMemo<Tag[]>(
    () => (program?.tags ?? []).map((t: Tag) => ({ ...t })),
    [program],
  );
  const [liveTags, setLiveTags] = useState<Tag[]>(plcTags);
  const [space, setSpace] = useState<TagSpace>(() => buildTagSpace(plcTags, doc.tags));
  const [alarmState, setAlarmState] = useState<Record<string, AlarmRuntime>>({});

  // Refs, because the scan loop runs on a timer and must not close over a
  // stale render.
  const tagsRef = useRef<Tag[]>(plcTags);
  const spaceRef = useRef<TagSpace>(space);
  const edgesRef = useRef<Record<string, boolean>>({});
  const alarmRef = useRef<Record<string, AlarmRuntime>>({});
  const trendsRef = useRef<Map<string, TrendBuffer>>(new Map());
  const historiansRef = useRef<Map<string, Historian>>(new Map());
  const lastSampleRef = useRef<Map<string, number>>(new Map());
  const [trendTick, setTrendTick] = useState(0);
  const [clockNow, setClockNow] = useState(0);

  spaceRef.current = space;
  alarmRef.current = alarmState;

  /** One scan: solve the ladder, fold in HMI writes, then evaluate alarms. */
  const step = useCallback(
    (dtMs: number) => {
      const now = Date.now();

      // HMI writes to PLC tags are applied before the scan, which is where a
      // real HMI's writes land: the controller reads them at the top of its
      // cycle, not part way through solving.
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
        doc.tags.map((t) => ({ ...t, value: spaceRef.current.hmi.get(t.name) ?? t.value })),
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
        const sample = {
          t: now,
          v: tr.pens.map((pen) =>
            resolveNumber(
              pen.target.source === "plc"
                ? { kind: "plc", tag: pen.target.tag }
                : { kind: "hmi", tag: pen.target.tag },
              evalCtx,
            ),
          ),
        };
        ring.push(sample);

        // The same sample into the recording. Rebuilt when the pens change,
        // because a recording whose columns mean something different halfway
        // through is worse than one that starts again.
        const pens = tr.pens.map((pen) => pen.label ?? pen.target.tag);
        let hist = historiansRef.current.get(tr.id);
        if (!hist || hist.pens.length !== pens.length) {
          hist = new Historian(pens);
          historiansRef.current.set(tr.id, hist);
        }
        hist.push(sample);
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
    const timer = setInterval(() => step(periodMs), periodMs);
    setClockNow(Date.now());
    // Separate from the scan tick because a clock does not need a hundred
    // updates a second and the scan does not need to carry the time.
    const clock = setInterval(() => setClockNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [running, step, periodMs]);

  // Leaving run mode puts the tags back where they started, so a design
  // session is not polluted by a test that latched something on. The
  // recordings are deliberately not cleared here: stopping is usually the
  // moment before somebody looks at what just happened.
  useEffect(() => {
    if (running) return;
    tagsRef.current = plcTags;
    edgesRef.current = {};
    trendsRef.current.clear();
    lastSampleRef.current.clear();
    setLiveTags(plcTags);
    setSpace(buildTagSpace(plcTags, doc.tags));
  }, [running, plcTags, doc.tags]);

  const ctx = useMemo(() => makeContext(space, liveTags), [space, liveTags]);

  /* ── what the operator's presses do ── */

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
          case "loadRecipe": {
            /*
             * Every value at once, and recorded.
             *
             * A recipe written value by value across several scans is a
             * machine briefly running on a mixture of two products, which is
             * the sort of thing that shows up as a batch nobody can explain.
             */
            const recipe = (doc.recipes ?? []).find((r) => r.id === a.recipe);
            if (!recipe) break;
            for (const v of recipe.values) {
              const written = writeTag(next, v.target, v.value);
              if (!written.error) next = written.space;
            }
            break;
          }
          case "goToScreen": {
            onGoToScreen?.(a.slug);
            break;
          }
          default:
            break;
        }
      }
      spaceRef.current = next;
      setSpace(next);
    },
    [running, doc.recipes, onGoToScreen],
  );

  /* ── alarms, as the widgets want them ── */

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
   * Popups the operator has closed.
   *
   * Closing dismisses the dialog, not the alarm: it stays outstanding in the
   * summary. Cleared when the alarm goes back to normal, so the same condition
   * recurring pops again rather than being silently suppressed forever.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const live = new Set(outstanding.map((r) => r.def.id));
    setDismissed((d) => {
      const next = new Set([...d].filter((id) => live.has(id)));
      return next.size === d.size ? d : next;
    });
  }, [outstanding]);

  const popupPriorities = doc.popupPriorities ?? ["critical"];
  const popped = outstanding.filter(
    (r) =>
      needsAck(r.runtime.state) &&
      popupPriorities.includes(r.def.priority) &&
      !dismissed.has(r.def.id),
  );

  /**
   * What a data widget needs, chosen by which one it is.
   *
   * trendTick is read so this recomputes as samples arrive; without it the
   * chart would be drawn once and then sit still while the process moved.
   */
  const liveData = useCallback(
    (w: Widget): RuntimeData | undefined => {
      void trendTick;

      if (w.kind === "clock") {
        // Passed in rather than read inside the widget. A component calling
        // Date() during render disagrees with the server on the first paint,
        // which React reports as a hydration mismatch and then discards the
        // tree. The scan loop already ticks, so it has the time to hand.
        return { now: running ? clockNow : undefined };
      }

      if (w.kind === "xyChart") {
        /*
         * Two pens of one trend, plotted against each other.
         *
         * Reusing a trend rather than inventing a second sampler: the buffer,
         * its interval and its span are already configured and already
         * running, and a chart with its own sampling would drift from the
         * trend beside it showing the same tags.
         */
        const id = (w.config?.trendId as string) ?? doc.trends[0]?.id;
        const def = doc.trends.find((t) => t.id === id) ?? doc.trends[0];
        if (!def) return undefined;
        const xi = Number(w.config?.xPen ?? 0);
        const yi = Number(w.config?.yPen ?? 1);
        const samples = trendsRef.current.get(def.id)?.toArray() ?? [];
        const xy = samples
          .map((sm) => ({ x: sm.v[xi], y: sm.v[yi] }))
          .filter(
            (pt): pt is { x: number; y: number } =>
              pt.x !== null && pt.y !== null && pt.x !== undefined && pt.y !== undefined,
          );
        return { xy };
      }

      if (w.kind === "trend") {
        const id = (w.config?.trendId as string) ?? doc.trends[0]?.id;
        const def = doc.trends.find((t) => t.id === id) ?? doc.trends[0];
        if (!def) return undefined;
        return { samples: trendsRef.current.get(def.id)?.toArray() ?? [] };
      }

      if (
        w.kind === "alarmSummary" ||
        w.kind === "alarmHistory" ||
        w.kind === "alarmBanner" ||
        w.kind === "alarmBadge" ||
        w.kind === "alarmMarquee"
      ) {
        // Each alarm widget filters independently: a banner set to critical
        // only and a summary showing everything are the normal arrangement.
        const filter = (w.config?.filter as string) ?? "outstanding";
        const floor = priorityRank((w.config?.minPriority as AlarmPriority) ?? "journal");
        const rows = outstanding
          .filter((r) => (filter === "unacked" ? needsAck(r.runtime.state) : true))
          .filter((r) => priorityRank(r.def.priority) <= floor);
        return {
          alarms: rows.map((r) => ({
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
    },
    [trendTick, running, clockNow, doc.trends, outstanding],
  );

  /**
   * Acknowledge one alarm.
   *
   * Separate from the `ackAll` action because a popup acknowledges the alarm
   * it is showing. Acknowledging everything because the operator dealt with
   * one of them is how an unacknowledged alarm on another screen gets silently
   * cleared by somebody who never saw it.
   */
  const ackOne = useCallback((id: string) => {
    const now = Date.now();
    const next = { ...alarmRef.current };
    const cur = next[id];
    if (!cur) return;
    next[id] = acknowledge(cur, now);
    alarmRef.current = next;
    setAlarmState(next);
  }, []);

  return {
    /** The controller's tags as declared, before the run moved any of them. */
    plcTags,
    /** The tag space, for anything binding by hand. */
    space,
    liveTags,
    ackOne,
    ctx,
    alarmState,
    outstanding,
    unacked,
    popped,
    dismiss: (id: string) => setDismissed((d) => new Set(d).add(id)),
    fire,
    liveData,
    trendTick,
    /** The recordings, by trend id. Read live; not cleared when the run stops. */
    historians: historiansRef.current,
    clearRecording: (trendId: string) => {
      historiansRef.current.delete(trendId);
      setTrendTick((n) => n + 1);
    },
  };
}
