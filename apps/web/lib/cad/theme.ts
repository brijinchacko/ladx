/**
 * What the drawing area looks like.
 *
 * Black by default, because that is what every CAD package has used for thirty
 * years and the reason is not nostalgia: a drawing is thin light lines on a
 * dark field, which is far easier on the eyes over a long session than the
 * same lines rendered dark on a glaring white sheet. Paper is what a drawing
 * becomes at plot time, not what it is worked on.
 *
 * The background is a preference, not a constant. Some people want the paper
 * look while laying a sheet out, some want a mid grey, and a few genuinely need
 * white for a projector.
 *
 * The hard part is not the background. It is that layer colours are stored in
 * the drawing, and a layer set to near-black is invisible on a black canvas
 * while a layer set to white is invisible on a white one. AutoCAD solved this
 * decades ago with colour 7, which draws white on dark and black on light, and
 * `contrastColour` below does the same thing: a colour close to either extreme
 * is flipped to whichever end of the ramp the background is not. Nothing is
 * written back to the drawing, so the file still says what the layer is and the
 * DXF and the PDF are unaffected.
 */

export interface CanvasTheme {
  id: string;
  name: string;
  /** The drawing area. */
  background: string;
  /** The fine grid. */
  grid: string;
  /** The heavier axis lines through the origin. */
  axis: string;
  /** Selected geometry. */
  selection: string;
  /** The snap marker. */
  snap: string;
  /** Text in the status strip and the marquee. */
  hint: string;
  /** True when the background is dark enough to need light default geometry. */
  dark: boolean;
}

export const THEMES: CanvasTheme[] = [
  {
    id: "black",
    name: "Black",
    background: "#0B0E11",
    grid: "#1A2027",
    axis: "#2E3944",
    selection: "#35B6BB",
    snap: "#E58A3C",
    hint: "#7A8894",
    dark: true,
  },
  {
    id: "slate",
    name: "Slate",
    background: "#1E262E",
    grid: "#2A343E",
    axis: "#3D4A57",
    selection: "#35B6BB",
    snap: "#E58A3C",
    hint: "#8A97A3",
    dark: true,
  },
  {
    id: "grey",
    name: "Grey",
    background: "#3A4048",
    grid: "#454C55",
    axis: "#57606B",
    selection: "#4ED2D7",
    snap: "#F0A05A",
    hint: "#A8B2BC",
    dark: true,
  },
  {
    id: "paper",
    name: "Paper",
    background: "#FFFFFF",
    grid: "#EEF2F5",
    axis: "#D5DCE2",
    selection: "#2C9A9E",
    snap: "#B4531A",
    hint: "#7A8894",
    dark: false,
  },
  {
    id: "cream",
    name: "Cream",
    background: "#F6F2E9",
    grid: "#EBE5D8",
    axis: "#D8D0BE",
    selection: "#2C9A9E",
    snap: "#B4531A",
    hint: "#8A8271",
    dark: false,
  },
];

export const DEFAULT_THEME = THEMES[0] as CanvasTheme;

export function getTheme(id: string): CanvasTheme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/** Perceived brightness, 0 to 255. The usual luma weighting. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * A layer colour that is actually visible on this background.
 *
 * Only the ends of the range are touched. A teal or an orange reads perfectly
 * well on black and on white and is left exactly as stored; it is the near-black
 * and the near-white that vanish, and those are flipped. This is what AutoCAD's
 * colour 7 does, and it is why the same drawing is legible on a black screen
 * and on a white sheet without anybody editing the layers.
 */
export function contrastColour(hex: string, theme: CanvasTheme): string {
  const value = luminance(hex);
  if (theme.dark && value < 60) return "#E6ECF1";
  if (!theme.dark && value > 205) return "#0F1A24";
  return hex.startsWith("#") ? hex : `#${hex}`;
}

const KEY = "ladx.cad.theme";
const CUSTOM_KEY = "ladx.cad.theme.custom";

/** The remembered choice, with a custom background applied over a preset. */
export function loadTheme(): CanvasTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const base = getTheme(window.localStorage.getItem(KEY) ?? DEFAULT_THEME.id);
  const custom = window.localStorage.getItem(CUSTOM_KEY);
  if (!custom || !/^#[0-9a-f]{6}$/i.test(custom)) return base;

  // A custom background needs the rest of the palette to follow it, or the grid
  // disappears the moment somebody picks a colour near it.
  const dark = luminance(custom) < 128;
  const preset = dark ? (THEMES[0] as CanvasTheme) : (THEMES[3] as CanvasTheme);
  return { ...preset, id: "custom", name: "Custom", background: custom, dark };
}

export function saveTheme(id: string, custom?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, id);
  if (custom) window.localStorage.setItem(CUSTOM_KEY, custom);
  else window.localStorage.removeItem(CUSTOM_KEY);
}
