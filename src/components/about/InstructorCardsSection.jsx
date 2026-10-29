import Image from 'next/image';
import Link from 'next/link';
import { specialtiesLine } from '@/lib/instructors/instructorSpecialties';
import { photoCropValues } from '@/lib/instructors/photoCrop';
import { AboutSection, AboutSectionHeader } from '@/components/about/AboutSection';
import InstructorPhotoPanel from './InstructorPhotoPanel';

/**
 * /about-us "เรียนกับผู้เชี่ยวชาญตัวจริง" — instructor cards in the Company
 * Profile style. The SECTION sits on the page's one ground with the shared
 * two-column header (round AB-3); the CARDS are the AB-2h-fix design (round
 * AB-3b): dark 9e-card objects in both themes, text centred, white type.
 *
 * Data: buildInstructorCards() — admin order, each card's program icons from
 * the MSDB-curated list. An instructor with no programs gets no icon row; one
 * with no specialties gets no "เชี่ยวชาญด้าน" block.
 *
 * Layout: 3 columns at lg, 2 at md, and below md a horizontal row that snaps
 * per card (snapping on THIS ROW only, never the page). Hover only — no
 * entrance animation. Hover/scroll CSS: globals.css, .about-instructor-*. The
 * card carries its own accent ring and tokens there, so no other card on the
 * page shares them.
 *
 * The arrow_logo watermark behind each photo lives in InstructorPhotoPanel.
 */
export default function InstructorCardsSection({ cards = [] }) {
  if (!cards.length) return null;

  return (
    <AboutSection>
      <AboutSectionHeader
        title="เรียนกับผู้เชี่ยวชาญตัวจริง"
        intro="วิทยากรที่ใช้เครื่องมือเหล่านี้ในงานจริง และได้รับการรับรองจาก Microsoft"
      >
        <ul className="mt-6 flex flex-wrap justify-center gap-3">
          <li className="about-pill about-pill--th">Microsoft MVP &amp; Certified Trainer</li>
          <li className="about-pill about-pill--th">ประสบการณ์สอนกว่า 10 ปี</li>
        </ul>
      </AboutSectionHeader>

      {/* A focusable region so keyboard users can scroll the mobile row. */}
      <div role="region" tabIndex={0} aria-label="รายชื่อวิทยากร" className="about-instructor-scroller mt-12 lg:mt-14">
        <ul data-reveal-group="" className="about-instructor-row">
          {cards.map((c) => (
            <li key={c.id} data-reveal="" className="about-instructor">
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
                  page, or is a plain image when that page is unpublished. */}
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
    </AboutSection>
  );
}
