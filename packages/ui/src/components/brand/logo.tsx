import { cn } from "../../lib/cn";

/**
 * The LADX mark.
 *
 * There were two of these: a placeholder "L in a teal square" here, and the
 * real wordmark buried in the ladder studio, which meant the product showed a
 * different logo depending on which screen you were on. This is the one.
 *
 * The wordmark is the shipped artwork rather than type, because the real mark
 * is set in Pirulen, which is licensed and not redistributable. Drawing it with
 * a font stack means it renders correctly only on machines that happen to have
 * that font and silently wrong everywhere else; an image is the same everywhere.
 *
 * Two files, not one recoloured: `wordmark.png` for light grounds and
 * `wordmark-dark.png` for dark. Which one shows is decided in CSS, by the same
 * three-state cascade the rest of the theme uses, so the mark follows the
 * surface it is sitting on rather than the operating system.
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
   * Which ground the mark is sitting on.
   *
   * `surface`, the default, follows the theme: the dark-ink mark on a light
   * surface and the white one on a dark surface, decided in CSS so there is no
   * flash and no JavaScript involved.
   *
   * `light` and `dark` pin it, and are for the places that keep their ground in
   * both themes, a dark hero band or a printed sheet.
   *
   * There used to be an `auto` that followed `prefers-color-scheme`. That is
   * the wrong question now: somebody on a dark machine who has chosen the light
   * theme would get the white wordmark on a white page, which is exactly the
   * bug `auto` was introduced to fix, arriving from the other direction.
   */
  tone?: "surface" | "light" | "dark";
}

/** Source aspect ratio of the wordmark artwork: 3860 × 900. */
const WORDMARK_ASPECT = 3860 / 900;

export function Logo({ className, size, variant = "wordmark", tone = "surface" }: LogoProps) {
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

  // A pinned tone picks one file.
  if (tone !== "surface") {
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

  // Both files ship, and the stylesheet hides one. A <picture> with a media
  // query cannot do this: it can ask what the operating system prefers, and the
  // question here is what the app is currently set to, which is an attribute on
  // the root that only CSS can see.
  return (
    <span className={cn("shrink-0 inline-flex", className)}>
      <img
        src="/brand/wordmark.png"
        alt="LADX"
        width={width}
        height={height}
        className="ladx-mark-on-light"
        style={{ height, width: "auto" }}
      />
      <img
        src="/brand/wordmark-dark.png"
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        className="ladx-mark-on-dark"
        style={{ height, width: "auto" }}
      />
    </span>
  );
}
