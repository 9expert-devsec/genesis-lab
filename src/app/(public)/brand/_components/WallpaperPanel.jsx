import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WALLPAPER } from '../brandContent';

/**
 * The desktop wallpaper: a preview, and the link to the real file.
 *
 * ══ THE PREVIEW IS NOT THE DOWNLOAD, AND IT MUST NOT BE ═════════════════════
 *
 * The stored asset is 8000 x 4500 and about 4.7 MB. The content reference
 * points its <img> straight at it, which is what a CMS field can express; a
 * real route can do better and has to, because that image is the largest single
 * byte on the page by two orders of magnitude and it sits in the LAST section,
 * where nobody has asked for it yet.
 *
 * Two separate things are done about it:
 *
 *  1. THE PREVIEW GOES THROUGH THE `/_img/w800` DELIVERY VARIANT. That prefix
 *     is not invented here — next.config.mjs already defines it
 *     (f_webp,q_80,w_800,c_limit) for exactly this, and it rewrites the same
 *     `/files/...` path it always would. Measured against the deployed site:
 *
 *         /_img/w800/files/ci/wallpaper-desktop.png   14,286 bytes  (webp)
 *         /files/ci/wallpaper-desktop.png             39,296 bytes  (webp, w1600)
 *         the stored PNG                              ~4.7 MB
 *
 *     The DOWNLOAD button keeps the unprefixed path, so what a visitor
 *     downloads is the full-resolution original — the preview is a thumbnail of
 *     it, not a substitute for it.
 *
 *  2. IT IS LAZY, AND IT RESERVES ITS BOX. `loading="lazy"` keeps those bytes
 *     off the initial load entirely for a section this far down. `width`/
 *     `height` carry the asset's true 16:9, so the browser reserves the right
 *     space before the image arrives and the eight sections above it do not
 *     jump when it does.
 *
 * A plain <img> rather than next/image, for consistency with the fifteen logo
 * tiles above (which have no choice — see LogoVariantGrid) and because routing
 * an already-optimized rewrite through a second optimizer buys nothing.
 */
export function WallpaperPanel() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-[1_1_420px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={WALLPAPER.previewHref}
          alt={WALLPAPER.alt}
          width={WALLPAPER.width}
          height={WALLPAPER.height}
          className="block h-auto w-full rounded-9e-md border border-[var(--surface-border)]"
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">{WALLPAPER.note}</p>
        <Button asChild variant="primary" size="md" radius="md" className="mt-3">
          <a href={WALLPAPER.downloadHref}>
            <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            {WALLPAPER.cta}
          </a>
        </Button>
      </div>
    </div>
  );
}
