import { Children } from 'react';
import { cn } from '@/lib/utils';
import { columnsClass, mobileBehaviorClass } from '@/lib/pageBuilder/presets';

/**
 * card_grid — child sections in a responsive grid (preset columns). Server
 * component. `carousel` mobile behaviour turns it into a horizontal snap
 * scroller below md.
 *
 * ── ROUND E: THE PER-ITEM BOX, BACK FROM highlight_grid ───────────────────
 * `highlight_grid` drew a box around each child. Round 78 removed the accent
 * bar that was that type's distinguishing idea and round 80 retired it from the
 * picker — neither of which was a complaint about the box itself. Authors are
 * now pointed at `card_grid`, which had no way to draw one. `layout.itemFrame`
 * is that way, and ABSENT MEANS `none`, which emits the class attribute this
 * component emitted before the option existed.
 *
 * ── THE CLASS STRING IS COPIED, NOT RE-DERIVED, AND NOT SHARED ────────────
 * It is `highlight_grid`'s box verbatim. Three details in it are load-bearing
 * and NONE of them was decided here — each has its own paragraph in
 * sections/highlight_grid.jsx and is inherited from it:
 *
 *   `grid`       round 70. The box holds exactly one child, and a single-cell
 *                grid stretches it on both axes with no class on the child —
 *                which this component could not add anyway, because it receives
 *                children already rendered by SectionRenderer.
 *   `p-4 md:p-6` round 73. 768px is VIEWPORT_WIDTH.tablet in CanvasPanel, the
 *                same breakpoint the shell inset uses, so the two switch
 *                together.
 *   no accent    round 78 removed the 4px `--pb-accent-fill` left border at the
 *   border       author's request. It is not coming back here as "the highlight
 *                look" — this option is the BOX, which is what was asked for.
 *
 * A COPY rather than a shared constant, deliberately. `highlight_grid` is
 * RETIRED: it survives so stored sections keep rendering, and it is the kind of
 * module that eventually goes away. Importing its box into a live type would
 * couple this one to a dying one, and deleting it later would be a change to
 * `card_grid` nobody reviewing that deletion would expect. The drift a shared
 * constant would prevent is prevented instead by a test that reads BOTH
 * component sources and asserts the two strings are equal
 * (test/render/cardGridItemFrame).
 *
 * ── CAROUSEL STILL TARGETS THE RIGHT ELEMENT ─────────────────────────────
 * `mobileBehaviorClass('carousel')` styles the grid's DIRECT children
 * (`max-md:[&>*]:min-w-[80%]`, `max-md:[&>*]:snap-start`). With a frame those
 * children are the BOXES rather than the sections, which is the correct target:
 * the box is the thing that should be 80% wide and the thing that should snap.
 * The section inside it stretches to the box because the box is a single-cell
 * grid. `card_grid` honours carousel and `highlight_grid` never did, so this
 * combination has never existed before — the structure is asserted in the test
 * tier; the resulting WIDTHS are a browser measurement nobody has taken.
 */
const ITEM_FRAME_CLASS =
  'grid rounded-9e-lg border border-[var(--surface-border)] bg-9e-ice/50 p-4 md:p-6 dark:bg-[#0D1B2A]/40';

export function CardGridSection({ layout, children }) {
  const carousel = layout?.mobileBehavior === 'carousel';
  const framed = layout?.itemFrame === 'bordered';
  return (
    <div className={cn('grid gap-6', columnsClass(layout?.columns), carousel && mobileBehaviorClass('carousel'))}>
      {/* The unframed branch renders `children` UNTOUCHED — not mapped, not
          re-keyed, not wrapped — because the byte-identity claim is about this
          expression and not about a transform that happens to be a no-op. */}
      {framed
        ? Children.toArray(children).map((child, i) => (
            <div key={i} className={ITEM_FRAME_CLASS}>{child}</div>
          ))
        : children}
    </div>
  );
}
