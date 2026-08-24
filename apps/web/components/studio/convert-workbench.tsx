"use client";

import {
  type ConversionNote,
  type LadxProgram,
  STARTER_PROGRAMS,
  TARGETS,
  type Target,
  convert,
  parseImport,
  programRoutines,
  summarise,
} from "@ladx/studio";
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
  PackageOpen,
  Upload,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
}: {
  sources: ConvertSource[];
  companyName: string | null;
  author: string;
  /** A project named in the URL, from a "Convert" link on a project page. */
  initialProjectId?: string | null;
  /** Programs that could not be read, named so their absence is not a mystery. */
  unreadable?: string[];
}) {
  // A project named in the URL wins over "whatever is first", so a "Convert"
  // link from a project opens that project's program.
  const [sourceKey, setSourceKey] = useState<string>(
    (initialProjectId && sources.some((s) => s.projectId === initialProjectId)
      ? initialProjectId
      : sources[0]?.projectId) ?? "__none",
  );
  const [uploaded, setUploaded] = useState<ConvertSource | null>(null);
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

  const takeFile = useCallback(async (file: File) => {
    const parsed = parseImport(await file.text());
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setUploaded({
      projectId: null,
      projectName: null,
      name: file.name.replace(/\.[^.]+$/, ""),
      program: parsed.program,
    });
  }, []);

  const download = (text: string, filename: string) => {
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

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Conversion record — ${source.name}`,
          projectId: source.projectId,
          kind: "generated",
          content: body,
        }),
      });
      setStatus(res.ok ? "Saved to the project's documents." : "Could not save the record.");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 5000);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
                {s.projectName ? `${s.projectName} — ${s.name}` : `${s.name} (scratch)`}
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
          accept=".json,application/json"
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
          {source?.projectId && (
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

      {error && (
        <p className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-800">
          {error}
        </p>
      )}

      {!source || !all || !current ? (
        <Empty unreadable={unreadable} />
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
                    Download
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
        </>
      )}
    </div>
  );
}

function Empty({ unreadable = [] }: { unreadable?: string[] }) {
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
          href="/studio/ladder"
          className="mt-4 inline-block rounded-md bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Open Ladder
        </a>
      </div>
    </div>
  );
}
