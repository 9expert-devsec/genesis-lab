import Link from 'next/link';
import { AboutSection } from '@/components/about/AboutSection';
import { COMPANY_PROFILE_PATH, companyProfileMeta } from '@/lib/about/companyProfileSize';

/**
 * /about-us closing section — the CTA (it replaced JoinUsSection) and the
 * Company Profile card (it replaced the old Company Profile section). Since
 * round AB-3 it sits on the page's one ground: a large closing statement
 * left, the card right as an opaque panel object. Dark mode only, one soft
 * static light pool sits behind the card (.about-pool).
 *
 * The card's meta line holds only values actually read: the PDF's size from
 * getCompanyProfileSize (a HEAD on its Blob destination). The page count is
 * not readable without fetching or parsing the whole file, so it is left out.
 * There is no cover image in the repo, so the cover is a navy title tile.
 *
 * Both Company Profile links (here and in the hero) keep the old section's
 * behaviour: the site-root path (the rewrite serves the Blob), a new tab, no
 * `download` attribute.
 */
export default function ClosingCtaSection({ profileSize = null }) {
  return (
    <AboutSection className="overflow-hidden" innerClassName="grid gap-12 lg:grid-cols-[minmax(0,690px)_460px] lg:items-center lg:justify-between lg:gap-10">
      <div data-reveal="" className="min-w-0">
        {/* Spans are forced to Google Sans by the global span rule; the H1
            of the hero uses the same override to stay in LINE Seed. */}
        <h2 className="font-heading text-[34px] font-bold leading-[1.3] text-[var(--ab-bright)] sm:text-[44px] lg:text-[48px] [&_span]:!font-heading">
          <span className="block">พร้อมพัฒนาทักษะ</span>
          <span className="block">กับ 9Expert วันนี้?</span>
        </h2>
        <p className="mt-5 max-w-[620px] text-base leading-relaxed text-[var(--ab-read)] lg:text-lg">
          เลือกหลักสูตรที่ตอบโจทย์การทำงาน หรือปรึกษาทีมเพื่อออกแบบหลักสูตร In-house สำหรับองค์กรของคุณ
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
          <Link href="/training-course" className="about-cta w-full sm:w-auto">
            ดูหลักสูตรทั้งหมด
          </Link>
          <Link href="/contact-us" className="about-cta-secondary w-full sm:w-auto">
            ปรึกษาทีมงาน
          </Link>
        </div>
      </div>

      <div data-reveal="" className="relative isolate">
        <div
          aria-hidden="true"
          className="about-pool pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2"
        />
        <div className="about-card about-profile-card">
          <div className="about-profile-cover" aria-hidden="true">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-9e-air">Company</span>
            <span className="font-heading text-xl font-bold leading-tight text-white">Profile</span>
            <span className="mt-auto text-[11px] font-semibold text-9e-lime">9Expert · 2026</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-bold text-[var(--ab-bright)]">Company Profile 2026</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ab-read)]">
              ประวัติ หลักสูตร ทีมวิทยากร และสถานที่อบรม ในเอกสารเดียว
            </p>
            <p className="mt-3 text-sm text-[var(--ab-meta)]">{companyProfileMeta({ size: profileSize })}</p>
            <a
              href={COMPANY_PROFILE_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="about-cta about-cta--sm mt-5"
            >
              ดาวน์โหลด<span className="sr-only"> (เปิดในแท็บใหม่)</span>
            </a>
          </div>
        </div>
      </div>
    </AboutSection>
  );
}
