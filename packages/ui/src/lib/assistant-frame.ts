import type { CSSProperties } from "react";

/**
 * Where the assistant sits, and how big it is.
 *
 * The assistant used to be a strip welded to the bottom of a tool. That is
 * fine until the thing you are asking about is behind it, which on a panel
 * mimic or a schematic is most of the time. So it floats, and it can be put
 * wherever the work is not.
 *
 * The whole of this file exists because of one failure mode. A floating panel
 * remembers where it was, the person moves it to the far right of a wide
 * monitor, opens the tool on a laptop, and the panel is remembered at x=2100
 * on a 1440 wide screen: gone, with no way to get it back, because the only
 * handle for moving it is the header that is now off-screen. Every stored
 * position is therefore clamped against the viewport it is being restored
 * into, not the one it was saved from.
 */

/**
 * Where it sits.
 *
 * Four edges and floating, because which one is right depends entirely on the
 * tool and on the screen. A schematic is read across its width, so the bottom
 * is the cheapest edge to give up; a ladder is read down, so the right is. On a
 * wide monitor a side dock costs nothing and floating is fussy; on a laptop the
 * opposite. Picking one for everybody would be wrong for most of them.
 */
export type AssistantMode = "floating" | "bottom" | "left" | "right" | "top" | "minimised";

/** The docked edges, in the order the control cycles through them. */
export const DOCK_EDGES = ["bottom", "right", "left", "top"] as const;
export type DockEdge = (typeof DOCK_EDGES)[number];

export function isDocked(mode: AssistantMode): mode is DockEdge {
  return mode === "bottom" || mode === "right" || mode === "left" || mode === "top";
}

export interface Frame {
  /** Viewport pixels from the left and top. Only meaningful while floating. */
  x: number;
  y: number;
  w: number;
  h: number;
  mode: AssistantMode;
}

export const MIN_W = 280;
export const MIN_H = 190;

/**
 * How much of the panel must remain on screen.
 *
 * Not the whole panel: dragging it mostly off the edge to get it out of the way
 * is a thing people deliberately do. But the header has to stay reachable, or
 * the panel cannot be dragged back.
 */
const KEEP_VISIBLE = 120;
const HEADER = 34;

/**
 * Whether the window can be measured yet.
 *
 * A webview reports nothing for its own size for a moment while the window is
 * being made, and a Tauri window is made after the page inside it has started.
 * Placing the panel against that zero is not a near miss, it is the worst
 * possible answer: every term in `defaultFrame` bottoms out, so the panel
 * lands at the top left corner at its minimum size, which on the desktop is
 * exactly where the sidebar is. It covers the brand, the project button and
 * the first three rows of navigation.
 *
 * Nothing recovers from it afterwards, either. `clampFrame` only ever pulls a
 * panel further inside the viewport, and a small panel in the top left corner
 * is already legal at every size, so no resize, no reload and no later
 * measurement moves it. The panel stays on top of the only way out of the
 * tool, and the app reads as having lost its sidebar.
 *
 * So a zero is treated as "not known yet" rather than as a viewport.
 */
export function viewportKnown(vw: number, vh: number): boolean {
  return vw > 0 && vh > 0;
}

export function defaultFrame(vw: number, vh: number): Frame {
  /*
   * Small, and floating.
   *
   * It started docked, on the reasoning that a floating panel is a surprise on
   * first use. That was the wrong trade: docked means it takes a strip off the
   * bottom of every tool whether or not it is being used, and the strip is
   * exactly where the work usually is. Floating, small, and out of the way in
   * the corner costs nothing until somebody wants it, and it can be dragged
   * anywhere from there.
   */
  const w = Math.min(340, Math.max(MIN_W, vw - 64));
  const h = Math.min(400, Math.max(MIN_H, vh - 140));
  return {
    // Bottom right, which is where a floating helper is expected and where it
    // overlaps least on a left to right drawing.
    x: Math.max(12, vw - w - 20),
    y: Math.max(12, vh - h - 56),
    w,
    h,
    mode: "floating",
  };
}

/**
 * Put a frame back inside the viewport.
 *
 * Applied on restore and after every window resize, not only on drag. A window
 * dragged to a smaller display, a browser zoom, or a devtools panel opening are
 * all ways the viewport shrinks under a panel that was legally placed.
 */
export function clampFrame(f: Frame, vw: number, vh: number): Frame {
  const w = Math.min(Math.max(f.w, MIN_W), Math.max(MIN_W, vw - 16));
  const h = Math.min(Math.max(f.h, MIN_H), Math.max(MIN_H, vh - 16));
  return {
    ...f,
    w,
    h,
    // Left edge may go negative so the panel can be pushed off to the side, but
    // never so far that the header leaves the screen.
    x: Math.min(Math.max(f.x, KEEP_VISIBLE - w), Math.max(0, vw - KEEP_VISIBLE)),
    // The top is different: a header above the viewport cannot be grabbed at
    // all, so y is never allowed to go negative.
    y: Math.min(Math.max(f.y, 0), Math.max(0, vh - HEADER)),
  };
}

const KEY = (toolId: string) => `ladx.assistant.frame.${toolId}.v1`;

export function loadFrame(toolId: string, vw: number, vh: number): Frame {
  const fallback = defaultFrame(vw, vh);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEY(toolId));
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<Frame>;
    const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    const mode: AssistantMode =
      s.mode === "floating" ||
      s.mode === "minimised" ||
      s.mode === "bottom" ||
      s.mode === "right" ||
      s.mode === "left" ||
      s.mode === "top"
        ? s.mode
        : // "docked" was the only edge before there were four. Anything else,
          // including that, falls back rather than rendering nowhere.
          s.mode === "docked"
          ? "bottom"
          : fallback.mode;
    return clampFrame(
      {
        x: num(s.x, fallback.x),
        y: num(s.y, fallback.y),
        w: num(s.w, fallback.w),
        h: num(s.h, fallback.h),
        mode,
      },
      vw,
      vh,
    );
  } catch {
    return fallback;
  }
}

/** Whether this tool's frame was ever put somewhere deliberately. */
export function hasStoredFrame(toolId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY(toolId)) !== null;
  } catch {
    return false;
  }
}

export function saveFrame(toolId: string, f: Frame): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(toolId), JSON.stringify(f));
  } catch {
    // Private browsing or a full quota. Losing where a panel sat is never worth
    // an error in front of somebody drawing.
  }
}

/* ─────────────────────────── reserving space ─────────────────────────── */

/**
 * How much room a docked panel is taking, published to the page.
 *
 * The panel is positioned against the viewport, which is the only way one
 * component mounted at five different points in five different layouts can
 * reach all four edges. On its own that means it covers the work, which is
 * exactly the complaint: docking it to the left hid the project tree.
 *
 * So it writes its thickness onto the document as custom properties, and any
 * container that wants to get out of the way reads them:
 *
 *   style={{ paddingLeft: "var(--ladx-ai-left, 0px)" }}
 *
 * A CSS variable rather than a context because the containers that need to move
 * are in five packages and two apps, some of them server rendered, and threading
 * a provider through all of them to communicate one number is more machinery
 * than the number is worth. A page that reads nothing still works; the panel
 * simply overlaps, which is the old behaviour rather than a broken one.
 */
export const DOCK_VARS = {
  top: "--ladx-ai-top",
  right: "--ladx-ai-right",
  bottom: "--ladx-ai-bottom",
  left: "--ladx-ai-left",
} as const;

export function publishDockInset(mode: AssistantMode, w: number, h: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const v of Object.values(DOCK_VARS)) root.style.setProperty(v, "0px");
  if (!isDocked(mode)) return;
  const px = mode === "left" || mode === "right" ? `${Math.round(w)}px` : `${Math.round(h)}px`;
  root.style.setProperty(DOCK_VARS[mode], px);
}

/** Clear the reservation, for when the panel unmounts entirely. */
export function clearDockInset(): void {
  if (typeof document === "undefined") return;
  for (const v of Object.values(DOCK_VARS)) {
    document.documentElement.style.setProperty(v, "0px");
  }
}

/** What a container should apply to get out of a docked panel's way. */
export const DOCK_INSET_STYLE: CSSProperties = {
  paddingTop: `var(${DOCK_VARS.top}, 0px)`,
  paddingRight: `var(${DOCK_VARS.right}, 0px)`,
  paddingBottom: `var(${DOCK_VARS.bottom}, 0px)`,
  paddingLeft: `var(${DOCK_VARS.left}, 0px)`,
};
