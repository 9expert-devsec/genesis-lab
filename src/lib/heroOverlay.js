/**
 * The Home hero's transparent-header contract.
 *
 * Two components on opposite sides of the tree have to agree on it and neither
 * can see the other:
 *   · src/app/_components/home/HeroSection.jsx renders the sentinel element at
 *     the BOTTOM of the hero (and is a server component — it ships no JS).
 *   · src/components/layout/PublicHeaderClient.jsx, in overlay mode, observes
 *     that sentinel to decide when to stop being transparent.
 *
 * A string literal copied into both files is a SILENT failure: the observer
 * finds no element, bails, and the header stays transparent for the whole page
 * with nothing wrong-looking in either file's markup. One export, imported
 * twice, is what makes the rename impossible to half-finish.
 *
 * PURE and import-free: a client component and a server component both import
 * it, so it must carry no runtime of its own.
 */

/**
 * id of the 1px marker at the TOP of the hero.
 *
 * It was at the bottom first, and that was the defect: the header then stayed
 * transparent while the whole hero scrolled up under it, so the hero's CTAs
 * were painted over the nav links. See the comment on the element itself in
 * HeroSection.jsx before moving it back.
 */
export const HERO_OVERLAY_SENTINEL_ID = 'hero-overlay-sentinel';

/**
 * The public header's rendered height in CSS px.
 *
 * 80 from `h-20` on the header's inner row (PublicHeaderClient.jsx) + 1 for its
 * `border-b`. HeroSection pulls itself up under the header by this amount and
 * gives it back as padding — but as the LITERAL Tailwind classes `-mt-[81px]` /
 * `pt-[81px]`, because Tailwind scans raw source text and a class assembled
 * from this constant would emit perfect markup and ZERO CSS. So the number
 * lives here, the classes repeat it, and the guard below ties them together.
 *
 * PublicHeaderClient does NOT read it. It used to, as the observer's
 * rootMargin, when the sentinel was at the hero's bottom; with the sentinel at
 * the hero's TOP the header's height cancels out of the comparison — the hero's
 * top edge and the header's top edge are the same document position by
 * construction of that same pull-up.
 *
 * test/fs/heroOverlayOptIn asserts the literals and this number agree, and that
 * the header row is still `h-20`, so a header-height change reddens rather than
 * quietly leaving the hero 81px out of register.
 */
export const PUBLIC_HEADER_HEIGHT_PX = 81;

/**
 * How far ABOVE the viewport top the hero's sentinel may sit and still count as
 * "the page is at rest on the hero", in CSS px.
 *
 * ── WHY THIS IS NOT ZERO. DO NOT "SIMPLIFY" IT BACK TO `>= 0`. ──────────────
 * The hero pulls itself up by 81 CSS px. A browser snaps that offset to whole
 * DEVICE pixels, so at any device-pixel ratio where 81 × dpr is not an integer,
 * the hero's top edge lands a fraction of a CSS pixel ABOVE the header's top —
 * and `boundingClientRect.top` at scroll 0 is a small NEGATIVE number rather
 * than 0. A bare `>= 0` then reads false at the very top of the page, the
 * header never returns to its transparent treatment, and no further callback
 * ever arrives to correct it because the 1px sentinel never stops intersecting.
 *
 * Measured in Chrome at scroll 0, window 1900×950 (`sentinelTop`):
 *
 *     zoom   50%   +1.0000      zoom  110%   -0.0852   ← bare >= 0 FAILS
 *     zoom   67%   +0.4897      zoom  125%   -0.2000   ← FAILS
 *     zoom   75%   +0.3333      zoom  135%   -0.2546   ← FAILS (the reported case)
 *     zoom   80%   +0.2539      zoom  150%   -0.3333   ← FAILS
 *     zoom   90%   +0.1215      zoom  175%   -0.4286   ← FAILS, worst measured
 *     zoom  100%    0.0000      zoom  200%    0.0000
 *
 * So it breaks at 110/125/135/150/175% — the ordinary Windows display-scaling
 * settings — and works at 100% and 200%, which is why it looked width-dependent
 * ("~1900px fails, 2560 works"): 2560 ÷ 1.35 ≈ 1896, so the two widths were the
 * same monitor at two zoom levels.
 *
 * The residue is bounded by one device pixel (1/dpr CSS px), so 1 CSS px covers
 * every case above with more than twice the margin of the worst one. It cannot
 * cause a wrong state in the other direction either: the next real state change
 * is the hero scrolling under the header, and the smallest wheel notch moves
 * tens of pixels, not fractions of one.
 */
export const OVERLAY_SUBPIXEL_TOLERANCE_PX = 1;

/**
 * Is the header allowed to be transparent RIGHT NOW?
 *
 * Two independent facts decide it and both are necessary:
 *
 *   · `overlayActive` — the page opted in AND is still at rest on its hero
 *     (see the sentinel above).
 *   · `openPanelCount === 0` — nothing is hanging off the bar. A transparent
 *     bar with a solid mega panel under it reads as two unrelated surfaces
 *     with hero artwork showing through the seam between them.
 *
 * It lives here, as one pure function, rather than as an `&&` at each use site.
 * The header has five consumers of this answer — its own background, the search
 * action, the hamburger, and the three kinds of nav trigger — and the failure
 * mode of getting them out of step is not subtle: an opaque bar whose links are
 * still forced white is white-on-white.
 */
export function isHeaderTransparent({ overlayActive, openPanelCount }) {
  return Boolean(overlayActive) && openPanelCount === 0;
}
