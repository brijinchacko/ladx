"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The LADX wordmark.
 *
 * "LAD" in the ink colour, "X" in the ladx.ai green, set in a squared techno
 * face with wide tracking — the shape of Pirulen.
 *
 * Pirulen itself is a licensed font and is not redistributable, so it is named
 * FIRST in the stack and everything after it is a fallback: if the family is
 * installed on the machine, or self-hosted later at /fonts/pirulen.woff2 with
 * an @font-face rule, the mark picks it up with no code change. Until then the
 * fallbacks are the squarest faces normally present, and the tracking and
 * weight are set to match Pirulen's proportions rather than a generic sans.
 */

export const LADX_GREEN = "#35B6BB";

const PIRULEN_STACK =
  'Pirulen, "Eurostile", "Square721 BT", "Michroma", "Orbitron", "Bank Gothic", ' +
  '"Trebuchet MS", system-ui, sans-serif';

export default function LadxLogo({
  size = 18,
  tone = "dark",
  suffix,
  className,
}: {
  /** Cap height in pixels. */
  size?: number;
  /** "dark" puts LAD in near-black for light backgrounds; "light" in white. */
  tone?: "dark" | "light";
  /** "Mini", or a version — set smaller and lighter beside the mark. */
  suffix?: string;
  className?: string;
}) {
  const ink = tone === "light" ? "#F8FAFC" : "#0F172A";

  return (
    <span
      className={className}
      style={{
        fontFamily: PIRULEN_STACK,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: size * 0.11,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "baseline",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: ink }}>LAD</span>
      <span style={{ color: LADX_GREEN }}>X</span>
      {suffix && (
        <span
          style={{
            color: tone === "light" ? "#94A3B8" : "#64748B",
            fontSize: size * 0.55,
            fontWeight: 600,
            letterSpacing: size * 0.05,
            marginLeft: size * 0.42,
          }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

/**
 * The app icon: a minimal ladder on a dark tile.
 *
 * Two power rails with three rungs — what the software draws, reduced until it
 * survives at 16px. Every decision here came from testing at that size and
 * nowhere else:
 *
 *   THREE rungs, not two. Two rungs between two uprights renders a capital H
 *   and nothing else; the third is what makes it a ladder.
 *
 *   Even air above, between and below, so the rails clearly run past the outer
 *   rungs. Crowded to the ends, the shape closes into a box.
 *
 *   Two colours on the tile — white rails, one green rung — which is the limit
 *   at 16px and the same pattern as the wordmark: the body in ink or white,
 *   one element in the ladx.ai green.
 *
 * Inline SVG rather than a PNG so it is crisp at any size and costs no
 * request. scripts/make-ladx-icon.py renders the same geometry to
 * public/images/ladx-icon.png for favicons and app tiles.
 */
export function LadxMark({ size = 28 }: { size?: number }) {
  // Narrow: a ladder is taller than it is wide. At 44% of the tile the first
  // version read as a gate rather than a ladder.
  const RAIL_W = 88;
  const RAILS = [336, 600];
  const [INNER_LEFT, INNER_RIGHT] = [424, 600];
  const RUNGS = [274, 464, 654];
  const RUNG_H = 96;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="LADX"
      className="shrink-0"
    >
      <rect width="1024" height="1024" rx="225" fill="#0F172A" />
      {RAILS.map((x) => (
        <rect key={x} x={x} y={180} width={RAIL_W} height={664} fill="#F8FAFC" />
      ))}
      {RUNGS.map((y, i) => (
        <rect
          key={y}
          x={INNER_LEFT}
          y={y}
          width={INNER_RIGHT - INNER_LEFT}
          height={RUNG_H}
          fill={i === 1 ? LADX_GREEN : "#F8FAFC"}
        />
      ))}
    </svg>
  );
}

/**
 * The application surface.
 *
 * LADX Mini is a piece of software sitting inside the portal, not another
 * portal page — so it gets a white canvas in a bordered frame with its own
 * title bar, and the home screen and the editor share it. Two screens of the
 * same program should not look like two different products.
 *
 * The palette is the mark's: LADX green for anything live or actionable, deep
 * slate ink for the chrome, white for the work.
 */
export function LadxFrame({
  right,
  children,
}: {
  /** Title-bar controls — Save, project name, and so on. */
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Fullscreen, two ways.
   *
   * A ladder is a wide drawing and the portal chrome costs a third of the
   * screen, so the editor needs the whole window. The real Fullscreen API is
   * tried first because it also hides the browser's own furniture; if it is
   * refused — an iframe without the permission, or an older browser — the
   * frame falls back to covering the viewport, which is nearly as good and
   * never fails.
   */
  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        return;
      }
      await document.exitFullscreen();
      return;
    } catch {
      setFull((v) => !v);
    }
  }, []);

  // Escape leaves the fallback, and the native one keeps our state in step.
  useEffect(() => {
    function onChange() {
      if (document.fullscreenElement === ref.current) setFull(true);
      else if (!document.fullscreenElement) setFull(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.fullscreenElement) setFull(false);
    }
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    // No overflow-hidden anywhere on this frame: it would clip every menu
    // dropdown at the frame's edge, which is exactly how the File and Edit
    // menus came out cut in half. The corners are rounded on the children
    // instead.
    <div
      ref={ref}
      className={full ? "fixed inset-0 z-50 overflow-auto" : "rounded-xl border"}
      style={
        full
          ? { background: "#FFFFFF" }
          : {
              borderColor: "#C9D2DC",
              background: "#FFFFFF",
              boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
            }
      }
    >
      <div
        className="flex items-center gap-2 px-3 h-10 border-b"
        style={{
          borderColor: "#C9D2DC",
          background: "#0F172A",
          borderTopLeftRadius: full ? 0 : 11,
          borderTopRightRadius: full ? 0 : 11,
        }}
      >
        <LadxMark size={20} />
        <LadxLogo size={14} tone="light" suffix="MINI" />
        <span className="ml-auto flex items-center gap-2">
          {right}
          <button
            type="button"
            onClick={toggle}
            title={
              full ? "Leave fullscreen  ·  Esc" : "Fullscreen — the ladder gets the whole window"
            }
            aria-label={full ? "Leave fullscreen" : "Fullscreen"}
            className="grid place-items-center w-6 h-6 rounded hover:bg-white/10"
            style={{ color: "#94A3B8" }}
          >
            {full ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </span>
      </div>
      <div
        style={{
          background: "#F4F6F9",
          borderBottomLeftRadius: full ? 0 : 11,
          borderBottomRightRadius: full ? 0 : 11,
          minHeight: full ? "calc(100vh - 40px)" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
