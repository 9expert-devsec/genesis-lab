"use client";

import { useId } from "react";

/**
 * Animated success mark — two pale circles pulsing behind a solid check glyph.
 * Replaces the flat lucide CheckCircle2 on the public registration success
 * screens (wizard step 3, both branches, and the Omise 3DS return page).
 *
 * SIZING — why the default is 192 and not the 96 a first pass suggests.
 * The artwork is a 300×300 viewBox in which the check glyph occupies only the
 * 75×75 clip rect at translate(112.5, 112.5) — a quarter of the box per side.
 * The visible mark is therefore `size × 0.25`; everything outside it is halo.
 * The icon this replaces was a 64px lucide box whose circle spanned 20 of its
 * 24 viewBox units ≈ 53px of visible glyph. Exact diameter parity would be
 * 53 ÷ 0.25 ≈ 213px, but this mark is a SOLID fill where the old one was a
 * 1.5px stroke, and a solid disc reads heavier than an outline at the same
 * diameter — so 192 (a 48px disc, ~90% of the old outline) lands on weight.
 * At 192 the three rings measure: 48px solid check, 96px mid circle, 192px
 * outer halo. Changing this number is the whole sizing knob; do not rescale
 * the paths.
 */

/*
 * Scoped keyframes, following the AwardsSection.jsx pattern (module-level CSS
 * const + `<style>{CSS}</style>`). Note the class names are GLOBAL — a <style>
 * element inside an <svg> is not scoped — so `.pulseCircle` is a document-wide
 * name. Two instances on one page emit two identical blocks, which is inert.
 *
 * The 0% / 100% frame is scale(1), NOT scale(0.8), and that is load-bearing:
 * globals.css handles reduced motion by clamping `animation-duration: 0.01ms
 * !important` rather than removing the animation, so whichever frame sits at
 * 0% is what a reduced-motion user is left looking at. Starting at full size
 * and dipping to 0.8 at the midpoint means the mark is fully visible at rest
 * under BOTH the global clamp and the explicit opt-out below. Inverting these
 * frames would ship a permanently shrunken mark to those users.
 */
const PULSE_STYLES = `
  @keyframes growAndShrink {
    0%   { transform: scale(1); }
    50%  { transform: scale(0.8); }
    100% { transform: scale(1); }
  }
  .pulseCircle {
    transform-box: fill-box;
    transform-origin: center;
    animation: growAndShrink 2s cubic-bezier(.4, 0, .2, 1) infinite;
  }
  .pulseCircle.delay { animation-delay: .15s; }
  @media (prefers-reduced-motion: reduce) {
    .pulseCircle { animation: none; }
  }
`;

export function SuccessPulseIcon({ size = 192, className = "" }) {
  // useId, not a literal — two of these on one page must not share a clipPath
  // id, or the second one's clip would resolve to the first one's rect.
  // Same reasoning (and the same shape) as the mask id in ScheduleCard.jsx.
  const clipId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 300 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <style>{PULSE_STYLES}</style>
      {/*
        These greens are DELIBERATELY outside the brand token set. The success
        mark is its own artwork and is not meant to track --9e-brand /
        --9e-action / the theme. Do not "fix" them into var(--…) — that would
        repaint the illustration, not modernise it.
      */}
      <circle
        className="pulseCircle"
        opacity="0.1"
        cx="150"
        cy="150"
        r="150"
        fill="#50D59C"
      />
      <circle
        className="pulseCircle delay"
        opacity="0.3"
        cx="150"
        cy="150"
        r="75"
        fill="#50D59C"
      />
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M150 187.5C140.054 187.5 130.516 183.549 123.483 176.517C116.451 169.484 112.5 159.946 112.5 150C112.5 140.054 116.451 130.516 123.483 123.483C130.516 116.451 140.054 112.5 150 112.5C159.946 112.5 169.484 116.451 176.517 123.483C183.549 130.516 187.5 140.054 187.5 150C187.5 159.946 183.549 169.484 176.517 176.517C169.484 183.549 159.946 187.5 150 187.5ZM142.5 168.75L176.25 136.875L170.625 131.25L142.5 157.5L129.375 144.375L123.75 150L142.5 168.75Z"
          fill="#16C479"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect
            width="75"
            height="75"
            fill="white"
            transform="translate(112.5 112.5)"
          />
        </clipPath>
      </defs>
    </svg>
  );
}
