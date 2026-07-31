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

  return (
    <div
      className={cn(pageClass)}
      style={themeStyle(page.theme)}
      data-pb-theme={page.theme || 'default'}
    >
      {sections.map((section, i) => (
        <SectionRenderer key={section?.id ?? i} section={section} depth={0} resolvedData={resolvedData} />
      ))}
    </div>
  );
}
