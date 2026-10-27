import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import MascotParallax from '@/components/about/MascotParallax';
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

// Twinkling dots around the mascot (decorative). Positions are % of the
// mascot box, so they scale with it; delays stagger the twinkle.
const STARS = [
  { top: '6%',  left: '18%', size: 6, delay: '0s' },
  { top: '14%', left: '84%', size: 4, delay: '0.6s' },
  { top: '34%', left: '4%',  size: 5, delay: '1.2s' },
  { top: '30%', left: '94%', size: 6, delay: '0.3s' },
  { top: '58%', left: '96%', size: 4, delay: '1.6s' },
  { top: '86%', left: '70%', size: 5, delay: '0.9s' },
  { top: '92%', left: '30%', size: 4, delay: '2.1s' },
  { top: '2%',  left: '56%', size: 4, delay: '1.8s' },
];

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
        {/* signature arc: a very wide, thin ellipse across the lower hero */}
        <svg
          className="absolute inset-x-0 bottom-[150px] h-[260px] w-full lg:bottom-[170px] lg:h-[340px]"
          viewBox="0 0 1440 340"
          preserveAspectRatio="none"
          fill="none"
        >
          <defs>
            <linearGradient id="about-hero-arc" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: 'var(--9e-lime)', stopOpacity: 0 }} />
              <stop offset="0.22" style={{ stopColor: 'var(--9e-lime)', stopOpacity: 0.9 }} />
              <stop offset="0.7" style={{ stopColor: 'var(--9e-brand)', stopOpacity: 0.9 }} />
              <stop offset="1" style={{ stopColor: 'var(--9e-brand)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <ellipse
            cx="720"
            cy="430"
            rx="1000"
            ry="330"
            stroke="url(#about-hero-arc)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
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
          <h1 className="font-heading text-[34px] font-bold leading-[1.3] sm:text-[44px] lg:text-[56px] [&_span]:!font-heading">
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
            <Button asChild variant="primary" size="lg" className="about-btn-primary w-full sm:w-auto">
              <Link href="/training-course">ดูหลักสูตรทั้งหมด</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="about-btn-ghost w-full border-white/60 text-white sm:w-auto"
            >
              <a href={COMPANY_PROFILE_PATH} target="_blank" rel="noopener noreferrer">
                ดาวน์โหลด Company Profile
              </a>
            </Button>
          </div>
        </div>

        {/* Mascot motion is CSS (globals.css, .about-mascot-*): a one-off
            fly-in from lower left, then a float with an out-of-phase tilt, a
            pulsing exhaust glow and twinkling stars. The image stays
            `priority` and is in the server HTML at its resting place; the
            fly-in starts from a faint (not zero) opacity so it still counts
            as painted for LCP. Reduced motion: all of it is off. */}
        <div className="order-first flex justify-center lg:order-none lg:justify-end">
          <MascotParallax>
            <div className="about-mascot relative h-[240px] w-[240px] lg:h-[480px] lg:w-[480px]">
              <span aria-hidden="true" className="about-mascot-exhaust" />
              {STARS.map((s, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="about-mascot-star"
                  style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }}
                />
              ))}
              <div className="about-mascot-enter">
                <div className="about-mascot-float">
                  <div className="about-mascot-tilt">
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
              </div>
            </div>
          </MascotParallax>
        </div>
      </div>
    </section>
  );
}
