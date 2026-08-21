'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * accordion — a client component (genuine interactivity: expand/collapse).
 * Item-based (title/body, plain-text body). Single-open behaviour. The OPEN
 * item's chevron and title take the section accent.
 *
 * ── IT FOLLOWS tabs, WHICH IS THE SAME COMPONENT WITH A DIFFERENT HINGE ────
 * Both were built in the same round, both are item lists with exactly one
 * active member, and until round 24 `tabs` accented its active member and this
 * accented nothing — two siblings differing for no stated reason (round 18,
 * finding 6). Read off tabs.jsx rather than off a note about it, the active
 * branch is ONE ternary setting TWO things:
 *
 *   the underline  → --pb-accent-fill   the ornament that marks which is active
 *   the label      → --pb-accent-text   the active control's own text
 *
 * Mapped onto this shape: the rotating chevron IS the underline (it is the mark
 * that says which item is open) and the item title IS the label. So the chevron
 * lands in the ornament role and the title in the text role — the same split,
 * not a new one.
 *
 * ── WHY AN ACCENTED TITLE IS NOT THE RULE ABOUT BODY COPY ──────────────────
 * "Headings and body copy are never accented" holds across every consumer, and
 * this does not breach it. The accented run is a BUTTON'S OWN LABEL IN ITS
 * ACTIVE STATE — the category the pattern already admits for the text role,
 * alongside a price, a stat value and a link. What the rule forbids is the
 * static prose beside it, and that stays: the item BODY keeps its muted text,
 * and a CLOSED item's title keeps the ordinary heading colour, exactly as an
 * inactive tab does.
 *
 * ── ONE ASYMMETRY WITH tabs, RECORDED RATHER THAN COPIED ───────────────────
 * An inactive tab is MUTED and its active sibling reads as the emphasis. Here
 * every title is full strength whether open or not, so the accent adds emphasis
 * rather than restoring it. That is a visual-weight question, not a correctness
 * one, and closing it would mean muting closed titles — a change to how the
 * component reads when no accent is involved at all. Left for a round that
 * wants to argue it.
 */
export function AccordionSection({ content }) {
  const items = (Array.isArray(content?.items) ? content.items : []).filter(
    (it) => it && (it.title || it.body)
  );
  const [open, setOpen] = useState(null);
  if (!items.length) return null;

  return (
    /*
      The box's own border and dividers stay neutral, and this is a JUDGEMENT
      rather than one of the two rules — flagged so a later round can overturn
      it on purpose. `highlight_grid` does accent a border, so the pattern
      permits it; but that is a decorative left-hand RULE on a cell, whereas
      this is the component's structural boundary. Accenting a container's own
      outline is not something any of the consumers does.
    */
    <div className="divide-y divide-[var(--surface-border)] rounded-9e-md border border-[var(--surface-border)]">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold',
                isOpen
                  ? 'text-[var(--pb-accent-text)]'
                  : 'text-9e-navy dark:text-white'
              )}
            >
              <span>{it.title || `รายการ ${i + 1}`}</span>
              {/*
                Written as an explicit two-branch ternary rather than appending
                the accent to a base that already carries the resting colour.
                Both would render the same — cn is tailwind-merge and the later
                colour wins — but only this way is the resting state visible at
                the call site instead of implied by merge order.
              */}
              <ChevronDown
                className={cn(
                  'h-5 w-5 shrink-0 transition-transform',
                  isOpen ? 'rotate-180 text-[var(--pb-accent-fill)]' : 'text-9e-slate-dp-50'
                )}
                aria-hidden
              />
            </button>
            {isOpen && (
              /*
                UNTOUCHED, and it is the rule rather than a preference: the item
                body is prose. It keeps its muted text in both themes.
              */
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
