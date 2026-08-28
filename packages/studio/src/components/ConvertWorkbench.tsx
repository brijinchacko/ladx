"use client";

import {
  type AskModel,
  type AssistRunContext,
  Assistant,
  type ModelsSource,
  RELAY_TITLES,
  useAssistant,
} from "@ladx/ui";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileCode2,
  FileDown,
  FolderKanban,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  PackageOpen,
  Upload,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ConversionNote,
  type LadxProgram,
  STARTER_PROGRAMS,
  TARGETS,
  type Target,
  convert,
  programRoutines,
  summarise,
} from "../index";
import { focusModeLabel, useFocusMode } from "../lib/focus-mode";
import { READABLE_ACCEPT, readProgramFile } from "../lib/import-any";
import type { ImportNote } from "../lib/import-l5x";
import type { SaveRecord } from "./Monitor";

export interface ConvertSource {
  projectId: string | null;
  projectName: string | null;
  name: string;
  program: LadxProgram;
}

const SEVERITY_ICON = { info: Info, warning: AlertTriangle, manual: Wrench } as const;
const SEVERITY_STYLE = {
  info: "border-ink-200 bg-ink-50 text-ink-600",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  manual: "border-red-300 bg-red-50 text-red-800",
} as const;
const SEVERITY_LABEL = { info: "Note", warning: "Check", manual: "By hand" } as const;

/**
 * Convert, as a tool rather than a page.
 *
 * The public converter takes a file and gives back one target. That is the
 * right shape for somebody trying it, and the wrong shape for somebody doing
 * the job: on a real migration you convert every routine, to more than one
 * target, and you have to be able to say afterwards what the tool warned you
 * about and what you did with it.
 *
 * So this one reads the program from the project it belongs to, converts to
 * every target at once, and can write the whole set plus the conversion report
 * onto the project as a document. The report is the part that matters. Ladder
 * carries geometry that text does not, and instructions that hold state across
 * scans become function block instances with declarations the original never
 * had; every one of those is a line somebody has to check, and a converter that
 * does not say so is the reason converters have the reputation they do.
 *
 * Still entirely in the browser. A PLC program is commercially sensitive and
 * usually under an NDA, and the honest way to convert one is not to receive it.
 */
export default function ConvertWorkbench({
  sources,
  companyName,
  author,
  initialProjectId,
  unreadable = [],
  ladderHref = "/studio/ladder",
  onSaveRecord,
  onExport,
  askModel,
  modelsUrl = "/api/models",
}: {
  sources: ConvertSource[];
  companyName: string | null;
  author: string;
  /** A project named in the URL, from a "Convert" link on a project page. */
  initialProjectId?: string | null;
  /** Programs that could not be read, named so their absence is not a mystery. */
  unreadable?: string[];
  /** Where "Open Ladder" goes. The two surfaces mount the editor at different paths. */
  ladderHref?: string;
  /** Where a generated record is written. Omitted means this surface cannot store one. */
  onSaveRecord?: SaveRecord;
  /**
   * Where an export goes, when the surface has somewhere better than the
   * browser's downloads folder.
   *
   * The desktop files it into the open project, next to the drawings and the
   * test records, which is where it belongs and where a browser cannot put it.
   * Omitted, the file downloads as it always has.
   *
   * The label travels with the behaviour rather than as a separate prop,
   * because a button that says "Download" and quietly writes a file somewhere
   * is worse than either one on its own. `save` returns where it went, so the
   * screen can say so.
   */
  onExport?: {
    label: string;
    save: (text: string, filename: string) => Promise<string>;
  };
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
}) {
  /*
   * Focus and fullscreen.
   *
   * Structured Text output is long lines, and the whole reason to look at a
   * conversion is to read it. The site chrome either side is the difference
   * between reading a line and wrapping it.
   */
  const screen_ = useFocusMode({ key: "ladx.convert.mode.v1" });

  // A project named in the URL wins over "whatever is first", so a "Convert"
  // link from a project opens that project's program.
  const [sourceKey, setSourceKey] = useState<string>(
    (initialProjectId && sources.some((s) => s.projectId === initialProjectId)
      ? initialProjectId
      : sources[0]?.projectId) ?? "__none",
  );
  const [uploaded, setUploaded] = useState<ConvertSource | null>(null);
  /**
   * What reading the file had to say.
   *
   * Kept apart from the conversion's own notes and shown above them, because
   * they answer different questions: these are about what did or did not come
   * across from the vendor's file, and a person has to read them before they
   * can trust anything downstream of it.
   */
  const [importNotes, setImportNotes] = useState<ImportNote[]>([]);
  const [importFormat, setImportFormat] = useState<string | null>(null);
  /** What to do instead, when the file was one LADX deliberately does not open. */
  const [remedy, setRemedy] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>("st");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const source =
    uploaded ??
    sources.find((s) => (s.projectId ?? "__scratch") === sourceKey) ??
    sources[0] ??
    null;

  /**
   * Every target, every time.
   *
   * Converting is instant and pure, so there is no reason to make somebody
   * click through the four to find out which one comes out cleanest. The tab
   * strip can then carry each target's warning count, which is the number that
   * actually decides which route to take.
   */
  const all = useMemo(() => {
    if (!source) return null;
    return TARGETS.map((t) => {
      const result = convert(source.program, t.id);
      return { target: t, result, counts: summarise(result.notes) };
    });
  }, [source]);

  const current = all?.find((a) => a.target.id === target) ?? null;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  /**
   * Asking what to do about a conversion note.
   *
   * The notes say what did not survive; this says what to do about it, which is
   * the part that turns a report into a migration. It explains rather than
   * edits, so nothing it says can change the output, and the prompt is told
   * never to claim the conversion is finished.
   */
  const runAssist = useCallback(
    async (question: string, { step, model, signal }: AssistRunContext) => {
      step.start("read", "Reading the conversion");
      const manual = current ? current.result.notes.filter((n) => n.severity === "manual") : [];
      step.detail(
        current
          ? `${current.target.name} output, ${current.result.notes.length} notes, ${manual.length} needing a person`
          : "Nothing converted yet",
      );

      if (!current || !source) {
        step.fail("Nothing to talk about yet");
        throw new Error("Open a program first, and this can answer questions about the result.");
      }

      const context = [
        `Source program: ${source.name}, ${source.program.rungs.length} rungs, ${source.program.tags.length} tags`,
        `Target: ${current.target.name}`,
        "",
        "Notes the conversion produced:",
        ...current.result.notes.map((n) => `  [${n.severity}] ${n.where}: ${n.message}`),
        "",
        "The converted output:",
        current.result.text.slice(0, 12000),
      ].join("\n");

      step.start("ask", model ? `Asking ${model}` : "Asking the model");
      let b: Awaited<ReturnType<AskModel>>;
      try {
        b = await askModel({ tool: "convert", context, question, model, signal });
      } catch (err) {
        // Reported through the step list rather than only thrown, so the
        // failure appears where the person was watching the work happen.
        const why = err instanceof Error ? err.message : "No answer came back";
        step.fail(why);
        throw new Error(why);
      }
      step.detail(b.model ? `${b.model} replied` : "Reply received");
      return { text: b.answer, undoable: false };
    },
    [current, source, askModel],
  );

  const assist = useAssistant({
    run: runAssist,
    modelsUrl,
    memoryKey: source ? `convert:${source.projectId ?? source.name}` : null,
  });

  const takeFile = useCallback(async (file: File) => {
    const out = readProgramFile(file.name, await file.text());
    if (!out.ok) {
      setError(out.error);
      setRemedy(out.remedy ?? null);
      setImportNotes([]);
      setImportFormat(null);
      return;
    }
    setError(null);
    setRemedy(null);
    setImportNotes(out.imported.notes);
    setImportFormat(out.format);
    setUploaded({
      projectId: null,
      projectName: null,
      name: out.name || file.name.replace(/\.[^.]+$/, ""),
      program: out.imported.program,
    });
  }, []);

  const [exported, setExported] = useState<string | null>(null);

  const download = (text: string, filename: string) => {
    if (onExport) {
      onExport
        .save(text, filename)
        .then((path) => setExported(`to ${path}`))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Every target at once, which is what a migration actually needs. */
  const downloadAll = () => {
    if (!all) return;
    if (onExport) {
      // Reported as a count rather than one path at a time: saving five files
      // and being told about one of them reads like the other four failed.
      Promise.all(all.map(({ result }) => onExport.save(result.text, result.filename)))
        .then((paths) => setExported(`${paths.length} files into the project`))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return;
    }
    for (const { result } of all) download(result.text, result.filename);
  };

  /**
   * The conversion, written onto the project.
   *
   * A migration is a controlled change, and "we converted it and it looked
   * fine" is not a record. This writes what was converted, to what, and every
   * note the converter raised, as a document that exports to PDF and Word with
   * the rest of the pack.
   */
  const saveReport = async () => {
    if (!source?.projectId || !all) return;
    setSaving(true);
    setStatus(null);
    try {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      const routines = programRoutines(source.program);
      const body = [
        "# Conversion record",
        "",
        "| | |",
        "|---|---|",
        `| **Project** | ${source.projectName ?? ""} |`,
        `| **Program** | ${source.name} |`,
        `| **Routines** | ${routines.map((r) => r.name).join(", ")} |`,
        `| **Converted by** | ${author}${companyName ? `, ${companyName}` : ""} |`,
        `| **Recorded** | ${now} UTC |`,
        "",
        "Ladder carries information that text does not: the physical order of",
        "contacts on a rung and the branch geometry. Structured Text preserves the",
        "logic and discards the drawing. Instructions that hold state across scans",
        "become function block instances with declarations the ladder never had.",
        "Every one of those is listed below and needs checking before this code",
        "reaches a controller.",
        "",
        "## Targets",
        "",
        "| Target | File | Notes | Check | By hand |",
        "|---|---|---|---|---|",
        ...all.map(
          ({ target: t, result, counts }) =>
            `| ${t.name} | ${result.filename} | ${counts.info ?? 0} | ${counts.warning ?? 0} | ${counts.manual ?? 0} |`,
        ),
        "",
        ...all.flatMap(({ target: t, result }) =>
          result.notes.length === 0
            ? [`## ${t.name}`, "", "Converted with nothing to report.", ""]
            : [
                `## ${t.name}`,
                "",
                "| Severity | Where | Note |",
                "|---|---|---|",
                ...result.notes.map(
                  (n: ConversionNote) =>
                    `| ${SEVERITY_LABEL[n.severity]} | ${n.where} | ${n.message} |`,
                ),
                "",
              ],
        ),
      ].join("\n");

      if (!onSaveRecord) return;
      const ok = await onSaveRecord({
        title: `Conversion record, ${source.name}`,
        projectId: source.projectId,
        content: body,
      });
      setStatus(ok ? "Saved to the project's documents." : "Could not save the record.");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  return (
    // `relative` for the sr-only upload input further down: absolute with no
    // positioned ancestor escapes to the initial containing block and stretches
    // the document, which scrolls the whole Studio shell.
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
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900">
          {unreadable.length} saved program{unreadable.length === 1 ? "" : "s"} could not be read
          and {unreadable.length === 1 ? "is" : "are"} not listed: {unreadable.join(", ")}. Open{" "}
          {unreadable.length === 1 ? "it" : "them"} in Ladder and save again to repair the file.
        </p>
      )}
      {/* source bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3 py-2">
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-ink-400" />
        {uploaded ? (
          <span className="flex items-center gap-2 rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] text-ink-700">
            {uploaded.name}
            <button
              type="button"
              onClick={() => setUploaded(null)}
              className="text-ink-400 hover:text-ink-900"
            >
              use a project instead
            </button>
          </span>
        ) : (
          <select
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[12.5px] outline-none focus:border-ink-500"
          >
            {sources.length === 0 && <option value="__none">No saved programs</option>}
            {sources.map((s) => (
              <option key={s.projectId ?? "__scratch"} value={s.projectId ?? "__scratch"}>
                {s.projectName ? `${s.projectName}, ${s.name}` : `${s.name} (scratch)`}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400"
        >
          <Upload className="h-3.5 w-3.5" />
          Open a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={READABLE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void takeFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => {
            const starter = STARTER_PROGRAMS[0];
            if (!starter) return;
            setError(null);
            setUploaded({
              projectId: null,
              projectName: null,
              name: `${starter.name} (example)`,
              program: starter.program,
            });
          }}
          className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400"
        >
          <PackageOpen className="h-3.5 w-3.5" />
          Example
        </button>

        <div className="ml-auto flex items-center gap-2">
          {status && <span className="text-[11.5px] text-ink-500">{status}</span>}
          {source?.projectId && onSaveRecord && (
            <button
              type="button"
              onClick={saveReport}
              disabled={saving || !all}
              className="flex h-7 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 text-[12px] text-ink-600 transition-colors hover:border-ink-400 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              Save record
            </button>
          )}
          <button
            type="button"
            onClick={downloadAll}
            disabled={!all}
            className="flex h-7 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            All targets
          </button>
        </div>
      </div>

      {exported && (
        <p
          className="shrink-0 truncate border-ink-100 border-b bg-ink-50/60 px-3 py-1.5 text-[11.5px] text-ink-600"
          title={exported}
        >
          Saved {exported}
        </p>
      )}

      {error && (
        <div className="shrink-0 border-red-200 border-b bg-red-50 px-3 py-2">
          <p className="text-[12.5px] text-red-800">{error}</p>
          {/* The remedy is the point of refusing a project file at all: the
              person is holding what their tool saved, and what they need is the
              two clicks that produce something readable. */}
          {remedy && <p className="mt-1 text-[12.5px] text-red-900">{remedy}</p>}
        </div>
      )}

      {importNotes.length > 0 && (
        <details
          open={importNotes.some((n) => n.severity === "manual")}
          className="shrink-0 border-ink-100 border-b bg-ink-50/40 px-3 py-2"
        >
          <summary className="cursor-pointer text-[12.5px] text-ink-700">
            {importFormat ? `Read from ${importFormat}` : "Read"}
            {": "}
            {importNotes.filter((n) => n.severity === "manual").length} to do by hand,{" "}
            {importNotes.filter((n) => n.severity === "warning").length} to check
          </summary>
          <ul className="mt-2 space-y-1.5">
            {importNotes.map((n) => (
              <li key={`${n.severity}${n.where}${n.message}`} className="flex gap-2">
                <span
                  className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
                    n.severity === "manual"
                      ? "bg-[#B4531A]"
                      : n.severity === "warning"
                        ? "bg-[#C08A2E]"
                        : "bg-ink-300"
                  }`}
                  aria-hidden="true"
                />
                <span className="text-[12px] text-ink-600 leading-snug">
                  <span className="font-mono text-[11px] text-ink-400">{n.where}</span> {n.message}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!source || !all || !current ? (
        <Empty unreadable={unreadable} ladderHref={ladderHref} />
      ) : (
        <>
          {/* target tabs, each carrying what it will cost you */}
          <div className="flex shrink-0 items-stretch gap-px overflow-x-auto border-b border-ink-100 bg-ink-50/30 px-3">
            {all.map(({ target: t, counts }) => {
              const active = t.id === target;
              const manual = counts.manual ?? 0;
              const warning = counts.warning ?? 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTarget(t.id)}
                  title={t.blurb}
                  className={`flex shrink-0 flex-col items-start gap-0.5 border-b-2 px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-ink-900 text-ink-900"
                      : "border-transparent text-ink-500 hover:text-ink-900"
                  }`}
                >
                  <span className="text-[13px] font-medium">{t.name}</span>
                  <span className="flex items-center gap-1.5 font-mono text-[10px]">
                    <span className="text-ink-400">{t.ext}</span>
                    {manual > 0 && <span className="text-red-700">{manual} by hand</span>}
                    {warning > 0 && <span className="text-amber-700">{warning} check</span>}
                    {manual === 0 && warning === 0 && <span className="text-teal-700">clean</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex min-h-0 flex-1">
            {/* the converted source */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b border-ink-100 px-3 py-1.5">
                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                <span className="font-mono text-[11.5px] text-ink-600">
                  {current.result.filename}
                </span>
                <span className="font-mono text-[10.5px] text-ink-300">
                  {current.result.text.split("\n").length} lines
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(current.result.text);
                      setCopied(true);
                    }}
                    className="flex h-6 items-center gap-1.5 rounded border border-ink-200 px-2 text-[11.5px] text-ink-600 transition-colors hover:border-ink-400"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => download(current.result.text, current.result.filename)}
                    className="flex h-6 items-center gap-1.5 rounded border border-ink-200 px-2 text-[11.5px] text-ink-600 transition-colors hover:border-ink-400"
                  >
                    <Download className="h-3 w-3" />
                    {onExport ? onExport.label : "Download"}
                  </button>
                </div>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto bg-ink-50/30 p-3 font-mono text-[11.5px] leading-relaxed text-ink-800">
                {current.result.text}
              </pre>
            </div>

            {/* what it could not carry across */}
            <aside className="flex w-80 shrink-0 flex-col border-l border-ink-100">
              <div className="shrink-0 border-b border-ink-100 px-3 py-2">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                  Conversion report
                </h2>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-500">
                  {current.result.notes.length === 0
                    ? "Nothing to report for this target."
                    : `${current.result.notes.length} item${
                        current.result.notes.length === 1 ? "" : "s"
                      }. Read them before this reaches a controller.`}
                </p>
              </div>
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                {current.result.notes.map((n: ConversionNote) => {
                  const Icon = SEVERITY_ICON[n.severity];
                  return (
                    <li
                      key={`${n.severity}-${n.where}-${n.message}`}
                      className={`rounded-md border px-2.5 py-2 ${SEVERITY_STYLE[n.severity]}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3 w-3 shrink-0" />
                        <span className="font-mono text-[9.5px] uppercase tracking-wide">
                          {SEVERITY_LABEL[n.severity]}
                        </span>
                        <span className="ml-auto font-mono text-[9.5px] opacity-70">{n.where}</span>
                      </span>
                      <span className="mt-1 block text-[12px] leading-snug">{n.message}</span>
                    </li>
                  );
                })}
              </ul>
            </aside>
          </div>

          {/*
            The assistant, the same one every other tool has.

            The notes say what did not survive; this says what to do about it,
            which is the part that turns a report into a migration.
          */}
          <Assistant
            toolId="convert"
            title={RELAY_TITLES.convert}
            placeholder="What do I do about the timer note?"
            suggestions={[
              "What do I have to do by hand here?",
              "How do the timers differ on the target?",
              "Is this safe to download as it stands?",
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
            actions={[
              {
                id: "open",
                label: "Open a program",
                hint: "L5X from Studio 5000, PLCopen XML, or a LADX export.",
                onSelect: () => fileRef.current?.click(),
              },
              {
                id: "download",
                label: onExport
                  ? "Save every target into the project"
                  : "Download every target at once",
                hint: "What a migration actually needs, rather than one at a time.",
                onSelect: downloadAll,
              },
            ]}
            footnote="It explains the conversion and what is left to do. It changes nothing, and it can be wrong: the output is a starting point that a person has to verify."
          />
        </>
      )}
    </div>
  );
}

function Empty({ unreadable = [], ladderHref }: { unreadable?: string[]; ladderHref: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <FileCode2 className="mx-auto mb-3 h-6 w-6 text-ink-300" />
        <h2 className="font-display text-[15px] font-bold text-ink-900">Nothing to convert yet</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
          Write a program in Ladder and save it against a project, open an exported project file, or
          load the example to see what conversion produces.
        </p>
        {unreadable.length > 0 && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[12.5px] leading-relaxed text-amber-900">
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
