"use client";

import type { CompanyProfile } from "@/lib/db/schema";
import { useRef, useState } from "react";

/** Fields other than name and logo, laid out in the order a letterhead reads. */
const FIELDS: { key: keyof CompanyProfile; label: string; placeholder?: string; wide?: boolean }[] =
  [
    { key: "addressLine1", label: "Address line 1", wide: true },
    { key: "addressLine2", label: "Address line 2", wide: true },
    { key: "city", label: "City" },
    { key: "region", label: "County / State" },
    { key: "postcode", label: "Postcode" },
    { key: "country", label: "Country" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "website", label: "Website" },
    { key: "registrationNumber", label: "Company reg. number" },
    { key: "vatNumber", label: "VAT number" },
  ];

// Keep the stored logo within the column's cap. ~1 MB of image.
const MAX_LOGO_BYTES = 1_000_000;

/**
 * The company profile, entered once and stamped onto every document.
 *
 * The logo preview matters: an engineer uploading a logo wants to see it come
 * out the size and crop it will be on the page, not just a filename. So the
 * upload reads the file to a data URL, shows it immediately, and that same data
 * URL is what gets saved and later embedded in documents.
 */
export default function CompanyForm({ initial }: { initial: CompanyProfile | null }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [logo, setLogo] = useState<string | null>(initial?.logo ?? null);
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of FIELDS) seed[f.key as string] = (initial?.[f.key] as string) ?? "";
    return seed;
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onLogo(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      setStatus({ kind: "error", text: "That logo is over 1 MB. Use a smaller PNG or SVG." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), logo: logo ?? "", ...fields }),
      });
      if (!res.ok) {
        setStatus({ kind: "error", text: "Could not save. Check the logo size and try again." });
        return;
      }
      setStatus({ kind: "ok", text: "Saved. This is now on every document you generate." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {/* logo + name, the two that show largest on a document */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
            Logo
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-24 w-44 items-center justify-center overflow-hidden rounded-sm border border-dashed border-ink-300 bg-white transition-colors hover:border-ink-500"
          >
            {logo ? (
              <img
                src={logo}
                alt="Company logo preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="px-2 text-center text-[12px] text-ink-400">
                Click to upload
                <br />
                PNG or SVG
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onLogo(f);
            }}
          />
          {logo && (
            <button
              type="button"
              onClick={() => setLogo(null)}
              className="mt-1.5 font-mono text-[11px] text-ink-400 transition-colors hover:text-danger"
            >
              Remove logo
            </button>
          )}
        </div>

        <label className="block flex-1">
          <span className="mb-1.5 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
            Company name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Your company"
            className="w-full rounded-sm border border-ink-200 px-3 py-2 text-[15px] text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-ink-500"
          />
          <span className="mt-2 block text-[12.5px] leading-relaxed text-ink-400">
            The name and logo print at the top of every document. The details below fill the
            letterhead beneath them.
          </span>
        </label>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key as string} className={`block ${f.wide ? "sm:col-span-2" : ""}`}>
            <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
              {f.label}
            </span>
            <input
              value={fields[f.key as string] ?? ""}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full rounded-sm border border-ink-200 px-2.5 py-1.5 text-[14px] text-ink-900 outline-none transition-colors focus:border-ink-500"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="rounded-sm bg-ink-900 px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save company profile"}
        </button>
        {status && (
          <p className={`text-[13.5px] ${status.kind === "ok" ? "text-teal-700" : "text-danger"}`}>
            {status.text}
          </p>
        )}
      </div>
    </form>
  );
}
