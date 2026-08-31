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
 *
 * ── ROUND 73: THE BOX IS TIGHTER ON A PHONE, AND ONLY ON A PHONE ─────────
 * `p-6` became `p-4 md:p-6` — 16px a side below 768px, 24px from it.
 * docs/mobile-padding.md §D measured this box as the ONE layer that compounds
 * beyond the shell inset: every other container costs 32px a level at 390px
 * and this one cost 80px, because its per-child surface adds 24px a side on
 * top. It is a CARD SURFACE and not a page margin, which is why it is reduced
 * rather than removed.
 *
 * 768px is VIEWPORT_WIDTH.tablet in editor/CanvasPanel (round 65's rule), the
 * same breakpoint the shell inset uses, so the two changes switch together
 * and an author checking the tablet button sees one consistent desktop
 * layout.
 *
 * THE ACCENT RULE IS UNTOUCHED. Round 24 gave this box its left border and
 * the treatment reads off the border, not the padding: measured at 390px with
 * one, two and four children, the rule stays 4px and only the gap between it
 * and the text tightens. Desktop is unchanged.
 */
export function HighlightGridSection({ layout, children }) {
  const kids = Children.toArray(children);
  if (!kids.length) return null;
  return (
    <div className={cn('grid gap-6', columnsClass(layout?.columns))}>
      {kids.map((child, i) => (
        <div
          key={i}
          className="grid rounded-9e-lg border border-[var(--surface-border)] border-l-4 border-l-[color:var(--pb-accent-fill)] bg-9e-ice/50 p-4 md:p-6 dark:bg-[#0D1B2A]/40"
        >
          {child}
        </div>
      ))}
    </div>
  );
}
