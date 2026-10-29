import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { COMPANY_PROFILE_PATH, companyProfileMeta } from '@/lib/about/companyProfileSize';

/**
 * /about-us closing section — the CTA (it replaced JoinUsSection) and the
 * Company Profile card (it replaced
 * CompanyProfileSection). Navy in both themes, with a soft glow.
 *
 * The card's meta line holds only values actually read: the PDF's size from
 * getCompanyProfileSize (a HEAD on its Blob destination). The page count is
 * not readable without fetching or parsing the whole file, so it is left out.
 * There is no cover image in the repo, so the cover is a navy title tile.
 *
 * The download keeps the old section's behaviour: the site-root path (the
 * rewrite serves the Blob), a new tab, no `download` attribute.
 */
export default function ClosingCtaSection({ profileSize = null }) {
  return (
    <section className="relative isolate overflow-hidden bg-9e-navy px-4 py-20 lg:px-6 lg:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute right-[-160px] top-[-200px] h-[620px] w-[620px] rounded-full"
          style={{
            background:
              'radial-gradient(closest-side, rgba(36,134,255,0.30) 0%, rgba(36,134,255,0.10) 55%, transparent 100%)',
          }}
        />
      </div>

      <div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[minmax(0,690px)_460px] lg:items-center lg:justify-between lg:gap-10">
        <div className="min-w-0">
          {/* Spans are forced to Google Sans by the global span rule; the H1
              of the hero uses the same override to stay in LINE Seed. */}
          <h2 className="font-heading text-[34px] font-bold leading-[1.3] text-white sm:text-[44px] lg:text-[48px] [&_span]:!font-heading">
            <span className="block">พร้อมพัฒนาทักษะ</span>
            <span className="block">กับ 9Expert วันนี้?</span>
          </h2>
          <p className="mt-5 max-w-[620px] text-base leading-relaxed text-white/[0.72] lg:text-lg">
            เลือกหลักสูตรที่ตอบโจทย์การทำงาน หรือปรึกษาทีมเพื่อออกแบบหลักสูตร In-house สำหรับองค์กรของคุณ
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            <Button asChild variant="primary" size="lg" className="about-btn-primary h-12 w-full px-7 text-base sm:w-auto">
              <Link href="/training-course">ดูหลักสูตรทั้งหมด</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="about-btn-ghost h-12 w-full border-white/60 px-7 text-base text-white sm:w-auto"
            >
              <Link href="/contact-us">ปรึกษาทีมงาน</Link>
            </Button>
          </div>
        </div>

        <div className="about-card about-profile-card">
          <div className="about-profile-cover" aria-hidden="true">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-9e-air">Company</span>
            <span className="font-heading text-xl font-bold leading-tight text-white">Profile</span>
            <span className="mt-auto text-[11px] font-semibold text-9e-lime">9Expert · 2026</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-bold text-white">Company Profile 2026</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/[0.72]">
              ประวัติ หลักสูตร ทีมวิทยากร และสถานที่อบรม ในเอกสารเดียว
            </p>
            <p className="mt-3 text-sm font-semibold text-9e-lime">{companyProfileMeta({ size: profileSize })}</p>
            <Button asChild variant="primary" size="md" className="about-btn-primary mt-5 h-11 px-6 text-sm">
              <a href={COMPANY_PROFILE_PATH} target="_blank" rel="noopener noreferrer">
                ดาวน์โหลด<span className="sr-only"> (เปิดในแท็บใหม่)</span>
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
