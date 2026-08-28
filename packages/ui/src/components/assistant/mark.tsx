/**
 * The LADX AI mark.
 *
 * A rung in a box: two power rails, a contact on the left, a coil on the right.
 * It is the smallest drawing that says "this is about ladder logic" and it is
 * not a sparkle, a star or a wand, which is what every assistant in every
 * product currently wears and which says nothing about what this one knows.
 *
 * Drawn on a square so it works as an avatar, a favicon and a 12 pixel glyph in
 * a header. Stroke rather than fill, and `currentColor` throughout, so it sits
 * on the solid header in white and on a white surface in teal without a second
 * asset.
 *
 * The geometry is deliberately coarse. At 12 pixels a contact drawn accurately
 * is two grey smudges; drawn as two thick verticals with a gap it still reads
 * as a contact.
 */
export function AiMark({
  size = 16,
  className,
  title,
}: {
  size?: number;
  className?: string;
  /** Set only where the mark is the sole label. Decorative next to text. */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {/* the box */}
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="4.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {/* the two power rails */}
      <path d="M6.5 7v10M17.5 7v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* the rung, broken where the contact sits */}
      <path
        d="M6.5 12h2.6M14.9 12h2.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* the contact: two verticals with a gap, which is what a contact is */}
      <path
        d="M11 9.4v5.2M13 9.4v5.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
