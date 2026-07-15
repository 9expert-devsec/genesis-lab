import { Children } from 'react';
import { cn } from '@/lib/utils';
import { columnsClass } from '@/lib/pageBuilder/presets';

/**
 * highlight_grid — like card_grid, but each child section sits in an
 * accent-emphasised box (accent left border). Server component.
 */
export function HighlightGridSection({ layout, children }) {
  const kids = Children.toArray(children);
  if (!kids.length) return null;
  return (
    <div className={cn('grid gap-6', columnsClass(layout?.columns))}>
      {kids.map((child, i) => (
        <div
          key={i}
          className="rounded-9e-lg border border-[var(--surface-border)] border-l-4 border-l-[color:var(--pb-accent-fill)] bg-9e-ice/50 p-6 dark:bg-[#0D1B2A]/40"
        >
          {child}
        </div>
      ))}
    </div>
  );
}
