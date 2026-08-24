"use client";

import { GROUP_META, GROUP_ORDER, PRODUCTS, productsIn } from "@/content/products";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/**
 * The Products mega menu.
 *
 * Eight tools is past the point where a dropdown list is readable, so the menu
 * is the shape of the work instead: write the logic, draw it and prove it, ship
 * the project. Somebody who has never heard of LADX can read the three column
 * headings and know what the thing is, which a flat list of eight product names
 * cannot do.
 *
 * Opens on hover for a mouse and on click or Enter for everything else, because
 * a hover-only menu is unusable by keyboard and invisible to touch. The close
 * on leave is delayed: the pointer has to cross a gap between the trigger and
 * the panel, and a menu that vanishes mid-journey is the classic version of
 * this component that nobody can actually click.
 */
export default function ProductsMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }

  // Clear a pending close on unmount. The ref is read inside the cleanup
  // rather than closing over cancelClose, which is a new function every render.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Escape closes and returns focus to the trigger, and a click anywhere else
  // dismisses it. Without the outside click, tapping the page on a touch device
  // leaves the panel stranded over the content.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        wrap.current?.querySelector("button")?.focus();
      }
    }
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-[14px] transition-colors ${
          active || open ? "font-semibold text-ink-900" : "text-ink-500 hover:text-ink-900"
        }`}
      >
        Products
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
          id={panelId}
          className="fixed inset-x-0 top-16 z-50 hidden px-5 md:block"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="mx-auto max-w-6xl overflow-hidden rounded-b-sm border border-t-0 border-ink-100 bg-white shadow-[0_18px_40px_-24px_rgba(15,26,36,0.35)]">
            <div className="grid gap-px bg-ink-100 sm:grid-cols-3">
              {GROUP_ORDER.map((g) => (
                <div key={g} className="bg-white p-6">
                  <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                    {GROUP_META[g].title}
                  </h3>
                  <p className="mt-1 text-[12px] leading-snug text-ink-400">
                    {GROUP_META[g].blurb}
                  </p>
                  <ul className="mt-4 space-y-1">
                    {productsIn(g).map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/products/${p.slug}`}
                          onClick={() => setOpen(false)}
                          className="group -mx-2 block rounded-sm px-2 py-1.5 transition-colors hover:bg-ink-50"
                        >
                          <span className="flex items-baseline gap-2">
                            <span className="font-display text-[14.5px] font-bold text-ink-900 group-hover:text-teal-700">
                              {p.name}
                            </span>
                            {p.state !== "live" && (
                              <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-400">
                                {p.state === "building" ? "in build" : "planned"}
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-500">
                            {p.menuLine}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-100 bg-ink-50/60 px-6 py-3">
              <Link
                href="/products"
                onClick={() => setOpen(false)}
                className="text-[13px] font-medium text-ink-800 hover:text-teal-700"
              >
                All {PRODUCTS.length} tools →
              </Link>
              <span className="text-[12.5px] text-ink-400">
                One project underneath all of them. Nothing exports to anything.
              </span>
              <Link
                href="/ladder"
                onClick={() => setOpen(false)}
                className="ml-auto text-[13px] font-medium text-teal-700 hover:text-teal-800"
              >
                Try the editor, no account
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The same thing for the mobile sheet.
 *
 * A hover panel has no meaning on a phone, so the products are simply listed
 * under their group headings, inline in the drawer. Collapsing them behind an
 * accordion would save a screen of scrolling and cost the one thing the menu is
 * for, which is seeing that there are eight of these and how they relate.
 */
export function ProductsMenuMobile({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="py-1">
      <Link
        href="/products"
        onClick={onNavigate}
        className="block py-2 text-[15px] font-semibold text-ink-900"
      >
        Products
      </Link>
      {GROUP_ORDER.map((g) => (
        <div key={g} className="mb-2 border-l border-ink-100 pl-3">
          <p className="mb-1 mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-400">
            {GROUP_META[g].title}
          </p>
          {productsIn(g).map((p) => (
            <Link
              key={p.slug}
              href={`/products/${p.slug}`}
              onClick={onNavigate}
              className="block py-1.5 text-[14px] text-ink-600"
            >
              {p.name}
              <span className="ml-2 text-[12px] text-ink-400">{p.menuLine}</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
