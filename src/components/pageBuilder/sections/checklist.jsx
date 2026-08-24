import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * checklist — a list of ticked/unticked items. Server component. Matches the
 * course "objectives" list convention (flex row: marker + text) but with a
 * check marker in the section accent colour. Body text inherits (readable);
 * the check icon is decorative.
 */
/**
 * ── ROUND 57: THE HEADING ─────────────────────────────────────────────────
 * docs/promotion-page-coverage.md §G step 3. Both live promotion pages carry
 * two titled bullet boxes — เงื่อนไขโปรโมชัน and หมายเหตุ — and §B #17 counted
 * the gap. The box's TINT is not part of this: the section background preset
 * already provides it, so only the title was missing.
 *
 * A string defaulting to '', absent renders nothing (§H). It ADDS, so it is the
 * opposite of round 50's `showPrice`.
 *
 * ── THE WRAPPER IS CONDITIONAL, for the same reason as heading's ──────────
 * This component returns a BARE <ul>. A title has to sit above it, and wrapping
 * unconditionally would change the root element of every stored checklist. So
 * the no-heading path returns exactly the <ul> it always returned.
 *
 * The title is a <p>, not an <h*>: the section tree has no idea what heading
 * level would be correct here, and emitting an h3 inside an arbitrary position
 * in the document outline would be a guess. Authors who need a real heading
 * have the `heading` type, one section above.
 */
export function ChecklistSection({ content }) {
  const items = Array.isArray(content?.items) ? content.items : [];
  const valid = items.filter((it) => typeof it?.text === 'string' && it.text.trim());
  if (!valid.length) return null;

  const heading = typeof content?.heading === 'string' ? content.heading.trim() : '';

  const list = (
    <ul className="space-y-2.5">
      {valid.map((it, i) => {
        const checked = it.checked !== false;
        const Icon = checked ? CheckCircle2 : Circle;
        return (
          <li key={i} className="flex items-start gap-2.5">
            <Icon
              className={cn('mt-0.5 h-5 w-5 shrink-0', checked ? 'text-[var(--pb-accent-fill)]' : 'text-9e-slate-dp-50')}
              strokeWidth={2}
              aria-hidden
            />
            <span>{it.text}</span>
          </li>
        );
      })}
    </ul>
  );
  if (!heading) return list;

  return (
    <div>
      <p className="mb-2.5 font-heading text-base font-bold">{heading}</p>
      {list}
    </div>
  );
}
