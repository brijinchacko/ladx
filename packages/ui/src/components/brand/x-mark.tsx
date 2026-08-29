/**
 * The X, on its own.
 *
 * Taken from the wordmark rather than redrawn, because the X *is* the mark and
 * an approximation of it is a second logo. The geometry below was measured off
 * `assets/brand/wordmark.png` and then checked back against it: the teal glyph
 * occupies 195 by 141 pixels, each stroke is 34 wide measured horizontally, and
 * the two strokes are mirror images about x = 97.5. Rasterised and compared
 * with the original it overlaps to within a hairline of antialiasing along the
 * diagonals, which is as close as a redraw gets.
 *
 * Two properties matter and both are easy to lose by eye:
 *
 * 1. **It is not a 45 degree X.** It is 195 wide by 140 tall, so the strokes
 *    sit at about 36 degrees from horizontal. Squaring it up to fit a square
 *    icon would make a different letter.
 * 2. **The ends are cut horizontally**, not square to the stroke. That is what
 *    gives the wordmark its flat top and bottom edge, and it is why each stroke
 *    is a parallelogram rather than a rotated rectangle.
 *
 * So the strokes are stated as explicit polygons. Nothing here is a `line` with
 * a stroke width, because a stroked line gets butt or square caps perpendicular
 * to its own direction, which is the one thing this glyph does not have.
 */

/** The glyph's own coordinate space, from the wordmark. */
const W = 195;
const H = 140;

/** Top-left to bottom-right. */
const DOWN_RIGHT = "1,0 35,0 195,140 161,140";
/** Top-right to bottom-left, the mirror of the above about x = 97.5. */
const DOWN_LEFT = "160,0 194,0 34,140 0,140";

export interface XMarkProps {
  /** Height in pixels. Width follows the glyph's own 194:140. */
  size?: number;
  /** Defaults to the current text colour, so it inherits like an icon. */
  color?: string;
  className?: string;
  /**
   * An accessible name.
   *
   * Omitted, the mark is decorative and hidden, which is right beside a
   * wordmark or inside a button that already has a label.
   */
  title?: string;
}

export function XMark({ size = 24, color = "currentColor", className, title }: XMarkProps) {
  return (
    <svg
      width={(size * W) / H}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <polygon points={DOWN_RIGHT} fill={color} />
      <polygon points={DOWN_LEFT} fill={color} />
    </svg>
  );
}

/**
 * The X on the ground it gets on a home screen or a browser tab.
 *
 * A rounded square in ink with the X centred on it, which is the shape every
 * platform expects: iOS and macOS round it again themselves, Windows and the
 * tab strip do not, and a bare glyph on transparency reads as a broken image
 * in half of them.
 *
 * The X is set to 54% of the tile's width. Smaller and it looks lost at 16
 * pixels; larger and the corner radius starts cutting into the arms once the
 * platform applies its own mask on top.
 */
export interface AppIconProps {
  size?: number;
  className?: string;
  title?: string;
}

/** Ink, from the design tokens. Duplicated as a literal because this renders into a file. */
export const ICON_GROUND = "#0F1A24";
export const ICON_MARK = "#35B6BA";

export function AppIcon({ size = 64, className, title }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <rect width="512" height="512" rx="114" ry="114" fill={ICON_GROUND} />
      <g transform={xTransform(512, 0.54)}>
        <polygon points={DOWN_RIGHT} fill={ICON_MARK} />
        <polygon points={DOWN_LEFT} fill={ICON_MARK} />
      </g>
    </svg>
  );
}

/**
 * Centre the glyph on a square tile at a given width fraction.
 *
 * Its own box is wider than it is tall, so centring means offsetting on both
 * axes rather than only scaling: getting this wrong sits the X a few pixels
 * high, which is invisible at 512 and obvious at 32.
 */
export function xTransform(tile: number, widthFraction: number): string {
  const scale = (tile * widthFraction) / W;
  const x = (tile - W * scale) / 2;
  const y = (tile - H * scale) / 2;
  return `translate(${round(x)} ${round(y)}) scale(${round(scale)})`;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** The glyph's own dimensions, for anything generating files from it. */
export const X_GEOMETRY = { width: W, height: H, downRight: DOWN_RIGHT, downLeft: DOWN_LEFT };
