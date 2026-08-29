"use client";

import { XMark } from "./x-mark";

/**
 * The X, turning, while LADX AI is working.
 *
 * One mark doing one thing. It replaced three pulsing dots, which said "busy"
 * without saying who: a spinner belongs to the browser, and this belongs to the
 * product. The moment between pressing send and the first token is the moment a
 * tool feels alive or feels broken, and on a local model that moment can be ten
 * seconds long.
 *
 * The rotation is a half turn rather than a full one. The X is symmetric about
 * its centre, so 180 degrees lands exactly where it started and the loop has no
 * seam; going the whole way round would pass through that same identity halfway
 * and read as two beats instead of one steady movement.
 *
 * Slow on purpose. A fast spin says "this should have finished by now"; this is
 * meant to say "still working", which is a different sentence.
 */

export interface ThinkingMarkProps {
  /** Height in pixels. The X is wider than it is tall, as it is in the wordmark. */
  size?: number;
  /** Seconds for a half turn. */
  seconds?: number;
  /** Defaults to the current text colour. */
  color?: string;
  className?: string;
  /**
   * What it is waiting for, for a screen reader.
   *
   * The turning itself is decoration: anything that matters is in the words
   * beside it, and this element is hidden from assistive technology because the
   * caller announces the state in prose.
   */
  label?: string;
}

export function ThinkingMark({
  size = 16,
  seconds = 2.6,
  color = "currentColor",
  className,
  label,
}: ThinkingMarkProps) {
  return (
    <span
      className={`ladx-x-spin inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{
        animation: `ladx-x-spin ${seconds}s linear infinite`,
        // The glyph is wider than tall, so a square box keeps the turn centred
        // rather than letting it wobble around the bounding box's centre.
        width: size,
        height: size,
      }}
      aria-hidden="true"
    >
      <XMark size={size * 0.72} color={color} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
