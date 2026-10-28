import Image from 'next/image';
import { specialtiesLine } from '@/lib/instructors/instructorSpecialties';

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
 * The brief's arrow_logo watermark behind the photo is omitted: no SVG of the
 * mark exists in the repo (only raster logos), so it cannot be recoloured.
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

              {/* Head-and-chest crop: the photo renders far larger than the
                  panel (see .about-instructor-crop), anchored top-centre, and
                  the panel's overflow:hidden cuts it around mid-chest. The
                  frame is ~1.3× the panel width, so `sizes` asks for that. */}
              <div className="about-instructor-panel mt-5">
                {c.imageUrl && (
                  <div className="about-instructor-crop">
                    <Image
                      src={c.imageUrl}
                      alt={c.name}
                      fill
                      sizes="(min-width: 1024px) 440px, (min-width: 768px) 60vw, 110vw"
                      className="about-instructor-photo object-contain object-top"
                    />
                  </div>
                )}
              </div>

              {c.specialties.length > 0 && (
                <div className="mt-5 text-left">
                  <p className="text-sm font-bold text-9e-lime">เชี่ยวชาญด้าน:</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/[0.85]">
                    {specialtiesLine(c.specialties)}
                  </p>
                </div>
              )}

              {c.programs.length > 0 && (
                <ul className="mt-auto flex flex-wrap gap-2 pt-5" aria-label={`โปรแกรมที่ ${c.name} สอน`}>
                  {c.programs.map((p) => (
                    <li key={p.name} title={p.name} className="about-instructor-tile">
                      <Image src={p.iconUrl} alt={p.name} width={20} height={20} className="h-5 w-5 object-contain" />
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
