import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardSurfaceClass, accentButtonClass } from '@/lib/pageBuilder/presets';
import { safeUrl, isExternalUrl } from '@/lib/pageBuilder/safeUrl';

/**
 * price_card — a self-contained pricing card. Server component (renders from
 * its own `content`, no upstream fetch). Card surface comes from
 * `style.cardStyle`; the button colour follows the section accent, its
 * treatment from `style.buttonStyle` — the SAME contract as `cta`, so the two
 * are the buttonStyle reader-set (asserted in the loader check).
 *
 * Fails closed like the rest of the family: with no title, price, or features
 * there is nothing to show, so it renders NOTHING (the editor warns — see
 * SectionContentEditor — and the tree marks it, see sectionRendersEmpty). The
 * button is a second fail-closed path: it appears ONLY with a non-empty label
 * AND a safe href, exactly as `cta` does.
 */
const BTN_BASE =
  'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-9e-xl px-6 py-3 ' +
  'font-en font-semibold transition-all duration-9e-micro ease-9e ' +
  'hover:-translate-y-[2px] hover:shadow-9e-md';

export function PriceCardSection({ content, style }) {
  const title = typeof content?.title === 'string' ? content.title : '';
  const price = typeof content?.price === 'string' ? content.price : '';
  const period = typeof content?.period === 'string' ? content.period : '';
  const features = (Array.isArray(content?.features) ? content.features : []).filter(
    (f) => typeof f === 'string' && f.trim()
  );
  if (!title.trim() && !price.trim() && !features.length) return null;

  const label = typeof content?.buttonLabel === 'string' ? content.buttonLabel.trim() : '';
  const href = safeUrl(content?.buttonHref);
  const highlighted = content?.highlighted === true;

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-9e-lg p-6',
        cardSurfaceClass('price_card', style),
        // The accent ring is the ONE thing `highlighted` does — a self-contained
        // emphasis that needs no layout preset (columns live on the parent grid).
        highlighted && 'ring-2 ring-[color:var(--pb-accent-fill)]'
      )}
    >
      {title.trim() && <h3 className="font-heading text-lg font-bold">{title}</h3>}
      {price.trim() && (
        <p className="mt-2 font-heading text-3xl font-bold text-[var(--pb-accent-text)]">
          {price}
          {period.trim() && (
            <span className="ml-1 text-sm font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">{period}</span>
          )}
        </p>
      )}
      {features.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pb-accent-fill)]" strokeWidth={2.5} aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {label && href && (
        <Link
          href={href}
          className={cn(BTN_BASE, 'mt-auto', accentButtonClass('price_card', style))}
          {...(isExternalUrl(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
        </Link>
      )}
    </div>
  );
}
