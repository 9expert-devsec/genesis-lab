import Link from 'next/link';
import { cn } from '@/lib/utils';
import { accentButtonClass } from '@/lib/pageBuilder/presets';
import { isExternalUrl } from '@/lib/pageBuilder/safeUrl';
// ADDED beside the statements above rather than folded into either — the
// standing rule in this repo. Round C: the button LIST is resolved in a pure
// module because the settings panel needs the same answer, and a rule computed
// inline in this JSX is a rule the panel cannot import.
import { resolveCtaButtons, ctaIsEmpty } from '@/lib/pageBuilder/ctaButtons';

/**
 * cta — heading + description + a LIST of buttons (round C; it was one button,
 * then a fixed pair). Server component. The button colour follows the section
 * accent (via --pb-accent-* set by the renderer), so buttonStyle is a treatment
 * (primary/secondary/outline/ghost), not a fixed brand colour. Shape/motion
 * match the site Button. A button only renders with a valid label AND a safe
 * href — the pair guard below, unchanged since there was one button.
 *
 * The list itself is resolved by lib/pageBuilder/ctaButtons.js, which is also
 * where the compatibility rule lives: `content.buttons` ABSENT means the legacy
 * primary/secondary fields, read at render time, because every stored cta reads
 * back without the key and absent has to mean "what this section already drew".
 */
const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-9e-xl px-6 py-3 ' +
  'font-en font-semibold transition-all duration-9e-micro ease-9e ' +
  'hover:-translate-y-[2px] hover:shadow-9e-md';

/**
 * ── ROUND 57: THE SECOND BUTTON ───────────────────────────────────────────
 * docs/promotion-page-coverage.md §G step 2. Both live promotion pages close
 * with two actions (สอบถาม LINE + ดูตารางอบรมอื่น ๆ) and page B's hero opens
 * with two; the type offered one pair, so §B counted it twice.
 *
 * THE SAME PAIR-GUARD, NOT A NEW RULE. The primary button has always rendered
 * only with a non-empty label AND a safe href — a label with no href draws
 * nothing rather than a dead button, and an href with no label draws nothing
 * rather than an empty one. The second button is read exactly that way, so a
 * half-filled pair is invisible on both.
 *
 * BOTH FIELDS DEFAULT TO '' AND ABSENT RENDERS NOTHING (§H). This ADDS
 * something no page has shown, so it is the opposite of round 50's `showPrice`,
 * which defaults ON because it REMOVES something every card shows.
 *
 * The wrapper's layout classes are CONDITIONAL on there actually being two
 * buttons. A cta with one button must emit the `mt-6` div exactly as it always
 * did, or every stored cta changes — which is the byte-identity §H requires.
 * ROUND C KEEPS THE CONDITIONAL and did not make it unconditional "for
 * consistency": the count it tests is now `buttons.length > 1` instead of two
 * booleans, and one button still emits exactly `mt-6`.
 *
 * The second button takes a fixed outline treatment rather than a second
 * `buttonStyle`. A style prop would need a capability declaration in
 * SECTION_STYLE_CAPS and a control derived from it (2C.3); the section has ONE
 * accent and one button treatment, and the secondary reads as secondary by
 * being outlined.
 *
 * ── ROUND C REVISITS THAT LAST PARAGRAPH, NARROWLY ──────────────────────
 * A button may now name its own treatment, and it does NOT need a new
 * capability declaration to do it: `buttonStyle` is already declared for `cta`
 * in SECTION_STYLE_CAPS, and a per-button style asks that same declared
 * question through the same public helper — `accentButtonClass('cta', {...})`.
 * Nothing reads the private resolver and nothing reads `style.*` unguarded, so
 * the 2C.3 property is untouched. What changed is only WHO supplies the value:
 * the section, or one button overriding it.
 *
 * IT PAINTS WITH SURFACE TOKENS, NOT THE ACCENT, and that is not a style
 * preference. The accent belongs to the PRIMARY action — two accent-coloured
 * buttons side by side say "these are equally important", which is the opposite
 * of what a secondary is for. It is also what keeps `cta` out of the set of
 * components that read `--pb-accent-*` directly: an earlier draft used the
 * accent text var here and settingsPanelTabs went red, because that set is
 * pinned to a comment claiming a gap is closed. Widening it would have made
 * that sentence false for a decoration.
 */
/**
 * ── ROUND A-fix 2: THE LABEL FOLLOWS THE SECTION, THE FRAME DOES NOT ─────
 * `text-9e-navy` is #0D1B2A — chosen against a surface the THEME owns. On a
 * section whose surface the author painted dark it measured 1.37:1 on #123456
 * and 1.00:1 on #0D1B2A, which is the "very nearly invisible" in the report.
 *
 * The label now reads the section-scoped muted ink, with today's navy as the
 * var() fallback, so a section with no authored background paints exactly what
 * it painted before. On an authored section it takes the ink chosen FOR that
 * surface — muted rather than primary, which is what a secondary action should
 * be and is the only variable this round defines.
 *
 * ── THE BORDER AND THE HOVER ARE DELIBERATELY LEFT ───────────────────────
 * `--surface-border` and `--surface-muted` are chosen against a THEME surface
 * too, so on an authored background they are as wrong as the label was. They
 * are not fixed here because neither can be resolved from an existing token:
 * a border needs a value that reads against an arbitrary author hex, and the
 * hover needs a surface tint that does the same. Both are palette decisions.
 * A readable label inside a faint frame beats a minted colour — reported, not
 * folded in.
 */
const BTN_SECONDARY =
  'border border-[var(--surface-border)] ' +
  'text-[color:var(--pb-text-muted,var(--9e-navy))] dark:text-white ' +
  'hover:bg-[var(--surface-muted)]';

/**
 * ── ROUND C: THE CASCADE, WRITTEN DOWN ────────────────────────────────────
 * A button with NO `style` of its own keeps round 57's arrangement exactly:
 * the FIRST takes the section's accent treatment, every LATER one takes the
 * outline. That is what makes a stored two-button cta render byte-identically
 * — the cascade is not a new default, it is the old hard-coded pair expressed
 * as a rule over a list.
 *
 * Round 57's argument against a second accent fill still stands: two accent
 * buttons side by side say "these are equally important", which is the
 * opposite of what a secondary is for. The per-button override does not
 * overturn that — it makes it the AUTHOR'S explicit act rather than the
 * default.
 *
 * It resolves through `accentButtonClass`, the sanctioned capability helper,
 * which gates on SECTION_STYLE_CAPS. The private `buttonStyleClass` is NOT
 * reachable from here and must not become so: test/fs/styleCaps.test.mjs locks
 * it shut, and the note above it explains that picking that lock reopens the
 * panel↔component drift 2C.3 closed. Handing the helper a one-key object is
 * how a PER-BUTTON style asks the same gated question the SECTION asks.
 */
function ctaButtonClass(button, index, style) {
  if (button.style) return accentButtonClass('cta', { buttonStyle: button.style });
  return index === 0 ? accentButtonClass('cta', style) : BTN_SECONDARY;
}

export function CtaSection({ content, style }) {
  const heading = typeof content?.heading === 'string' ? content.heading : '';
  const description = typeof content?.description === 'string' ? content.description : '';
  const buttons = resolveCtaButtons(content);

  /**
   * ── ROUND C: A CTA WITH NOTHING IN IT NOW RENDERS NOTHING ───────────────
   * It used to emit a bare `<div class="text-center">` — no heading, no
   * description, no button, zero height, nothing to see. The structure tree's
   * ว่าง marker is defined as "renders NOTHING on the page", and
   * test/render/mirror.test.mjs operationalises that as markup === '', so
   * marking such a cta while this component returned a wrapper would have made
   * the marker lie by the module's own rule.
   *
   * So the component moved rather than the rule bending: cta leaves
   * sectionLabels.js's "renders a wrapper, cannot be marked" exclusion by
   * genuinely no longer rendering one. Nothing an author can see changes — an
   * empty div and no div occupy the same zero pixels — and every cta with any
   * content at all takes the identical path it always did.
   */
  if (ctaIsEmpty(content)) return null;

  return (
    <div className="text-center">
      {heading.trim() && (
        <h2 className="font-heading text-2xl font-bold md:text-3xl">{heading}</h2>
      )}
      {description.trim() && (
        <p className="mx-auto mt-3 max-w-2xl text-[color:var(--pb-text-muted,var(--9e-slate-dp-50))] dark:text-[#94a3b8]">{description}</p>
      )}
      {buttons.length > 0 && (
        <div
          className={cn(
            'mt-6',
            // Only when there are genuinely two or more — see the header. With
            // one button this must stay exactly `mt-6`.
            buttons.length > 1 && 'flex flex-wrap items-center justify-center gap-3'
          )}
        >
          {buttons.map((button, i) => {
            // Derived from the href, once, which is what every cta has done
            // since there was one button: external opens a tab, internal does
            // not. There is deliberately no per-button override — see the
            // decision block in lib/pageBuilder/ctaButtons.js, which records
            // the measurement that closed it and what would reopen it.
            const external = isExternalUrl(button.href);
            return (
              <Link
                key={`${i}-${button.href}`}
                href={button.href}
                className={cn(BTN_BASE, ctaButtonClass(button, i, style))}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {button.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
