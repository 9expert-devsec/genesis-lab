import { useId } from "react";

/**
 * "Planet horizon" at the bottom of a dark section that sits above a light one.
 *
 * Fully CONTAINED in the dark section: rendered inside it, pinned to its bottom
 * edge, and nothing here reaches past that edge. The section below starts on
 * its own flat background — no glow, overlay or negative margin reaches into
 * it.
 *
 * Top to bottom inside the divider's box:
 *   1. the arc band (--horizon-depth tall): the next section's background
 *      painted into the two lower corners, so the dark area bulges down in the
 *      middle, traced by a thin Air Blue line — strongest at the centre,
 *      fading to transparent at the edges;
 *   2. the gap (--horizon-gap tall): plain next-section background, so the arc's
 *      lowest point sits clearly away from the section below.
 *
 * The glow is a blurred copy of the line painted BEHIND the corner fill, so the
 * fill hides its lower half: it only shows above the arc, inside the dark area,
 * like light along the edge of a planet.
 *
 * ── TUNABLES (CSS custom properties on the root, override via className) ────
 *   --horizon-depth          arc depth: 28px below md, 64px from md up
 *   --horizon-gap            plain light space under the arc's lowest point:
 *                            32px below md, 48px from md up
 *   --horizon-line-opacity   the crisp line: 0.55
 *   --horizon-glow-opacity   the blurred copy: 0.08 light, 0.04 dark
 *
 * The divider is depth + gap tall, so the dark section's padding-bottom must be
 * at least that PLUS the breathing room wanted above the arc's corners.
 *
 * `fillClassName` MUST be the light section's background as `fill-*` classes —
 * the same tokens it uses for `bg-*`, dark variant included — so the corners
 * and the gap match it in both themes. Never a hard-coded white. `gapClassName`
 * is the same tokens as `bg-*`.
 *
 * Nothing here animates.
 */
const ARC = "M0,0 Q500,200 1000,0"; // lowest (y=100) at the centre

export function HorizonDivider({ fillClassName, gapClassName, className = "" }) {
  const gradientId = useId();
  const svgProps = {
    viewBox: "0 0 1000 100",
    preserveAspectRatio: "none",
    className: "absolute inset-0 h-full w-full overflow-visible",
  };
  const line = (strokeWidth) => (
    <path
      d={ARC}
      fill="none"
      stroke={`url(#${gradientId})`}
      strokeWidth={strokeWidth}
      vectorEffect="non-scaling-stroke"
    />
  );

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col text-9e-air [--horizon-depth:28px] [--horizon-gap:32px] [--horizon-line-opacity:0.55] [--horizon-glow-opacity:0.08] dark:[--horizon-glow-opacity:0.04] md:[--horizon-depth:64px] md:[--horizon-gap:48px] ${className}`}
    >
      <div className="relative h-[var(--horizon-depth)]">
        {/* The glow FIRST, so the corner fill painted after it covers its
            lower half. A wider, faint copy of the line with a narrow blur — a
            soft edge, not a band. The blur is a CSS filter on the <svg> box
            rather than an feGaussianBlur, which would be stretched unevenly by
            preserveAspectRatio="none". */}
        <svg
          {...svgProps}
          className={`${svgProps.className} opacity-[var(--horizon-glow-opacity)] blur-[2px]`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="currentColor" stopOpacity="0" />
              <stop offset="0.5" stopColor="currentColor" stopOpacity="1" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {line(5)}
        </svg>

        {/* Corners: everything below the arc, in the next section's colour. */}
        <svg {...svgProps}>
          <path d={`${ARC} L1000,100 L0,100 Z`} className={fillClassName} />
        </svg>

        {/* The line itself, crisp. */}
        <svg
          {...svgProps}
          className={`${svgProps.className} opacity-[var(--horizon-line-opacity)]`}
        >
          {line(1.25)}
        </svg>
      </div>

      {/* Plain light space between the arc and the next section. */}
      <div className={`h-[var(--horizon-gap)] ${gapClassName}`} />
    </div>
  );
}
