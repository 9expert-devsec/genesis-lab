import Link from 'next/link';
import { PolicyHero } from './PolicyHero';
import { PolicyTocSidebar } from './PolicyTocSidebar';
import { PolicyIcon } from './PolicyIcon';
import { POLICY_PAGES, POLICY_HUB } from '@/config/policies';

/**
 * The shell every detail policy page renders into.
 *
 * ── ONE LAYOUT, FOUR PAGES ──────────────────────────────────────────────────
 * The Figma drew four variations on one skeleton: breadcrumb, hero, a 280 rail
 * of contents beside the body, then an optional strip of links to sibling
 * policies. The differences between them were incidental — privacy numbered its
 * contents and cookie did not, terms ended in a promo bar and cookie ended in
 * nothing — so they are unified here rather than reproduced.
 *
 * The terms page has no "open sections" region at all; it is entirely
 * accordions. That falls out for free: `sections` is optional, and a page that
 * passes only `accordion` renders as an all-accordion list.
 *
 * Column math inside the mandatory 1200 container: 280 rail + 40 gap + 880
 * body. Below lg the rail stacks above the body full-width.
 */
export function PolicyLayout({
  breadcrumb,
  illustration,
  title,
  titleEn,
  lede,
  updated,
  toc,
  numbered = true,
  help,
  notice,
  children,
  currentSlug,
}) {
  return (
    <>
      <PolicyHero
        breadcrumb={breadcrumb}
        illustration={illustration}
        title={title}
        titleEn={titleEn}
        lede={lede}
        updated={updated}
      />

      {/* The draft banner sits BETWEEN the hero and the content, full-bleed
          and outside the content container. It used to render inside the
          column, above the body — which put it in the same visual class as a
          callout and let it read as part of the article. A warning that the
          whole page is unapproved is not a callout within the page. */}
      {notice}

      <div className="bg-[var(--page-bg)]">
        <div className="mx-auto w-full max-w-[1200px] px-0 py-12 max-md:px-4">
          <div className="flex gap-10 max-lg:flex-col">
            <PolicyTocSidebar items={toc} numbered={numbered} help={help} />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </div>

      <PolicyRelatedStrip currentSlug={currentSlug} />
    </>
  );
}

/**
 * The strip of sibling policies at the foot of every detail page.
 *
 * Shows the other three policies plus the hub — never a link to the page you
 * are already on, which is the same rule the hub's card grid follows.
 */
function PolicyRelatedStrip({ currentSlug }) {
  const others = POLICY_PAGES.filter((p) => p.slug !== currentSlug);

  return (
    <section className="border-t border-[var(--surface-border)] bg-[var(--page-bg-muted)]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-0 py-6 max-md:px-4">
        <p className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <PolicyIcon
            name="listChecks"
            className="h-5 w-5 shrink-0 text-9e-action dark:text-[#48B0FF]"
          />
          <span>
            ศึกษานโยบายที่เกี่ยวข้อง เพื่อความเข้าใจในสิทธิและเงื่อนไขของผู้ใช้บริการ
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {others.map((p) => (
            <Link
              key={p.slug}
              href={p.href}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-9e-action hover:text-9e-action dark:hover:border-[#48B0FF] dark:hover:text-[#48B0FF]"
            >
              {p.title}
              <PolicyIcon name="chevronRight" className="h-3 w-3" />
            </Link>
          ))}
          <Link
            href={POLICY_HUB.href}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-9e-action transition-colors hover:underline dark:text-[#48B0FF]"
          >
            ดูทั้งหมด
            <PolicyIcon name="chevronRight" className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}
