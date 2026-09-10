import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The "do this / avoid this" pair the page uses three times: under the colour
 * system, under "การวางโลโก้บนพื้นหลัง", and — as a single full-width `avoid`
 * panel with no partner — for the eight logo prohibitions.
 *
 * ── THE TWO TONES ARE STOCK GREEN AND ROSE, NOT BRAND COLOURS ───────────────
 * Deliberately. The brand palette is blue-led with one lime accent and contains
 * no "wrong" colour; borrowing Signal Lime for the affirmative panel would put
 * the page's own accent ink into a role the guideline explicitly restricts to
 * CTAs and badges, on the very page that says so. Green/rose is the
 * conventional pass/fail pairing and reads as such without competing with the
 * swatches above it.
 *
 * ── DARK MODE ───────────────────────────────────────────────────────────────
 * The reference's flat #F1F8EC / #FDF1F1 fills are light-only and would glare
 * on the dark canvas, so each tone is a low-alpha wash over the page's own
 * ground in dark — the same `-500/10` fill and `-500/30` hairline pattern the
 * policy pages use. Text stays on the semantic tokens; only the tint is
 * conditional.
 */
const TONE = {
  affirm: {
    panel:
      'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    Glyph: Check,
  },
  avoid: {
    panel: 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10',
    icon: 'text-rose-600 dark:text-rose-400',
    Glyph: X,
  },
};

/**
 * ── `as` IS THE HEADING LEVEL, AND IT DEFAULTS TO h4 ────────────────────────
 * A panel's title is a real heading — `Do`, `Avoid`, `Don't` — so it must not
 * be a styled <p>, and it must not be a fixed <h3> either. Most of these panels
 * sit INSIDE a Subsection, whose own title is the h3; a hardcoded h3 made
 * "Voice & Tone", "Do" and "Avoid" siblings in the outline, which tells a
 * screen-reader user the three are peers rather than a heading and its two
 * halves. The two panels in section 05 have no Subsection above them and are
 * therefore genuinely h3. The call site knows which; this component does not.
 */
export function GuidancePanel({ tone, title, items, columns = 1, as = 'h4', className }) {
  const { panel, icon, Glyph } = TONE[tone];
  const Heading = as;

  return (
    <div className={cn('min-w-0 rounded-9e-md border p-4 sm:p-[18px]', panel, className)}>
      <Heading className="text-[15px] font-bold text-[var(--text-primary)]">{title}</Heading>
      {/* `columns={2}` is for the one full-width panel on the page — the eight
          logo prohibitions, each two or three words long, which as a single
          column read as a ragged strip down the left of a very wide box. A GRID
          and not CSS `columns`: multi-column would flow the list top-to-bottom
          and split a wrapping bullet across the gutter mid-sentence. */}
      <ul
        className={cn(
          'mt-2.5',
          columns === 2 ? 'grid gap-2 sm:grid-cols-2 sm:gap-x-6' : 'space-y-2',
        )}
      >
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed text-[var(--text-primary)]">
            {/* The glyph carries no meaning a screen reader needs: the panel's
                own heading — "ทำได้" / "ห้ามทำ" — already says which list this
                is, and repeating it once per bullet is noise. */}
            <Glyph
              className={cn('mt-1 h-4 w-4 shrink-0', icon)}
              strokeWidth={2.5}
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The side-by-side pair. Stacks below the flex-basis, one panel per row. */
export function GuidancePair({ affirm, avoid, as = 'h4' }) {
  return (
    <div className="flex flex-wrap gap-3.5">
      <GuidancePanel tone="affirm" as={as} title={affirm.title} items={affirm.items} className="flex-[1_1_320px]" />
      <GuidancePanel tone="avoid" as={as} title={avoid.title} items={avoid.items} className="flex-[1_1_320px]" />
    </div>
  );
}
