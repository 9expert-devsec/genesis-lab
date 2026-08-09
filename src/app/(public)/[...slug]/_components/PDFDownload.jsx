import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Course outline downloads. Upstream sends `course_outline_th` and
 * `course_outline_en` objects, each with an absolute, ready-to-use
 * `download_url`. A single card holds the heading plus up to two
 * side-by-side language buttons (TH | EN).
 *
 * ── RENDERED TWICE, ONE SLOT PER BREAKPOINT ─────────────────────────────────
 * page.jsx mounts this in two places and shows exactly one at a time: a
 * `lg:hidden` copy at the top of the content column, and the original
 * `hidden lg:flex` copy in the sidebar. `className` carries the visibility.
 *
 * ── AND THEY DIFFER IN LAYOUT, WHICH IS WHY `layout` IS A PROP ──────────────
 * The mobile slot is wide and puts the label and buttons on ONE row. The
 * sidebar is a ~300px column and stacks them, label above buttons.
 *
 * That difference is expressed at the CALL SITE and deliberately NOT as an
 * `lg:` prefix. On this component a breakpoint reads backwards: the NARROW
 * slot is the lg one, so `lg:flex-col` would mean "stack at the wide
 * breakpoint" and the next person to touch it will invert it in good faith.
 * A named layout says which shape each mount wants without anyone having to
 * remember that the sidebar is the small one.
 *
 * The aside copy needs `lg:flex` rather than `lg:block`: this root is a flex
 * row, and `hidden lg:block` would restore it at lg as a BLOCK, stacking the
 * icon above the text instead of beside it.
 *
 * Same two-slot pattern as the hero cover (d97d6ea) and the section nav
 * (fb03dc1), and it springs the same trap: leave the sidebar copy visible and
 * the card renders twice below lg. test/render/pdfDownloadSlots asserts
 * never-both rather than trusting a screenshot of the top of the page.
 */

const hasFile = (outline) =>
  typeof outline?.download_url === 'string' && outline.download_url.length > 0;

/**
 * One language button.
 *
 * ── THE SHARED Button, NOT A HAND-ROLLED CLASS STRING ───────────────────────
 * This used to carry its own `rounded-xl border-2 border-[var(--surface-border)]
 * px-4 py-2 text-sm` — a second dialect for a button, with no focus-visible
 * ring and no size scale, sitting next to a design system that already has an
 * `outline` variant built from the tokens. `asChild` hands Button's classes to
 * the <a> through Radix Slot, so href/target/rel survive intact; verified by
 * render before this was relied on, not assumed from the API.
 *
 * ── THE HEIGHT IS THE POINT ─────────────────────────────────────────────────
 * The old string measured 40px: text-sm's 1.25rem line box + py-2's 16px +
 * border-2's 4px. That is exactly the height ScrollToTopButton shipped at and
 * was raised FROM, its docstring recording the ruling — 40px is "four under the
 * 44px minimum tap target". `size="md"` is h-11 = 44px, the same height as
 * every other interactive element on the site. This card is now a primary
 * mobile surface, so the same rule applies to it.
 *
 * `radius="md"` = 12px, chosen from the existing 9e scale (sm 8 / md 12 /
 * lg 16 / xl 24). Button's default is xl, and 24px is more than HALF this
 * button's 44px height, so the shape clamps to a full pill — around a
 * two-character label that reads as a circle. 12px clears that threshold with
 * room to spare AND matches the icon box's `rounded-xl` (also 12px), so the two
 * 44px squares in the row share a corner.
 *
 * It is a VARIANT and not a className override for a measured reason: `cn` is
 * twMerge, twMerge does not recognise the custom 9e keys as one conflict group,
 * and an override would have left BOTH classes in the markup with the winner
 * decided by Tailwind's alphabetical emission order — which puts xl last. The
 * override would have been silently ignored. See button.jsx.
 *
 * `px-3` DOES override size md's px-6, because `px-*` is stock and twMerge
 * groups it correctly — measured, not assumed. The HEIGHT is what the
 * tap-target rule is about and comes from the variant untouched; the width is
 * what has to fit two buttons and a label on one row.
 *
 * ── THE Download ICON IS PER-SLOT, AND THE ASYMMETRY IS THE POINT ───────────
 * `withIcon` is true in the STACKED slot and false in the ROW slot. That is a
 * ruling, not an arithmetic result, and it is deliberately not symmetric:
 *
 *   stacked — the buttons own a whole row to themselves, so the icon costs
 *             nothing. Each button goes ~52px -> ~68px wide, the pair still
 *             fits the ~220px column on one line, and the card's height is
 *             unchanged because the icon lives inside a fixed h-11 button.
 *   row     — the label and the buttons share one line, so every pixel the
 *             buttons take comes out of the label's budget. Without the icon
 *             the mobile card is 70px BY CONSTRUCTION: nothing about the label
 *             can push the buttons onto a second line, because there is slack
 *             by design. With it, the fit depends on the label's rendered
 *             width, and a future copy change would silently re-grow the card.
 *
 * So do NOT "restore symmetry for consistency" — that is the regression, and
 * test/render/pdfDownloadSlots asserts the asymmetry in both directions
 * precisely because nothing else in the suite would notice it.
 */
function OutlineButton({ lang, outline, withIcon = false }) {
  return (
    <Button asChild variant="outline" size="md" radius="md" className="px-3">
      <a href={outline.download_url} target="_blank" rel="noopener noreferrer">
        {withIcon && (
          <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
        )}
        {lang}
      </a>
    </Button>
  );
}

export function PDFDownload({ course, className = '', layout = 'row' }) {
  const buttons = [
    { lang: 'TH', outline: course?.course_outline_th },
    { lang: 'EN', outline: course?.course_outline_en },
  ].filter(({ outline }) => hasFile(outline));

  if (!buttons.length) return null;

  const stacked = layout === 'stacked';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--surface-divider)] bg-[var(--surface-raised)] p-3 shadow-9e-md',
        className,
      )}
    >
      {/* h-11, matching the buttons rather than overhanging them at h-12. The
          icon was the tallest thing in the card, so it — not the buttons — set
          the card's height; sizing it to the tap target lets one row of 44px
          things be the whole card. */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50">
        <FileText className="h-6 w-6 text-red-500" strokeWidth={1.75} />
      </div>

      {/* WHAT THE TWO SLOTS DISAGREE ABOUT: direction, and cross-axis
          alignment. The shared Button, the 44px tap target and the radius are
          identical in both.

          ── items-center STACKED, OVERRULING c3d0268 ──────────────────────────
          c3d0268 argued items-start for BOTH slots on the grounds that "left is
          right in both". That argument was about a ONE-ROW layout with a
          leading icon, where the text should align to the icon's edge — and it
          still holds for the row slot, which keeps items-start via
          flex-row/items-center on the main axis and a left-aligned label. It
          does NOT carry to a stacked column: there the heading sits above the
          buttons with nothing to align to, and left-aligning a short label over
          a narrower button row just looks ragged. So the stacked slot centres,
          and this note is here so the earlier reasoning is not cited back at it.

          THE LEADING FILE ICON STAYS PUT — it does not join the centring. The
          root keeps flex-row/items-center in both slots, so the icon is a
          leading badge at the card's left edge, vertically centred, and the
          column centres BESIDE it. The alternative was turning the whole card
          into one centred stack with the icon on top; that was rejected because
          it makes the two slots read as two different cards rather than one
          component in two shapes, and because it would make the ROOT
          conditional too, where today only this wrapper is. The honest cost:
          the icon occupies ~56px on the left, so the centred column's optical
          centre sits about 28px right of the card's true centre. If that reads
          as lopsided rather than as a badge, the centred-stack version is the
          fallback. */}
      <div
        className={cn(
          'flex flex-1 gap-3',
          stacked ? 'flex-col items-center' : 'flex-row items-center',
        )}
      >
        {/* `flex-1` and NOT `min-w-0`, deliberately, in the row layout: flex-1
            makes the label absorb the slack, which is what pushes the buttons
            to the right edge and uses the width instead of clustering
            everything in the left third. Omitting min-w-0 leaves its min-width
            at min-content, so it wraps rather than shrinking to nothing.
            Stacked, there is no slack to absorb — the label is simply the first
            row — so flex-1 would do nothing and is left off. */}
        <p className={cn('text-sm font-semibold text-[var(--text-primary)]', !stacked && 'flex-1')}>
          ดาวน์โหลด Course Outline
        </p>

        {/* shrink-0 and content-sized, which is what answers the one-button
            case in BOTH layouts: a lone button stays a 44px-wide button rather
            than stretching across the card like a mis-sized CTA. Nothing here
            is flex-1. */}
        <div className="flex shrink-0 gap-2">
          {buttons.map(({ lang, outline }) => (
            <OutlineButton
              key={lang}
              lang={lang}
              outline={outline}
              withIcon={stacked}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
