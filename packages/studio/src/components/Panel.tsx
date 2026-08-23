"use client";

import { HelpCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { PANEL_BY_ID, type PanelId, clampSize } from "../lib/panels";
import { ink, line, radius, surface } from "../lib/theme";
import Tip from "./Tip";
import css from "./ladx.module.css";

/**
 * One dockable pane: a title bar, a close button, and a body.
 *
 * Closing sends it to the dock along the bottom rather than deleting it. That
 * is the whole reason people are willing to close things.
 */
export default function Panel({
  id,
  onClose,
  onHelp,
  actions,
  children,
  bodyClass,
  style,
}: {
  id: PanelId;
  onClose: (id: PanelId) => void;
  onHelp: (topic: string) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  bodyClass?: string;
  style?: React.CSSProperties;
}) {
  const def = PANEL_BY_ID.get(id)!;

  return (
    <section
      data-tour={`panel-${id}`}
      aria-label={def.title}
      className={`overflow-hidden flex flex-col min-h-0 min-w-0 ${css.panelIn}`}
      style={{
        border: `1px solid ${line.base}`,
        borderRadius: radius.md,
        background: surface.raised,
        ...style,
      }}
    >
      <header
        className="flex items-center gap-1 px-2 shrink-0"
        style={{
          height: 24,
          background: surface.subtle,
          borderBottom: `1px solid ${line.soft}`,
        }}
      >
        <Tip
          label={def.title}
          text={def.blurb}
          topic={def.helpTopic}
          onOpenHelp={onHelp}
          place="bottom"
        >
          <span
            className="cursor-default"
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              color: ink.muted,
            }}
          >
            {def.title}
          </span>
        </Tip>
        <span className="flex-1" />
        {actions}
        <Tip
          label={`Help: ${def.title}`}
          text="Open the manual at this panel."
          topic={def.helpTopic}
          onOpenHelp={onHelp}
          place="bottom"
        >
          <button
            type="button"
            onClick={() => onHelp(def.helpTopic)}
            aria-label={`Help for ${def.title}`}
            className={`${css.iconBtn} ${css.iconBtnHelp}`}
          >
            <HelpCircle size={11} />
          </button>
        </Tip>
        <Tip
          label={`Close ${def.title}`}
          text="It moves to the dock along the bottom. Click it there to bring it back."
          topic="screen"
          onOpenHelp={onHelp}
          place="bottom"
        >
          <button
            type="button"
            onClick={() => onClose(id)}
            aria-label={`Close ${def.title}`}
            className={css.iconBtn}
          >
            <X size={12} />
          </button>
        </Tip>
      </header>
      <div className={bodyClass ?? "flex-1 min-h-0 overflow-auto"}>{children}</div>
    </section>
  );
}

/**
 * The draggable edge between a panel and the canvas.
 *
 * Uses pointer capture, so a fast drag that leaves the handle keeps resizing
 * instead of sticking, the single most common flaw in hand-built splitters.
 * The keyboard works too: a splitter you can only reach with a mouse is one
 * more thing that quietly excludes somebody.
 */
export function Resizer({
  id,
  axis,
  invert,
  size,
  onSize,
}: {
  id: PanelId;
  /** "x" for a side panel's width, "y" for a bottom panel's height. */
  axis: "x" | "y";
  /** True when dragging toward the origin should make the panel bigger. */
  invert?: boolean;
  size: number;
  onSize: (id: PanelId, size: number) => void;
}) {
  const def = PANEL_BY_ID.get(id)!;
  const from = useRef<{ pos: number; size: number } | null>(null);

  const move = useCallback(
    (e: PointerEvent) => {
      if (!from.current) return;
      const now = axis === "x" ? e.clientX : e.clientY;
      const delta = (now - from.current.pos) * (invert ? -1 : 1);
      onSize(id, clampSize(id, from.current.size + delta));
    },
    [axis, invert, id, onSize],
  );

  const up = useCallback(() => {
    from.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [move, up]);

  const step = (d: number) => onSize(id, clampSize(id, size + d));

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={`Resize ${def.title}`}
      aria-valuenow={size}
      aria-valuemin={def.min}
      aria-valuemax={def.max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        from.current = { pos: axis === "x" ? e.clientX : e.clientY, size };
      }}
      onDoubleClick={() => onSize(id, def.size)}
      onKeyDown={(e) => {
        const big = e.shiftKey ? 40 : 12;
        if (e.key === (axis === "x" ? "ArrowLeft" : "ArrowUp")) {
          e.preventDefault();
          step(invert ? big : -big);
        } else if (e.key === (axis === "x" ? "ArrowRight" : "ArrowDown")) {
          e.preventDefault();
          step(invert ? -big : big);
        } else if (e.key === "Home") {
          e.preventDefault();
          onSize(id, def.size);
        }
      }}
      title={`Drag to resize ${def.title}. Double-click to reset.`}
      className={`group shrink-0 grid place-items-center focus:outline-none ${css.seam}`}
      style={{
        cursor: axis === "x" ? "col-resize" : "row-resize",
        width: axis === "x" ? 7 : undefined,
        height: axis === "y" ? 7 : undefined,
        touchAction: "none",
      }}
    >
      {/* A thin grip that darkens on hover, the handle is 7px for an easy
          target, the visible line is 3px so it reads as a seam. */}
      <div
        className={css.seamGrip}
        style={{
          width: axis === "x" ? 3 : 26,
          height: axis === "y" ? 3 : 26,
        }}
      />
    </div>
  );
}
