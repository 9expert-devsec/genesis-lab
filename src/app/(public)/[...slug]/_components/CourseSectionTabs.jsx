import { courseSectionLinks } from '@/lib/courseSectionNav';

/**
 * The course page's in-page jump links, as a sticky horizontal tab strip.
 * MOBILE ONLY — below lg. At lg the sidebar (SidebarNav) does this job and this
 * strip does not exist.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * The links live in the <aside>, which at lg is a sticky right column. Below lg
 * the grid collapses to one column, so the aside — and the whole navigation —
 * reflows to the very BOTTOM of the page, after every section it is meant to
 * navigate to. A table of contents you reach by scrolling past everything it
 * lists is not navigation. SidebarNav is therefore `hidden lg:block` and this
 * takes over below it: the two are alternatives, never both, which is asserted
 * rather than eyeballed — rendering both would look correct in any screenshot
 * of the top of the page and be wrong on every real one.
 *
 * ── STICKY, AND WHAT IT STICKS UNDER ────────────────────────────────────────
 * `top-20` is not a guess: the site header is `sticky top-0` with an `h-20`
 * (80px) inner container, so 80px is exactly where the header stops. The strip
 * pins its row to `h-12` (48px) so that height is a DECLARED number the anchor
 * offset can be derived from — see SECTION_ANCHOR_CLASS, which is
 * 80 + 48 + 16 = 144px. Change this height and that constant changes with it;
 * a test pins the two together.
 *
 * ── z-30 ────────────────────────────────────────────────────────────────────
 * From the ladder in tailwind.config.js. It must sit UNDER the header (z-60),
 * which slides over it, and it has no business in the tiers above: the dock
 * (z-50) and the sticky CTA bar (z-40) both need to stay clickable over page
 * chrome. It only has to beat ordinary flow content, which is z-auto, so the
 * lowest free rung is the right one. Note this is a stacking context (sticky +
 * z-index) — harmless here, because it is a SIBLING of the content grid and
 * ancestor of nothing that carries a z-index of its own.
 *
 * ── FULL-BLEED, DELIBERATELY ────────────────────────────────────────────────
 * The hero above it is edge-to-edge below lg and the body below it is inset by
 * px-4, so the strip had to pick one. It is full-bleed, for three reasons:
 * a scrollable row whose track stops 16px short of the edge hides the "there is
 * more" cue exactly where the thumb looks for it; when stuck, a full-width bar
 * with a bottom border reads as chrome continuous with the full-width header
 * above it, where an inset one reads as a floating card that came loose; and it
 * keeps the top of the page a single edge-to-edge stack before the body's inset
 * begins. The px-4 goes on the scroll container instead, so the first tab still
 * lines up with the body text while the track itself reaches the edge.
 *
 * ── WHY A COMPONENT AND NOT INLINE MARKUP ───────────────────────────────────
 * page.jsx could have written this row inline. It must not, for two reasons
 * that both live in test/render/stickyBarButtonCoordination:
 *
 *   1. That file counts the net nesting depth of lowercase HTML container tags
 *      between the article and the aside, to catch a wrapper that would trap
 *      the sidebar's z-50 under the sticky bar's z-40 while every other
 *      assertion stayed green. A capitalised React component is skipped by
 *      that counter entirely; inline markup is counted.
 *   2. Inline markup would also bring `sticky` into that span, and the same
 *      file's createsStackingContext() treats sticky as ALWAYS creating one.
 *
 * Rendered here instead, this element is a SIBLING of the content grid and an
 * ancestor of nothing that carries a z-index, so its stacking context contains
 * only itself.
 *
 * One consequence worth knowing: that counter reads page.jsx as RAW TEXT, so an
 * element name written in prose inside that span counts as if it were markup.
 * The first draft of this feature turned the guard red purely by explaining
 * itself in a comment at the call site — which is why the explanation lives
 * here, in the file it is about, and the call site names no elements.
 *
 * ── NO ACTIVE-TAB HIGHLIGHTING ──────────────────────────────────────────────
 * Deliberately absent. Marking the current section needs a scroll-spy, and a
 * scroll-spy is an observer with thresholds that this tier cannot test — no
 * layout, no scrolling, no events. Shipping one with no control proving it
 * works is worse than not shipping it; the strip's job is to get you there.
 */
export function CourseSectionTabs({ course, hasSchedules, hasRelated, hasFaqs }) {
  const links = courseSectionLinks({ course, hasSchedules, hasRelated, hasFaqs });

  // Same rule as the sidebar: no links, no empty shell.
  if (!links.length) return null;

  return (
    <nav
      aria-label="ข้ามไปยังหัวข้อ"
      data-course-section-tabs=""
      className="sticky top-20 z-30 border-b border-[var(--surface-divider)] bg-[var(--surface-raised)] lg:hidden"
    >
      <ul className="flex h-12 items-center gap-1 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <li key={link.id} className="shrink-0">
              <a
                href={`#${link.id}`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e hover:bg-[var(--surface-hover)] hover:text-9e-action"
              >
                <Icon
                  className="h-4 w-4 shrink-0 text-9e-air"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
