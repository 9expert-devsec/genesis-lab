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

export function CtaSection({ content, style }) {
  const heading = typeof content?.heading === 'string' ? content.heading : '';
  const description = typeof content?.description === 'string' ? content.description : '';
  const label = typeof content?.buttonLabel === 'string' ? content.buttonLabel.trim() : '';
  const href = safeUrl(content?.buttonHref);

  return (
    <div className="text-center">
      {heading.trim() && (
        <h2 className="font-heading text-2xl font-bold md:text-3xl">{heading}</h2>
      )}
      {description.trim() && (
        <p className="mx-auto mt-3 max-w-2xl text-9e-slate-dp-50 dark:text-[#94a3b8]">{description}</p>
      )}
      {label && href && (
        <div className="mt-6">
          <Link
            href={href}
            className={cn(BTN_BASE, accentButtonClass('cta', style))}
            {...(isExternalUrl(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {label}
          </Link>
        </div>
      )}
    </div>
  );
}
