import Image from 'next/image';
import Link from 'next/link';
import { specialtiesLine } from '@/lib/instructors/instructorSpecialties';
import { photoCropValues } from '@/lib/instructors/photoCrop';
import InstructorPhotoPanel from './InstructorPhotoPanel';

/**
 * /about-us "เรียนกับผู้เชี่ยวชาญตัวจริง" — instructor cards in the Company
 * Profile style. Dark in both themes (9e-navy section, 9e-card cards).
 *
 * Data: buildInstructorCards() — admin order, each card's program icons from
 * the MSDB-curated list. An instructor with no programs gets no icon row; one
 * with no specialties gets no "เชี่ยวชาญด้าน" block.
 *
 * Layout: 3 columns at lg, 2 at md, and below md a horizontal row that snaps
 * per card (snapping on THIS ROW only, never the page). Hover only — no
 * entrance animation. Hover/scroll CSS: globals.css, .about-instructor-*.
 *
 * The arrow_logo watermark behind each photo lives in InstructorPhotoPanel.
 */
export default function InstructorCardsSection({ cards = [] }) {
  if (!cards.length) return null;

  return (
    <section className="relative isolate overflow-hidden bg-9e-navy px-4 py-20 lg:px-6 lg:py-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-[-160px] top-[-160px] h-[560px] w-[560px] rounded-full"
          style={{
            background:
              'radial-gradient(closest-side, rgba(36,134,255,0.30) 0%, rgba(36,134,255,0.10) 55%, transparent 100%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="font-heading text-3xl font-bold leading-snug text-white md:text-[40px]">
            เรียนกับผู้เชี่ยวชาญตัวจริง
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/[0.72] md:text-lg">
            วิทยากรที่ใช้เครื่องมือเหล่านี้ในงานจริง และได้รับการรับรองจาก Microsoft
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-3">
            <li className="about-pill">Microsoft MVP &amp; Certified Trainer</li>
            <li className="about-pill">ประสบการณ์สอนกว่า 10 ปี</li>
          </ul>
        </div>

        {/* A focusable region so keyboard users can scroll the mobile row. */}
        <div role="region" tabIndex={0} aria-label="รายชื่อวิทยากร" className="about-instructor-scroller mt-12 lg:mt-14">
        <ul className="about-instructor-row">
          {cards.map((c) => (
            <li key={c.id} className="about-card about-instructor">
              <h3 className="font-heading text-[22px] font-bold leading-snug text-white">{c.name}</h3>
              {c.title && (
                <p className="mt-1 text-sm leading-snug text-white/[0.72]">{c.title}</p>
              )}

              {/* Per-instructor crop (defaults when unset) — the same panel the
                  admin previews in /admin/instructors. */}
              <InstructorPhotoPanel
                imageUrl={c.imageUrl}
                alt={c.name}
                scale={(c.crop ?? photoCropValues()).scale}
                offsetY={(c.crop ?? photoCropValues()).offsetY}
                offsetX={(c.crop ?? photoCropValues()).offsetX}
                className="mt-5"
              />

              {c.specialties.length > 0 && (
                <div className="mt-5 text-left">
                  <p className="text-[15px] font-bold text-9e-lime">เชี่ยวชาญด้าน:</p>
                  <p className="mt-1 text-[15px] leading-[1.6] text-white/[0.85]">
                    {specialtiesLine(c.specialties)}
                  </p>
                </div>
              )}

              {/* Bare icons, no tile: each links to its program's listing
                  page, or is a plain image when that page is unpublished.
                  The MSDB icon artwork itself carries a ring on a white disc;
                  no plain-logo source exists, so that is what shows. */}
              {c.programs.length > 0 && (
                <ul className="about-instructor-programs mt-auto pt-5" aria-label={`โปรแกรมที่ ${c.name} สอน`}>
                  {c.programs.map((p) => (
                    <li key={p.name}>
                      {p.href ? (
                        <Link
                          href={p.href}
                          title={p.name}
                          aria-label={`ดูหลักสูตร ${p.name}`}
                          className="about-instructor-program"
                        >
                          <Image src={p.iconUrl} alt="" width={36} height={36} className="about-instructor-program-icon" />
                        </Link>
                      ) : (
                        <span title={p.name} className="about-instructor-program">
                          <Image src={p.iconUrl} alt={p.name} width={36} height={36} className="about-instructor-program-icon" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        </div>
      </div>
    </section>
  );
}
