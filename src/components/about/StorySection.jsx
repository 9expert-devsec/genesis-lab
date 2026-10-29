import { cn } from '@/lib/utils';
import { AboutSection, AboutSectionHeader } from '@/components/about/AboutSection';
import { MILESTONES } from '@/lib/about/milestones';
import { quoteParts } from '@/lib/about/quoteParts';

/**
 * /about-us Story — the 20-year intro, the mission pull quote, and the
 * milestone timeline from src/lib/about/milestones.js.
 *
 * The pull quote renders AboutConfig.tagline (round AB-3c): no box, centred
 * between two short hairlines, a decorative opening mark drawn by CSS, and
 * the tagline's own quoted phrase as the accent emphasis — split by
 * quoteParts, so no quote character reaches the text. No attribution: there
 * is no real source to cite. AboutConfig.mission is NOT used: the live
 * document holds a short card title there ("หลักสูตรทันสมัย").
 *
 * Timeline: 6 equal columns at lg, each a small marker with a hairline running
 * right to the next one; below lg a vertical list, marker column on the left
 * with a hairline down to the next item. No rule after the last item. The last
 * (current) marker is the page's one --ab-signal dot; nothing pulses. A year
 * may hold more than one item, stacked under its one label.
 */
export default function StorySection({ tagline }) {
  const lastIndex = MILESTONES.length - 1;
  const quote = quoteParts(tagline);

  return (
    <AboutSection>
      <AboutSectionHeader
        title={
          <>
            <span className="block">กว่า 20 ปีที่องค์กร</span>
            <span className="block">และคนทำงานไว้วางใจเรา</span>
          </>
        }
        intro="ตั้งแต่ปี 2005 นายน์เอ็กซ์เพิร์ท (9Expert) ไม่หยุดพัฒนาหลักสูตรให้ทันเทคโนโลยี AI, Data และ Automation เรามุ่งหวังให้ทุกการเรียนรู้นำไปต่อยอดได้จริง ช่วยเพิ่มศักยภาพของบุคลากร ยกระดับประสิทธิภาพการทำงาน และสร้างคุณค่าให้กับองค์กร"
      />

      {/* <blockquote data-reveal="" className="mx-auto mt-12 max-w-[720px] text-center lg:mt-14">
        <span aria-hidden="true" className="mx-auto block h-px w-[120px] bg-[var(--ab-hairline)]" />
        <div className="py-8">
          <span aria-hidden="true" className="about-quote-mark" />
          <p className="mt-3 !font-heading text-2xl font-bold leading-[1.5] text-[var(--ab-bright)] lg:text-[30px] [&_span]:!font-heading">
            {quote.before}
            {quote.emphasis && (
              <span className="about-quote-emphasis text-[var(--ab-accent)] lg:block">{quote.emphasis}</span>
            )}
            {quote.after}
          </p>
        </div>
        <span aria-hidden="true" className="mx-auto block h-px w-[120px] bg-[var(--ab-hairline)]" />
      </blockquote> */}

      <ol data-reveal-group="" className="mt-14 grid lg:mt-16 lg:grid-cols-6">
        {MILESTONES.map((m, i) => {
          const isLast = i === lastIndex;
          return (
            <li key={m.year} data-reveal="" className="relative min-w-0 pb-8 pl-8 last:pb-0 lg:pb-0 lg:pl-0 lg:pr-6">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1.5 left-[4px] top-[26px] w-px bg-[var(--ab-hairline-2)] lg:bottom-auto lg:left-[18px] lg:right-2 lg:top-[4px] lg:h-px lg:w-auto"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-0 top-[10px] h-2.5 w-2.5 rounded-full lg:static lg:block',
                  isLast ? 'bg-[var(--ab-signal)]' : 'bg-[var(--ab-hairline-2)]'
                )}
              />
              <p className="!font-heading text-2xl font-bold leading-tight text-[var(--ab-bright)] tabular-nums lg:mt-5 lg:text-[28px]">
                {m.year}
              </p>
              {/* One or more items under the one year label, 12px apart. */}
              <ul className="mt-1 space-y-3 lg:mt-2">
                {m.items.map((it) => (
                  <li key={it.title}>
                    <p className="font-bold leading-snug text-[var(--ab-bright)]">{it.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ab-read)] [overflow-wrap:anywhere]">
                      {it.description}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </AboutSection>
  );
}
