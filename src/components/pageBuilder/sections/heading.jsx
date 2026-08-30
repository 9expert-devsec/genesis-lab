import { cn } from '@/lib/utils';

/**
 * heading — a standalone H1–H6. Server component. Inherits the page/section
 * text colour (accent is not applied to headings by default). Level and
 * alignment come from the tightened content schema.
 */
const LEVEL_CLASS = {
  h1: 'text-3xl font-bold md:text-4xl',
  h2: 'text-2xl font-bold md:text-3xl',
  h3: 'text-xl font-bold md:text-2xl',
  h4: 'text-lg font-bold md:text-xl',
  h5: 'text-base font-bold md:text-lg',
  h6: 'text-sm font-bold md:text-base',
};
const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' };

/**
 * ── ROUND 57: THE EYEBROW ─────────────────────────────────────────────────
 * docs/promotion-page-coverage.md §G step 3. Page B opens its detail section
 * with a small "PROMOTION DETAILS" line above the heading proper; §B #25
 * counted the gap.
 *
 * A string defaulting to '', absent renders nothing (§H) — it ADDS something no
 * page has shown, so it is the opposite of round 50's `showPrice`, which
 * defaults ON because it REMOVES something every card shows.
 *
 * ── THE WRAPPER IS CONDITIONAL, AND THAT IS THE WHOLE BYTE-IDENTITY TRICK ──
 * This component returns a BARE heading element. An eyebrow has to sit above
 * it, which needs a wrapper — and wrapping unconditionally would change the
 * root element of EVERY stored heading, the most-used type in the system (17
 * stored on this clone). So the no-eyebrow path returns exactly what it always
 * returned, and the wrapper exists only when there is an eyebrow to place.
 *
 * The alignment moves to the wrapper in that case, so the eyebrow and the
 * heading stay aligned with each other rather than the eyebrow defaulting left
 * under a centred heading.
 *
 * IT IS MUTED, NOT ACCENTED. An eyebrow is a quiet label above the thing that
 * matters; accenting it competes with the heading it introduces. It also keeps
 * `heading` out of the set of components reading --pb-accent-* directly, which
 * settingsPanelTabs and sectionControlAudit both pin against a comment claiming
 * the accent gap is closed — widening that set for a decoration would mean
 * amending two guards about a different concern.
 */
export function HeadingSection({ content }) {
  const text = typeof content?.text === 'string' ? content.text : '';
  if (!text.trim()) return null;
  const level = LEVEL_CLASS[content?.level] ? content.level : 'h2';
  const Tag = level;
  const alignClass = ALIGN_CLASS[content?.align] ?? ALIGN_CLASS.left;
  const eyebrow = typeof content?.eyebrow === 'string' ? content.eyebrow.trim() : '';

  const headingEl = (
    <Tag className={cn('font-heading', LEVEL_CLASS[level], alignClass)}>
      {text}
    </Tag>
  );
  if (!eyebrow) return headingEl;

  return (
    <div className={alignClass}>
      <p className="mb-1.5 font-en text-xs font-bold uppercase tracking-wider text-9e-slate-dp-50">
        {eyebrow}
      </p>
      {headingEl}
    </div>
  );
}
