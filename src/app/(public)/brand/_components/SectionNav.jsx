import Link from 'next/link';
import { BRAND_SECTIONS } from '../brandContent';

/**
 * The numbered rail: 01–06, each linking to its section.
 *
 * ══ PLAIN ANCHORS. NO SCROLL-SPY, NO CLIENT STATE, NO 'use client'. ═════════
 *
 * Deliberate, and the same ruling PolicyTocSidebar records for the legal
 * centre's rail. An active-section highlight needs an IntersectionObserver and
 * a state hook, which turns a static page into a client component for a visual
 * nicety; anchors work with JavaScript disabled, survive being copied out of
 * the address bar, and are what this page actually needs. If a highlight is
 * wanted later it is its own change, with its own reasoning — not something to
 * slip in while editing the labels.
 *
 * ── TWO SHAPES, ONE LIST, NO DUPLICATION OF THE DATA ───────────────────────
 * Wide screens get a sticky column beside the content. Narrow screens have no
 * column to spare, so the same six links become a horizontally scrolling strip
 * of chips above the content — usable with a thumb, and it does not eat a
 * third of a phone screen before the reader reaches section 01.
 *
 * Both render from BRAND_SECTIONS, so a seventh section appears in both without
 * anyone remembering the second one exists. The two are mutually exclusive at
 * `lg`, so a screen reader meets exactly one — hence `aria-hidden` on neither
 * and a distinct `aria-label` on each, rather than one nav rendered twice.
 */

const NUMBER_CLASS =
  'font-en text-xs font-bold tracking-widest text-9e-action dark:text-9e-air';

export function SectionNavRail() {
  return (
    <nav
      aria-label="Brand guideline sections"
      className="sticky top-24 hidden w-[220px] shrink-0 lg:block"
    >
      <p className="px-3 pb-2 font-en text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
        Contents
      </p>
      <ol className="flex flex-col">
        {BRAND_SECTIONS.map((section) => (
          <li key={section.id}>
            <Link
              href={`#${section.id}`}
              className="flex items-baseline gap-2.5 rounded-9e-sm px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-9e-micro hover:bg-[var(--surface-hover)] hover:text-9e-action dark:hover:text-9e-air"
            >
              <span className={NUMBER_CLASS}>{section.number}</span>
              <span>{section.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionNavStrip() {
  return (
    <nav
      aria-label="Brand guideline sections"
      // `-mx-4 px-4` lets the strip bleed to the screen edge while its first and
      // last chips keep the page's gutter, so a mid-scroll chip is not clipped
      // against a hard container edge. The page itself must never scroll
      // sideways, so the overflow is owned here.
      className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden"
    >
      <ol className="flex w-max gap-2">
        {BRAND_SECTIONS.map((section) => (
          <li key={section.id}>
            <Link
              href={`#${section.id}`}
              className="flex items-baseline gap-2 whitespace-nowrap rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-3.5 py-2 text-sm text-[var(--text-primary)] transition-colors duration-9e-micro hover:border-9e-action/40"
            >
              <span className={NUMBER_CLASS}>{section.number}</span>
              <span>{section.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
