import { Hand, Lightbulb, MessagesSquare, Presentation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AboutSection, AboutSectionHeader } from '@/components/about/AboutSection';
import { TEACHING_STEPS, WORKSHOP_ITEMS } from '@/lib/about/teaching';

/**
 * /about-us "เราสอนอย่างไร" — the four learning steps and the workshop block,
 * from src/lib/about/teaching.js. Two different shapes (round AB-3c), so the
 * reader is pulled through rather than shown the same grid twice:
 *
 *  · the steps are a PROCESS ROW — an icon circle per step on a dashed
 *    connector (lg only, behind the circles), number, title, text; the last
 *    circle is filled with the accent, the result of the path. No boxes, no
 *    motion;
 *  · the workshop is an EDITORIAL SPLIT — the page's own 70% figure (step 3's
 *    text) on a panel left, the three parts as a ruled list right, equal
 *    height at lg.
 */
const STEP_ICONS = [Lightbulb, Presentation, Hand, MessagesSquare];

export default function TeachingSection() {
  const last = TEACHING_STEPS.length - 1;

  return (
    <AboutSection>
      <AboutSectionHeader
        title="เราออกแบบประสบการณ์การเรียนรู้อย่างไร"
        intro="ทุกหลักสูตรเดินตามลำดับเดียวกัน — จากแนวคิด สู่การลงมือทำจริง"
      />

      <div className="relative mt-12 lg:mt-14">
        {/* Connector: circle centre (12.5% of the row) to circle centre
            (87.5%), at the circles' vertical centre, behind them. */}
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] right-[12.5%] top-7 hidden border-t border-dashed border-[var(--ab-hairline-2)] lg:block"
        />
        <ol data-reveal-group="" className="relative grid gap-10 text-center md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {TEACHING_STEPS.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? Lightbulb;
            const isLast = i === last;
            return (
              <li key={step.title} data-reveal="" className="flex min-w-0 flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative z-10 flex h-14 w-14 items-center justify-center rounded-full border',
                    isLast
                      ? 'border-[var(--ab-accent)] bg-[var(--ab-accent)] text-white dark:text-9e-navy'
                      : 'border-[var(--ab-hairline-2)] bg-[var(--ab-panel)] text-[var(--ab-accent)]'
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <p aria-hidden="true" className="mt-5 !font-heading text-[28px] font-bold leading-none text-[var(--ab-accent)] tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-3 font-heading text-lg font-bold leading-[1.4] text-[var(--ab-bright)]">
                  <span className="sr-only">ขั้นที่ {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-[var(--ab-read)]">
                  {step.description}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-20 lg:mt-24">
        <AboutSectionHeader as="h3" title="เรียนรู้จาก Workshop ที่ใช้งานได้จริง" />
        <div data-reveal-group="" className="mt-10 grid gap-6 lg:mt-12 lg:grid-cols-12 lg:items-stretch lg:gap-10">
          <div data-reveal="" className="flex flex-col justify-center rounded-lg bg-[var(--ab-panel-2)] p-8 lg:col-span-5 lg:p-12">
            <p className="!font-heading text-[56px] font-bold leading-none text-[var(--ab-accent)] tabular-nums lg:text-[72px]">
              70%
            </p>
            <p className="mt-4 text-lg leading-relaxed text-[var(--ab-bright)]">ของเวลาเรียน คือการลงมือทำ</p>
          </div>
          <ol className="flex flex-col divide-y divide-[var(--ab-hairline)] border-y border-[var(--ab-hairline)] lg:col-span-7">
            {WORKSHOP_ITEMS.map((item) => (
              <li key={item.number} data-reveal="" className="grid flex-1 grid-cols-[48px_minmax(0,1fr)] content-center gap-x-4 py-6">
                <span aria-hidden="true" className="!font-heading text-xl font-bold leading-[1.4] text-[var(--ab-accent)] tabular-nums">
                  {item.number}
                </span>
                <div className="min-w-0">
                  <h4 className="font-heading text-lg font-bold leading-[1.4] text-[var(--ab-bright)]">{item.label}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--ab-read)]">{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AboutSection>
  );
}
