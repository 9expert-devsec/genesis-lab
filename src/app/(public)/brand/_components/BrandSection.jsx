import { Card, CardContent } from '@/components/ui/card';

/**
 * One panel of the brand asset page: heading, optional sub-line, content.
 *
 * ── BUILT ON THE SHARED Card, NOT ON A LOCAL PANEL STRING ───────────────────
 * The content reference draws each section as a white rounded box with a hair
 * border and a soft shadow — which is exactly `Card`: `rounded-9e-lg`, a
 * `--surface` fill, a `--surface-border` hairline, `shadow-9e-sm`. Rewriting
 * that as `bg-white border-[#E8F0FE]` here would have been a second dialect for
 * a card, and — the part that matters — a LIGHT-ONLY one: the reference is
 * inline CSS written for a CMS field and has no dark mode at all. Card's fill
 * and border are semantic vars, so one component renders correctly in both
 * themes with nothing conditional in this file.
 *
 * ── THE HEADING LEVEL ───────────────────────────────────────────────────────
 * The reference uses <h3> because a CMS body field renders BELOW a title the
 * page chrome supplied. This is a real route, so page.jsx owns the <h1> (that
 * is the site's convention — see /faq and the policy pages, where the heading
 * is part of the page and the shared layout contributes only header/footer),
 * and each section is its own <h2>. Skipping from h1 to h3 would leave a hole
 * in the outline for anyone navigating by heading.
 */
export function BrandSection({ id, title, blurb, children }) {
  return (
    <Card className="mt-8 scroll-mt-24" id={id}>
      <CardContent className="p-5 sm:p-6">
        <h2 className="text-[22px] font-bold leading-tight text-[var(--text-primary)]">
          {title}
        </h2>
        {blurb ? (
          <p className="mt-1.5 max-w-[820px] text-[15px] leading-relaxed text-[var(--text-secondary)]">
            {blurb}
          </p>
        ) : null}
        <div className="mt-5">{children}</div>
      </CardContent>
    </Card>
  );
}
