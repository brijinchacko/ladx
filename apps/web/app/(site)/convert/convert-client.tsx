"use client";

import {
  type ImportNote,
  type LadxProgram,
  READABLE_ACCEPT,
  STARTER_PROGRAMS,
  TARGETS,
  type Target,
  convert,
  readProgramFile,
  summarise,
} from "@ladx/studio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SEVERITY_STYLE: Record<string, string> = {
  info: "border-ink-300 text-ink-600",
  warning: "border-amber-500 text-amber-800",
  manual: "border-red-500 text-red-800",
};

const SEVERITY_LABEL: Record<string, string> = {
  info: "Note",
  warning: "Check",
  manual: "By hand",
};

/**
 * Convert, the working end.
 *
 * Everything runs in the browser. That is not a shortcut, it is the point: a
 * PLC program is commercially sensitive and often covered by an NDA, and the
 * honest way to convert one is to not receive it in the first place. Nothing
 * here is uploaded, and the page says so where somebody deciding whether to
 * paste their program can read it.
 *
 * The source is a LADX project file, which is what Studio exports. Reading
 * vendor formats directly is the Rust parser's job and belongs on the desktop
 * side, where a 50 MB L5X is not a browser problem.
 */
export default function ConvertClient() {
  const [program, setProgram] = useState<LadxProgram | null>(null);
  const [sourceName, setSourceName] = useState<string>("");
  const [target, setTarget] = useState<Target>("st");
  const [error, setError] = useState<string | null>(null);
  /** What to do instead, when the file was a project rather than an export. */
  const [remedy, setRemedy] = useState<string | null>(null);
  /** What reading the file had to say, which is the part a migration lives on. */
  const [importNotes, setImportNotes] = useState<ImportNote[]>([]);
  const [importFormat, setImportFormat] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => (program ? convert(program, target) : null), [program, target]);
  const counts = useMemo(() => (result ? summarise(result.notes) : null), [result]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const loadText = useCallback((raw: string, name: string) => {
    const out = readProgramFile(name, raw);
    if (!out.ok) {
      setError(out.error);
      setRemedy(out.remedy ?? null);
      setImportNotes([]);
      setImportFormat(null);
      setProgram(null);
      return;
    }
    setError(null);
    setRemedy(null);
    setImportNotes(out.imported.notes);
    setImportFormat(out.format);
    setProgram(out.imported.program);
    setSourceName(name);
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      // Read in the browser. The file never leaves the machine.
      const text = await file.text();
      loadText(text, file.name);
    },
    [loadText],
  );

  const loadExample = useCallback(() => {
    const starter = STARTER_PROGRAMS[0];
    if (!starter) return;
    setError(null);
    setRemedy(null);
    setImportNotes([]);
    setImportFormat(null);
    setProgram(starter.program);
    setSourceName(`${starter.name} (example)`);
  }, []);

  const download = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div className="grid gap-8 lg:grid-cols-[340px_1fr] lg:items-start">
      {/* ── source and target ── */}
      <div className="space-y-6">
        <section className="border border-ink-200 bg-white">
          <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
            <h2 className="font-display text-[14px] font-bold text-ink-900">1. The program</h2>
          </div>
          <div className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-sm border border-dashed border-ink-300 px-4 py-5 text-[13.5px] text-ink-600 transition-colors hover:border-ink-500 hover:text-ink-900"
            >
              Open a program
              <span className="mt-1 block font-mono text-[11px] text-ink-400">
                .L5X from Studio 5000, PLCopen XML, or a LADX export
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={READABLE_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />

            <button
              type="button"
              onClick={loadExample}
              className="w-full rounded-sm border border-ink-200 px-4 py-2 text-[13px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
            >
              Or load an example to see the output
            </button>

            {error && (
              <div className="border-red-500 border-l-2 bg-red-50 py-2 pl-3">
                <p className="text-[13px] text-red-800">{error}</p>
                {/* The whole point of recognising a project file is being able
                    to name the export that works instead. */}
                {remedy && <p className="mt-1 text-[12.5px] text-red-900">{remedy}</p>}
              </div>
            )}

            {importNotes.length > 0 && (
              <details
                open={importNotes.some((n) => n.severity === "manual")}
                className="border-ink-200 border-t pt-3"
              >
                <summary className="cursor-pointer text-[12.5px] text-ink-700">
                  {importFormat ? `Read from ${importFormat}` : "Read"}:{" "}
                  {importNotes.filter((n) => n.severity === "manual").length} to do by hand,{" "}
                  {importNotes.filter((n) => n.severity === "warning").length} to check
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {importNotes.map((n) => (
                    <li key={`${n.severity}${n.where}${n.message}`} className="flex gap-2">
                      <span
                        className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                          n.severity === "manual"
                            ? "bg-[#B4531A]"
                            : n.severity === "warning"
                              ? "bg-[#C08A2E]"
                              : "bg-ink-300"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-[12px] text-ink-600 leading-snug">
                        <span className="font-mono text-[11px] text-ink-400">{n.where}</span>{" "}
                        {n.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {program && (
              <div className="border-t border-ink-100 pt-3">
                <p className="font-mono text-[11.5px] text-ink-500">
                  <span className="font-semibold text-ink-800">{program.name}</span>
                  <br />
                  {sourceName}
                </p>
                <p className="mt-1.5 font-mono text-[11px] text-ink-400">
                  {program.rungs.length} rungs · {program.tags.length} tags
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="border border-ink-200 bg-white">
          <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
            <h2 className="font-display text-[14px] font-bold text-ink-900">2. The target</h2>
          </div>
          <div className="p-2">
            {TARGETS.map((t) => (
              <label
                key={t.id}
                className={`block cursor-pointer border-l-2 px-3 py-2.5 transition-colors ${
                  target === t.id
                    ? "border-teal-600 bg-teal-50/40"
                    : "border-transparent hover:bg-ink-50"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="target"
                    checked={target === t.id}
                    onChange={() => setTarget(t.id)}
                    className="sr-only"
                  />
                  <span className="font-display text-[14px] font-bold text-ink-900">{t.name}</span>
                  <span className="ml-auto font-mono text-[10.5px] text-ink-400">{t.ext}</span>
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-500">
                  {t.blurb}
                </span>
              </label>
            ))}
          </div>
        </section>

        <p className="border border-ink-200 bg-ink-50/50 px-4 py-3 text-[12.5px] leading-relaxed text-ink-500">
          This runs entirely in your browser. Your program is not uploaded, and there is no server
          that could keep a copy of it.
        </p>
      </div>

      {/* ── output ── */}
      <div className="min-w-0">
        {!result ? (
          <div className="flex min-h-[360px] items-center justify-center border border-dashed border-ink-200 px-6 text-center">
            <p className="max-w-sm text-[14.5px] leading-relaxed text-ink-400">
              Choose a program on the left. The converted source appears here, with a note against
              anything that needs a person to look at it.
            </p>
          </div>
        ) : (
          <>
            {counts && result.notes.length > 0 && (
              <section className="mb-5">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <h2 className="font-display text-[15px] font-bold text-ink-900">What to check</h2>
                  <p className="font-mono text-[11.5px] text-ink-400">
                    {counts.manual > 0 && (
                      <span className="text-red-700">{counts.manual} by hand · </span>
                    )}
                    {counts.warning > 0 && (
                      <span className="text-amber-700">{counts.warning} to check · </span>
                    )}
                    {counts.info} notes
                  </p>
                </div>
                <ul className="space-y-2">
                  {result.notes.map((note) => (
                    <li
                      key={`${note.where}-${note.message}`}
                      className={`border-l-2 py-1.5 pl-3 ${SEVERITY_STYLE[note.severity]}`}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] opacity-70">
                        {SEVERITY_LABEL[note.severity]} · {note.where}
                      </p>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed">{note.message}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border border-ink-200 bg-white">
              <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                <h2 className="font-mono text-[12px] font-semibold text-ink-800">
                  {result.filename}
                </h2>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(result.text).then(() => setCopied(true));
                    }}
                    className="rounded-sm border border-ink-200 bg-white px-2.5 py-1 font-mono text-[11px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={download}
                    className="rounded-sm bg-ink-900 px-3 py-1 font-mono text-[11px] text-white transition-opacity hover:opacity-90"
                  >
                    Download
                  </button>
                </div>
              </div>
              <div className="max-h-[560px] overflow-auto">
                <pre className="p-4 font-mono text-[12px] leading-relaxed text-ink-800">
                  {result.text}
                </pre>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
