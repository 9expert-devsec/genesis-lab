import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cardSurfaceClass, accentButtonClass } from '@/lib/pageBuilder/presets';
import { safeUrl, isExternalUrl } from '@/lib/pageBuilder/safeUrl';

/**
 * price_card — a self-contained pricing card. Server component (renders from
 * its own `content`, no upstream fetch). Card surface comes from
 * `style.cardStyle`; the button colour follows the section accent, its
 * treatment from `style.buttonStyle` — the SAME contract as `cta`, so the two
 * are the buttonStyle reader-set (asserted in the loader check).
 *
 * Fails closed like the rest of the family: with no title, price, or features
 * there is nothing to show, so it renders NOTHING (the editor warns — see
 * SectionContentEditor — and the tree marks it, see sectionRendersEmpty). The
 * button is a second fail-closed path: it appears ONLY with a non-empty label
 * AND a safe href, exactly as `cta` does.
 */
const BTN_BASE =
  'mt-6 inline-flex w-full items-center justify-center gap-2 rounded-9e-xl px-6 py-3 ' +
  'font-en font-semibold transition-all duration-9e-micro ease-9e ' +
  'hover:-translate-y-[2px] hover:shadow-9e-md';

export function PriceCardSection({ content, style }) {
  const title = typeof content?.title === 'string' ? content.title : '';
  const price = typeof content?.price === 'string' ? content.price : '';
  const period = typeof content?.period === 'string' ? content.period : '';
  const features = (Array.isArray(content?.features) ? content.features : []).filter(
    (f) => typeof f === 'string' && f.trim()
  );
  if (!title.trim() && !price.trim() && !features.length) return null;

  const label = typeof content?.buttonLabel === 'string' ? content.buttonLabel.trim() : '';
  const href = safeUrl(content?.buttonHref);
  const highlighted = content?.highlighted === true;

  /**
   * ── ROUND 57: FOUR PROMOTION FIELDS, EVERY ONE ABSENT-RENDERS-NOTHING ────
   * docs/promotion-page-coverage.md §H. Each is a string defaulting to '', and
   * each is gated on `.trim()` — the SAME mechanism the three fields above
   * already use. That is the whole reason a card stored before this commit is
   * byte-identical after it: absent and '' take the same branch, and that
   * branch emits nothing.
   *
   * NOT round 50's pattern. `showPrice` defaults ON and reads `!== false`
   * because it removes something every card shows. These four add something no
   * card has ever shown, so the inversion is deliberate — see the schema.
   */
  const originalPrice = typeof content?.originalPrice === 'string' ? content.originalPrice.trim() : '';
  const discountBadge = typeof content?.discountBadge === 'string' ? content.discountBadge.trim() : '';
  const footnote = typeof content?.footnote === 'string' ? content.footnote.trim() : '';
  const ribbon = typeof content?.ribbon === 'string' ? content.ribbon.trim() : '';

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-9e-lg p-6',
        cardSurfaceClass('price_card', style),
        // The accent ring is the ONE thing `highlighted` does — a self-contained
        // emphasis that needs no layout preset (columns live on the parent grid).
        highlighted && 'ring-2 ring-[color:var(--pb-accent-fill)]',
        /**
         * STILL CONDITIONAL, for the same byte-identity reason: adding a class
         * unconditionally would change the class attribute of EVERY stored
         * card. `relative` is gone because nothing is absolutely positioned any
         * more (see the ribbon below); `overflow-hidden` stays as the guard for
         * a ribbon longer than the card is wide, so it is clipped at the card's
         * rounded edge rather than painting outside it.
         */
        ribbon && 'overflow-hidden'
      )}
    >
      {/**
        * ── ROUND 59: THE CORNER RECTANGLE, IN FLOW ─────────────────────────
        * docs/promo-card-style.md §B measured the original as a FLUSH corner
        * rectangle; round 57 shipped a rotated 45° band. The band is replaced,
        * and the reason is the author's text rather than fidelity to the page.
        *
        * MEASURED (scripts/_probe-round59-ribbon-window.mjs): the rotated
        * band's box is 144px wide but only ~85px of it can ever sit inside the
        * corner, so both ends were clipped by `overflow-hidden` — and the
        * characters lost were IDENTICAL at card widths 320/445/640. The loss
        * was not "the card is too small", it was a fixed-width box laid across
        * a fixed-length corner chord, and it silently ate any ribbon past ~16
        * characters on every card. `ribbon` is a free author string with no
        * length cap, so that is a control quietly discarding what the author
        * typed — round 18's defect in a different costume.
        *
        * IN FLOW, NOT ABSOLUTE, and that is the load-bearing part. As a normal
        * flex child the ribbon OCCUPIES layout, so the title is pushed below it
        * by the box model instead of by a reserved padding number someone has
        * to keep right. The negative margins cancel the card's own `p-6` so the
        * box sits flush against the top and right edges, and `rounded-tr-9e-lg`
        * is the card's own radius, so the two corners coincide exactly.
        *
        * `self-end` keeps it shrink-to-fit and right-aligned; without it a flex
        * column stretches the item to full width and the corner ornament
        * becomes a banner.
        */}
      {ribbon && (
        <span
          data-pb-ribbon=""
          className={cn(
            'pointer-events-none -mr-6 -mt-6 mb-4 self-end',
            'rounded-bl-9e-lg rounded-tr-9e-lg px-4 py-2',
            'text-sm font-bold leading-tight text-[var(--pb-accent-on)]',
            'bg-[color:var(--pb-accent-fill)]'
          )}
        >
          {ribbon}
        </span>
      )}
      {title.trim() && <h3 className="font-heading text-lg font-bold">{title}</h3>}
      {(originalPrice || discountBadge) && (
        <p className="mt-2 flex items-center gap-2 text-sm">
          {originalPrice && (
            <span className="text-9e-slate-dp-50 line-through dark:text-[#94a3b8]">{originalPrice}</span>
          )}
          {discountBadge && (
            <span className="rounded-9e-sm bg-[color:var(--pb-accent-fill)]/10 px-1.5 py-0.5 text-xs font-bold text-[var(--pb-accent-text)]">
              {discountBadge}
            </span>
          )}
        </p>
      )}
      {price.trim() && (
        <p className="mt-2 font-heading text-3xl font-bold text-[var(--pb-accent-text)]">
          {price}
          {period.trim() && (
            <span className="ml-1 text-sm font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">{period}</span>
          )}
        </p>
      )}
      {/**
        * A SEPARATE SURFACE FROM `features`, on purpose (§B #10). `features`
        * draws a check glyph per row — it is a list of what the buyer GETS. A
        * VAT line is not something they get, and rendering it as a feature
        * would put a tick beside "ราคาดังกล่าวยังไม่รวม VAT 7%".
        */}
      {footnote && (
        <p className="mt-2 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">{footnote}</p>
      )}
      {features.length > 0 && (
        <ul
          className={cn(
            'mt-4 space-y-2 text-sm',
            /**
             * ── ROUND 59: THE SEPARATION, NOT JUST THE SEPARATE FIELD ───────
             * Round 57 gave the footnote its own element for the reason in the
             * comment above, and that half held: it is a `<p>`, outside the
             * `<ul>`, with no glyph. But a small muted line sitting directly
             * above a list of small lines still READS as an unglyphed first
             * row — the schema separated them and the page did not.
             *
             * A BOUNDARY, gated on the PAIR. The rule appears only when a
             * footnote is actually above a list, because that is the only
             * arrangement that is ambiguous. A card with features and no
             * footnote keeps the exact class attribute it has always had, so
             * the 4 stored cards in that shape stay byte-identical — the
             * conditional is the byte-identity, not decoration.
             *
             * `--surface-border` is the token `cardStyle: 'border'` already
             * resolves to, so the line matches the card's own edge and is
             * defined in both themes (light rgba(13,27,42,.12), dark #1A2D42).
             * A hand-picked hex here would be a source colour, which round 30
             * put out of bounds.
             *
             * NOT the original's `.price-divider`, and not its two-column
             * label/value grid: that is round 58's STRUCTURE item and is out of
             * scope. This is the boundary alone.
             */
            footnote && 'border-t border-[var(--surface-border)] pt-4'
          )}
        >
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pb-accent-fill)]" strokeWidth={2.5} aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}
      {label && href && (
        <Link
          href={href}
          className={cn(BTN_BASE, 'mt-auto', accentButtonClass('price_card', style))}
          {...(isExternalUrl(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {label}
        </Link>
      )}
    </div>
  );
}
