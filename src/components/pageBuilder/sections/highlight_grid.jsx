import { Children } from 'react';
import { cn } from '@/lib/utils';
import { columnsClass } from '@/lib/pageBuilder/presets';

/**
 * highlight_grid — like card_grid, but each child section sits in its own
 * bordered, padded box. Server component.
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
 * ── ROUND 78: THE ACCENT RULE IS GONE ───────────────────────────────────
 * Round 24 gave this box a 4px left border painted from `--pb-accent-fill`,
 * and rounds 70/73 both preserved it deliberately. It is now removed at the
 * author's request. What that leaves, measured on the live page:
 *
 *   border      1px on ALL FOUR sides, `--surface-border` — unchanged
 *   radius      16px (rounded-9e-lg) — unchanged
 *   padding     16px below 768px, 24px from it — unchanged
 *   surface     bg-9e-ice/50, dark:bg-[#0D1B2A]/40 — unchanged
 *
 * Only the left border's WIDTH and COLOUR change: 4px accent → 1px
 * `--surface-border`, matching the other three. Before the change the live
 * page carried four boxes at `border-left-width: 4px` in
 * rgb(0,92,255)/rgb(31,193,126); after, all four sides read 1px.
 *
 * ── THIS REMOVES THE TYPE'S ONLY ACCENT CONSUMER ────────────────────────
 * `--pb-accent-fill` had exactly one reader in this file and it was this
 * border. With it gone, `style.accentColor` on a `highlight_grid` changes
 * nothing that this component paints — the accent still cascades to the
 * CHILDREN, which is why the control is not withdrawn. The count of types
 * whose OWN markup reads an accent variable drops by one; see
 * docs/page-builder-status.md and the note in presets.js on the
 * `--pb-accent-*` contract.
 *
 * The pinning test that guarded the border classes (round 73's
 * test/fs/mobilePaddingScale.test.mjs §E) is updated in the same commit —
 * it existed so the bar could not be removed as a side effect of a spacing
 * change, and this is not one: it is the removal, asked for by name.
 */
export function HighlightGridSection({ layout, children }) {
  const kids = Children.toArray(children);
  if (!kids.length) return null;
  return (
    <div className={cn('grid gap-6', columnsClass(layout?.columns))}>
      {kids.map((child, i) => (
        <div
          key={i}
          className="grid rounded-9e-lg border border-[var(--surface-border)] bg-9e-ice/50 p-4 md:p-6 dark:bg-[#0D1B2A]/40"
        >
          {child}
        </div>
      ))}
    </div>
  );
}
