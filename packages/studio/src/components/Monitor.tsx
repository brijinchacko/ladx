"use client";

import {
  type AskModel,
  type AssistRunContext,
  Assistant,
  type AssistantStore,
  type ModelsSource,
  RELAY_TITLES,
  useAssistant,
} from "@ladx/ui";
import {
  Activity,
  CircleDot,
  FileDown,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  StepForward,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LadxProgram,
  type Routine,
  type ScanResult,
  type Tag,
  programRoutines,
  resetTags,
  scan,
  seedPresets,
  validate,
} from "../index";
import { rungToNeutralText } from "../lib/convert";
import { focusModeLabel, useFocusMode } from "../lib/focus-mode";
import MonitorRungs from "./MonitorRungs";

/**
 * Where a generated record goes.
 *
 * Monitor writes a test record and Convert writes a conversion record, and
 * both used to POST straight at /api/documents. That is a web assumption: the
 * desktop build is forbidden from making HTTP calls at all and stores its
 * documents through Tauri instead. Handing the write in as a callback lets one
 * component serve both, and a surface with nowhere to put a record simply
 * omits it, which hides the button rather than offering a save that fails.
 */
export type SaveRecord = (doc: {
  title: string;
  projectId: string | null;
  content: string;
}) => Promise<boolean>;

export interface ProgramSource {
  /** The project this program belongs to, or null for the scratch program. */
  projectId: string | null;
  projectName: string | null;
  name: string;
  program: LadxProgram;
  updatedAt: string;
}

/** One sample of every watched tag, for the trend and the log. */
interface Sample {
  t: number;
  values: Record<string, number>;
}

const RATES = [
  { ms: 20, label: "20 ms" },
  { ms: 50, label: "50 ms" },
  { ms: 100, label: "100 ms" },
  { ms: 250, label: "250 ms" },
  { ms: 1000, label: "1 s" },
];

const MAX_SAMPLES = 600;
const MAX_EVENTS = 400;

/**
 * Monitor: the program, running.
 *
 * Ladder is written weeks before there is a panel to put it in, and the first
 * time most logic runs is on a bench with the client watching. That is an
 * expensive place to discover that the seal-in never seals or that the timer
 * counts on every scan. Running it here costs nothing.
 *
 * The engine is the one from @ladx/studio, unchanged, and its fidelity is the
 * reason this is worth doing rather than a toy: rungs run top to bottom against
 * one live set of values, so a coil reaches the rungs below it this scan and the
 * rungs above it only on the next one, which is what makes a seal-in hold rather
 * than race; edge instructions keep their own memory, so a held button counts
 * once; and timers advance on elapsed milliseconds rather than on scan count, so
 * three seconds is three seconds even when a background tab throttles the loop
 * to one scan a second.
 *
 * Inputs are forced rather than simulated from a process model, which is what
 * an engineer actually does when going online: put the signal in the state you
 * want to test and see what the logic does. Device kind decides how the control
 * behaves, because a momentary start button that latches would teach the wrong
 * thing about why the seal-in is there.
 *
 * What comes out is evidence. A FAT is a document that says what was done and
 * what happened; every force and every output transition here is timestamped,
 * and the run can be written straight onto the project as a test record.
 */
export default function Monitor({
  sources,
  companyName,
  author,
  initialProjectId,
  unreadable = [],
  ladderHref = "/studio/ladder",
  onSaveRecord,
  askModel,
  modelsUrl = "/api/models",
  assistantStore,
}: {
  sources: ProgramSource[];
  companyName: string | null;
  author: string;
  /** A project named in the URL, from a "Run it" link on a project page. */
  initialProjectId?: string | null;
  /** Programs the engine cannot read, named so their absence is not a mystery. */
  unreadable?: string[];
  /** Where "Open Ladder" goes. The two surfaces mount the editor at different paths. */
  ladderHref?: string;
  /** Where a generated record is written. Omitted means this surface cannot store one. */
  onSaveRecord?: SaveRecord;
  /**
   * How the assistant reaches a model.
   *
   * Required, not defaulted. It used to be a hardcoded POST to a web API
   * route, so the desktop rendered a working looking assistant that failed on
   * every question against a route that does not exist there. A surface has to
   * say how it reaches a model rather than inheriting the web's answer.
   */
  askModel: AskModel;
  /** Where the model list comes from: a URL on the web, a function on desktop. */
  modelsUrl?: ModelsSource;
  /**
   * Where the conversation is kept.
   *
   * The browser's own storage by default. The desktop passes one backed by
   * its database, because a webview reset should not take somebody's
   * reasoning about a machine with it.
   */
  assistantStore?: AssistantStore;
}) {
  /*
   * Focus and fullscreen.
   *
   * Monitor had none, which is the tool that needs it most: a rung is read
   * across its full width and this one is usually open beside a machine with
   * somebody looking over a shoulder.
   */
  const screen_ = useFocusMode({ key: "ladx.monitor.mode.v1" });

  // A project named in the URL wins over "whatever is first", so a "Run it"
  // link from a project lands on that project's program rather than on the
  // most recently touched one.
  const [sourceKey, setSourceKey] = useState(
    (initialProjectId && sources.some((s) => s.projectId === initialProjectId)
      ? initialProjectId
      : sources[0]?.projectId) ?? "__scratch",
  );
  const source = useMemo(
    () => sources.find((s) => (s.projectId ?? "__scratch") === sourceKey) ?? sources[0] ?? null,
    [sources, sourceKey],
  );

  const program = source?.program ?? null;
  const routines: Routine[] = useMemo(() => (program ? programRoutines(program) : []), [program]);
  const [routineName, setRoutineName] = useState<string | null>(null);
  const routine = routines.find((r) => r.name === routineName) ?? routines[0] ?? null;

  const [tags, setTags] = useState<Tag[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(100);
  const [scans, setScans] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [watched, setWatched] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const edgesRef = useRef<Record<string, boolean>>({});
  const lastRef = useRef<number>(0);
  const startedRef = useRef<number>(0);
  const prevRef = useRef<Record<string, number>>({});

  /**
   * The tags the next scan reads.
   *
   * A ref rather than the state, because a scan is a side effect with a
   * timestamp on it and must happen exactly once per tick. Running it inside a
   * setState updater looked tidy and was wrong twice over: React may invoke an
   * updater more than once, which double-counts scans and duplicates log lines,
   * and the updater runs at render time rather than at tick time, so every
   * entry in the sequence carried the wrong clock. The record is the product
   * here, so it has to be the accurate one.
   */
  const tagsRef = useRef<Tag[]>([]);

  /**
   * How long the run has actually been going.
   *
   * Browsers throttle timers in a background tab, typically to one tick per
   * second, so a monitor left running behind another tab scans far slower than
   * it was told to. The logic is unaffected because the engine advances timers
   * on elapsed milliseconds rather than on scan count, but the test record must
   * not claim a scan time that did not happen. Both numbers go on the record.
   */
  const runMsRef = useRef<number>(0);

  const applyTags = useCallback((next: Tag[]) => {
    tagsRef.current = next;
    setTags(next);
  }, []);

  const problems = useMemo(() => (program ? validate(program) : []), [program]);

  const observedScanMs = scans > 1 ? Math.round(runMsRef.current / scans) : null;

  /* ── load a program ── */

  const load = useCallback(() => {
    if (!program) return;
    const fresh = seedPresets(program, resetTags(program.tags));
    applyTags(fresh);
    setResult(null);
    setRunning(false);
    setScans(0);
    setEvents([]);
    setSamples([]);
    edgesRef.current = {};
    prevRef.current = {};
    startedRef.current = 0;
    runMsRef.current = 0;
    // Outputs first: they are what a test is judged on. Then anything analog.
    setWatched(
      fresh
        .filter((t) => t.isOutput || t.type === "TIMER" || t.type === "COUNTER")
        .slice(0, 6)
        .map((t) => t.name),
    );
  }, [program, applyTags]);

  // Deliberately keyed on the chosen program rather than on the tags: this
  // reloads when you switch program, and must not re-run every time a tag is
  // edited or forcing an input would reset the run. (The ignore directive this
  // replaced is inert here; biome.json disables the rule for this package.)
  useEffect(() => {
    load();
    setRoutineName(null);
  }, [sourceKey, load]);

  /* ── the scan loop ── */

  const step = useCallback(
    (dtMs: number) => {
      if (!program) return;
      const at = `${((performance.now() - startedRef.current) / 1000).toFixed(2)}s`;

      const r = scan(program, tagsRef.current, edgesRef.current, dtMs);
      edgesRef.current = r.edges;
      applyTags(r.tags);
      setResult(r);
      setScans((n) => n + 1);

      // Anything that changed goes in the log. Outputs are what a witness signs
      // off, so they are the ones named.
      const changes: string[] = [];
      const nextPrev: Record<string, number> = {};
      for (const t of r.tags) {
        const before = prevRef.current[t.name];
        const now = t.type === "BOOL" ? (t.value ? 1 : 0) : t.value;
        nextPrev[t.name] = now;
        if (before !== undefined && before !== now && (t.isOutput || t.type !== "BOOL")) {
          changes.push(`${at}  ${t.name}  ${t.type === "BOOL" ? (now ? "ON" : "OFF") : now}`);
        }
      }
      prevRef.current = nextPrev;
      if (changes.length) setEvents((e) => [...changes, ...e].slice(0, MAX_EVENTS));

      const values: Record<string, number> = {};
      for (const t of r.tags) values[t.name] = t.type === "BOOL" ? (t.value ? 1 : 0) : t.value;
      const elapsed = performance.now() - startedRef.current;
      setSamples((sp) => [...sp, { t: elapsed, values }].slice(-MAX_SAMPLES));
      runMsRef.current = elapsed;
    },
    [program, applyTags],
  );

  useEffect(() => {
    if (!running || !program) return;
    if (startedRef.current === 0) startedRef.current = performance.now();
    lastRef.current = performance.now();

    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - lastRef.current;
      lastRef.current = now;
      step(dt);
    }, rate);

    return () => window.clearInterval(id);
  }, [running, rate, step, program]);

  /* ── forcing ── */

  const force = useCallback(
    (name: string, value: number) => {
      if (startedRef.current === 0) startedRef.current = performance.now();
      const at = `${((performance.now() - startedRef.current) / 1000).toFixed(2)}s`;
      applyTags(tagsRef.current.map((t) => (t.name === name ? { ...t, value } : t)));
      setEvents((e) =>
        [`${at}  FORCE  ${name}  ${value ? "ON" : "OFF"}`, ...e].slice(0, MAX_EVENTS),
      );
    },
    [applyTags],
  );

  /**
   * A momentary device springs back.
   *
   * The seal-in exists because a start button is not a switch. Making the
   * control behave like the device is the difference between a simulator that
   * teaches the circuit and one that hides it.
   */
  const pulse = useCallback(
    (t: Tag) => {
      const rest = t.device === "PUSHBUTTON_NC" ? 1 : 0;
      force(t.name, rest ? 0 : 1);
      window.setTimeout(() => force(t.name, rest), Math.max(rate * 2, 150));
    },
    [force, rate],
  );

  const inputs = tags.filter((t) => t.isInput);
  const outputs = tags.filter((t) => t.isOutput);

  /* ── evidence ── */

  const captureEvidence = async () => {
    if (!source?.projectId) return;
    setSaving(true);
    setStatus(null);
    try {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      const body = [
        "# Logic test record",
        "",
        "| | |",
        "|---|---|",
        `| **Project** | ${source.projectName ?? ""} |`,
        `| **Program** | ${source.name} |`,
        `| **Routine** | ${routine?.name ?? ""} |`,
        `| **Run by** | ${author}${companyName ? `, ${companyName}` : ""} |`,
        `| **Recorded** | ${now} UTC |`,
        `| **Scans** | ${scans} |`,
        `| **Scan time** | ${rate} ms set, ${observedScanMs ?? "not yet"} ms observed |`,
        "",
        "This record was produced by running the program in LADX Studio's monitor.",
        "It is a desk test of the logic, not a test of the installed system, and it",
        "does not replace a witnessed FAT. Its value is that the sequence below was",
        "observed rather than asserted.",
        "",
        "## Final state",
        "",
        "| Tag | Address | Type | Value |",
        "|---|---|---|---|",
        ...tags.map(
          (t) =>
            `| ${t.name} | ${t.address ?? ""} | ${t.type} | ${
              t.type === "BOOL" ? (t.value ? "ON" : "OFF") : t.value
            } |`,
        ),
        "",
        "## Sequence",
        "",
        "Newest last. FORCE lines are inputs applied by the tester; the rest are",
        "outputs and stored values the program changed in response.",
        "",
        "```",
        ...(events.length ? [...events].reverse() : ["Nothing was recorded."]),
        "```",
        "",
      ].join("\n");

      if (!onSaveRecord) return;
      const ok = await onSaveRecord({
        title: `Logic test record, ${routine?.name ?? source.name}`,
        projectId: source.projectId,
        content: body,
      });
      setStatus(ok ? "Saved to the project's documents." : "Could not save the record.");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  if (!source || !program) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Activity className="mx-auto mb-3 h-6 w-6 text-ink-400" />
          <h2 className="font-display text-[15px] font-bold text-ink-900">Nothing to run yet</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
            Write a program in the Ladder tool and save it. Anything saved against a project shows
            up here, ready to run.
          </p>
          {unreadable.length > 0 && (
            <p className="mt-4 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-left text-[12.5px] leading-relaxed text-warning">
              {unreadable.length === 1
                ? `"${unreadable[0]}" is saved against a project but could not be read, so it is not listed here.`
                : `${unreadable.length} saved programs could not be read, so they are not listed here: ${unreadable.join(", ")}.`}{" "}
              Open in Ladder and save again to repair the file.
            </p>
          )}
          <a
            href={ladderHref}
            className="mt-4 inline-block rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Open Ladder
          </a>
        </div>
      </div>
    );
  }

  /**
   * Asking why the logic is doing what it is doing.
   *
   * The most asked question in this trade, and the one a simulator is uniquely
   * placed to answer: it has the rungs and it has every tag value at this
   * instant, which is exactly what somebody standing at a panel does not have.
   *
   * It explains rather than edits. Nothing it says changes the program, so the
   * failure mode is not a bad edit, it is a confident wrong diagnosis that
   * somebody acts on. The context below is assembled from what is actually in
   * front of the person, and the prompt is told to say it cannot tell rather
   * than to guess.
   */
  const runAssist = useCallback(
    async (question: string, { step, model, signal }: AssistRunContext) => {
      step.start("read", "Reading the program and the live values");
      const rungs = routine?.rungs ?? [];
      const on = tags.filter((t) => Number(t.value) !== 0);
      step.detail(
        `${rungs.length} rung${rungs.length === 1 ? "" : "s"}, ${tags.length} tags, ${on.length} currently on, ${running ? `running at ${observedScanMs ?? rate} ms` : "stopped"}`,
      );

      const context = [
        `Program: ${source?.name ?? "Untitled"}${routine ? `, routine ${routine.name}` : ""}`,
        running
          ? `State: running, ${scans} scans, about ${observedScanMs ?? rate} ms per scan`
          : "State: stopped",
        "",
        "Tag values right now:",
        ...tags.map(
          (t) =>
            `  ${t.name} = ${t.value}  (${t.type}${t.device ? `, ${t.device}` : ""}${t.isInput ? ", input" : ""}${t.isOutput ? ", output" : ""}${t.comment ? `, "${t.comment}"` : ""})`,
        ),
        "",
        "Rungs, as neutral text:",
        ...rungs.map(
          (r, i) => `  ${i + 1}: ${r.comment ? `(* ${r.comment} *) ` : ""}${rungToNeutralText(r)}`,
        ),
      ].join("\n");

      step.start("ask", model ? `Asking ${model}` : "Asking the model");
      let b: Awaited<ReturnType<AskModel>>;
      try {
        b = await askModel({ tool: "monitor", context, question, model, signal });
      } catch (err) {
        // Reported through the step list rather than only thrown, so the
        // failure appears where the person was watching the work happen.
        const why = err instanceof Error ? err.message : "No answer came back";
        step.fail(why);
        throw new Error(why);
      }
      step.detail(b.model ? `${b.model} replied` : "Reply received");
      // Nothing was changed, so nothing is offered as undoable. Saying so is the
      // point: this reads the program, it does not touch it.
      return { text: b.answer, undoable: false };
    },
    [routine, tags, running, observedScanMs, rate, scans, source, askModel],
  );

  const assist = useAssistant({
    run: runAssist,
    modelsUrl,
    store: assistantStore,
    memoryKey: source ? `monitor:${source.projectId ?? source.name}` : null,
  });

  return (
    <div
      ref={screen_.ref}
      className={`relative flex min-h-0 flex-1 flex-col bg-white ${
        screen_.immersive ? "fixed inset-0 z-50" : ""
      }`}
    >
      {/* Focus and fullscreen, the same control every other tool has. */}
      <button
        type="button"
        onClick={screen_.cycle}
        title={`${focusModeLabel(screen_.mode, screen_.canFullscreen)}. Press F, or Escape to step back.`}
        aria-label={focusModeLabel(screen_.mode, screen_.canFullscreen)}
        className={`absolute right-3 top-2 z-10 rounded-md border px-2 py-1 transition-colors ${
          screen_.immersive
            ? "border-teal-500 bg-teal-50 text-teal-800"
            : "border-ink-200 bg-white text-ink-500 hover:border-ink-400"
        }`}
      >
        {screen_.immersive ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>
      {unreadable.length > 0 && (
        <p className="shrink-0 border-b border-warning-border bg-warning-bg px-3 py-1.5 text-[12px] text-warning">
          {unreadable.length} saved program{unreadable.length === 1 ? "" : "s"} could not be read
          and {unreadable.length === 1 ? "is" : "are"} not listed: {unreadable.join(", ")}. Open{" "}
          {unreadable.length === 1 ? "it" : "them"} in Ladder and save again to repair the file.
        </p>
      )}
      {/* controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50 px-3 py-2">
        <select
          value={sourceKey}
          onChange={(e) => setSourceKey(e.target.value)}
          className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
        >
          {sources.map((s) => (
            <option key={s.projectId ?? "__scratch"} value={s.projectId ?? "__scratch"}>
              {s.projectName ? `${s.projectName}, ${s.name}` : `${s.name} (scratch)`}
            </option>
          ))}
        </select>

        {routines.length > 1 && (
          <select
            value={routine?.name ?? ""}
            onChange={(e) => setRoutineName(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
          >
            {routines.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setRunning((r) => !r)}
          className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-opacity hover:opacity-90 ${
            running ? "bg-danger text-white" : "bg-ink-900 text-white"
          }`}
        >
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Stop" : "Run"}
        </button>

        <button
          type="button"
          onClick={() => {
            if (startedRef.current === 0) startedRef.current = performance.now();
            step(rate);
          }}
          disabled={running}
          title="Run exactly one scan"
          className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12.5px] text-ink-600 transition-colors hover:border-ink-400 disabled:opacity-40"
        >
          <StepForward className="h-3.5 w-3.5" />
          Step
        </button>

        <button
          type="button"
          onClick={load}
          title="Reset every tag and clear the record"
          className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12.5px] text-ink-600 transition-colors hover:border-ink-400"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>

        <select
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          title="Scan time"
          className="rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-[12px] outline-none focus:border-ink-500"
        >
          {RATES.map((r) => (
            <option key={r.ms} value={r.ms}>
              {r.label}
            </option>
          ))}
        </select>

        <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-ink-500">
          <CircleDot
            className={`h-3 w-3 ${running ? "animate-pulse text-teal-600" : "text-ink-400"}`}
          />
          {scans} scans
          {observedScanMs !== null && observedScanMs > rate * 1.5 && (
            <span
              className="text-danger"
              title="This tab is in the background, so the browser is throttling the scan. Timers still keep real time."
            >
              {observedScanMs} ms actual
            </span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {status && <span className="text-[11.5px] text-ink-500">{status}</span>}
          {source.projectId && onSaveRecord && (
            <button
              type="button"
              onClick={captureEvidence}
              disabled={saving || events.length === 0}
              title={
                events.length === 0
                  ? "Run the program first, so there is something to record"
                  : "Write this run onto the project as a test record"
              }
              className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              Save test record
            </button>
          )}
        </div>
      </div>

      {problems.length > 0 && (
        <div className="shrink-0 border-b border-warning-border bg-warning-bg px-3 py-1.5">
          <p className="text-[11.5px] leading-snug text-warning">
            {problems.length === 1
              ? problems[0]
              : `${problems.length} problems in this program: ${problems[0]}`}
          </p>
        </div>
      )}
      {result && result.errors.length > 0 && (
        <div className="shrink-0 border-b border-danger-border bg-danger-bg px-3 py-1.5">
          <p className="text-[11.5px] leading-snug text-danger">{result.errors[0]}</p>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* the logic */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-ink-50">
          {routine && (
            <MonitorRungs
              routine={routine}
              elementPower={result?.elementPower ?? {}}
              rungPower={result?.rungPower ?? {}}
              tags={tags}
            />
          )}
        </div>

        {/* I/O, watch, trend, log */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-ink-100">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Section title="Inputs" note="Click to force. Buttons spring back.">
              {inputs.length === 0 ? (
                <Empty>No tags are marked as inputs.</Empty>
              ) : (
                <ul className="space-y-1">
                  {inputs.map((t) => (
                    <li key={t.name} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          t.device === "PUSHBUTTON_NO" || t.device === "PUSHBUTTON_NC"
                            ? pulse(t)
                            : force(t.name, t.value ? 0 : 1)
                        }
                        className={`h-5 w-9 shrink-0 rounded-full border transition-colors ${
                          t.value ? "border-teal-500 bg-teal-500" : "border-ink-300 bg-white"
                        }`}
                        aria-pressed={Boolean(t.value)}
                        aria-label={`Force ${t.name}`}
                      >
                        <span
                          className={`block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                            t.value ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-ink-800">{t.name}</span>
                        <span className="block truncate font-mono text-[10px] text-ink-400">
                          {[t.address, t.device].filter(Boolean).join("  ·  ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Outputs">
              {outputs.length === 0 ? (
                <Empty>No tags are marked as outputs.</Empty>
              ) : (
                <ul className="space-y-1">
                  {outputs.map((t) => (
                    <li key={t.name} className="flex items-center gap-2">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full border ${
                          t.value ? "border-teal-600 bg-teal-500" : "border-ink-300 bg-white"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-800">
                        {t.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-ink-400">
                        {t.address ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Watch" note="Every tag, live.">
              <table className="w-full">
                <tbody>
                  {tags.map((t) => {
                    const on = watched.includes(t.name);
                    return (
                      <tr key={t.name} className="border-b border-ink-50 last:border-0">
                        <td className="py-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setWatched((w) =>
                                on ? w.filter((n) => n !== t.name) : [...w, t.name],
                              )
                            }
                            title={on ? "Stop trending" : "Trend this tag"}
                            className={`truncate text-left text-[12px] ${
                              on ? "font-medium text-teal-700" : "text-ink-700"
                            }`}
                          >
                            {t.name}
                          </button>
                        </td>
                        <td className="py-0.5 text-right font-mono text-[11px] tabular-nums text-ink-600">
                          {t.type === "BOOL"
                            ? t.value
                              ? "ON"
                              : "OFF"
                            : t.type === "TIMER"
                              ? `${((t.acc ?? 0) / 1000).toFixed(1)}s`
                              : t.type === "COUNTER"
                                ? (t.acc ?? 0)
                                : t.value}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>

            <Section title="Trend" note={watched.length ? undefined : "Click a tag above."}>
              {watched.length > 0 && <Trend samples={samples} names={watched} />}
            </Section>

            <Section title="Sequence" note="Forces and what they caused.">
              {events.length === 0 ? (
                <Empty>Nothing yet. Press Run, then force an input.</Empty>
              ) : (
                <ol className="space-y-px font-mono text-[10.5px] leading-relaxed text-ink-600">
                  {events.slice(0, 60).map((e) => (
                    <li key={e} className={e.includes("FORCE") ? "text-danger" : undefined}>
                      {e}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>
        </aside>
      </div>

      {/*
        The assistant, the same one every other tool has.

        It reads the program and the live tag values and explains; it never
        edits. That is the whole reason it is worth having here: standing at a
        panel, the thing you cannot see is every value at once, and the
        simulator has exactly that.
      */}
      <Assistant
        toolId="monitor"
        title={RELAY_TITLES.monitor}
        placeholder="Why is the conveyor not starting?"
        suggestions={[
          "Why is this rung not conducting?",
          "Which tag is holding the output off?",
          "What would I have to press to make rung 1 true?",
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
        footnote="It reads the program and the values in front of you and explains them. It does not change anything, and it can be wrong: check the rung yourself before acting on it."
      />
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-ink-100 p-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">{title}</h2>
      {note && <p className="mb-2 mt-0.5 text-[11px] leading-snug text-ink-400">{note}</p>}
      <div className={note ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] leading-snug text-ink-400">{children}</p>;
}

const TREND_COLORS = [
  "rgb(var(--teal-600))",
  "rgb(var(--danger))",
  "rgb(var(--ink-600))",
  "rgb(var(--ink-400))",
  "rgb(var(--ink-900))",
  "rgb(var(--teal-500))",
];

/**
 * A trend of the watched tags.
 *
 * Booleans are the point: what an engineer wants to see is the order things
 * happened in, and a square wave shows that at a glance where a table of
 * numbers does not. Analog values are scaled into the same band so one chart
 * carries both.
 */
function Trend({ samples, names }: { samples: Sample[]; names: string[] }) {
  if (samples.length < 2) {
    return <p className="text-[11.5px] text-ink-400">Run the program to see a trend.</p>;
  }

  const w = 280;
  const rowH = 22;
  const h = names.length * rowH;
  const t0 = samples[0]?.t ?? 0;
  const t1 = samples[samples.length - 1]?.t ?? t0 + 1;
  const span = t1 - t0 || 1;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      style={{ height: h }}
      role="img"
      aria-label={`Trend of ${names.join(", ")}`}
    >
      <title>{`Trend of ${names.join(", ")}`}</title>
      {names.map((name, i) => {
        const top = i * rowH;
        const values = samples.map((s) => s.values[name] ?? 0);
        const max = Math.max(1, ...values);
        const path = samples
          .map((s, j) => {
            const x = ((s.t - t0) / span) * w;
            const v = (s.values[name] ?? 0) / max;
            const y = top + rowH - 4 - v * (rowH - 10);
            // Step, not slope: a digital signal does not ramp.
            return j === 0
              ? `M${x.toFixed(1)},${y.toFixed(1)}`
              : `H${x.toFixed(1)} V${y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <g key={name}>
            <line
              x1={0}
              x2={w}
              y1={top + rowH - 3}
              y2={top + rowH - 3}
              stroke="rgb(var(--ink-100))"
              strokeWidth={1}
            />
            <path
              d={path}
              fill="none"
              stroke={TREND_COLORS[i % TREND_COLORS.length]}
              strokeWidth={1.4}
            />
            <text
              x={2}
              y={top + 8}
              fontSize={8}
              fill="rgb(var(--ink-400))"
              fontFamily="ui-monospace, monospace"
            >
              {name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
