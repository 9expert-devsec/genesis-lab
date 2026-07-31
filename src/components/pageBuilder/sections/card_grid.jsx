import { cn } from '@/lib/utils';
import { columnsClass, mobileBehaviorClass } from '@/lib/pageBuilder/presets';

/**
 * card_grid — child sections in a responsive grid (preset columns). Server
 * component. `carousel` mobile behaviour turns it into a horizontal snap
 * scroller below md.
 */
export function CardGridSection({ layout, children }) {
  const carousel = layout?.mobileBehavior === 'carousel';
  return (
    <div className={cn('grid gap-6', columnsClass(layout?.columns), carousel && mobileBehaviorClass('carousel'))}>
      {children}
    </div>
  );
}
