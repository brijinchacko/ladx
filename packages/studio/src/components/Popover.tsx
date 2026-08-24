"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ink, line, surface } from "../lib/theme";

/**
 * A small panel anchored to the thing it is about.
 *
 * Editing a contact used to open a centred dialog over a dimmed, blurred
 * screen. That is the right treatment for a decision that stops the world, and
 * the wrong one for typing a tag name: it hid the rung being edited, so you
 * could not see the contact you were naming or the two either side of it, and
 * every instruction added meant the whole program blinking out and back.
 *
 * This opens beside the instruction instead. Nothing is dimmed, nothing is
 * blurred, and the rung stays legible behind it, which is the point, because
 * the tag you want is usually visible on the rung you are looking at.
 *
 * Positioning: below the anchor by preference, above when there is no room
 * below, and always clamped inside the viewport so it cannot open off-screen on
 * a laptop. It repositions on scroll and resize, because the rung it is
 * attached to moves.
 */

const GAP = 8;
const MARGIN = 10;

export default function Popover({
  anchorSelector,
  title,
  onClose,
  width = 300,
  children,
}: {
  /** CSS selector for the element to sit beside. Centred if it is not found. */
  anchorSelector?: string | null;
  title: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const h = el.offsetHeight || 200;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const anchor = anchorSelector
        ? (document.querySelector(anchorSelector) as HTMLElement | null)
        : null;

      if (!anchor) {
        setPos({ left: Math.max(MARGIN, (vw - width) / 2), top: Math.max(MARGIN, (vh - h) / 3) });
        return;
      }

      const r = anchor.getBoundingClientRect();
      // Centred on the instruction horizontally, then pulled back inside.
      const left = Math.min(
        Math.max(MARGIN, r.left + r.width / 2 - width / 2),
        vw - width - MARGIN,
      );

      const below = r.bottom + GAP;
      const above = r.top - GAP - h;
      // Below unless it would run off the bottom and there is room above.
      const top =
        below + h <= vh - MARGIN || above < MARGIN ? Math.min(below, vh - h - MARGIN) : above;

      setPos({ left, top: Math.max(MARGIN, top) });
    };

    place();
    // The rung moves when the page scrolls, so the panel has to follow it.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorSelector, width]);

  /**
   * Straight into the field, once it is on screen.
   *
   * Adding an instruction and naming it is one gesture, and a panel that opens
   * with nothing focused makes it two: click the contact, then click the box,
   * then type. Only a real field is taken, never a button, so the instruction
   * picker does not open with an arbitrary instruction looking chosen.
   *
   * It has to wait for placement. The panel is visibility:hidden until its
   * position is known, and focusing a hidden element silently does nothing,
   * which is exactly how this failed the first time.
   */
  const focused = useRef(false);
  useEffect(() => {
    if (!pos || focused.current) return;
    focused.current = true;
    ref.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  }, [pos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/*
        A click-catcher, not a scrim. It closes the panel when you click away,
        which is what a popover should do, but it paints nothing: dimming here
        would bring back the exact problem this replaced.
      */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="fixed inset-0 z-40 cursor-default"
      />

      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        style={{
          position: "fixed",
          left: pos?.left ?? -9999,
          top: pos?.top ?? -9999,
          width,
          // Hidden until placed, so it never flashes at the wrong coordinates.
          visibility: pos ? "visible" : "hidden",
          /*
           * Painted from the theme rather than from a utility class.
           *
           * The dialog this replaced used `bg-dark-secondary`, which is a class
           * from this package's own Tailwind theme and is not compiled into the
           * app that mounts it: it resolved to transparent. That went unnoticed
           * because the dimmed, blurred scrim behind the dialog made it look
           * like a surface. Remove the scrim and the panel is a sheet of glass
           * with the message log legible through it. A floating panel has to
           * bring its own opacity.
           */
          background: surface.raised,
          border: `1px solid ${line.base}`,
          color: ink.base,
          boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
        }}
        className="z-50 max-h-[70vh] overflow-y-auto rounded-xl p-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[12.5px] font-bold" style={{ color: ink.strong }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hover:opacity-70"
            style={{ color: ink.muted }}
          >
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
