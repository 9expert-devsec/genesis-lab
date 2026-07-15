import { cn } from '@/lib/utils';
import { cardSurfaceClass } from '@/lib/pageBuilder/presets';
import { lucideIcon } from '@/lib/pageBuilder/lucideIcon';

/**
 * icon_card — an icon + title + description feature card. Server component,
 * self-contained. Card surface from `style.cardStyle`; the icon takes the
 * section accent inside a tinted chip.
 *
 * Fails closed on RAW content, not on the resolved icon: with no title, no
 * description, and no icon NAME it renders NOTHING (so sectionRendersEmpty —
 * which cannot resolve a Lucide component — can mirror the same check from the
 * strings alone). A set-but-unknown icon name renders the card without a chip;
 * the editor warns about the name.
 */
export function IconCardSection({ content, style }) {
  const title = typeof content?.title === 'string' ? content.title : '';
  const description = typeof content?.description === 'string' ? content.description : '';
  const iconName = typeof content?.icon === 'string' ? content.icon.trim() : '';
  if (!title.trim() && !description.trim() && !iconName) return null;

  const Icon = lucideIcon(iconName);

  return (
    <div className={cn('rounded-9e-lg p-6', cardSurfaceClass('icon_card', style))}>
      {Icon && (
        <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-9e-md bg-[color:var(--pb-accent-fill)]/10 text-[var(--pb-accent-fill)]">
          <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
        </div>
      )}
      {title.trim() && <h3 className="font-heading text-lg font-bold">{title}</h3>}
      {description.trim() && (
        <p className="mt-1.5 whitespace-pre-line text-9e-slate-dp-50 dark:text-[#94a3b8]">{description}</p>
      )}
    </div>
  );
}
