import Image from 'next/image';
import Link from 'next/link';
import { COMPANY_PROFILE_PATH } from '@/lib/about/companyProfileSize';

/**
 * /about-us hero — on the page's one ground in both themes (round AB-3, light
 * modern / dark modern): text left and the rocket mascot right (mascot on top
 * below lg). All copy is fixed; AboutConfig.tagline is rendered in
 * StorySection's quote card, not here.
 *
 * No fog: the hero shares the ground with the section below, so there is no
 * seam to hide. Dark mode only, one soft static light pool sits behind the
 * mascot (.about-pool); light mode is flat.
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
    <section className="relative isolate overflow-hidden px-4 lg:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="about-pool absolute left-1/2 top-[-50px] h-[420px] w-[420px] -translate-x-1/2 lg:left-auto lg:right-[calc(50%-720px)] lg:top-0 lg:h-[720px] lg:w-[720px] lg:translate-x-0" />
      </div>

      {/* The bottom padding sets the hero-to-stats gap: the Proof section's stats row
          follows with no rule and no top padding, so it reads as the ruled
          row of facts under the hero: 40px below the buttons on mobile. At
          lg the 480px mascot is taller than the centred copy, so its box
          plus this padding sets the gap to the stats. */}
      <div className="mx-auto grid max-w-[1200px] gap-8 pb-10 pt-10 lg:grid-cols-[minmax(0,700px)_480px] lg:items-center lg:justify-between lg:gap-10 lg:pb-20 lg:pt-16">
        <div className="min-w-0">
          {/* The two lines are spans, and globals.css forces every span to
              Google Sans with !important. The class-level !important below
              (higher specificity than the element rule) hands them back to
              the heading face, LINE Seed Sans TH, at its regular 400 weight.
              Scoped to this H1 only. */}
          <h1 className="font-heading text-[34px] font-bold leading-[1.3] sm:text-[44px] lg:text-[48px] [&_span]:!font-heading">
            <span className="block text-[var(--ab-bright)]">เปลี่ยนความรู้ให้เป็นทักษะ</span>
            <span className="block text-[var(--ab-accent)]">เปลี่ยนทักษะให้เป็นผลลัพธ์</span>
          </h1>

          <p className="mt-6 max-w-[620px] text-base leading-relaxed text-[var(--ab-read)] lg:text-lg">
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
            <Link href="/training-course" className="about-cta w-full sm:w-auto">
              ดูหลักสูตรทั้งหมด
            </Link>
            <a
              href={COMPANY_PROFILE_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="about-cta-secondary w-full sm:w-auto"
            >
              ดาวน์โหลด Company Profile
            </a>
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
