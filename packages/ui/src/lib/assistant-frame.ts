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
