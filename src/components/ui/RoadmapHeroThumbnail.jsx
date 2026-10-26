'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ZoomIn } from 'lucide-react';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { withCloudinaryTransform } from '@/lib/cloudinaryUrl';

/**
 * A roadmap as a hero THUMBNAIL that opens the full image in ImageLightbox.
 *
 * Lifted out of ProgramPageClient's hero (its right-hand column) so the skill
 * page can use the same one. Rendering nothing for an empty `src` is the
 * caller's no-roadmap path: the program page's hero collapses to its text
 * column, and the skill page keeps its single centred hero.
 *
 * ── TWO URLS, ONE ASSET ─────────────────────────────────────────────────────
 * The roadmaps are 2500–5266px PNGs of 1–2.3 MB, and used to be downloaded
 * whole to be shown at ~560px. The thumbnail now asks Cloudinary for a 960px
 * (about 2x the column) auto-format, auto-quality rendition; the lightbox asks
 * for the full-resolution one in an auto format, so zoom stays sharp. The
 * lightbox URL is requested only when it opens — ImageLightbox renders nothing
 * until it has an `image`. Both stay `unoptimized` in next/image: the
 * transformed URL is already the optimised asset (see lib/cloudinaryUrl.js).
 *
 * ── A FIXED BOX, SO NOTHING SHIFTS ──────────────────────────────────────────
 * The thumbnail sits in an ISO-216 landscape box (1.414, what most roadmaps
 * are) with `object-contain`, so its height is known before the image arrives
 * whatever the image's real ratio — Power Platform's 1.502 included. It is
 * `priority`: it is in the hero, above the fold. The box is the card-surface
 * and border tokens, not a white literal, so the dark theme gets a dark card.
 *
 * ── NAMES ──────────────────────────────────────────────────────────────────
 * The button's accessible name STARTS with the visible label and then names
 * the roadmap, so a voice user saying the label they see reaches it. The
 * image keeps its own `<name> Roadmap` alt. Focus returns to this button when
 * the lightbox closes (it is passed as `trigger`).
 */
export const ROADMAP_VIEW_LABEL = 'ดู Roadmap แบบเต็ม';
const THUMB_TRANSFORM = 'w_960,c_limit,f_auto,q_auto';
const FULL_TRANSFORM = 'f_auto,q_auto';

export function RoadmapHeroThumbnail({ src, alt, name = '', label = ROADMAP_VIEW_LABEL, plate = true }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  if (!src) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={name ? `${label} — ${name}` : label}
        className="group block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-md transition-shadow duration-9e-micro ease-9e hover:shadow-9e-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-9e-action dark:focus-visible:outline-9e-air"
      >
        <span className="relative block aspect-[1414/1000] w-full">
          <Image
            src={withCloudinaryTransform(src, THUMB_TRANSFORM)}
            alt={alt}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 560px"
            className="object-contain"
            unoptimized
          />
        </span>
        <span
          aria-hidden="true"
          className="flex items-center justify-center gap-1.5 border-t border-[var(--surface-border)] px-3 py-2 text-xs font-semibold text-9e-action group-hover:underline dark:text-9e-air"
        >
          <ZoomIn className="h-4 w-4" />
          {label}
        </span>
      </button>

      {/* `plate` ON by default: a roadmap is a light-background diagram, often
          a transparent PNG, which would otherwise bleed into the dark backdrop. */}
      <ImageLightbox
        image={open ? { src: withCloudinaryTransform(src, FULL_TRANSFORM), alt, trigger: buttonRef.current } : null}
        onClose={() => setOpen(false)}
        plate={plate}
      />
    </>
  );
}
