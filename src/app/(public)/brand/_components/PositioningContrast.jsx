import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_POSITIONING } from '../brandContent';

/**
 * Brand Positioning, drawn as the two-point contrast the source asks for rather
 * than as a paragraph.
 *
 * The point of a positioning statement is the GAP between what everyone else
 * does and what we do; a paragraph makes the reader hold both halves in their
 * head and infer it. Two panels side by side put the comparison on the page,
 * which is why the reference specifies this shape explicitly.
 *
 * ── THE EMPHASIS IS DATA, NOT MARKUP ────────────────────────────────────────
 * `isOurs` comes from brandContent, so which half is 9Expert's is stated once,
 * next to the copy, rather than being implied by which panel happens to be
 * second here. Swapping the order in the data would move the emphasis with it.
 */
export function PositioningContrast() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BRAND_POSITIONING.points.map((point) => (
        <div
          key={point.key}
          className={cn(
            'flex items-start gap-3 rounded-9e-md border p-4',
            point.isOurs
              ? 'border-9e-action/30 bg-9e-action/5'
              : 'border-[var(--surface-border)] bg-[var(--surface-muted)]',
          )}
        >
          {point.isOurs ? (
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-9e-action text-white dark:bg-9e-air dark:text-9e-navy">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
          ) : (
            // A hollow counterpart rather than nothing, so the two panels share
            // a baseline and the copy starts at the same x on both sides.
            <span
              className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-[var(--surface-border)]"
              aria-hidden="true"
            />
          )}
          <p
            className={cn(
              'text-sm leading-relaxed',
              point.isOurs
                ? 'font-semibold text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)]',
            )}
          >
            {point.copy}
          </p>
        </div>
      ))}
    </div>
  );
}
