"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HELP_BY_ID } from "../lib/help";
import { brand, ink, radius, shadow } from "../lib/theme";
import css from "./ladx.module.css";

/**
 * A hover explanation that can hand you off to the manual.
 *
 * The browser's own title attribute would be less work, but it cannot carry a
 * link, it takes a second to appear, and it is unreadable on a touch screen.
 * This appears quickly, explains the control in a sentence, and offers the
 * page in the manual that covers it properly.
 *
 * Rendered through a portal so a tooltip on a control inside a scrolling panel
 * is not clipped by that panel, the failure that makes most hand-rolled
 * tooltips useless exactly where they are most needed.
 */
export default function Tip({
  label,
  text,
  topic,
  onOpenHelp,
  place = "bottom",
  children,
  className,
  asChild,
}: {
  label: string;
  text?: string;
  topic?: string;
  onOpenHelp?: (topic: string) => void;
  place?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  className?: string;
  /** Render no wrapper element, use when the child is already a block. */
  asChild?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topicTitle = topic ? HELP_BY_ID.get(topic)?.title : undefined;

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = hostRef.current;
      if (!el) return;
      // With asChild the wrapper is display:contents, which has no box of its
      // own, measure the child that actually occupies space, or the card
      // lands in the top-left corner.
      const measured = el.getBoundingClientRect();
      const r =
        measured.width < 1 && measured.height < 1
          ? (el.firstElementChild?.getBoundingClientRect() ?? measured)
          : measured;
      if (r.width < 1 && r.height < 1) return;
      const pad = 8;
      // Anchor point on the requested side, then let the bubble clamp itself.
      const x =
        place === "left" ? r.left - pad : place === "right" ? r.right + pad : r.left + r.width / 2;
      const y =
        place === "top" ? r.top - pad : place === "bottom" ? r.bottom + pad : r.top + r.height / 2;
      setAt({ x, y });
    }, 350);
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setAt(null);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const body = (
    <>
      {children}
      {at &&
        typeof document !== "undefined" &&
        createPortal(
          <Bubble
            at={at}
            place={place}
            label={label}
            text={text}
            topicTitle={topicTitle}
            onHelp={
              topic && onOpenHelp
                ? () => {
                    hide();
                    onOpenHelp(topic);
                  }
                : undefined
            }
          />,
          document.body,
        )}
    </>
  );

  return (
    <span
      ref={hostRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={asChild ? className : `inline-flex ${className ?? ""}`}
      style={asChild ? { display: "contents" } : undefined}
    >
      {body}
    </span>
  );
}

function Bubble({
  at,
  place,
  label,
  text,
  topicTitle,
  onHelp,
}: {
  at: { x: number; y: number };
  place: "top" | "bottom" | "left" | "right";
  label: string;
  text?: string;
  topicTitle?: string;
  onHelp?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Measure, then place, so the bubble can be kept inside the window whatever
  // its size turns out to be. Placed off-screen for the first paint rather
  // than hidden, so it never flashes in the wrong corner.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const pad = 8;
    let left = at.x;
    let top = at.y;

    if (place === "top") {
      left -= b.width / 2;
      top -= b.height;
    } else if (place === "bottom") {
      left -= b.width / 2;
    } else if (place === "left") {
      left -= b.width;
      top -= b.height / 2;
    } else {
      top -= b.height / 2;
    }

    left = Math.max(pad, Math.min(window.innerWidth - b.width - pad, left));
    top = Math.max(pad, Math.min(window.innerHeight - b.height - pad, top));
    setPos({ left, top });
  }, [at.x, at.y, place]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className={`fixed z-[9000] pointer-events-none ${pos ? css.tipIn : ""}`}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        maxWidth: 268,
        background: ink.strong,
        color: "#E8EDF3",
        padding: "8px 10px",
        fontSize: 11,
        lineHeight: 1.45,
        borderRadius: radius.md,
        boxShadow: shadow.pop,
      }}
    >
      <div className="font-semibold text-white">{label}</div>
      {text && (
        // pre-line, so a hover card can carry a "watch out" paragraph on its
        // own line instead of running it into the description.
        <div className="mt-0.5 text-[10.5px] text-ink-400" style={{ whiteSpace: "pre-line" }}>
          {text}
        </div>
      )}
      {topicTitle && onHelp && (
        <div
          className="mt-2 pt-2 pointer-events-auto"
          style={{ borderTop: "1px solid rgba(255,255,255,0.13)" }}
        >
          <button
            type="button"
            onClick={onHelp}
            className={css.tipLink}
            style={{ color: brand.teal }}
          >
            Help: {topicTitle} →
          </button>
        </div>
      )}
    </div>
  );
}
