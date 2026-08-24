import Link from 'next/link';
import { cn } from '@/lib/utils';
import { accentButtonClass } from '@/lib/pageBuilder/presets';
import { safeUrl, isExternalUrl } from '@/lib/pageBuilder/safeUrl';

/**
 * cta — heading + description + a single button. Server component. The button
 * colour follows the section accent (via --pb-accent-* set by the renderer),
 * so buttonStyle is a treatment (primary/secondary/outline/ghost), not a fixed
 * brand colour. Shape/motion match the site Button. The button only renders
 * with a valid label AND a safe href.
 */
const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-9e-xl px-6 py-3 ' +
  'font-en font-semibold transition-all duration-9e-micro ease-9e ' +
  'hover:-translate-y-[2px] hover:shadow-9e-md';

/**
 * ── ROUND 57: THE SECOND BUTTON ───────────────────────────────────────────
 * docs/promotion-page-coverage.md §G step 2. Both live promotion pages close
 * with two actions (สอบถาม LINE + ดูตารางอบรมอื่น ๆ) and page B's hero opens
 * with two; the type offered one pair, so §B counted it twice.
 *
 * THE SAME PAIR-GUARD, NOT A NEW RULE. The primary button has always rendered
 * only with a non-empty label AND a safe href — a label with no href draws
 * nothing rather than a dead button, and an href with no label draws nothing
 * rather than an empty one. The second button is read exactly that way, so a
 * half-filled pair is invisible on both.
 *
 * BOTH FIELDS DEFAULT TO '' AND ABSENT RENDERS NOTHING (§H). This ADDS
 * something no page has shown, so it is the opposite of round 50's `showPrice`,
 * which defaults ON because it REMOVES something every card shows.
 *
 * The wrapper's layout classes are CONDITIONAL on there actually being two
 * buttons. A cta with one button must emit the `mt-6` div exactly as it always
 * did, or every stored cta changes — which is the byte-identity §H requires.
 *
 * The second button takes a fixed outline treatment rather than a second
 * `buttonStyle`. A style prop would need a capability declaration in
 * SECTION_STYLE_CAPS and a control derived from it (2C.3); the section has ONE
 * accent and one button treatment, and the secondary reads as secondary by
 * being outlined.
 *
 * IT PAINTS WITH SURFACE TOKENS, NOT THE ACCENT, and that is not a style
 * preference. The accent belongs to the PRIMARY action — two accent-coloured
 * buttons side by side say "these are equally important", which is the opposite
 * of what a secondary is for. It is also what keeps `cta` out of the set of
 * components that read `--pb-accent-*` directly: an earlier draft used the
 * accent text var here and settingsPanelTabs went red, because that set is
 * pinned to a comment claiming a gap is closed. Widening it would have made
 * that sentence false for a decoration.
 */
const BTN_SECONDARY =
  'border border-[var(--surface-border)] text-9e-navy dark:text-white ' +
  'hover:bg-[var(--surface-muted)]';

export function CtaSection({ content, style }) {
  const heading = typeof content?.heading === 'string' ? content.heading : '';
  const description = typeof content?.description === 'string' ? content.description : '';
  const label = typeof content?.buttonLabel === 'string' ? content.buttonLabel.trim() : '';
  const href = safeUrl(content?.buttonHref);
  const label2 = typeof content?.secondaryButtonLabel === 'string' ? content.secondaryButtonLabel.trim() : '';
  const href2 = safeUrl(content?.secondaryButtonHref);

  const showPrimary = Boolean(label && href);
  const showSecondary = Boolean(label2 && href2);

  return (
    <div className="text-center">
      {heading.trim() && (
        <h2 className="font-heading text-2xl font-bold md:text-3xl">{heading}</h2>
      )}
      {description.trim() && (
        <p className="mx-auto mt-3 max-w-2xl text-9e-slate-dp-50 dark:text-[#94a3b8]">{description}</p>
      )}
      {(showPrimary || showSecondary) && (
        <div
          className={cn(
            'mt-6',
            // Only when there are genuinely two — see the header. With one
            // button this must stay exactly `mt-6`.
            showPrimary && showSecondary && 'flex flex-wrap items-center justify-center gap-3'
          )}
        >
          {showPrimary && (
            <Link
              href={href}
              className={cn(BTN_BASE, accentButtonClass('cta', style))}
              {...(isExternalUrl(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {label}
            </Link>
          )}
          {showSecondary && (
            <Link
              href={href2}
              className={cn(BTN_BASE, BTN_SECONDARY)}
              {...(isExternalUrl(href2) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {label2}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
