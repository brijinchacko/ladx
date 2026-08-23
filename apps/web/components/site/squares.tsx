/**
 * The square motif.
 *
 * The LADX mark is squared and so is the display face, so the page furniture is
 * built from the same shape: a plotting grid behind sections, corner ticks on
 * panels, and small filled squares where a bullet or a separator would normally
 * go. Nothing here is illustration. It is the graph paper a control drawing sits
 * on, which is the right register for this audience and, usefully, a register
 * that generated pages almost never reach for.
 *
 * All of it is decorative, so all of it is `aria-hidden` and none of it carries
 * meaning that is not also written in words.
 */

/**
 * A faint square grid, absolutely positioned behind a section.
 *
 * Masked so it fades before the edges: a grid that runs hard into a section
 * boundary reads as a mistake, and one that fades reads as paper.
 */
export function GridField({
  className = "",
  size = 32,
  fade = "ellipse 80% 60% at 50% 40%",
}: {
  className?: string;
  /** Cell size in pixels. */
  size?: number;
  /** A CSS gradient shape for the mask. */
  fade?: string;
}) {
  const mask = `radial-gradient(${fade}, #000 40%, transparent 100%)`;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgb(var(--ladx-ink) / 0.055) 1px, transparent 1px)," +
          "linear-gradient(to bottom, rgb(var(--ladx-ink) / 0.055) 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    />
  );
}

/**
 * Four corner ticks around a panel.
 *
 * The convention from dimensioned drawings and camera viewfinders: mark the
 * corners rather than drawing a box, and the eye supplies the box.
 */
export function CornerTicks({ className = "" }: { className?: string }) {
  const tick = "absolute h-2.5 w-2.5 border-ink-400";
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <span className={`${tick} -left-px -top-px border-l border-t`} />
      <span className={`${tick} -right-px -top-px border-r border-t`} />
      <span className={`${tick} -bottom-px -left-px border-b border-l`} />
      <span className={`${tick} -bottom-px -right-px border-b border-r`} />
    </div>
  );
}

/** A small filled square. Used where a bullet or a middot would go. */
export function Sq({
  className = "",
  size = 6,
  filled = true,
}: { className?: string; size?: number; filled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${filled ? "bg-current" : "border border-current"} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * A section eyebrow with a leading square.
 *
 * One component so every section label is spaced identically. They were being
 * written by hand and drifting apart by a pixel or two.
 */
export function Eyebrow({
  children,
  className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`mb-3 flex items-center gap-2 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-teal-700 ${className}`}
    >
      <Sq size={7} />
      {children}
    </p>
  );
}
