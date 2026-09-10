import {
  GraduationCap,
  HeartHandshake,
  Rocket,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

/**
 * The two halves of the Core Values / Brand Personality pairing — deliberately
 * in ONE file, because the only thing that makes either of them correct is how
 * different it looks from the other.
 *
 * ── THE PROBLEM THIS FILE EXISTS TO SOLVE ───────────────────────────────────
 * Both blocks are five English names against five Thai lines, and THREE of the
 * names are shared — `Friendly` and `Practical` most visibly. That overlap is
 * the source guideline's, not a slip: a value is what we hold to, a personality
 * trait is how we come across, and the same word can honestly be both. It is
 * carried with two DIFFERENT Thai lines each, and neither may be deleted or
 * renamed to "fix" the duplication.
 *
 * But rendered as two identical card grids, the repetition reads as a
 * copy-paste error rather than as the relationship it is. So the fix is
 * typographic: the two blocks must not LOOK the same.
 *
 *   · Core Values   — the heavier block. Cards, an icon each, a lead-in.
 *   · Personality   — the lighter block. Chips in a wrapping run, no icons.
 *
 * The absence of icons on the chips is NOT an oversight to be tidied up later:
 * the weight difference IS the message — values are the substance, personality
 * is the register. test/render/brandPage asserts that the chips carry no icon,
 * so a "make these consistent" pass goes red instead of quietly undoing it.
 */

/**
 * One icon per value, mapped by name rather than carried in brandContent.js:
 * that module is COPY, and a React component is not copy. Keyed by the exact
 * `name` in CORE_VALUES.
 *
 * ── NOT `Compass`, FOR ANY OF THESE ─────────────────────────────────────────
 * The compass is the LOGO's own meaning in section 02 (`เข็มทิศ / ทิศทาง`) —
 * one page-length symbol that section is trying to teach. Spending it up here
 * on a generic "direction" value would blur it before the reader arrives.
 */
const VALUE_ICONS = Object.freeze({
  Expertise: GraduationCap,
  Friendly: HeartHandshake,
  Practical: Wrench,
  'Forward-Thinking': Rocket,
  Trustworthy: ShieldCheck,
});

/**
 * Core Values — the heavier of the pair. Same `<dl>` semantics as
 * DefinitionGrid (and for the same reason: these are definitions, not tabular
 * data), with an icon chip ahead of each name.
 *
 * A value whose name is not in VALUE_ICONS renders WITHOUT the chip rather
 * than throwing: an unmapped name is a content edit, and failing the whole
 * build on one is a worse outcome than a red assertion that names the value.
 */
export function CoreValueGrid({ items }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = VALUE_ICONS[item.name];
        return (
          <div
            key={item.name}
            className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4"
          >
            <dt className="flex items-center gap-2.5">
              {Icon ? (
                // Decorative: the value's name sits right beside it in text, so
                // announcing the icon would read the same thing twice. lucide
                // renders this straight onto the <svg>.
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-9e-sm bg-9e-action/10 text-9e-action dark:bg-9e-air/10 dark:text-9e-air">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                </span>
              ) : null}
              <span className="font-en text-[15px] font-bold text-[var(--text-primary)]">
                {item.name}
              </span>
            </dt>
            <dd className="mt-2.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {item.copy}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Brand Personality — the lighter of the pair. A run of compact chips that
 * wraps, each carrying the English trait and its Thai line on one baseline.
 *
 * Still a `<dl>`: the name→line relationship is unchanged, only its weight is.
 * Dropping to a flat list of <span>s to get the look would have thrown away the
 * structure a screen reader uses to pair the two halves.
 *
 * NO ICON HERE. See the file header — that is the point, not a gap.
 */
export function TraitChips({ items }) {
  return (
    <dl className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.name}
          className="flex items-baseline gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-3.5 py-1.5"
        >
          <dt className="font-en text-[13px] font-bold text-9e-action dark:text-9e-air">
            {item.name}
          </dt>
          <dd className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {item.copy}
          </dd>
        </div>
      ))}
    </dl>
  );
}
