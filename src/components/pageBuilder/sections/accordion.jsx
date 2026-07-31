'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * accordion — a client component (genuine interactivity: expand/collapse).
 * Item-based (title/body, plain-text body). Single-open behaviour.
 */
export function AccordionSection({ content }) {
  const items = (Array.isArray(content?.items) ? content.items : []).filter(
    (it) => it && (it.title || it.body)
  );
  const [open, setOpen] = useState(null);
  if (!items.length) return null;

  return (
    <div className="divide-y divide-[var(--surface-border)] rounded-9e-md border border-[var(--surface-border)]">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-9e-navy dark:text-white"
            >
              <span>{it.title || `รายการ ${i + 1}`}</span>
              <ChevronDown className={cn('h-5 w-5 shrink-0 text-9e-slate-dp-50 transition-transform', isOpen && 'rotate-180')} aria-hidden />
            </button>
            {isOpen && (
              <div className="whitespace-pre-line px-4 pb-4 text-9e-slate-dp-50 dark:text-[#94a3b8]">
                {it.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
