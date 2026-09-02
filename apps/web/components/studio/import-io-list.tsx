"use client";

import {
  type Column,
  type ImportedTag,
  type Mapping,
  type Sheet,
  guessMapping,
  mergeTags,
  parseSheet,
  tagsFromSheet,
} from "@/lib/ladder/io-list";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const COLUMNS: { id: Column; label: string; about: string }[] = [
  { id: "name", label: "Tag name", about: "Required. Becomes the tag." },
  {
    id: "address",
    label: "Address",
    about: "I0.0, Q0.3, Local:1:I.Data.4. Decides input or output.",
  },
  { id: "type", label: "Type", about: "BOOL, INT, REAL and so on. Blank means BOOL." },
  { id: "comment", label: "Description", about: "Shown beside the tag everywhere." },
  { id: "direction", label: "Direction", about: "Only if the address does not say. I or O." },
];

/**
 * An I/O list, in.
 *
 * Most jobs start with the client's I/O list in a spreadsheet. Saved as CSV
 * and dropped here, it becomes the tag table: named, addressed, described,
 * marked input or output. The program then starts with its signals in place,
 * and the drift check has a list to compare the site against for free.
 *
 * The columns are guessed from the headings and can be corrected before
 * anything is written. Tags the program already has keep what they have; the
 * sheet only fills in what was blank.
 */
export function ImportIoList({
  projectId,
  program,
  onDone,
}: {
  projectId: string | null;
  /** The program as saved, so the merge sees every tag it has. */
  program: { name: string; tags?: unknown[] } & Record<string, unknown>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheet: Sheet | null = useMemo(() => (text.trim() ? parseSheet(text) : null), [text]);
  // Named once, so an unnamed column still has a stable identity in the list.
  const headerOptions = useMemo(
    () =>
      (sheet?.headers ?? []).map((h, i) => ({
        id: `${i}:${h}`,
        value: i,
        label: h || `Column ${i + 1}`,
      })),
    [sheet],
  );
  const preview = useMemo(
    () => (sheet ? tagsFromSheet(sheet, mapping) : { tags: [] as ImportedTag[], skipped: 0 }),
    [sheet, mapping],
  );

  function load(t: string) {
    setText(t);
    const parsed = parseSheet(t);
    setMapping(guessMapping(parsed.headers));
    setError(null);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    load(await file.text());
  }

  async function apply() {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const existing = (program.tags ?? []) as Parameters<typeof mergeTags>[0];
      const merged = mergeTags(existing, preview.tags);
      const res = await fetch(`/api/ladder/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: program.name, program: { ...program, tags: merged.tags } }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Could not save the tags.");
        return;
      }
      setOpen(false);
      setText("");
      router.refresh();
      onDone();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!projectId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1 text-[12.5px] text-ink-700 transition-colors hover:border-ink-400"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Import an I/O list
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
          <div
            // biome-ignore lint/a11y/useSemanticElements: <dialog> manages its own open state through showModal(), which fights conditional rendering.
            role="dialog"
            aria-modal="true"
            aria-labelledby="io-import-title"
            className="w-full max-w-3xl animate-pop-in rounded-lg border border-ink-200 bg-white shadow-lg"
          >
            <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
              <div>
                <h2 id="io-import-title" className="text-[15px] font-semibold text-ink-900">
                  Import an I/O list
                </h2>
                <p className="mt-0.5 text-[13px] text-ink-500">
                  Save the spreadsheet as CSV and drop it here, or paste the cells. The columns are
                  guessed from the headings; check them before you write anything.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {!sheet ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-ink-300 px-4 py-8 text-center transition-colors hover:border-ink-500">
                    <Upload className="h-5 w-5 text-ink-400" />
                    <span className="mt-2 text-[13px] font-medium text-ink-900">Choose a CSV</span>
                    <span className="mt-0.5 text-[12px] text-ink-500">
                      Excel: File, Save As, CSV.
                    </span>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                      className="sr-only"
                      onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => load(e.target.value)}
                    rows={7}
                    spellCheck={false}
                    placeholder={
                      "Or paste from the sheet, headings first:\nTag,Address,Type,Description\nStart_PB,I0.0,BOOL,Start button"
                    }
                    className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-ink-500"
                  />
                </div>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {COLUMNS.map((c) => (
                      <label key={c.id} className="block">
                        <span className="text-[12px] font-medium text-ink-700">{c.label}</span>
                        <select
                          value={mapping[c.id] ?? ""}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [c.id]: e.target.value === "" ? undefined : Number(e.target.value),
                            }))
                          }
                          className="mt-0.5 h-8 w-full rounded-md border border-ink-200 bg-white px-2 text-[12.5px] outline-none focus:border-ink-500"
                        >
                          <option value="">Not in this sheet</option>
                          {headerOptions.map((o) => (
                            <option key={o.id} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] text-ink-400">{c.about}</span>
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 flex items-baseline justify-between">
                    <p className="text-[12.5px] text-ink-700">
                      <span className="font-medium text-ink-900">{preview.tags.length}</span> tag
                      {preview.tags.length === 1 ? "" : "s"} from {sheet.rows.length} row
                      {sheet.rows.length === 1 ? "" : "s"}
                      {preview.skipped > 0 && (
                        <span className="text-ink-500">
                          , {preview.skipped} skipped (blank or duplicate name)
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setText("")}
                      className="text-[12px] text-ink-500 hover:text-ink-900"
                    >
                      Choose another file
                    </button>
                  </div>

                  <div className="mt-2 max-h-64 overflow-auto rounded-md border border-ink-200">
                    <table className="w-full text-[12px]">
                      <thead className="sticky top-0 bg-ink-50 text-left text-ink-500">
                        <tr>
                          <th className="px-2 py-1 font-medium">Tag</th>
                          <th className="px-2 py-1 font-medium">Type</th>
                          <th className="px-2 py-1 font-medium">Address</th>
                          <th className="px-2 py-1 font-medium">I/O</th>
                          <th className="px-2 py-1 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.tags.slice(0, 200).map((t) => (
                          <tr key={t.name} className="border-t border-ink-100">
                            <td className="px-2 py-1 font-mono text-ink-900">{t.name}</td>
                            <td className="px-2 py-1 text-ink-700" title={t.lost}>
                              {t.type}
                              {t.lost && <span className="ml-1 text-warning">*</span>}
                            </td>
                            <td className="px-2 py-1 font-mono text-ink-700">{t.address ?? ""}</td>
                            <td className="px-2 py-1 text-ink-500">
                              {t.isInput ? "in" : t.isOutput ? "out" : ""}
                            </td>
                            <td className="max-w-xs truncate px-2 py-1 text-ink-600">
                              {t.comment ?? ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.tags.some((t) => t.lost) && (
                    <p className="mt-1.5 text-[11.5px] text-warning">
                      * A type the ladder editor does not have. Hover for what happens to it.
                    </p>
                  )}
                </>
              )}
              {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-[13px] text-ink-600 transition-colors hover:bg-ink-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!sheet || preview.tags.length === 0 || mapping.name === undefined || busy}
                className="rounded-md bg-ink-900 px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy
                  ? "Writing…"
                  : `Add ${preview.tags.length} tag${preview.tags.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
