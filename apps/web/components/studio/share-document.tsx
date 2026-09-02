"use client";

import { Check, Copy, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const EXPIRIES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "Until revoked" },
];

/**
 * A read only link to this document, for somebody without an account.
 *
 * This is how an FDS gets to the client for approval without an email
 * attachment that is out of date the moment it is sent. The link shows the
 * document as it is now, with the letterhead, and a PDF of the same. It stops
 * working on the date chosen, or when it is revoked here, whichever comes
 * first. The token is separate from the document's own id, so a private URL
 * never turns into a public one.
 */
export function ShareDocument({
  documentId,
  shareToken,
  expiresAt,
}: {
  documentId: string;
  shareToken: string | null;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(30);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const url = shareToken ? `${window.location.origin}/share/d/${shareToken}` : null;
  const expired = expiresAt ? new Date(expiresAt) < new Date() : false;

  async function create() {
    setBusy(true);
    try {
      await fetch(`/api/documents/${documentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await fetch(`/api/documents/${documentId}/share`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // The field below is selectable; copying by hand still works.
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
          url && !expired
            ? "border-teal-700 text-teal-700 hover:bg-teal-50"
            : "border-ink-200 text-ink-700 hover:border-ink-400"
        }`}
      >
        <Link2 className="h-3.5 w-3.5" />
        {url && !expired ? "Shared" : "Share"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 animate-slide-down rounded-md border border-ink-200 bg-white p-4 shadow-lg">
          {url && !expired ? (
            <>
              <p className="text-[13px] font-medium text-ink-900">
                Anyone with this link can read it
              </p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {expiresAt
                  ? `Until ${new Date(expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.`
                  : "Until you revoke it."}{" "}
                They see the document as it is now, and can download the PDF.
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Share link"
                  className="h-8 min-w-0 flex-1 rounded-md border border-ink-200 bg-ink-50 px-2 font-mono text-[11.5px] text-ink-700 outline-none"
                />
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copy link"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink-200 text-ink-600 transition-colors hover:border-ink-400"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={revoke}
                disabled={busy}
                className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-500 transition-colors hover:text-danger disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Revoke the link
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium text-ink-900">Share a read only link</p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {expired
                  ? "The previous link has expired. A new one replaces it."
                  : "For the client, or anyone without an account. The letterhead goes with it."}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {EXPIRIES.map((e) => (
                  <button
                    key={e.days}
                    type="button"
                    onClick={() => setDays(e.days)}
                    className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                      days === e.days
                        ? "border-ink-900 bg-ink-900 text-white"
                        : "border-ink-200 text-ink-700 hover:border-ink-400"
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={create}
                disabled={busy}
                className="mt-3 w-full rounded-md bg-ink-900 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create the link"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
