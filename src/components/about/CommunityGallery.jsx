'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The /about-us gallery bento and its lightbox.
 *
 * Tiles are <button>s named by the photo's alt text; the server-rendered images
 * are in the HTML either way. The lightbox is a native <dialog> opened with
 * showModal(): the page behind it is inert (focus cannot leave it) and Escape
 * closes it natively. On close, focus goes back to the tile that opened it.
 * ← / → step through the gallery's photos. The only motion is a fade, and
 * reduced motion drops it (globals.css, .about-lightbox).
 *
 * The site's ImageLightbox is single-image and documents that it is not a
 * focus trap, so it does not fit a navigable gallery.
 */
const SIZES = {
  wide: '(min-width: 1200px) 600px, (min-width: 768px) 50vw, 100vw',
  narrow: '(min-width: 1200px) 300px, (min-width: 768px) 25vw, 50vw',
};

export default function CommunityGallery({ layout, items }) {
  const dialogRef = useRef(null);
  const tileRefs = useRef([]);
  const [index, setIndex] = useState(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const onClose = () => {
      const from = tileRefs.current[index ?? 0];
      setIndex(null);
      from?.focus();
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [index]);

  const open = (i) => {
    setIndex(i);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  };
  const step = (d) => setIndex((i) => (i + d + items.length) % items.length);
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  };

  const current = index != null ? items[index] : null;

  return (
    <>
      <div data-reveal-group="" className={cn('about-bento', layout === 'grid' && 'about-bento--grid')}>
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            data-reveal="fade"
            ref={(el) => { tileRefs.current[i] = el; }}
            onClick={() => open(i)}
            aria-label={`ดูภาพขนาดใหญ่: ${it.alt}`}
            className={cn('about-bento-tile', it.size === 'wide' && 'about-bento-tile--wide')}
          >
            <Image src={it.src} alt={it.alt} fill sizes={SIZES[it.size]} className="object-cover" />
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className="about-lightbox"
        aria-label={current ? current.alt : 'ภาพบรรยากาศ'}
        onKeyDown={onKeyDown}
        onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current.close(); }}
      >
        {current && (
          <figure className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 sm:p-8">
            <div className="relative h-full max-h-[78vh] w-full">
              <Image src={current.src} alt={current.alt} fill sizes="100vw" className="object-contain" />
            </div>
            <figcaption className="text-center text-sm text-white">
              {current.alt} <span className="text-white/[0.72]">({index + 1} / {items.length})</span>
            </figcaption>
          </figure>
        )}
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="ปิด"
          className="about-lightbox-btn right-4 top-4"
          autoFocus
        >
          <X className="h-5 w-5" />
        </button>
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} aria-label="ภาพก่อนหน้า" className="about-lightbox-btn left-4 top-1/2 -translate-y-1/2">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="ภาพถัดไป" className="about-lightbox-btn right-4 top-1/2 -translate-y-1/2">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
