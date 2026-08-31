import Image from 'next/image';
import { cn } from '@/lib/utils';
import { cardSurfaceClass } from '@/lib/pageBuilder/presets';
import { lucideIcon } from '@/lib/pageBuilder/lucideIcon';
import { CLOUDINARY } from './image';

/**
 * icon_card — an icon + title + description feature card. Server component,
 * self-contained. Card surface from `style.cardStyle`; the icon takes the
 * section accent inside a tinted chip.
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
 * picture, and the branch below is the whole of the change:
 *
 *   imageSrc.trim() !== ''  → the illustration
 *   otherwise               → the icon branch, byte for byte as before
 *
 * ABSENT IS THE SECOND CASE, and that is the point (§H). `.lean()` applies no
 * Mongoose defaults and serialisation drops undefined keys, so every card
 * stored before this commit reads `imageSrc` back ABSENT — the `typeof` guard
 * turns that into `''` and `''` falls through. Round 50's `!== false` shape,
 * which makes absent mean ON, would put a broken <img> on every stored card.
 *
 * ── THE BOX IS THE ICON CHIP'S BOX, TO THE PIXEL ─────────────────────────
 * The wrapper is the SAME `mb-3 inline-flex h-11 w-11 … rounded-9e-md` element
 * the icon sits in — 44×44 CSS px, in the same inline-flex line box, with the
 * same 12px bottom margin. An author's upload is any size and any ratio; four
 * cards in a row must not become four heights, and a swap that moved the card's
 * height would be a layout change wearing a content change's clothes. Only the
 * PAINT differs: no accent tint and no accent text colour, because those exist
 * to colour a monochrome stroke glyph through currentColor and an illustration
 * brings its own colour.
 *
 * `object-contain` (not cover) fits the whole picture inside that box without
 * distortion, letterboxing a portrait or a landscape rather than cropping it.
 * next/image serves it small: `sizes="44px"` over the 88px intrinsic hint means
 * a 2000×2000 upload arrives as a ~48-96px file from Cloudinary's transformer,
 * and any other host falls back to `unoptimized` — the same rule, from the same
 * constant, as the `image` section.
 */
export function IconCardSection({ content, style }) {
  const title = typeof content?.title === 'string' ? content.title : '';
  const description = typeof content?.description === 'string' ? content.description : '';
  const iconName = typeof content?.icon === 'string' ? content.icon.trim() : '';
  const imageSrc = typeof content?.imageSrc === 'string' ? content.imageSrc.trim() : '';
  if (!title.trim() && !description.trim() && !iconName && !imageSrc) return null;

  const Icon = imageSrc ? null : lucideIcon(iconName);

  return (
    <div className={cn('rounded-9e-lg p-6', cardSurfaceClass('icon_card', style))}>
      {imageSrc ? (
        <div className="mb-3 inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-9e-md">
          <Image
            src={imageSrc}
            alt=""
            width={88}
            height={88}
            sizes="44px"
            unoptimized={!CLOUDINARY.test(imageSrc)}
            className="h-full w-full object-contain"
          />
        </div>
      ) : Icon && (
        <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-9e-md bg-[color:var(--pb-accent-fill)]/10 text-[var(--pb-accent-fill)]">
          <Icon className="h-6 w-6" strokeWidth={2} aria-hidden />
        </div>
      )}
      {title.trim() && <h3 className="font-heading text-lg font-bold">{title}</h3>}
      {description.trim() && (
        <p className="mt-1.5 whitespace-pre-line text-9e-slate-dp-50 dark:text-[#94a3b8]">{description}</p>
      )}
    </div>
  );
}
