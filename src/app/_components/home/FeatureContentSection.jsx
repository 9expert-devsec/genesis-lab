import {
  FEATURE_CONTENT_COPY,
  mapBannersToFeatureContent,
} from "@/lib/home/featureContentFromBanners";
import { FeaturedContentSlider } from "./FeaturedContentSlider";

/**
 * Home "Feature Content" — the dark band directly under the hero.
 *
 * Figma: file TLKzWZOYVUHl0PHUTseUD9, frame `featured-content-section`, node 2:4.
 *
 * ── WHERE THE CONTENT COMES FROM ────────────────────────────────────────────
 * The REAL Banner records, read-only, via the `banners` array the home page
 * already has from `getLandingData()` — the `landing_cache` snapshot. This
 * step adds no query, no model import and no schema change; it re-points an
 * existing payload at a new surface.
 *
 * The Banner shape stops at src/lib/home/featureContentFromBanners.js. Nothing
 * below this line knows a Banner exists, which is what makes Step C's schema
 * rework a one-file diff.
 *
 * Mapping runs HERE, on the server, so the raw Banner documents are never
 * serialised into the client bundle — only the mapped view model crosses the
 * boundary.
 *
 * ══ THE SEAM ═══════════════════════════════════════════════════════════════
 * Scrolling out of the hero into this section must show no horizontal edge.
 * Three layers do that, and they are described where they are defined — the
 * "FEATURE CONTENT SECTION" block at the bottom of src/app/globals.css:
 *
 *   1. `.fc-hero-fade`  — inside HeroSection, its bottom ~180px fading to this
 *                         section's base colour. See the call site there for
 *                         why it stacks above the mascot.
 *   2. `.fc-surface`    — on this <section>: the pull-up over the hero, the
 *                         padding that gives the space back, and a single
 *                         gradient that is both the fade-in and the fill.
 *   3. `.fc-aurora`     — the glow, spilling above this section's top edge.
 *
 * THE ONE SOURCE for the colour is `--9e-fc-base-rgb` in that block. The
 * section's fill and every gradient's terminal stop are both computed from
 * that single triplet, so they cannot drift apart and bring the band back.
 *
 * ── THINGS THAT WILL SILENTLY BREAK THE SEAM ────────────────────────────────
 *
 * NO `overflow-hidden` ON THIS SECTION. Ever. The aurora is positioned to
 * spill ABOVE the top edge; clipping it removes the softening at exactly the
 * edge it exists to soften, and the failure looks like "the glow is a bit
 * small", not like a clip.
 *
 * NO `from-transparent` / `to-transparent` in any of those gradients. CSS
 * `transparent` is transparent BLACK; some browsers interpolate through it
 * and paint a faint grey band precisely along the seam. Every stop ends on
 * the base colour at alpha 0 instead — same R,G,B, no band.
 *
 * ── POINTER EVENTS: WHY THE SECTION IS INERT AND THE WRAPPER IS NOT ─────────
 * The pull-up puts this section's top band physically OVER the hero's lower
 * area. Anything there that accepts pointer events eats clicks meant for the
 * hero's CTAs — this repo has already shipped an invisible full-width strip
 * that did exactly that. So:
 *   • the <section> is `pointer-events-none`, and it is also what carries the
 *     tall `padding-top` (in .fc-surface), so the whole overlap band is inert;
 *   • the inner wrapper turns them back ON, and its box begins BELOW that
 *     band, so it never covers the hero at all.
 * EVERY interactive thing — the two arrows, the card buttons, the play button,
 * the detail/video links — must stay inside that wrapper. Adding a button as a
 * direct child of the <section> would render it unclickable.
 *
 * ── WIDTH ───────────────────────────────────────────────────────────────────
 * The dark background is FULL-BLEED at every width, the same ruling the hero
 * got in round 1 — no 1440 cap. The CONTENT uses the repo's container pattern
 * (`px-4 … lg:px-6` + `mx-auto max-w-[1200px]`) so it lines up with the
 * sections below rather than with the Figma's 112px / 1210px, which were
 * measured against a 1440 artboard.
 *
 * ── THEME ───────────────────────────────────────────────────────────────────
 * Dark in BOTH light and dark mode, deliberately. There are no `dark:`
 * variants here and there should not be: the base is a named token, so a
 * light variant is added by overriding that token, not by editing call sites.
 */
export function FeatureContentSection({ banners = [] }) {
  const items = mapBannersToFeatureContent(banners);

  // No banner in the pool means no section — not an empty dark band with a
  // heading over nothing. The hero's bottom fade still resolves correctly
  // because it fades to a colour, not to whatever happens to be below it.
  if (!items.length) return null;

  return (
    <section
      aria-label={FEATURE_CONTENT_COPY.title}
      // `relative` for the aurora to anchor to. `z-20` puts the whole section
      // above the hero, whose tallest internal rung is the headline block at
      // z-20 — this section is later in document order, so it wins the tie —
      // and well below the sticky header at z-60. It deliberately does NOT
      // take z-30: that rung is a documented shared rung with four occupants
      // and a "no two on one page" rule (see tailwind.config.js), enforced by
      // test/pure/zIndexStack.
      //
      // `pb-12` matches the other Home sections. There is no `pt-*` here: the
      // top padding is the overlap plus that same 3rem and lives in
      // .fc-surface, because it must move with the negative margin.
      //
      // NO overflow-hidden. See the note above.
      className="fc-surface pointer-events-none relative z-20 w-full px-4 pb-12 lg:px-6"
    >
      <div aria-hidden="true" className="fc-aurora pointer-events-none" />

      {/* Pointer events come back ON here — and this box starts below the
          overlap band, so it never sits over the hero. `relative` so it
          paints above the aurora, which is an absolute sibling before it. */}
      <div className="pointer-events-auto relative mx-auto flex max-w-[1200px] flex-col gap-10">
        <FeaturedContentSlider copy={FEATURE_CONTENT_COPY} items={items} />
      </div>
    </section>
  );
}
