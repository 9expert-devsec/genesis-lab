import { cn } from '@/lib/utils';
import { cardSurfaceClass } from '@/lib/pageBuilder/presets';
import { lucideIcon } from '@/lib/pageBuilder/lucideIcon';

/**
 * stat_card — a single headline metric (value + label, optional Lucide icon).
 * Server component, self-contained. Card surface from `style.cardStyle`; the
 * value + icon take the section accent.
 *
 * Fails closed: a lone icon is not a statistic, so with no value AND no label
 * it renders NOTHING (editor warns; tree marks it). An unknown icon name simply
 * resolves to null — the card still renders its value/label, the editor flags
 * the bad name.
 */
export function StatCardSection({ content, style }) {
  const value = typeof content?.value === 'string' ? content.value : '';
  const label = typeof content?.label === 'string' ? content.label : '';
  if (!value.trim() && !label.trim()) return null;

  const Icon = lucideIcon(content?.icon);

  return (
    <div className={cn('h-full rounded-9e-lg p-6 text-center', cardSurfaceClass('stat_card', style))}>
      {Icon && (
        <Icon className="mx-auto mb-2 h-8 w-8 text-[var(--pb-accent-fill)]" strokeWidth={2} aria-hidden />
      )}
      {value.trim() && (
        <div className="font-heading text-3xl font-bold text-[var(--pb-accent-text)] md:text-4xl">{value}</div>
      )}
      {label.trim() && (
        <div className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">{label}</div>
      )}
    </div>
  );
}
