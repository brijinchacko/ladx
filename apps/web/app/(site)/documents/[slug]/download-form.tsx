"use client";

import { PLACEHOLDER_LABELS, type Placeholder, type TemplateFile } from "@ladx/documents";
import { useMemo, useState } from "react";

const FIELDS: Placeholder[] = [
  "PROJECT_NAME",
  "CLIENT",
  "COMPANY",
  "AUTHOR",
  "DOC_NO",
  "REV",
  "DATE",
];

/** Fields worth showing before the reader asks for more. */
const PRIMARY: Placeholder[] = ["PROJECT_NAME", "CLIENT", "COMPANY", "AUTHOR"];

/**
 * Fill in the project details, then download.
 *
 * The whole point of this control is that the file arrives usable. Downloading
 * a template and then find-and-replacing seven placeholders across a hundred
 * line document is the tedious part, and it is the part a form removes.
 *
 * The download is a plain link rather than a fetch and a Blob: a link can be
 * right-clicked, copied, and pasted to a colleague, and it survives the page
 * being closed mid-download.
 */
export default function DownloadForm({ slug, files }: { slug: string; files: TemplateFile[] }) {
  const [values, setValues] = useState<Partial<Record<Placeholder, string>>>({});
  const [showAll, setShowAll] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ slug });
    for (const f of FIELDS) {
      const v = values[f]?.trim();
      if (v) p.set(f, v);
    }
    return p;
  }, [slug, values]);

  const set = (field: Placeholder, v: string) => setValues((prev) => ({ ...prev, [field]: v }));

  const visible = showAll ? FIELDS : PRIMARY;
  const filledCount = FIELDS.filter((f) => values[f]?.trim()).length;

  return (
    <div className="border border-ink-200 bg-white">
      <div className="border-b border-ink-100 bg-ink-50 px-5 py-3">
        <h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink-900">
          Fill in and download
        </h2>
        <p className="mt-0.5 text-[13px] text-ink-500">
          Optional. Anything you leave blank downloads as a square bracket placeholder.
        </p>
      </div>

      <div className="px-5 py-5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          {visible.map((field) => (
            <label key={field} className="block">
              <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                {PLACEHOLDER_LABELS[field]}
              </span>
              <input
                type="text"
                value={values[field] ?? ""}
                onChange={(e) => set(field, e.target.value)}
                maxLength={120}
                placeholder={placeholderFor(field)}
                className="w-full rounded-sm border border-ink-200 px-2.5 py-1.5 text-[14px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500"
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 font-mono text-[11.5px] text-ink-400 underline-offset-2 transition-colors hover:text-ink-700 hover:underline"
        >
          {showAll ? "Fewer fields" : "Document number, revision and date"}
        </button>

        <div className="mt-6 border-t border-ink-100 pt-5">
          <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
            {files.length === 1 ? "Download" : `Download, ${files.length} files`}
          </p>
          <div className="flex flex-col gap-2.5">
            {files.map((file, i) => {
              const href = `/api/templates/download?${new URLSearchParams({
                ...Object.fromEntries(query),
                file: file.name,
              }).toString()}`;
              return (
                <a
                  key={file.name}
                  href={href}
                  download={file.name}
                  className={`flex items-center gap-3 rounded-sm px-4 py-2.5 text-[14px] font-medium transition-opacity hover:opacity-90 ${
                    i === 0
                      ? "bg-ink-900 text-white"
                      : "border border-ink-200 bg-white text-ink-800"
                  }`}
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] opacity-60">
                    {file.kind === "csv" ? "CSV" : "MD"}
                  </span>
                  <span className="flex-1">{file.name}</span>
                  <span aria-hidden="true" className="text-[15px] opacity-60">
                    ↓
                  </span>
                </a>
              );
            })}
          </div>
          {filledCount > 0 && (
            <p className="mt-3 font-mono text-[11px] text-teal-700">
              {filledCount} of {FIELDS.length} fields will be filled in for you
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function placeholderFor(field: Placeholder): string {
  switch (field) {
    case "PROJECT_NAME":
      return "Line 3 palletiser upgrade";
    case "CLIENT":
      return "Client name";
    case "COMPANY":
      return "Your company";
    case "AUTHOR":
      return "Your name";
    case "DOC_NO":
      return "LX-2601-FDS-001";
    case "REV":
      return "0";
    case "DATE":
      return "2026-08-23";
    default:
      return "";
  }
}
