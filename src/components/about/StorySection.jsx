import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion/Reveal';
import { MILESTONES } from '@/lib/about/milestones';
import { quoteCardText } from '@/lib/about/aboutText';

/**
 * /about-us Story — the 20-year intro, the mission quote, and the milestone
 * timeline from src/lib/about/milestones.js.
 *
 * The quote card renders AboutConfig.tagline (see quoteCardText for the
 * fallback and the quote marks). AboutConfig.mission is NOT used: the live
 * document holds a short card title there ("หลักสูตรทันสมัย").
 *
 * Timeline: 6 equal columns at lg, each a marker with a rule running right to
 * the next one; below lg a vertical list, marker column on the left with a rule
 * down to the next item. No rule after the last item, whose marker is filled.
 */
export default function StorySection({ tagline }) {
  const lastIndex = MILESTONES.length - 1;

  return (
    <section className="bg-[var(--page-bg-muted)] px-4 py-20 lg:px-6 lg:py-24">
      <div className="mx-auto max-w-[1200px]">
        <Reveal y={16} className="max-w-[720px]">
          <h2 className="font-heading text-3xl font-bold leading-snug text-[var(--text-primary)] md:text-[40px]">
            <span className="block">กว่า 20 ปีที่องค์กร</span>
            <span className="block">และคนทำงานไว้วางใจเรา</span>
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
            ตั้งแต่ปี 2005 นายน์เอ็กซ์เพิร์ท (9Expert) ไม่หยุดพัฒนาหลักสูตรให้ทันเทคโนโลยี AI, Data
            และ Automation เรามุ่งหวังให้ทุกการเรียนรู้นำไปต่อยอดได้จริง ช่วยเพิ่มศักยภาพของบุคลากร
            ยกระดับประสิทธิภาพการทำงาน และสร้างคุณค่าให้กับองค์กร
          </p>
          <blockquote className="about-quote mt-8 flex gap-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-5 md:p-6">
            <span aria-hidden="true" className="about-quote-bar w-1 shrink-0 self-stretch rounded-full bg-9e-action" />
            <p className="text-lg font-bold leading-relaxed text-[var(--text-primary)] md:text-xl">
              {quoteCardText(tagline)}
            </p>
          </blockquote>
        </Reveal>

        <Reveal as="ol" y={16} delay={120} className="mt-14 grid lg:mt-16 lg:grid-cols-6">
          {MILESTONES.map((m, i) => {
            const isLast = i === lastIndex;
            return (
              <li key={m.year} className="about-ms relative min-w-0 pb-8 pl-9 last:pb-0 lg:pb-0 lg:pl-0 lg:pr-6">
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="about-ms-line absolute -bottom-1 left-[7px] top-6 w-0.5 bg-9e-signature-700 dark:bg-9e-action/50 lg:bottom-auto lg:left-[22px] lg:right-1 lg:top-2 lg:h-0.5 lg:w-auto"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    'about-ms-marker absolute left-0 top-1 h-4 w-4 rounded-full border-2 border-9e-action lg:static lg:block lg:h-[18px] lg:w-[18px]',
                    isLast ? 'about-ms-now bg-9e-action' : 'bg-[var(--surface-raised)]'
                  )}
                />
                <p className="about-ms-year font-heading text-2xl font-bold leading-tight text-9e-action dark:text-9e-air lg:mt-5 lg:text-[28px]">
                  {m.year}
                </p>
                <p className="mt-1 font-bold text-[var(--text-primary)] lg:mt-2">{m.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                  {m.description}
                </p>
              </li>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
