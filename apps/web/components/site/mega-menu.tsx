"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

/**
 * The shell a mega menu sits in.
 *
 * All of the fiddly parts of this component are in the opening and closing, and
 * none of them are about what the menu contains. The Products menu had a
 * careful version of it and the Free tools menu was about to get a second copy,
 * which is how one of them ends up without the outside-click handler and
 * strands a panel over the page on a phone.
 *
 * What is handled here:
 *
 *   Hover for a mouse, click or Enter for everything else. A hover-only menu is
 *   unusable by keyboard and invisible to touch.
 *
 *   The close on leave is delayed. The pointer has to cross a gap between the
 *   trigger and the panel, and a menu that vanishes mid-journey is the classic
 *   version of this component that nobody can actually click.
 *
 *   Escape closes and returns focus to the trigger, so a keyboard user is not
 *   left at the top of the document.
 *
 *   A click anywhere else dismisses it. Without that, tapping the page on a
 *   touch device leaves the panel stranded over the content.
 *
 *   Only one menu is open at a time. Two panels overlapping is not a state
 *   anybody meant, and moving along the nav should feel like one menu whose
 *   contents change rather than a pile of them.
 */

/**
 * Which menu is open, shared across every instance.
 *
 * A module-level subscription rather than context: the header is the only
 * consumer, and a provider around it would be ceremony for two components that
 * are always siblings.
 */
const listeners = new Set<(id: string | null) => void>();
let openId: string | null = null;

function setOpenId(id: string | null) {
  openId = id;
  for (const fn of listeners) fn(id);
}

export function useMegaMenu(id: string) {
  const [current, setCurrent] = useState<string | null>(openId);
  useEffect(() => {
    listeners.add(setCurrent);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return { open: current === id, setOpenId };
}

export default function MegaMenu({
  label,
  active,
  children,
}: {
  label: string;
  /** Whether the section this menu covers is the current page. */
  active: boolean;
  /** Called with a closer, so links inside can dismiss the panel. */
  children: (close: () => void) => ReactNode;
}) {
  const id = useId();
  const { open, setOpenId: setOpen } = useMegaMenu(id);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  }

  // Clear a pending close on unmount. The ref is read inside the cleanup rather
  // than closing over cancelClose, which is a new function every render.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(null);
        wrap.current?.querySelector("button")?.focus();
      }
    }
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, setOpen]);

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(id);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={`${id}-panel`}
        onClick={() => setOpen(open ? null : id)}
        className={`flex items-center gap-1 text-[14px] transition-colors ${
          active || open ? "font-semibold text-ink-900" : "text-ink-500 hover:text-ink-900"
        }`}
      >
        {label}
        <svg
          width="9"
          height="6"
          viewBox="0 0 9 6"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M1 1.2 4.5 4.6 8 1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        // Anchored to the viewport rather than the trigger: three columns are
        // wider than the trigger and would otherwise hang off the left edge.
        <div
          id={`${id}-panel`}
          className="fixed inset-x-0 top-16 z-50 hidden px-5 md:block"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="mx-auto max-w-6xl overflow-hidden rounded-b-sm border border-ink-100 border-t-0 bg-white shadow-[0_18px_40px_-24px_rgba(15,26,36,0.35)]">
            {children(() => setOpen(null))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A column of the panel, with its heading and its one-line reason for existing. */
export function MegaColumn({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white p-6">
      <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {title}
      </h3>
      <p className="mt-1 text-[12px] leading-snug text-ink-400">{blurb}</p>
      <ul className="mt-4 space-y-1">{children}</ul>
    </div>
  );
}

/** The strip along the bottom of a panel. */
export function MegaFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-ink-100 border-t bg-ink-50 px-6 py-3">
      {children}
    </div>
  );
}
