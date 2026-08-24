import { cn } from '@/lib/utils';
import { themeSurface, themeStyle } from '@/lib/pageBuilder/presets';
import { resolveSectionData } from '@/lib/pageBuilder/resolveSectionData';
import { SectionRenderer } from './SectionRenderer';

/**
 * PageBuilderView — public renderer for one builder page. Server component.
 *
 * Layer boundaries mirror CustomPageView: this renders the page BODY only.
 * generateMetadata and the JSON-LD <script> belong to the route (page.jsx),
 * not here.
 *
 * Theme: `page.theme` sets the page surface class and the default accent CSS
 * vars (--pb-accent-*) on the wrapper; a section with `style.accentColor`
 * re-sets those vars for its own subtree, so accent cascades from here down.
 *
 * The page title is NOT rendered as an <h1> here (unlike CustomPageView,
 * whose body is one blob). A builder page composes its own headings — author
 * a `heading` section at level h1. `page.title` is admin/metadata only.
 *
 * ── showHeader / showFooter / showStickyCta: ACCEPTED, NOT HONORED ────────
 * These flags are read and preserved on the doc, but this component cannot
 * act on them, and deliberately does not fake it:
 *
 *   - The site chrome is rendered by src/app/(public)/layout.jsx as siblings
 *     of {children} (<PublicHeader/> … <PublicFooter/>). In RSC a page cannot
 *     unrender a parent layout's siblings.
 *   - CSS display:none is NOT used. A hidden header still loads, still
 *     occupies the DOM, and still ships its JS — that's a broken
 *     implementation, not a limitation. Letting the chrome show is honest.
 *
 * Two mechanisms were considered and rejected FOR NOW, both permanent prices
 * for a flag nothing can set yet (builder pages can't be created through the
 * UI until 2B):
 *   - middleware x-pathname + a layout-level lookup → a DB query on EVERY
 *     public request, for a feature a handful of pages use;
 *   - a chrome-less route group → a second render path plus a broken
 *     bare-slug URL contract.
 * Deferring costs nothing and loses nothing. Revisit in 2B/2C; see
 * docs/page-builder-status.md (forward dependencies 6 and 7) for the cost of
 * each option. The 2B editor deliberately ships NO controls for these flags —
 * a toggle wired to nothing is worse than an absent one.
 *
 * showStickyCta: no reusable sticky-CTA component exists today (the
 * masterclass one is inline and coupled to batch/early-bird data), so the
 * flag is wired through and renders nothing. Do not invent the component
 * here — that's 2C at the earliest.
 */
export async function PageBuilderView({ page }) {
  if (!page) return null;

  // Top-level sections render in sortOrder; nested children are ordered by
  // the renderer's recursion (their own array order).
  const sections = (Array.isArray(page.sections) ? [...page.sections] : []).sort(
    (a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0)
  );

  // 2C.2a — the fetch, hoisted above the renderer. Resolve every data-backed
  // section's upstream reference ONCE, server-side, under the adapters' normal
  // ISR, and inject the id-keyed map into the sync SectionRenderer. The canvas
  // gets the same map from resolveBuilderSectionData (an admin server action),
  // so there is still ONE renderer. Keyed by section id (unique), so this pre-
  // pass needs no agreement with the render order (including the sort above).
  const resolvedData = await resolveSectionData(page.sections);

  const { pageClass } = themeSurface(page.theme);

  /**
   * ── ROUND 61: ONE INHERITED DECLARATION, AND WHY IT IS `anywhere` ────────
   * A long unbroken run — a synthetic `ทททท…`, or any Thai string the ICU
   * breaker finds no opportunity in — pushed the section past the page and out
   * of the card. Measured across all 17 self-contained section types
   * (scripts/_probe-round61-overflow.mjs): 12 of them overflowed, at up to
   * 2862px inside a 600px box.
   *
   * `overflow-wrap` is INHERITED, so this reaches every section without any
   * section's own class attribute moving — the whole stored corpus renders
   * byte-identically, which is what makes a page-level fix the small one.
   *
   * ── `anywhere` RATHER THAN `break-word`, AND globals.css ALREADY SAYS WHY ──
   * The article-table note in globals.css records the governing fact:
   * `overflow-wrap: break-word` does NOT reduce a box's min-content width (CSS
   * Text 3 §5.5 — its soft wrap opportunities are not counted when computing
   * min-content intrinsic sizes); only `anywhere` counts. Measured here, the
   * consequence is exact:
   *
   *   break-word  fixed the plain blocks and left EVERY flex/grid case at a
   *               min-content floor — cta, notice, two_column, card_grid,
   *               accordion, full_width all still overflowed, and four of
   *               two_column's five ratios sat at 1248 in a 1200 box.
   *   anywhere    fixed all 17 types and all 5 ratios, with nothing else added.
   *
   * `min-w-0` on the wrappers was tried first and is NOT the answer: it lets a
   * track shrink but does not give the text anywhere to break, so several cases
   * got WORSE (70-30 went 1463 -> 2258).
   *
   * ── IT DOES NOT TOUCH THAI PROSE, WHICH IS THE POINT ────────────────────
   * `anywhere` only introduces a break where the line would otherwise overflow,
   * so Chrome's ICU dictionary breaking still decides ordinary Thai. Measured on
   * 314 characters of real Thai at 1200 / 380 / 260px: identical line counts
   * (3 / 9 / 15) before and after, and ZERO breaks landing on a combining mark.
   * `word-break: break-all` also wraps the run, and is rejected: it broke Latin
   * words mid-word (2 mid-word breaks in one 63-character English sentence),
   * which these bilingual pages carry throughout.
   *
   * An arbitrary PROPERTY, so it can compile to nothing while the markup looks
   * perfect — registered in test/fs/tailwindArbitraryValueRules.test.mjs,
   * compiled from this file.
   */
  return (
    <div
      className={cn(pageClass, '[overflow-wrap:anywhere]')}
      style={themeStyle(page.theme)}
      data-pb-theme={page.theme || 'default'}
    >
      {sections.map((section, i) => (
        <SectionRenderer key={section?.id ?? i} section={section} depth={0} resolvedData={resolvedData} />
      ))}
    </div>
  );
}
