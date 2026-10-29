import { TEACHING_STEPS, WORKSHOP_ITEMS } from '@/lib/about/teaching';

/**
 * /about-us "เราสอนอย่างไร" — the four learning steps and the workshop block,
 * from src/lib/about/teaching.js.
 *
 * Background is var(--page-bg), not the mist of Proof/Story, so the band reads
 * as a new section; the step cards take the mist instead.
 */
export default function TeachingSection() {
  return (
    <section className="bg-[var(--page-bg)] px-4 py-20 lg:px-6 lg:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="font-heading text-3xl font-bold leading-snug text-[var(--text-primary)] md:text-[40px]">
            เราออกแบบประสบการณ์การเรียนรู้อย่างไร
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
            ทุกหลักสูตรเดินตามลำดับเดียวกัน — จากแนวคิด สู่การลงมือทำจริง
          </p>
        </div>

        <ol className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-14 lg:grid-cols-4 lg:gap-6">
          {TEACHING_STEPS.map((step, i) => (
            <li key={step.title} className="about-card about-step min-w-0 rounded-2xl bg-[var(--page-bg-muted)] p-4 lg:p-6">
              <span
                aria-hidden="true"
                className="about-step-num flex h-8 w-8 items-center justify-center rounded-full bg-9e-action text-sm font-bold text-white"
              >
                {i + 1}
              </span>
              <h3 className="mt-4 font-heading text-base font-bold leading-snug text-[var(--text-primary)] lg:text-lg">
                <span className="sr-only">ขั้นที่ {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {step.description}
              </p>
            </li>
          ))}
        </ol>

        <h3 className="mt-16 font-heading text-2xl font-bold text-[var(--text-primary)] lg:mt-20 lg:text-[28px]">
          เรียนรู้จาก Workshop ที่ใช้งานได้จริง
        </h3>
        <ol className="mt-8 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {WORKSHOP_ITEMS.map((item) => (
            <li
              key={item.number}
              className="about-card about-workshop grid min-w-0 grid-cols-[48px_1fr] gap-x-4 gap-y-1 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-5 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-x-3 lg:gap-y-3 lg:p-6"
            >
              <span
                aria-hidden="true"
                className="about-workshop-num row-span-2 font-heading text-3xl font-bold leading-none text-9e-action dark:text-9e-air lg:row-span-1 lg:text-4xl"
              >
                {item.number}
              </span>
              <h4 className="font-heading text-lg font-bold text-[var(--text-primary)]">{item.label}</h4>
              <p className="col-start-2 text-sm leading-relaxed text-[var(--text-secondary)] lg:col-span-2 lg:col-start-1">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
