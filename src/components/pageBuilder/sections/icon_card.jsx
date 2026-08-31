import Image from 'next/image';
import { cn } from '@/lib/utils';
import { cardSurfaceClass } from '@/lib/pageBuilder/presets';
import { lucideIcon } from '@/lib/pageBuilder/lucideIcon';
import { CLOUDINARY } from './image';

/**
 * icon_card — art + title + description feature card. Server component,
 * self-contained. Card surface from `style.cardStyle`; a Lucide glyph takes the
 * section accent inside a tinted chip, an uploaded illustration replaces it.
 *
 * Fails closed on RAW content, not on the resolved icon: with no title, no
 * description, no icon NAME and no image it renders NOTHING (so
 * sectionRendersEmpty — which cannot resolve a Lucide component — can mirror
 * the same check from the strings alone). A set-but-unknown icon name renders
 * the card without a chip; the editor warns about the name.
 *
 * ── ROUND 69: AN IMAGE MAY STAND IN FOR THE ICON ─────────────────────────
 * docs/promotion-page-coverage.md §C: both live promotion pages draw this card
 * with a raster ILLUSTRATION where the Lucide glyph goes. `imageSrc` is that
 * picture, and the branch below is the whole of it:
 *
 *   imageSrc.trim() !== ''  → the illustration
 *   otherwise               → the icon
 *
 * ABSENT IS THE SECOND CASE, and that is the point (§H). `.lean()` applies no
 * Mongoose defaults and serialisation drops undefined keys, so every card
 * stored before that commit reads `imageSrc` back ABSENT — the `typeof` guard
 * turns that into '' and '' falls through. Round 50's `!== false` shape, which
 * makes absent mean ON, would put a broken <img> on every stored card. Round 70
 * does not touch that rule.
 *
 * ── ROUND 70: ART BOX 80×80, CENTRED, AND THE CARD FILLS ITS TRACK ───────
 * THE BOX IS 80×80 CSS px (`h-20 w-20`) ON BOTH BRANCHES. Round 69 fixed it at
 * 44×44 because that was the Lucide chip's box element for element, chosen so
 * that swapping icon→image could not change a card's height. 44px is right for
 * a glyph and too small for an illustration — the target design draws it at
 * roughly 80-90px — so the CHIP GREW WITH THE IMAGE rather than the two
 * diverging. Round 69's invariant is therefore intact at the new size: both
 * branches are the same box, so the swap still moves no height. A card using an
 * icon gets a bigger chip and a proportionally bigger glyph (24/44 to 40/80),
 * which is the visible change to an icon card and the price of keeping one box.
 *
 * 80 and 40 are both on Tailwind's stock scale. 88 (the middle of the design's
 * range) is not, and minting an arbitrary value for it would buy 8px.
 *
 * `object-contain` (not cover) fits the whole picture inside that box without
 * distortion, letterboxing a portrait or a landscape rather than cropping it.
 * `sizes` moved with the box — a stale `sizes` ships the wrong file.
 *
 * CENTRED IS A FIXED PROPERTY OF THE TYPE, NOT AN AUTHOR CHOICE. Its two
 * nearest neighbours, `stat_card` and `instructor_card`, both centre
 * unconditionally and neither offers a control; left-aligned was `icon_card`
 * alone among the three self-contained display cards, and a per-card control
 * would let one strip hold four different alignments, which is the thing the
 * design is avoiding.
 *
 * THIS IS NOT A FREE CHANGE, AND ROUND 69's NUMBER IS STALE. Round 69 measured
 * ZERO stored `icon_card` sections and reasoned from it; re-measuring in round
 * 70 finds SIXTEEN — 8 live, 8 in version snapshots — and every one of them
 * inside a `card_grid`. So sixteen stored cards centre and grow their art on
 * deploy. That is the intended change rather than a cost to be absorbed: those
 * sixteen ARE the strip this design is for. It is recorded because a count
 * carried forward from a previous round is a measurement nobody took today.
 *
 * It DOES foreclose a left-aligned card, and the way back is written down
 * rather than left implied: add `align` with 'center' as its DEFAULT, so absent
 * keeps what every card has by then — §H's rule, the same shape `imageSrc` used.
 *
 * `h-full` is this card's half of round 70's equal-height fix. It is INERT on
 * its own: `height:100%` against an auto-height parent computes to `auto`,
 * which is why `price_card` has carried it for rounds without ever filling. It
 * bites only once SectionRenderer gives the container above it a definite
 * height, and it does that only for a child of `card_grid` / `highlight_grid`.
 */
export function IconCardSection({ content, style }) {
  const title = typeof content?.title === 'string' ? content.title : '';
  const description = typeof content?.description === 'string' ? content.description : '';
  const iconName = typeof content?.icon === 'string' ? content.icon.trim() : '';
  const imageSrc = typeof content?.imageSrc === 'string' ? content.imageSrc.trim() : '';
  if (!title.trim() && !description.trim() && !iconName && !imageSrc) return null;

  const Icon = imageSrc ? null : lucideIcon(iconName);

  return (
    <div className={cn('h-full rounded-9e-lg p-6 text-center', cardSurfaceClass('icon_card', style))}>
      {imageSrc ? (
        <div className="mb-3 inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-9e-md">
          <Image
            src={imageSrc}
            alt=""
            width={160}
            height={160}
            sizes="80px"
            unoptimized={!CLOUDINARY.test(imageSrc)}
            className="h-full w-full object-contain"
          />
        </div>
      ) : Icon && (
        <div className="mb-3 inline-flex h-20 w-20 items-center justify-center rounded-9e-md bg-[color:var(--pb-accent-fill)]/10 text-[var(--pb-accent-fill)]">
          <Icon className="h-10 w-10" strokeWidth={2} aria-hidden />
        </div>
      )}
      {title.trim() && <h3 className="font-heading text-lg font-bold">{title}</h3>}
      {description.trim() && (
        <p className="mt-1.5 whitespace-pre-line text-9e-slate-dp-50 dark:text-[#94a3b8]">{description}</p>
      )}
    </div>
  );
}
