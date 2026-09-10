import { Card, CardContent } from '@/components/ui/card';

/**
 * One numbered section of the brand hub: `01 Brand Story`, a Thai lead, content.
 *
 * ── BUILT ON THE SHARED Card, NOT ON A LOCAL PANEL STRING ───────────────────
 * The guideline draws each section as a white rounded box with a hair border
 * and a soft shadow — which is exactly `Card`: `rounded-9e-lg`, a `--surface`
 * fill, a `--surface-border` hairline, `shadow-9e-sm`. Rewriting that as
 * `bg-white border-[#E8F0FE]` here would have been a second dialect for a card,
 * and — the part that matters — a LIGHT-ONLY one. Card's fill and border are
 * semantic vars, so one component renders correctly in both themes with nothing
 * conditional in this file.
 *
 * ── THE ID IS PUBLIC API ────────────────────────────────────────────────────
 * `id` comes from BRAND_SECTIONS and is what the section rail links to and what
 * people paste into chat. `scroll-mt-24` keeps the heading clear of the sticky
 * site header when an anchor lands here — without it the title sits underneath
 * the header and the section looks like it starts at its second paragraph.
 *
 * ── THE HEADING LEVEL ───────────────────────────────────────────────────────
 * The page owns the <h1> (the site's convention — see /faq and the policy
 * pages, where the heading is part of the page and the shared layout
 * contributes only header/footer), each section is an <h2>, and each subsection
 * an <h3>. No level is skipped, so the outline is navigable by heading.
 */
export function BrandSection({ number, id, title, lead, children }) {
  return (
    <Card className="scroll-mt-24" id={id}>
      <CardContent className="p-5 sm:p-7">
        <div className="flex items-baseline gap-3">
          {/* The number is decoration for a screen reader — the title carries
              the meaning, and "zero one Brand Story" is noise in a heading. */}
          <span
            className="font-en text-sm font-bold tracking-widest text-9e-action dark:text-9e-air"
            aria-hidden="true"
          >
            {number}
          </span>
          <h2 className="font-heading text-2xl font-bold leading-tight text-[var(--text-primary)]">
            {title}
          </h2>
        </div>
        {lead ? (
          <p className="mt-2 max-w-[820px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
            {lead}
          </p>
        ) : null}
        <div className="mt-6 space-y-8">{children}</div>
      </CardContent>
    </Card>
  );
}

/**
 * A titled block inside a section — `About`, `Vision`, `Minimum Size`.
 *
 * English title, optional Thai lead: the split the source document uses
 * throughout, and the reason this is one component rather than an h3 written
 * out eighteen times with slightly different spacing each time.
 */
export function Subsection({ title, lead, children }) {
  return (
    <section>
      <h3 className="font-heading text-base font-bold text-[var(--text-primary)]">{title}</h3>
      {lead ? (
        <p className="mt-1.5 max-w-[820px] text-sm leading-relaxed text-[var(--text-secondary)]">
          {lead}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
