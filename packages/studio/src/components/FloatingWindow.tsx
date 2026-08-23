"use client";

import { Maximize2, Minimize2, Minus, PanelRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A window that floats over the lesson without interrupting it.
 *
 * The point is what it deliberately is NOT: not a modal, no backdrop, no focus
 * trap, no scroll lock. A student takes notes *while* the video plays, so
 * anything that stops the page behind it has defeated the feature.
 *
 * Position and size persist per window key, because somebody who has dragged it
 * to their second monitor's edge should not have to do it again tomorrow.
 *
 * Dragging and resizing are done with pointer events on a ref rather than React
 * state per mousemove — re-rendering sixty times a second while someone drags
 * makes the whole page stutter, including the video.
 */

type Props = {
  /** Distinguishes stored geometry between windows. */
  storageKey: string;
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  /**
   * Put the window back where it came from, if it has somewhere to go.
   * Given, a "dock" control appears beside maximise — a window you can pop
   * out but not put back is a one-way door, and people stop using the
   * pop-out at all rather than risk it.
   */
  onDock?: () => void;
  children: React.ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
};

type Geometry = { x: number; y: number; w: number; h: number };

// Deliberately small. The simulator is a strip of toggles and lamps; forcing
// it to stay 320x240 meant it covered rungs the student was trying to watch.
const MIN_W = 240;
const MIN_H = 140;

function clampToViewport(g: Geometry): Geometry {
  if (typeof window === "undefined") return g;
  const maxX = Math.max(0, window.innerWidth - 120);
  const maxY = Math.max(0, window.innerHeight - 80);
  return {
    w: Math.max(MIN_W, Math.min(g.w, window.innerWidth - 16)),
    h: Math.max(MIN_H, Math.min(g.h, window.innerHeight - 16)),
    x: Math.min(Math.max(0, g.x), maxX),
    y: Math.min(Math.max(0, g.y), maxY),
  };
}

export default function FloatingWindow({
  storageKey,
  title,
  icon,
  onClose,
  onDock,
  children,
  defaultWidth = 460,
  defaultHeight = 520,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [minimised, setMinimised] = useState(false);
  /**
   * The height to come back to.
   *
   * Minimising used to hide the children and leave the inline height alone, so
   * the window stayed its full size with nothing in it — a large empty panel
   * sitting over the ladder, which is what the black rectangle was.
   */
  const restoreH = useRef<number | null>(null);
  const [maximised, setMaximised] = useState(false);
  // Lazy initialiser: reading localStorage during render would be a side effect,
  // and setting state in an effect would flash the default position first.
  const [geo] = useState<Geometry>(() => {
    if (typeof window === "undefined") {
      return { x: 80, y: 80, w: defaultWidth, h: defaultHeight };
    }
    try {
      const raw = localStorage.getItem(`edw-win-${storageKey}`);
      if (raw) return clampToViewport(JSON.parse(raw));
    } catch {
      /* corrupt value is not worth an error */
    }
    return clampToViewport({
      x: Math.max(16, window.innerWidth - defaultWidth - 40),
      y: 96,
      w: defaultWidth,
      h: defaultHeight,
    });
  });

  const save = useCallback(
    (g: Geometry) => {
      try {
        localStorage.setItem(`edw-win-${storageKey}`, JSON.stringify(g));
      } catch {
        /* private mode */
      }
    },
    [storageKey],
  );

  // Apply the stored geometry once, directly to the node.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.left = `${geo.x}px`;
    el.style.top = `${geo.y}px`;
    el.style.width = `${geo.w}px`;
    el.style.height = `${geo.h}px`;
  }, [geo]);

  // Collapse to the title bar when minimised, and go back to the height the
  // window had before — not the default, which would undo a deliberate resize.
  useEffect(() => {
    const el = ref.current;
    if (!el || maximised) return;
    if (minimised) {
      restoreH.current = el.getBoundingClientRect().height;
      el.style.height = "auto";
    } else if (restoreH.current !== null) {
      el.style.height = `${restoreH.current}px`;
      restoreH.current = null;
    }
  }, [minimised, maximised]);

  /** Drag by the title bar, or resize by the corner — same mechanics. */
  function startPointer(e: React.PointerEvent, mode: "move" | "resize" | "resize-x" | "resize-y") {
    if (maximised && mode === "resize") return;
    if (mode === "move" && maximised) return;
    // The title bar carries the minimise/maximise/close buttons. Without this,
    // pressing one and twitching a pixel dragged the window instead.
    if ((e.target as HTMLElement).closest("button")) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = el.getBoundingClientRect();

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (mode === "move") {
        const x = Math.min(Math.max(0, rect.left + dx), window.innerWidth - 120);
        const y = Math.min(Math.max(0, rect.top + dy), window.innerHeight - 60);
        el!.style.left = `${x}px`;
        el!.style.top = `${y}px`;
        return;
      }
      if (mode !== "resize-y") {
        el!.style.width = `${Math.max(MIN_W, Math.min(rect.width + dx, window.innerWidth - rect.left - 8))}px`;
      }
      if (mode !== "resize-x") {
        el!.style.height = `${Math.max(MIN_H, Math.min(rect.height + dy, window.innerHeight - rect.top - 8))}px`;
      }
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const r = el!.getBoundingClientRect();
      save({ x: r.left, y: r.top, w: r.width, h: r.height });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Escape closes — but only from the window, never swallowing the page's keys.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && ref.current?.contains(document.activeElement)) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      // Fixed, above the page, but with no backdrop — the lesson keeps running.
      className={`fixed z-40 flex flex-col rounded-xl border border-border-hover bg-dark-secondary shadow-2xl overflow-hidden ${
        maximised ? "!inset-4 !w-auto !h-auto" : ""
      }`}
      role="dialog"
      aria-label={title}
    >
      <div
        onPointerDown={(e) => startPointer(e, "move")}
        className="flex items-center gap-2 px-3 h-9 shrink-0 border-b border-border bg-surface cursor-move select-none touch-none"
      >
        {icon}
        <span className="text-[12.5px] font-semibold text-text-primary flex-1 truncate">
          {title}
        </span>
        <button
          type="button"
          onClick={() => setMinimised((v) => !v)}
          title={minimised ? "Expand" : "Minimise"}
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover"
        >
          <Minus size={13} />
        </button>
        {onDock && (
          <button
            type="button"
            onClick={onDock}
            title="Dock back into the editor"
            aria-label="Dock back into the editor"
            className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover"
          >
            <PanelRight size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMaximised((v) => !v)}
          title={maximised ? "Restore" : "Maximise"}
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover"
        >
          {maximised ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="hover:border-danger-line hover:text-danger w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-secondary hover:bg-surface"
        >
          <X size={13} />
        </button>
      </div>

      {!minimised && <div className="flex-1 min-h-0 flex flex-col">{children}</div>}

      {/*
        Three grips, not one. A 16px corner is a hard target with a mouse and
        an unreasonable one on a trackpad, which is most of why resizing these
        windows felt fiddly. The edges resize in one axis; the corner in both.
      */}
      {!minimised && !maximised && (
        <>
          <div
            onPointerDown={(e) => startPointer(e, "resize-x")}
            title="Resize width"
            className="absolute top-9 right-0 bottom-5 w-2 cursor-ew-resize touch-none"
          />
          <div
            onPointerDown={(e) => startPointer(e, "resize-y")}
            title="Resize height"
            className="absolute bottom-0 left-0 right-5 h-2 cursor-ns-resize touch-none"
          />
          <div
            onPointerDown={(e) => startPointer(e, "resize")}
            title="Resize"
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none"
            style={{
              background:
                "linear-gradient(135deg, transparent 45%, rgba(255,255,255,0.28) 45%, rgba(255,255,255,0.28) 55%, transparent 55%, transparent 70%, rgba(255,255,255,0.28) 70%, rgba(255,255,255,0.28) 80%, transparent 80%)",
            }}
          />
        </>
      )}
    </div>
  );
}
