'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { Search } from 'lucide-react';

import MapImageDialog from './MapImageDialog';

/**
 * The map thumbnail in the training-room card — a real button that opens the
 * same map-image dialog as MapSection's "ดูภาพแผนที่ขนาดใหญ่", and gets focus
 * back when it closes.
 *
 * THE CROP. The source is the full 1920x1080 route map; at thumbnail size the
 * building would be a speck. The image is object-[42%_18%] (the 9Expert label,
 * the red pin and the Evergreen Place block) and its wrapper is scaled 2x from
 * that same point, so roughly the source's x 400–1360 / y 105–590 region fills
 * the frame. Hover zoom (1.04) is on the inner image, so it composes with the
 * 2x instead of replacing it; none under reduced motion.
 *
 * `className` sizes / places the frame — the caller owns layout.
 */
export default function MapThumbnailButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="ดูภาพแผนที่ขนาดใหญ่"
        className={`group relative block overflow-hidden rounded-[14px] border border-[#E2E8F0] bg-white dark:border-9e-border ${className}`}
      >
        <span aria-hidden="true" className="absolute inset-0 origin-[42%_18%] scale-[2]">
          <Image
            src="/assets/9ExpertMap-2026.png"
            alt=""
            fill
            // drawn at 2x inside the frame, so ask for twice the frame width
            sizes="(min-width: 768px) 520px, 200vw"
            className="object-cover object-[42%_18%] transition-transform duration-200 ease-9e motion-safe:group-hover:scale-[1.04]"
          />
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-[rgba(13,27,42,0.82)] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Search aria-hidden="true" className="h-3.5 w-3.5" />
          ดูภาพแผนที่ขนาดใหญ่
        </span>
      </button>
      <MapImageDialog open={open} onClose={close} returnFocusRef={buttonRef} />
    </>
  );
}
