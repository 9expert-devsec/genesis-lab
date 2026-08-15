'use client';

import { useId, useState } from 'react';
import { PolicyIcon } from './PolicyIcon';

/**
 * A generic disclosure list for the legal pages.
 *
 * ── WHY THIS DUPLICATES FaqClient, ON PURPOSE ───────────────────────────────
 * FaqClient already has an accordion. It is not reused and it is not
 * refactored, and that is a deliberate, temporary duplication:
 *
 *   FaqClient's disclosure is welded to the FAQ page's grouped-question data
 *   shape, and it drives a live page. Generalising it is a refactor of working
 *   production code in a round whose job is to add five new pages. Doing both at
 *   once means a regression on /faq is indistinguishable from a bug in the new
 *   pages.
 *
 * FOLLOW-UP, deliberately deferred: fold FaqClient onto this component once
 * these pages are settled. Whoever does it should expect FaqClient's grouping
 * behaviour to be the only real difference — this component takes a flat list
 * because none of the five legal pages needs groups.
 *
 * ── BEHAVIOUR ───────────────────────────────────────────────────────────────
 * Independent toggles, not a single-open set: legal sections get compared
 * against each other, so opening §5 must not close §4. Items opt into being
 * open on first paint via `defaultOpen`, which is how the Figma showed several
 * sections expanded.
 *
 * `body` is a ReactNode, so a server component can pass rendered JSX in.
 */
export function PolicyAccordion({ items, className = '' }) {
  const baseId = useId();
  const [open, setOpen] = useState(
    () => new Set(items.filter((it) => it.defaultOpen).map((it) => it.id)),
  );

  function toggle(id) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {items.map((item) => {
        const isOpen = open.has(item.id);
        const panelId = `${baseId}-${item.id}-panel`;
        const btnId = `${baseId}-${item.id}-button`;

        return (
          <div
            key={item.id}
            id={item.id}
            className="scroll-mt-24 overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)]"
          >
            <h3>
              <button
                type="button"
                id={btnId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full items-center gap-3 px-6 py-5 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-action focus-visible:ring-offset-0"
              >
                {item.icon && (
                  <PolicyIcon
                    name={item.icon}
                    className="h-5 w-5 shrink-0 text-9e-action dark:text-[#48B0FF]"
                  />
                )}
                <span className="flex-1 text-[15px] font-bold text-[var(--text-primary)]">
                  {item.number != null && (
                    <span className="mr-2 text-9e-action dark:text-[#48B0FF]">
                      {item.number}.
                    </span>
                  )}
                  {item.title}
                </span>
                <PolicyIcon
                  name="chevronDown"
                  className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </h3>

            {/* Unmounted rather than hidden when closed: the bodies hold long
                Thai legal prose, and leaving nine of them in the tree makes the
                page's text content nine sections longer than what is on screen
                for anything that reads the DOM. */}
            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={btnId}
                className="border-t border-[var(--surface-border)] px-6 py-5 text-[14px] leading-[1.8] text-[var(--text-secondary)]"
              >
                {item.body}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
