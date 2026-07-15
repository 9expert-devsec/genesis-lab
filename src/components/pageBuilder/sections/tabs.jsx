'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * tabs — a client component (genuine interactivity: switching panels). Item-
 * based (title/body, plain-text body). The active tab underline + label use
 * the section accent.
 */
export function TabsSection({ content }) {
  const tabs = (Array.isArray(content?.tabs) ? content.tabs : []).filter(
    (t) => t && (t.title || t.body)
  );
  const [active, setActive] = useState(0);
  if (!tabs.length) return null;
  const idx = Math.min(active, tabs.length - 1);

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--surface-border)]">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === idx}
            onClick={() => setActive(i)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
              i === idx
                ? 'border-[color:var(--pb-accent-fill)] text-[var(--pb-accent-text)]'
                : 'border-transparent text-9e-slate-dp-50 hover:text-9e-navy dark:hover:text-white'
            )}
          >
            {t.title || `แท็บ ${i + 1}`}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="whitespace-pre-line pt-4">
        {tabs[idx].body}
      </div>
    </div>
  );
}
