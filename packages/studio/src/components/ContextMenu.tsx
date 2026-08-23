"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The right-click menu.
 *
 * Its job is to say what the thing under the cursor IS before it offers to do
 * anything to it. A menu of bare verbs makes you check what you clicked; a
 * menu that opens with "XIC · Start_PB · rung 2" does not.
 *
 * It also flips itself when it would run off the edge, because a menu whose
 * last three items are off-screen is worse than no menu, the items you cannot
 * see are usually the destructive ones.
 */

export type MenuItem =
  | {
      kind: "item";
      label: string;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      onClick: () => void;
    }
  | { kind: "separator" }
  | { kind: "heading"; label: string; detail?: string };

export type MenuState = { x: number; y: number; items: MenuItem[] } | null;

export default function ContextMenu({
  menu,
  onClose,
}: {
  menu: MenuState;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Reset during render when the menu changes, so a stale position from the
  // previous menu is never painted at the new one's location.
  const [lastMenu, setLastMenu] = useState(menu);
  if (menu !== lastMenu) {
    setLastMenu(menu);
    setPos(null);
  }

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const pad = 8;

    /*
     * Clamped at BOTH ends, and against a viewport that might not be measured
     * yet.
     *
     * This kept the menu off the right and bottom edges with a bare Math.min
     * and never stopped it going the other way. When the menu was wider than
     * the space available, or innerWidth read 0 for a frame, which happens in
     * a background tab and during layout, the sum went negative and the menu
     * opened at left -224, top -194. It was there the whole time, entirely off
     * screen, which is indistinguishable from right-click doing nothing at all.
     */
    const vw = window.innerWidth || document.documentElement.clientWidth || box.width + pad * 2;
    const vh = window.innerHeight || document.documentElement.clientHeight || box.height + pad * 2;

    setPos({
      left: Math.max(pad, Math.min(menu.x, vw - box.width - pad)),
      top: Math.max(pad, Math.min(menu.y, vh - box.height - pad)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    /*
     * Close on a click OUTSIDE the menu: and only outside.
     *
     * This listened on window in the CAPTURE phase, which runs on the way
     * down, before the event reaches anything. The menu's own
     * onPointerDown={stopPropagation} is a React handler and therefore
     * bubbling: by the time it ran, the capture listener had already closed
     * the menu, so every item unmounted under the pointer and no click ever
     * landed on one.
     *
     * The result was a menu that opened, looked right, listed the correct
     * actions, and did nothing whatever you picked. Capture is still the
     * right phase, it is what stops the click doing something else
     * underneath, so the fix is to ask where the pointer actually is.
     */
    const close = (e: Event) => {
      const target = e.target as Node | null;
      if (target && ref.current?.contains(target)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", close);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      ref={ref}
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: pos?.left ?? menu.x,
        top: pos?.top ?? menu.y,
        // Hidden for the one frame before it has been measured, so it is never
        // seen jumping from the wrong corner to the right one.
        visibility: pos ? "visible" : "hidden",
        zIndex: 10000,
        minWidth: 216,
        background: "#FFFFFF",
        border: "1px solid #C9D2DC",
        borderRadius: 4,
        boxShadow: "0 8px 24px rgba(15,32,48,0.18)",
        padding: "4px 0",
        fontSize: 12,
        color: "#0F2030",
        userSelect: "none",
      }}
    >
      {menu.items.map((item, i) => {
        if (item.kind === "separator") {
          return <div key={i} style={{ height: 1, background: "#E4E9EE", margin: "4px 0" }} />;
        }
        if (item.kind === "heading") {
          return (
            <div key={i} style={{ padding: "6px 12px 5px" }}>
              <div style={{ fontWeight: 700, fontSize: 11.5, letterSpacing: 0.2 }}>
                {item.label}
              </div>
              {item.detail && (
                <div
                  style={{
                    marginTop: 1,
                    fontSize: 11,
                    color: "#5A6B7B",
                    fontFamily: "ui-monospace, Menlo, monospace",
                  }}
                >
                  {item.detail}
                </div>
              )}
            </div>
          );
        }
        return (
          <button
            type="button"
            key={i}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            style={{
              display: "flex",
              width: "100%",
              alignItems: "baseline",
              gap: 10,
              padding: "5px 12px",
              background: "transparent",
              border: 0,
              textAlign: "left",
              cursor: item.disabled ? "default" : "pointer",
              color: item.disabled ? "#9AA7B4" : item.danger ? "#B3382C" : "#0F2030",
              font: "inherit",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled)
                e.currentTarget.style.background = item.danger ? "#FBEAE8" : "#EAF3FC";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.hint && (
              <span
                style={{
                  fontSize: 10.5,
                  color: "#8998A6",
                  fontFamily: "ui-monospace, Menlo, monospace",
                }}
              >
                {item.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
