import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { COMPANY_PROFILE_PATH } from '@/lib/about/companyProfileSize';

/**
 * /about-us hero — dark navy in BOTH themes, text left and the rocket mascot
 * right (mascot on top below lg). All copy is fixed; AboutConfig.tagline is
 * rendered in StorySection's quote card, not here.
 *
 * ── THE FOG ─────────────────────────────────────────────────────────────────
 * The bottom of the hero fades to var(--page-bg-muted), the SAME variable the
 * Proof section below paints its background with, so the seam is invisible in
 * light and dark alike. The content block's bottom padding keeps the text above
 * the fog's opaque half.
 */

const PARAGRAPH =
  '9Expert ออกแบบและพัฒนาหลักสูตรอย่างต่อเนื่อง ให้ทันเทคโนโลยีและโจทย์ของภาคธุรกิจ ผสานองค์ความรู้ การลงมือปฏิบัติ และโจทย์จากการทำงานจริงเข้าไว้ด้วยกัน';

const PILLS = ['AI', 'DATA', 'AUTOMATION'];

/**
 * @param {{ pills?: { label: string, href: string|null }[] }} props
 *   from focusPillLinks(getNavMenuData().skillSlugs), resolved by the page.
 */
export default function AboutHero({ pills = PILLS.map((label) => ({ label, href: null })) }) {
  return (
    <section className="relative isolate overflow-hidden bg-9e-navy px-4 lg:min-h-[840px] lg:px-6">
      {/* ── Decoration ─────────────────────────────────────────────── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {/* soft blue glow behind the mascot */}
        <div
          className="absolute left-1/2 top-[-120px] h-[560px] w-[560px] -translate-x-1/2 rounded-full lg:left-auto lg:right-[-80px] lg:top-[-80px] lg:h-[820px] lg:w-[820px] lg:translate-x-0"
          style={{
            background:
              'radial-gradient(closest-side, rgba(36,134,255,0.38) 0%, rgba(36,134,255,0.12) 55%, transparent 100%)',
          }}
        />
        {/* fog into the Proof section's background */}
        <div
          className="absolute inset-x-0 bottom-0 h-[280px] lg:h-[320px]"
          style={{ background: 'linear-gradient(180deg, transparent 0%, var(--page-bg-muted) 100%)' }}
        />
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="mx-auto grid max-w-[1200px] gap-8 pb-[200px] pt-10 lg:min-h-[840px] lg:grid-cols-[minmax(0,700px)_480px] lg:items-center lg:justify-between lg:gap-10 lg:pb-[260px] lg:pt-16">
        <div className="min-w-0">
          {/* The two lines are spans, and globals.css forces every span to
              Google Sans with !important. The class-level !important below
              (higher specificity than the element rule) hands them back to
              font-heading, i.e. LINE Seed Sans TH via var(--font-thai), bold
              700, which LINE Seed ships. Scoped to this H1 only. */}
          <h1 className="font-heading text-[34px] font-bold leading-[1.3] sm:text-[44px] lg:text-[48px] [&_span]:!font-heading">
            <span className="block text-white">เปลี่ยนความรู้ให้เป็นทักษะ</span>
            <span className="block text-9e-brand">เปลี่ยนทักษะให้เป็นผลลัพธ์</span>
          </h1>

          <p className="mt-6 max-w-[620px] text-base leading-relaxed text-9e-slate-lt-300 lg:text-lg">
            {PARAGRAPH}
          </p>

          <ul className="mt-8 flex flex-wrap gap-3">
            {pills.map((pill) => (
              <li key={pill.label}>
                {pill.href ? (
                  <Link href={pill.href} className="about-pill">
                    {pill.label}
                  </Link>
                ) : (
                  <span className="about-pill">{pill.label}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Button asChild variant="primary" size="lg" className="about-btn-primary h-12 w-full px-7 text-base sm:w-auto">
              <Link href="/training-course">ดูหลักสูตรทั้งหมด</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="about-btn-ghost h-12 w-full border-white/60 px-7 text-base text-white sm:w-auto"
            >
              <a href={COMPANY_PROFILE_PATH} target="_blank" rel="noopener noreferrer">
                ดาวน์โหลด Company Profile
              </a>
            </Button>
          </div>
        </div>

        {/* The mascot is static by decision (round AB-2p-fix removed its
            motion). It is the LCP image, hence `priority`. */}
        <div className="order-first flex justify-center lg:order-none lg:justify-end">
          <Image
            src="/about-img/mascot/nong-nine-rocket.webp"
            alt="น้องไนน์ มาสคอตของ 9Expert"
            width={480}
            height={480}
            priority
            sizes="(min-width: 1024px) 480px, 240px"
            className="h-[240px] w-[240px] lg:h-[480px] lg:w-[480px]"
          />
        </div>
      </div>
    </section>
  );
}
