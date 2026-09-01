"use client";

import {
  CATEGORIES,
  type ConsentCategory,
  type ConsentState,
  acceptedState,
  purgeFunctionalStorage,
  readConsent,
  rejectedState,
  writeConsent,
} from "@/lib/consent/consent";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * The consent banner and its preferences dialog.
 *
 * Two rules govern the design, both of them from the regulations rather than
 * from taste. Reject must be exactly as easy as accept, which means one click
 * at the same level, not buried behind "manage preferences". And every optional
 * category starts off, so a visitor who ignores the banner entirely is treated
 * as having refused.
 *
 * It renders nothing until a decision is known to be missing, so a returning
 * visitor never sees a flash of a banner they already dismissed.
 */
export default function ConsentBanner() {
  const [decided, setDecided] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setDecided(readConsent() !== null);
  }, []);

  // The footer link reopens this. Listening for an event rather than lifting
  // state means the footer stays a server component.
  useEffect(() => {
    const open = () => setDialogOpen(true);
    window.addEventListener("ladx:open-consent", open);
    return () => window.removeEventListener("ladx:open-consent", open);
  }, []);

  const decide = useCallback((state: ConsentState) => {
    if (!state.functional) purgeFunctionalStorage();
    writeConsent(state);
    setDecided(true);
    setDialogOpen(false);
  }, []);

  /**
   * Reserve space for the banner while it is showing.
   *
   * It is fixed to the bottom of the viewport, so without this it covers
   * whatever the page ends with. Padding the document rather than the banner
   * is what keeps the last paragraph of every page readable.
   */
  useEffect(() => {
    const showing = decided === false && !dialogOpen;
    const root = document.documentElement;
    if (showing) root.setAttribute("data-consent-open", "");
    else root.removeAttribute("data-consent-open");
    return () => root.removeAttribute("data-consent-open");
  }, [decided, dialogOpen]);

  // Unknown yet: render nothing rather than guessing, so there is no flash.
  if (decided === null) return null;

  return (
    <>
      {!decided && !dialogOpen && (
        <Banner
          onAcceptAll={() => decide(acceptedState())}
          onRejectAll={() => decide(rejectedState())}
          onCustomise={() => setDialogOpen(true)}
        />
      )}
      {dialogOpen && (
        <PreferencesDialog
          onSave={decide}
          onClose={() => {
            setDialogOpen(false);
            // Closing without deciding leaves the banner up, which is the point:
            // dismissing a consent dialog is not consent.
            if (readConsent() === null) setDecided(false);
          }}
        />
      )}
    </>
  );
}

function Banner({
  onAcceptAll,
  onRejectAll,
  onCustomise,
}: {
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onCustomise: () => void;
}) {
  return (
    <section
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-ink-200 bg-white"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="flex-1">
          <p className="text-[14px] leading-relaxed text-ink-700">
            <span className="font-semibold text-ink-900">We store very little.</span> One cookie to
            keep you signed in, and browser storage so Studio can keep your ladder program on your
            own machine. No advertising, no third party trackers.{" "}
            <Link
              href="/cookies"
              className="underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-900"
            >
              What we store
            </Link>
          </p>
        </div>

        {/* Reject sits beside accept, same size, same prominence. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onCustomise}
            className="rounded-sm px-3 py-2 text-[13.5px] text-ink-500 transition-colors hover:text-ink-900"
          >
            Choose
          </button>
          <button
            type="button"
            onClick={onRejectAll}
            className="rounded-sm border border-ink-300 px-4 py-2 text-[13.5px] font-medium text-ink-800 transition-colors hover:border-ink-500"
          >
            Reject optional
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </section>
  );
}

function PreferencesDialog({
  onSave,
  onClose,
}: {
  onSave: (state: ConsentState) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const existing = readConsent();

  const [selected, setSelected] = useState<Record<ConsentCategory, boolean>>({
    necessary: true,
    functional: existing?.functional ?? false,
    analytics: existing?.analytics ?? false,
  });

  // Escape closes, and focus moves into the dialog on open. Both are the
  // minimum for a modal that a keyboard user can actually get out of.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () =>
    onSave({
      necessary: true,
      functional: selected.functional,
      analytics: selected.analytics,
      decidedAt: new Date().toISOString(),
      version: 1,
    });

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink-900 p-0 sm:items-center sm:p-6">
      <div
        ref={panelRef}
        // biome-ignore lint/a11y/useSemanticElements: <dialog> manages its own
        // open state through showModal(), which fights conditional rendering.
        // The ARIA roles here give the same semantics without that conflict.
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-ink-200 bg-white outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
          <div>
            <h2 id={titleId} className="font-display text-[1.1rem] font-bold text-ink-900">
              What we store
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-500">
              Everything on this site, named. Nothing is hidden behind a vendor list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-sm border border-ink-200 px-2 py-1 font-mono text-[12px] text-ink-500 transition-colors hover:border-ink-400 hover:text-ink-900"
          >
            Esc
          </button>
        </div>

        <div className="divide-y divide-ink-100">
          {CATEGORIES.map((cat) => (
            <section key={cat.id} className="px-6 py-5">
              <div className="flex items-start justify-between gap-5">
                <div className="flex-1">
                  <h3 className="font-display text-[15px] font-bold text-ink-900">{cat.name}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-600">{cat.summary}</p>
                </div>
                <Toggle
                  label={cat.name}
                  checked={cat.required ? true : selected[cat.id]}
                  disabled={cat.required}
                  onChange={(v) => setSelected((s) => ({ ...s, [cat.id]: v }))}
                />
              </div>

              {cat.items.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr>
                        {["Name", "Kind", "Purpose", "Kept for"].map((h) => (
                          <th
                            key={h}
                            className="border-b border-ink-200 pb-1.5 pr-4 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cat.items.map((item) => (
                        <tr key={item.name}>
                          <td className="border-b border-ink-100 py-2 pr-4 font-mono text-[11.5px] text-ink-800">
                            {item.name}
                          </td>
                          <td className="border-b border-ink-100 py-2 pr-4 text-[12.5px] text-ink-500">
                            {item.kind}
                          </td>
                          <td className="border-b border-ink-100 py-2 pr-4 text-[12.5px] leading-relaxed text-ink-600">
                            {item.purpose}
                          </td>
                          <td className="border-b border-ink-100 py-2 text-[12.5px] text-ink-500">
                            {item.retention}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 font-mono text-[11.5px] text-ink-400">
                  Nothing in this category is in use today.
                </p>
              )}
            </section>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-ink-50 px-6 py-4">
          <button
            type="button"
            onClick={save}
            className="rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Save choices
          </button>
          <button
            type="button"
            onClick={() => onSave(rejectedState())}
            className="rounded-sm border border-ink-300 px-4 py-2 text-[13.5px] font-medium text-ink-800 transition-colors hover:border-ink-500"
          >
            Reject optional
          </button>
          <button
            type="button"
            onClick={() => onSave(acceptedState())}
            className="rounded-sm border border-ink-300 px-4 py-2 text-[13.5px] font-medium text-ink-800 transition-colors hover:border-ink-500"
          >
            Accept all
          </button>
          <Link
            href="/cookies"
            className="ml-auto text-[13px] text-ink-500 underline-offset-2 transition-colors hover:text-ink-900 hover:underline"
          >
            Full detail
          </Link>
        </div>
      </div>
    </div>
  );
}

/** A switch that is a real checkbox underneath, so it is keyboard operable. */
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex shrink-0 items-center gap-2 ${disabled ? "" : "cursor-pointer"}`}>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-400">
        {disabled ? "Always" : checked ? "On" : "Off"}
      </span>
      <span className="relative inline-block h-5 w-9">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={`${label} storage`}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={`absolute inset-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-900 peer-focus-visible:ring-offset-2 ${
            checked ? "bg-teal-600" : "bg-ink-200"
          } ${disabled ? "opacity-50" : ""}`}
          style={checked ? { backgroundColor: "rgb(var(--ladx-teal))" } : undefined}
        />
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[1.15rem]" : "left-0.5"
          }`}
        />
      </span>
    </label>
  );
}
