'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/**
 * Full-size viewer for one image. Shared.
 *
 * WHY IT EXISTS. `.article-content td img` / `th img` are pinned to a 3rem box
 * with `object-fit: contain` so a table of logos has one vertical rhythm
 * (f987a84). That is right for the table and useless for reading the image, so
 * a click opens it at full size.
 *
 * ── IT MOVED HERE FROM articles/[slug]/_components, UNCHANGED ───────────────
 * The program page's roadmap needs the same viewer, and importing across a
 * route's `_components` folder is the awkwardness already recorded against
 * OnlineCourseCard. The move was byte-identical — see the commit — and the
 * `plate` prop below is the only behavioural addition, opt-in so /articles
 * renders exactly as it did.
 *
 * TWO CALLERS NOW, and their needs differ in exactly one way, which is why
 * `plate` is a prop rather than a new default: an article image is usually a
 * photo or a screenshot that reads fine on the dark backdrop, while a program
 * roadmap is a light-background diagram, frequently a transparent PNG, whose
 * text disappears into `bg-black/80` without something opaque behind it.
 *
 * ── PORTALLED TO <body>, AND IT HAS TO BE ───────────────────────────────────
 * Same reason ChatPanel and the header drawer are, quoting ChatPanel's
 * docstring: a `fixed`/`transformed` ancestor forms a stacking context, and
 * rendering the overlay in place would trap it there while the source looked
 * completely correct. This is rendered from inside the article column, which
 * sits under several such ancestors.
 *
 * ── THE z TIER, CHOSEN NOT SQUATTED ─────────────────────────────────────────
 * 9600. It must sit ABOVE SitePopup (9000) and the chat panel (9500) — a promo
 * image or a chat window must not cover a viewer the reader opened
 * deliberately, which is the ladder's own stated principle for putting chat
 * above SitePopup — and BELOW the mobile drawer backdrop/panel (9998/9999),
 * because primary navigation always wins. The rung was unoccupied; the ladder
 * comment in tailwind.config.js now lists it.
 *
 * ── IT DOES NOT TOUCH THE PROSE ─────────────────────────────────────────────
 * The trigger is event delegation on the existing `contentRef`, installed by an
 * effect in ArticleDetailClient. This component receives no reference to the
 * body markup and adds nothing to the memoized ArticleContent, whose props stay
 * exactly `{ html, contentRef }` — a re-render there would let React diff
 * dangerouslySetInnerHTML and wipe the injected heading IDs, breaking the table
 * of contents and every anchor link.
 *
 * ── ACCESSIBILITY ───────────────────────────────────────────────────────────
 * `role="dialog"` + `aria-modal` + an accessible name taken from the image's
 * own alt text (falling back to a generic Thai label when alt is empty, which
 * is common in this corpus). Escape closes. Focus moves to the close button on
 * open and returns to the CLICKED IMAGE on close — the caller passes the
 * element, because returning focus to the document body would dump a keyboard
 * user back at the top of a long article. Body scroll is locked and restored
 * through the shared hook.
 *
 * Motion: a plain CSS transition, so the global
 * `@media (prefers-reduced-motion: reduce)` clamp in globals.css already covers
 * it. Nothing extra is needed and nothing here animates in JS.
 *
 * NOT A FOCUS TRAP. Focus is moved in on open and restored on close, which is
 * what the two callers need; Tab can still walk out of the overlay into the
 * page behind it. Stated plainly rather than implied, because "focus moves to
 * the close button" reads like a trap and is not one. Adding a real trap means
 * a dependency or a hand-rolled ring, and neither was in scope when this moved.
 *
 * @param {{src: string, alt?: string, trigger?: HTMLElement}} image
 * @param {() => void} onClose
 * @param {boolean} [plate=false] render the image on an opaque white plate.
 *   OFF by default so the article surface this component grew up on is
 *   unaffected. On for light-background diagrams — see the note above.
 */
export function ImageLightbox({ image, onClose, plate = false }) {
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  // Captured on open so focus can go back to the exact <img> that was clicked,
  // even though `image` is cleared by the time the effect's cleanup runs.
  const returnFocusRef = useRef(null);

  const open = Boolean(image);
  useBodyScrollLock(open);

  if (open && image.trigger) returnFocusRef.current = image.trigger;

  const close = useCallback(() => {
    const target = returnFocusRef.current;
    onClose();
    // After the overlay unmounts. `focus()` on a detached/hidden node is a
    // no-op, so the guard is cheap insurance rather than ceremony.
    requestAnimationFrame(() => {
      if (target && document.contains(target)) target.focus({ preventScroll: true });
    });
  }, [onClose]);

  // ESC on DOCUMENT, not window — SitePopup's target, which ChatPanel also
  // adopted. Two modal patterns in one codebase is how one of them goes wrong.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Move focus into the overlay so Escape and Tab have somewhere to land.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const name = image.alt?.trim() || 'ภาพในบทความ';

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={name}
      // Clicking the backdrop closes. The <img> below stops propagation, so a
      // click on the picture itself does not.
      onClick={close}
      className="fixed inset-0 z-[9600] flex flex-col bg-black/80 p-4 backdrop-blur-sm"
    >
      {/*
        THE CLOSE CONTROL HAS ITS OWN ROW, so it cannot overlap the artwork.

        It used to be `absolute right-4 top-4` over the backdrop, and it sat on
        top of the picture — measured in headless Chrome at 1440x800, where the
        roadmap overflowed to 1376x973 and the ✕ landed on it.

        Bounding the image alone would have been enough at the viewports that
        were tried, and NOT enough in general: with an absolute ✕ at 16px
        inset and ~40px square, avoiding it is an arithmetic argument about
        every viewport and every image ratio at once, and it comes out to a
        few pixels of margin. A row of its own makes the answer structural —
        no image, no ratio and no window size can put them in the same place.
      */}
      <div className="flex shrink-0 justify-end pb-3">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={close}
          aria-label="ปิด"
          className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/*
        THE PLATE IS A WRAPPER ELEMENT, AND IT IS ONLY EMITTED WHEN ASKED FOR.

        `bg-white` on the <img> itself would paint only the image's own box —
        under `object-contain` that box IS the picture — so a transparent PNG
        would still show black through its own transparent pixels. The wrapper
        takes the layout box and the artwork sits on top of it.

        `bg-white` with NO dark: variant, deliberately: the plate exists
        because the artwork assumes a light background, and that assumption
        does not change with the viewer's theme. The BACKDROP stays dark in
        both themes; only what is behind the artwork is forced.

        ── WHY TWO BRANCHES RATHER THAN ONE WRAPPER WITH `contents` ──────────
        The first draft always emitted the wrapper and gave it `display:
        contents` when `plate` was false. That renders identically to the eye
        and is NOT identical in the DOM — it is an extra node on a surface this
        move promised to leave untouched, and the identity test caught it. So
        the false branch emits exactly the element that shipped before this
        prop existed, character for character.
      */}
      {/*
        ── WHY THE IMAGE IS BOUNDED IN VIEWPORT UNITS AND NOT `max-h-full` ────

        `max-h-full` is `max-height: 100%`, and a percentage max-height resolves
        against the CONTAINING BLOCK'S HEIGHT. The backdrop has a definite
        height, so a bare <img> directly inside it was correctly bounded — which
        is why /articles never showed this — but the plate wrapper's own height
        is `auto`, content-derived. A percentage against an indefinite height
        computes to `none`, so inside the plate the image was bounded on width
        ONLY and grew as tall as its 1.414 ratio demanded.

        Measured in headless Chrome against the real compiled CSS, 5266x3724 at
        1440x800:

          plate, max-h-full      1376 x 973   taller than the window, ✕ over it
          plate, viewport units   928 x 656   fits, no overlap, no scrollbars

        Viewport units are definite regardless of any ancestor, so the bound
        holds in both branches and cannot be broken by a future wrapper. The
        subtracted amounts are the chrome around the picture: 9rem of height
        covers the backdrop's `p-4`, the close row and the plate's padding;
        6rem of width covers `p-4` plus the plate's padding.

        `min-h-0` on the stage is what lets it shrink below its content in a
        column flex container — without it the row refuses to go under
        min-content and the centring is off.
      */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {plate ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-lg bg-white p-2 shadow-2xl sm:p-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={image.alt || ''}
              className="max-h-[calc(100vh-9rem)] max-w-[calc(100vw-6rem)] cursor-default object-contain"
            />
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={image.src}
            alt={image.alt || ''}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[calc(100vh-9rem)] max-w-[calc(100vw-6rem)] cursor-default rounded-lg object-contain shadow-2xl"
          />
        )}
      </div>
    </div>,
    document.body
  );
}
