import { cn } from '@/lib/utils';
import { spacingBetweenClass } from '@/lib/pageBuilder/presets';

/**
 * full_width — a container that stacks its child sections vertically, each
 * spanning the full width of the section box. Server component. Recursion is
 * owned by the renderer: `children` are already-rendered child sections.
 */
/**
 * ── ROUND 71: THE GAP BETWEEN CHILDREN IS THE AUTHOR'S NOW ────────────────
 * Same field, same map and the same absent-means-32px rule as `container` —
 * see the longer note there. These two are the only types that honour it
 * (presets.SPACING_BETWEEN_TYPES), because they are the only ones whose
 * children are a single vertical stack with exactly one gap.
 */
export function FullWidthSection({ children, settings }) {
  return (
    <div className={cn('flex flex-col', spacingBetweenClass(settings?.spacingBetween))}>
      {children}
    </div>
  );
}
