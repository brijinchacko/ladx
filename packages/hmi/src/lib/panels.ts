import type { ScreenSize } from "./types";

/**
 * The screen to draw for.
 *
 * A panel is a fixed number of pixels and does not reflow, so this is the
 * first question a builder asks and the reason it is asked first: a graphic
 * laid out at 1280x800 and deployed to a 7" 800x480 panel is not smaller, it
 * is cut off. Choosing up front is what stops that.
 *
 * Resolutions rather than model numbers do the work here, because a 7"
 * panel is 800x480 whoever made it. The example names are there so somebody
 * holding a datasheet recognises the row, and only name panels whose
 * resolution is confirmed.
 */
export interface PanelPreset {
  id: string;
  /** Diagonal, for the ones that are real panels. */
  label: string;
  size: ScreenSize;
  /** Confirmed examples, or how the size is usually met. */
  note: string;
  group: "Panel" | "Widescreen" | "Desktop";
}

export const PANEL_PRESETS: PanelPreset[] = [
  {
    id: "p4",
    label: '4" panel',
    size: { width: 480, height: 272 },
    note: "The smallest practical graphic. Two or three objects and a title.",
    group: "Panel",
  },
  {
    id: "p7",
    label: '7" panel',
    size: { width: 800, height: 480 },
    note: 'The workhorse. SIMATIC TP700 Comfort is 7.0" at this resolution.',
    group: "Panel",
  },
  {
    id: "p9",
    label: '9" panel',
    size: { width: 800, height: 480 },
    note: 'Same pixels as 7", larger glass. Easier to touch, no more room.',
    group: "Panel",
  },
  {
    id: "p10",
    label: '10" panel',
    size: { width: 1024, height: 600 },
    note: "Common on mid-range panels and industrial tablets.",
    group: "Widescreen",
  },
  {
    id: "p12",
    label: '12" panel',
    size: { width: 1280, height: 800 },
    note: "Where a full mimic with a trend starts to fit.",
    group: "Widescreen",
  },
  {
    id: "p15",
    label: '15" panel',
    size: { width: 1280, height: 800 },
    note: 'SIMATIC TP1500 Comfort is 15.4" at this resolution.',
    group: "Widescreen",
  },
  {
    id: "p19",
    label: '19" panel',
    size: { width: 1366, height: 768 },
    note: "Control room panel or a rack-mounted display.",
    group: "Widescreen",
  },
  {
    id: "hd",
    label: "Full HD",
    size: { width: 1920, height: 1080 },
    note: 'A 22" panel, or a SCADA client on a desktop monitor.',
    group: "Desktop",
  },
  {
    id: "wxga",
    label: "Laptop",
    size: { width: 1366, height: 768 },
    note: "An engineering laptop running the client.",
    group: "Desktop",
  },
];

export const PANEL_GROUPS: PanelPreset["group"][] = ["Panel", "Widescreen", "Desktop"];

/** Clamped to something drawable: a zero-width screen is not a screen. */
export function sanitiseSize(size: Partial<ScreenSize> | null | undefined): ScreenSize {
  const w = Math.round(Number(size?.width));
  const h = Math.round(Number(size?.height));
  return {
    width: Number.isFinite(w) ? Math.min(Math.max(w, 240), 4096) : 800,
    height: Number.isFinite(h) ? Math.min(Math.max(h, 180), 4096) : 480,
  };
}

export function presetFor(size: ScreenSize): PanelPreset | undefined {
  return PANEL_PRESETS.find((p) => p.size.width === size.width && p.size.height === size.height);
}
