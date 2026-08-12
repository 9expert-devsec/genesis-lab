import Link from 'next/link';
import { PolicyHero } from '@/components/policies/PolicyHero';
import { PolicyCardGrid } from '@/components/policies/PolicyCardGrid';
import { PolicyAccordion } from '@/components/policies/PolicyAccordion';
import { PolicyIcon } from '@/components/policies/PolicyIcon';
import {
  POLICY_HUB,
  POLICY_SHORTCUTS,
  POLICY_SUMMARY,
  POLICY_FAQ,
  POLICY_VERSION,
  findPolicy,
} from '@/config/policies';

export const metadata = {
  title: 'นโยบายและข้อกำหนด',
  description:
    'ศูนย์รวมเอกสารนโยบายและข้อกำหนดที่เกี่ยวข้องกับความเป็นส่วนตัว และการใช้บริการเว็บไซต์และบริการของ 9EXPERT',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/policies` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/policies` },
};

/**
 * The legal centre hub.
 *
 * ── COLUMN MATH ─────────────────────────────────────────────────────────────
 * The Figma laid this out as 760 + 32 + 500 inside a 1280 content width — and
 * the right rail actually overran the gutter by 12px there, which is a slip in
 * the file rather than an intention. Re-fitted to the mandatory 1200 container
 * that becomes 708 + 32 + 460, so the rail keeps its proportion and the page
 * is not scaled.
 *
 * The summary panel describes the PRIVACY policy specifically, so the privacy
 * card in the grid carries the active state — the two are one statement read
 * left to right, which is how the design drew it.
 */
export default function PoliciesPage() {
  const summarySubject = findPolicy('privacy-policy');

  return (
    <>
      <PolicyHero
        breadcrumb={[
          { label: 'หน้าหลัก', href: '/' },
          { label: POLICY_HUB.title },
        ]}
        illustration={POLICY_HUB.illustration}
        title={POLICY_HUB.title}
        titleEn={POLICY_HUB.titleEn}
        lede="ศูนย์รวมเอกสารนโยบายและข้อกำหนด ที่เกี่ยวข้องกับความเป็นส่วนตัว และการใช้บริการเว็บไซต์และบริการของ 9EXPERT"
        showStamp={false}
      />

      <div className="bg-[var(--page-bg)]">
        <div className="mx-auto w-full max-w-[1200px] px-0 py-12 max-md:px-4">
          <div className="flex gap-8 max-lg:flex-col">
            {/* ── Left: the four policies, then the shortcuts ── */}
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <PolicyIcon
                  name="listChecks"
                  className="h-[18px] w-[18px] text-9e-action dark:text-[#48B0FF]"
                />
                เลือกดูนโยบาย
              </h2>

              <div className="mt-4">
                <PolicyCardGrid activeSlug={summarySubject?.slug} />
              </div>

              <h2 className="mt-8 text-sm font-bold text-[var(--text-primary)]">
                ทางลัดที่เกี่ยวข้อง
              </h2>
              {/*
                Two tiles, not the Figma's three. The third was
                "ดาวน์โหลดเอกสาร PDF" and no such files exist — a download tile
                that 404s on a legal page is worse than one fewer tile.

                The cookie tile points at the cookie policy's browser-settings
                SECTION, not at a consent manager. This repo has no cookie
                consent manager; a control that looks like it opens one and
                does not is a promise the page cannot keep.
              */}
              <ul className="mt-4 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                {POLICY_SHORTCUTS.map((shortcut) => (
                  <li key={shortcut.href}>
                    <Link
                      href={shortcut.href}
                      className="flex h-full items-center gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-4 transition-colors hover:border-9e-action dark:hover:border-[#48B0FF]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-9e-action dark:text-[#48B0FF]">
                        <PolicyIcon name={shortcut.icon} className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-[var(--text-primary)]">
                          {shortcut.title}
                        </span>
                        <span className="block text-xs text-[var(--text-secondary)]">
                          {shortcut.blurb}
                        </span>
                      </span>
                      <PolicyIcon
                        name="chevronRight"
                        className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Right rail: summary, then FAQ ── */}
            <div className="w-[460px] shrink-0 space-y-6 max-lg:w-full">
              <section className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-9e-action/10 text-9e-action dark:bg-[#48B0FF]/10 dark:text-[#48B0FF]">
                    <PolicyIcon name="dpo" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">
                      {POLICY_SUMMARY.heading}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {POLICY_SUMMARY.subject}
                    </p>
                  </div>
                </div>

                <ul className="mt-5 space-y-3">
                  {POLICY_SUMMARY.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-9e-action text-white dark:bg-[#48B0FF] dark:text-[#0D1B2A]">
                        <PolicyIcon name="check" className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      <span className="text-[13px] leading-[1.6] text-[var(--text-secondary)]">
                        {bullet}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* The summary describes ONE policy, so it stamps that
                    policy's date — not a site-wide one. Reading it off
                    `summarySubject` means the panel cannot drift from the page
                    it is summarising.

                    The date is CONDITIONAL for the same reason PolicyHero's is:
                    the privacy policy is not yet in force and has no honest
                    date, and "อัปเดตล่าสุด:" followed by nothing is worse than
                    no line at all. */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--surface-border)] pt-4 text-xs text-[var(--text-muted)]">
                  {summarySubject?.updated ? (
                    <span className="flex items-center gap-1.5">
                      <PolicyIcon name="calendar" className="h-3.5 w-3.5" />
                      อัปเดตล่าสุด: {summarySubject.updated}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <PolicyIcon name="clock" className="h-3.5 w-3.5" />
                      ยังไม่มีผลบังคับใช้
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <PolicyIcon name="help" className="h-3.5 w-3.5" />
                    เวอร์ชัน: {POLICY_VERSION}
                  </span>
                </div>

                {summarySubject && (
                  <Link
                    href={summarySubject.href}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-9e-action px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#0049CC]"
                  >
                    {POLICY_SUMMARY.cta}
                    <PolicyIcon name="arrowUpRight" className="h-3.5 w-3.5" />
                  </Link>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                    <PolicyIcon
                      name="help"
                      className="h-4 w-4 text-9e-action dark:text-[#48B0FF]"
                    />
                    คำถามที่พบบ่อย (FAQ)
                  </h2>
                  <Link
                    href="/faq"
                    className="flex shrink-0 items-center gap-1 text-xs font-semibold text-9e-action hover:underline dark:text-[#48B0FF]"
                  >
                    ดูทั้งหมด
                    <PolicyIcon name="chevronRight" className="h-3 w-3" />
                  </Link>
                </div>

                <PolicyAccordion
                  items={POLICY_FAQ.map((item, i) => ({
                    id: `policy-faq-${i + 1}`,
                    title: item.q,
                    body: <p>{item.a}</p>,
                  }))}
                />
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
