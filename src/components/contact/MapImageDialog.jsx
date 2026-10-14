'use client';

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X } from "lucide-react";

/**
 * The large map-image dialog.
 *
 * PORTALLED to <body> at z-[9650], in the overlay tier of the ladder in
 * tailwind.config.js: above the sticky PublicHeader (z-60) so the header is
 * dimmed too, and above SitePopup (9000) / chat (9500) / the article lightbox
 * (9600), because it is modal and opened on purpose — below the job dialog
 * (9700, never on this page) and the mobile drawer (9998/9999), because
 * navigation always wins. The portal is the same guard the other overlays use:
 * no ancestor stacking context can cap it.
 *
 * The close button sits ABOVE the image, outside it, so it never covers the
 * compass drawn in the map's top-right corner. Closes on X, backdrop click and
 * Escape; focus goes to the close button on open (and stays in the dialog —
 * it is the only focusable element) and back to the opener on close; body
 * scroll is locked while open.
 *
 * Shared by MapSection ("ดูภาพแผนที่ขนาดใหญ่") and MapThumbnailButton (the
 * training-room card). Each owner keeps its own open state and passes the ref
 * of ITS trigger, so focus returns to whichever control opened it. The body
 * mounts only while open — that is what scopes the effect to one opening.
 */
export default function MapImageDialog({ open, onClose, returnFocusRef }) {
  if (!open) return null;
  return <MapImageDialogBody onClose={onClose} returnFocusRef={returnFocusRef} />;
}

function MapImageDialogBody({ onClose, returnFocusRef }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const opener = returnFocusRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        // One focusable element: keep focus on it rather than letting Tab
        // walk out to the page underneath.
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      opener?.focus();
    };
  }, [onClose, returnFocusRef]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9650] flex items-center justify-center bg-black/80 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="แผนที่การเดินทางมายัง 9Expert Training"
        className="flex max-h-full max-w-[min(1200px,100%)] flex-col items-end gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="ปิดแผนที่"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/50 transition-colors hover:bg-white/25"
        >
          <X aria-hidden="true" className="h-6 w-6" />
        </button>

        <div className="max-w-full overflow-hidden rounded-2xl bg-white p-2 shadow-2xl dark:bg-[#0d1f35]">
          {/* 100dvh minus: overlay padding (2 × 2rem at sm), the close button
              (2.75rem) + gap (0.75rem), and this frame's padding (1rem). */}
          <Image
            src="/assets/9ExpertMap-2026.png"
            alt="แผนที่การเดินทางมายัง 9Expert Training"
            width={1920}
            height={1080}
            className="h-auto max-h-[calc(100dvh-8.5rem)] w-auto max-w-full rounded-xl object-contain"
            priority={false}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
