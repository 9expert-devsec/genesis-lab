import { useId } from "react";

/**
 * "Planet horizon" between a dark section and the light section below it.
 *
 * Two pieces, because they live in two different stacking contexts:
 *
 *   <HorizonDivider />  — inside the DARK section, pinned to its bottom edge.
 *                         Paints the next section's background into the two
 *                         lower corners so the dark band bulges down in the
 *                         middle, and traces that arc with a glowing Air Blue
 *                         line (strongest at the centre, fading to the edges).
 *   <HorizonGlow />     — inside the LIGHT section, as its first child. A soft
 *                         Air Blue radial glow behind that section's heading.
 *                         It has to live there: rendered from the dark section
 *                         (z-20 on Home) it would paint OVER the heading.
 *
 * ── TUNABLES (CSS custom properties, override per call site via className) ──
 *   On HorizonDivider's root:
 *     --horizon-depth          arc depth: 28px below md, 64px from md up
 *     --horizon-line-opacity   the line and its glow together: 1
 *   On HorizonGlow's root:
 *     --horizon-glow-opacity   0.18 in light mode, 0.09 in dark mode
 *
 * The dark section's bottom padding must stay ≥ --horizon-depth or the corner
 * fill covers its content.
 *
 * `fillClassName` MUST be the light section's background as `fill-*` classes —
 * the same tokens it uses for `bg-*`, dark variant included — so the corners
 * match it in both themes. Never a hard-coded white.
 *
 * Nothing here animates.
 */
const ARC = "M0,0 Q500,200 1000,0"; // lowest (y=100) at the centre

export function HorizonDivider({ fillClassName, className = "" }) {
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
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-[var(--horizon-depth)] text-9e-air [--horizon-depth:28px] [--horizon-line-opacity:1] md:[--horizon-depth:64px] ${className}`}
    >
      {/* Corners: everything below the arc, in the next section's colour. */}
      <svg {...svgProps}>
        <path d={`${ARC} L1000,100 L0,100 Z`} className={fillClassName} />
      </svg>

      {/* The glow: a wider, fainter copy of the line, blurred. The blur is a
          CSS filter on the <svg> box rather than an feGaussianBlur, which would
          be stretched unevenly by preserveAspectRatio="none". */}
      <svg
        {...svgProps}
        className={`${svgProps.className} opacity-[calc(var(--horizon-line-opacity)*0.6)] blur-[4px]`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="1" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {line(6)}
      </svg>

      {/* The line itself, crisp. */}
      <svg
        {...svgProps}
        className={`${svgProps.className} opacity-[var(--horizon-line-opacity)]`}
      >
        {line(1.75)}
      </svg>
    </div>
  );
}

/**
 * The light section needs `relative isolate` for this to sit behind its
 * content (`-z-10` inside its own stacking context).
 *
 * It only shows when the section directly follows a `.fc-surface` section, so
 * there is no glow without an arc above it when Feature Content renders
 * nothing.
 */
export function HorizonGlow({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 -z-10 hidden h-48 bg-[radial-gradient(ellipse_50%_100%_at_50%_0%,theme(colors.9e.air)_0%,theme(colors.9e.air/0)_100%)] opacity-[var(--horizon-glow-opacity)] [--horizon-glow-opacity:0.18] dark:[--horizon-glow-opacity:0.09] md:h-64 [.fc-surface+*>&]:block ${className}`}
    />
  );
}
