/**
 * CookieMascot — the 80×80 cookie illustration from the Figma `cookie-banner`
 * frame (node 7:2), reproduced as ONE inline SVG.
 *
 * ── WHY INLINE SVG AND NOT AN IMAGE ─────────────────────────────────────────
 * Three options were on the table; this is why the other two lost.
 *
 * 1. HOTLINK THE FIGMA ASSETS — rejected outright. The frame composes the
 *    mascot from ~12 separately-exported layers, and those export URLs expire
 *    roughly seven days after they are generated. A component whose artwork
 *    404s next week is not a component.
 *
 * 2. REUSE public/policies-img/cookie-hero.png (654KB) or cookie-mascot.png
 *    (814KB) — checked, and neither fits. cookie-hero is the /cookie-policy
 *    hero, declared at 360×240 in src/config/policies.js: wrong aspect ratio
 *    for an 80×80 slot, and 654KB of raster to paint an 80px square is absurd
 *    when the whole banner is otherwise ~4KB of markup. cookie-mascot.png is
 *    orphaned (referenced from nowhere in src/) and has the same size problem.
 *    Decisively: a PNG cannot respond to dark mode. The two badges here carry
 *    brand colour and a white keyline that has to become a dark keyline on the
 *    dark canvas, which raster art simply cannot do.
 *
 * 3. INLINE SVG — chosen. ~1.5KB, no network request, no build step, and the
 *    badge fills are `currentColor`-adjacent token classes, so the check badge
 *    tracks the same blue as the banner's buttons in BOTH themes rather than
 *    drifting from them the first time the token moves.
 *
 * ── THE COOKIE COLOURS ARE LITERALS, DELIBERATELY ───────────────────────────
 * The dough and chocolate are `#E3A857` / `#7B4B27`, written as literal hex
 * with no token behind them. That is not an oversight. The 9Expert CI palette
 * is blues + lime + navy + slate, plus the Page Builder accents (purple,
 * orange, cyan, green) — there is no brown or tan family anywhere in it, and
 * `9e-orange-50` (#FF9124) is a saturated safety-orange that reads as plastic,
 * not baking. Inventing a `9e-cookie-*` token family to hold two decorative
 * values used by exactly one illustration would be worse than the literals.
 *
 * Geometry is transcribed from the Figma layer table: every layer's top-left
 * offset inside the 80×80 box, converted to a centre point (x + w/2, y + h/2).
 */
export function CookieMascot({ className }) {
  return (
    <svg
      viewBox="0 0 80 80"
      width="80"
      height="80"
      fill="none"
      className={className}
      role="img"
      aria-label="ภาพประกอบคุกกี้"
    >
      {/* cookie-base: 64×64 centred in the 80×80 box → r=32 at (40,40) */}
      <circle cx="40" cy="40" r="32" fill="#E3A857" />

      {/* Chocolate chips — Figma offsets converted to centres.
          6×6@(24,24)  8×8@(48,20)  6×6@(18,44)
          7×7@(40,48)  4×4@(32,34)  4×4@(44,34) */}
      <g fill="#7B4B27">
        <circle cx="27" cy="27" r="3" />
        <circle cx="52" cy="24" r="4" />
        <circle cx="21" cy="47" r="3" />
        <circle cx="43.5" cy="51.5" r="3.5" />
        <circle cx="34" cy="36" r="2" />
        <circle cx="46" cy="36" r="2" />
      </g>

      {/*
        Check badge — 24×24 @ (4,44) → r=12 at (16,56).
        The 2px keyline is white in the Figma; on the dark canvas white would
        glare, so it tracks --surface-raised and reads as a cut-out in both
        themes. Fill follows the banner's primary blue token, not a copy of it.
      */}
      <circle
        cx="16"
        cy="56"
        r="12"
        className="fill-9e-action dark:fill-9e-air"
        stroke="var(--surface-raised)"
        strokeWidth="2"
      />
      {/* 12×12 check glyph centred on the badge */}
      <path
        d="M11 56.5 L14.5 60 L21 53"
        className="stroke-white dark:stroke-9e-navy"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/*
        Lock badge — 20×20 @ (60,48) → r=10 at (70,58), 1.5px keyline.
        Figma fills this #0f172a; --text-primary is the token that means
        "near-black" here and it inverts correctly for dark mode.
      */}
      <circle
        cx="70"
        cy="58"
        r="10"
        fill="var(--text-primary)"
        stroke="var(--surface-raised)"
        strokeWidth="1.5"
      />
      {/* 10×10 padlock glyph: shackle arc + body */}
      <path
        d="M67 56.5 v-1.5 a3 3 0 0 1 6 0 v1.5"
        stroke="var(--surface-raised)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="66.5"
        y="56.5"
        width="7"
        height="5.5"
        rx="1.25"
        fill="var(--surface-raised)"
      />
    </svg>
  );
}
