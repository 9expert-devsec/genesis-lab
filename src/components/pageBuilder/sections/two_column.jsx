import { cn } from '@/lib/utils';
import { ratioClass } from '@/lib/pageBuilder/presets';

/**
 * two_column — two child-section columns at a preset ratio, stacking below lg.
 * Server component. `left`/`right` are already-rendered child sections.
 * `reverse_stack` shows the right column first on mobile.
 */
export function TwoColumnSection({ layout, left, right }) {
  const reverse = layout?.mobileBehavior === 'reverse_stack';
  return (
    <div className={cn('grid grid-cols-1 gap-8', ratioClass(layout?.ratio))}>
      <div className={cn('flex flex-col gap-6', reverse && 'max-lg:order-2')}>{left}</div>
      <div className="flex flex-col gap-6">{right}</div>
    </div>
  );
}
