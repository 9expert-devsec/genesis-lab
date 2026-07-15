import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * checklist — a list of ticked/unticked items. Server component. Matches the
 * course "objectives" list convention (flex row: marker + text) but with a
 * check marker in the section accent colour. Body text inherits (readable);
 * the check icon is decorative.
 */
export function ChecklistSection({ content }) {
  const items = Array.isArray(content?.items) ? content.items : [];
  const valid = items.filter((it) => typeof it?.text === 'string' && it.text.trim());
  if (!valid.length) return null;

  return (
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
}
