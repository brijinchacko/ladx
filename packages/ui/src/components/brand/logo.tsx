import { cn } from "../../lib/cn";

/**
 * The LADX mark.
 *
 * There were two of these — a placeholder "L in a teal square" here, and the
 * real wordmark buried in the ladder studio — which meant the product showed a
 * different logo depending on which screen you were on. This is the one.
 *
 * The wordmark is the shipped artwork rather than type, because the real mark
 * is set in Pirulen, which is licensed and not redistributable. Drawing it with
 * a font stack means it renders correctly only on machines that happen to have
 * that font and silently wrong everywhere else; an image is the same everywhere.
 *
 * Two files, not one recoloured: `wordmark.png` for light grounds and
 * `wordmark-dark.png` for dark, swapped with a CSS media query so the logo does
 * not disappear into the background when someone's OS is in dark mode.
 *
 * @example
 * <Logo />                       // wordmark, header size
 * <Logo variant="icon" size={32} /> // square mark, for tight spaces
 */
export interface LogoProps {
  className?: string;
  /** Height in pixels for `wordmark`; width and height for `icon`. */
  size?: number;
  variant?: "wordmark" | "icon";
  /**
   * Which ground the mark is sitting on — not which theme the viewer prefers.
   *
   * `light` (the default) draws the dark-ink mark for a light surface; `dark`
   * draws the white one. `auto` follows `prefers-color-scheme`, and is correct
   * ONLY on a surface that also follows it.
   *
   * This defaults to `light` because it used to default to `auto`, and every
   * LADX surface is currently light regardless of the OS setting. On a machine
   * set to dark mode the browser dutifully served the white wordmark onto a
   * white page, and the mark vanished — leaving a lone teal X floating above
   * the sign-in form. Follow the surface, not the operating system.
   */
  tone?: "auto" | "light" | "dark";
}

/** Source aspect ratio of the wordmark artwork: 3860 × 900. */
const WORDMARK_ASPECT = 3860 / 900;

export function Logo({ className, size, variant = "wordmark", tone = "light" }: LogoProps) {
  if (variant === "icon") {
    const px = size ?? 32;
    return (
      <img
        src="/brand/icon-512.png"
        alt="LADX"
        width={px}
        height={px}
        className={cn("shrink-0", className)}
        style={{ width: px, height: px }}
      />
    );
  }

  const height = size ?? 28;
  const width = Math.round(height * WORDMARK_ASPECT);

  // `tone` picks a single file; `auto` ships both and lets the browser choose,
  // which keeps it correct without JavaScript and without a hydration flash.
  if (tone !== "auto") {
    return (
      <img
        src={tone === "dark" ? "/brand/wordmark-dark.png" : "/brand/wordmark.png"}
        alt="LADX"
        width={width}
        height={height}
        className={cn("shrink-0", className)}
        style={{ height, width: "auto" }}
      />
    );
  }

  return (
    <picture className={cn("shrink-0 inline-flex", className)}>
      <source srcSet="/brand/wordmark-dark.png" media="(prefers-color-scheme: dark)" />
      <img
        src="/brand/wordmark.png"
        alt="LADX"
        width={width}
        height={height}
        style={{ height, width: "auto" }}
      />
    </picture>
  );
}
