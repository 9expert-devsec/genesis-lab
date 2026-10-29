import { cn } from '@/lib/utils';

/**
 * The /about-us section frame (round AB-3, "Modern"): no background of its own
 * — every section sits on the one ground <main> paints — and a 1px hairline on
 * the 1200px container, not full-bleed, so the column edges match the header
 * and every other section. The hairline plus the vertical rhythm is the only
 * thing that marks a section boundary.
 *
 * `rule={false}` drops the hairline for a section that continues the one
 * above it (Proof, whose stats row anchors the bottom of the hero).
 */
export function AboutSection({ children, className, innerClassName, rule = true }) {
  return (
    <section className={cn('relative isolate px-4 lg:px-6', className)}>
      <div
        className={cn(
          'mx-auto max-w-[1200px] py-20 lg:py-24',
          rule && 'border-t border-[var(--ab-hairline)]',
          innerClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Section header, CENTRED (round AB-3c, back to the AB-2 arrangement): the
 * heading, the intro directly below it (720px), and any pills below that.
 * Headings are LINE Seed Sans TH Bold (the CI). Spans inside the heading need
 * the class-level override because globals.css forces every span to Google
 * Sans with !important. Thai keeps normal tracking and a line-height of 1.3.
 */
export function AboutSectionHeader({ title, intro, children, as: Heading = 'h2' }) {
  return (
    <div data-reveal="" className="mx-auto max-w-[720px] text-center">
      <Heading className="font-heading text-3xl font-bold leading-[1.3] text-[var(--ab-bright)] md:text-[30px] [&_span]:!font-heading">
        {title}
      </Heading>
      {intro && (
        <p className="mt-4 text-base leading-relaxed text-[var(--ab-read)] md:text-lg">{intro}</p>
      )}
      {children}
    </div>
  );
}
