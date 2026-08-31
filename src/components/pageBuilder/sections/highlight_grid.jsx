import { Children } from 'react';
import { cn } from '@/lib/utils';
import { columnsClass } from '@/lib/pageBuilder/presets';

/**
 * highlight_grid — like card_grid, but each child section sits in an
 * accent-emphasised box (accent left border). Server component.
 *
 * ── ROUND 70: THE BOX STRETCHES; ITS CHILD HAD TO BE TOLD TO ─────────────
 * Round 29 built the per-child box, and because that box is the GRID ITEM it
 * has always been full row height — measured at 348px across four cards of
 * four different label lengths, while the <section> inside it was
 * 168/204/300/204. That is why this layout LOOKED equal-height and card_grid
 * did not: here you see the box, there you see the card surface. The defect was
 * the same in both, one element further in.
 *
 * `grid` on the box is what fixes it, and it is chosen over `flex`+`flex-1`
 * because the box holds EXACTLY ONE child: a single-cell grid stretches that
 * child on both axes with no class on the child at all, which this component
 * cannot add — it receives `{child}` already rendered by SectionRenderer.
 * A stretched section then gives SectionRenderer's own `h-full` container a
 * definite height to resolve against, and the card surface fills.
 */
export function HighlightGridSection({ layout, children }) {
  const kids = Children.toArray(children);
  if (!kids.length) return null;
  return (
    <div className={cn('grid gap-6', columnsClass(layout?.columns))}>
      {kids.map((child, i) => (
        <div
          key={i}
          className="grid rounded-9e-lg border border-[var(--surface-border)] border-l-4 border-l-[color:var(--pb-accent-fill)] bg-9e-ice/50 p-6 dark:bg-[#0D1B2A]/40"
        >
          {child}
        </div>
      ))}
    </div>
  );
}
