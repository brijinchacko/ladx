"use client";

import { LayoutGrid, PanelBottom, PanelLeft, PanelRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { Dock, DockLayout, Side } from "../lib/dock";

/**
 * The chrome around a dockable panel, and the strip that holds the closed ones.
 *
 * Written against the generic dock so the ladder editor, the HMI builder and
 * CAD get the same behaviour rather than three interpretations of it. The
 * styling is Tailwind against the LADX tokens, which is what the newer two
 * surfaces use.
 */

const SIDE_ICON: Record<Side, typeof PanelLeft> = {
  left: PanelLeft,
  right: PanelRight,
  bottom: PanelBottom,
};

export function DockPanel<Id extends string>({
  dock,
  id,
  layout,
  onResize,
  onClose,
  onMove,
  actions,
  children,
}: {
  dock: Dock<Id>;
  id: Id;
  layout: DockLayout<Id>;
  onResize: (size: number) => void;
  onClose: () => void;
  /** Omit to leave the panel where it is. Absent anyway unless it has somewhere to go. */
  onMove?: (side: Side) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const def = dock.def(id);
  const state = layout[id];
  const side = dock.sideOf(layout, id);
  const moveTo = onMove ? dock.nextSide(layout, id) : null;

  /*
   * Resize follows how far the pointer has moved, not where a container edge
   * is.
   *
   * Measuring against a parent rectangle looks simpler and is wrong as soon as
   * the layout is not exactly what the author pictured: a bottom panel sitting
   * above the dock strip computes a height that is short by the strip, and the
   * pane jumps the moment you grab it. A delta from where the drag started is
   * true wherever the panel happens to be, and it costs one ref.
   */
  const drag = useRef<{ from: number; size: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = {
      from: side === "bottom" ? e.clientY : e.clientX,
      size: state.size,
    };
    // Capture keeps the drag alive when the pointer leaves the 5px gutter,
    // which it does immediately. Guarded because it throws for a pointer the
    // browser no longer considers active, and losing the capture is survivable
    // while losing the whole drag is not.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Resizing still works while the pointer stays over the gutter.
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Each side grows in a different direction: a left panel widens as the
    // pointer goes right, a right panel as it goes left, a bottom panel as it
    // goes up.
    const delta =
      side === "left"
        ? e.clientX - d.from
        : side === "right"
          ? d.from - e.clientX
          : d.from - e.clientY;
    onResize(dock.clampSize(id, d.size + delta));
  };
  const stop = (e: React.PointerEvent) => {
    drag.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const isSide = side !== "bottom";
  const MoveIcon = moveTo ? SIDE_ICON[moveTo] : null;

  return (
    <div
      className={`relative flex shrink-0 flex-col bg-white ${
        side === "left"
          ? "border-ink-100 border-r"
          : side === "right"
            ? "border-ink-100 border-l"
            : "border-ink-100 border-t"
      }`}
      style={isSide ? { width: state.size } : { height: state.size }}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-ink-100 border-b bg-ink-50 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-500">
          {def.title}
        </span>
        {actions}
        <span className="ml-auto flex items-center gap-1.5">
          {moveTo && MoveIcon && (
            <button
              type="button"
              onClick={() => onMove?.(moveTo)}
              title={`Move ${def.title} to the ${moveTo}.`}
              className="text-ink-400 transition-colors hover:text-ink-900"
            >
              <MoveIcon className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title={`Close ${def.title}. It goes to the strip along the bottom.`}
            className="text-ink-400 transition-colors hover:text-ink-900"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">{children}</div>

      {/* The gutter, on the side facing the canvas. */}
      <div
        onPointerDown={onDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        className={`absolute z-10 ${
          side === "left"
            ? "top-0 right-0 h-full w-[5px] cursor-col-resize"
            : side === "right"
              ? "top-0 left-0 h-full w-[5px] cursor-col-resize"
              : "top-0 left-0 h-[5px] w-full cursor-row-resize"
        } hover:bg-teal-500`}
      />
    </div>
  );
}

/**
 * The strip along the bottom holding whatever has been closed.
 *
 * It exists so that closing a panel is not frightening. A pane that vanishes
 * completely reads as destroyed; a pane that becomes a labelled chip you can
 * click reads as put away. The strip stays visible with a quiet hint even when
 * nothing is closed, so people know where things go before they close the
 * first one.
 */
export function DockStrip<Id extends string>({
  dock,
  layout,
  onOpen,
  onReset,
}: {
  dock: Dock<Id>;
  layout: DockLayout<Id>;
  onOpen: (id: Id) => void;
  onReset: () => void;
}) {
  const closed = dock.panels.filter((p) => !layout[p.id]?.open);
  return (
    <div className="flex shrink-0 items-center gap-2 border-ink-100 border-t bg-ink-50 px-2 py-1">
      <LayoutGrid className="h-3 w-3 shrink-0 text-ink-400" />
      {closed.length === 0 ? (
        <span className="text-[11px] text-ink-400">
          Closed panels come back here. Nothing is closed.
        </span>
      ) : (
        <div className="flex items-center gap-1 overflow-x-auto">
          {closed.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              title={`${p.blurb} Click to bring it back.`}
              className="shrink-0 rounded-sm border border-ink-200 bg-white px-2 py-0.5 text-[11.5px] text-ink-700 transition-colors hover:border-teal-500"
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
      {dock.isMoved(layout) && (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto shrink-0 text-[11px] text-ink-500 hover:text-ink-900"
        >
          Reset layout
        </button>
      )}
    </div>
  );
}
