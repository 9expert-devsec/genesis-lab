'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus, X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/**
 * The zoom range, as ONE grid rather than two notions of "a zoom level".
 *
 * Every input lands on the same 0.25 grid — the buttons step by it, the wheel
 * steps by it, and a pinch is ROUNDED to it. That is deliberate: with a
 * continuous pinch and stepped buttons the readout and the disabled states
 * disagree ("+ is greyed out but it says 397%"), and 13 stops between fit and
 * 4x is fine enough that nobody feels the quantisation.
 *
 * 0.25 is exactly representable in binary, so repeated addition here does not
 * drift and `zoom >= MAX_ZOOM` is a safe end-of-range test.
 *
 * FIT IS THE FLOOR. `MIN_ZOOM` is 1 — the fitted size — and zooming out below
 * it is refused rather than allowed and clamped later, because there is nothing
 * to see out there: the image is already whole and the space around it is
 * backdrop.
 */
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

const snapZoom = (z) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z / ZOOM_STEP) * ZOOM_STEP));

/**
 * A drag has to MOVE before it counts as one.
 *
 * Used to tell a pan from a click: a click that happens to travel a pixel is
 * still a click, and treating it as a pan would swallow it. See the frame's
 * onClick.
 */
const DRAG_SLOP_PX = 3;

/**
 * The zoom controls, anchored to the FRAME rather than to the viewport.
 *
 * `absolute` inside the frame, not `fixed`: a viewport-pinned control collides
 * with whatever else the site puts at the bottom of a small screen, and it
 * would also float away from the picture it acts on. Anchored to the frame it
 * is always over the image and always inside the popup, at every viewport and
 * every image ratio.
 *
 * Colours are CI tokens — navy panel, white glyphs, action blue on hover, air
 * blue for the focus ring — so it reads as this site's chrome and not as a
 * generic viewer's. No hex anywhere in here.
 */
function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }) {
  const button =
    'flex h-8 min-w-[2rem] items-center justify-center rounded-9e-sm px-2 text-white ' +
    'transition-colors duration-9e-micro ease-9e ' +
    'enabled:hover:bg-9e-action ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-9e-air ' +
    'disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      // The controls sit inside the backdrop, whose click closes the viewer, so
      // they stop their own clicks. Its own handler rather than one on the
      // frame, so the two stopPropagation calls the close tests are written
      // against keep meaning exactly what they say.
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-9e-md border border-9e-air/30 bg-9e-navy/90 p-1 shadow-9e-lg backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoom <= MIN_ZOOM}
        aria-label="ย่อ"
        className={button}
      >
        <Minus className="h-4 w-4" />
      </button>
      {/*
        THE READOUT IS THE RESET CONTROL, not a label sitting beside one.

        It is the only place the current zoom is stated, and "click the number
        to go back to fit" is what every drawing tool does — so it earns its
        width twice and adds no third element to a cluster that has to stay
        small at 375px. Disabled at fit, where it would do nothing, for the same
        reason + and − are disabled at the ends: a live-looking control that
        does nothing reads as a broken viewer, not as a limit.
      */}
      <button
        type="button"
        onClick={onReset}
        disabled={zoom <= MIN_ZOOM}
        aria-label="รีเซ็ตขนาดภาพ"
        className={`${button} font-en text-xs tabular-nums`}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoom >= MAX_ZOOM}
        aria-label="ขยาย"
        className={button}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Full-size viewer for one image. Shared.
 *
 * WHY IT EXISTS. `.article-content td img` / `th img` are pinned to a 3rem box
 * with `object-fit: contain` so a table of logos has one vertical rhythm
 * (f987a84). That is right for the table and useless for reading the image, so
 * a click opens it at full size.
 *
 * ── IT MOVED HERE FROM articles/[slug]/_components ──────────────────────────
 * The program page's roadmap needs the same viewer, and importing across a
 * route's `_components` folder is the awkwardness already recorded against
 * OnlineCourseCard. The move was byte-identical — see the commit — and `plate`
 * was the only behavioural addition it carried.
 *
 * TWO CALLERS, and their needs differ in exactly one way, which is why `plate`
 * is a prop rather than a new default: an article image is usually a photo or a
 * screenshot that reads fine on the dark backdrop, while a program roadmap is a
 * light-background diagram, frequently a transparent PNG, whose text disappears
 * into `bg-black/80` without something opaque behind it.
 *
 * ── ZOOM AND PAN ARE ONE FEATURE, NOT TWO ───────────────────────────────────
 * The roadmap is 5266x3724 with per-course descriptions set small, and fit-to-
 * frame is where this viewer lands: 928x656 at 1440x800, about a fifth of the
 * artwork's linear size, and the descriptions are not readable there.
 *
 * Zoom WITHOUT pan would have been worse than no zoom at all. `scale()` grows
 * the image about its centre, so a reader could magnify the middle of the
 * diagram and never reach the course at the edge they opened it for. The
 * drag-to-pan is not polish on top of the zoom; it is the half that makes the
 * zoom reach anything.
 *
 * It is all `transform: translate3d(...) scale(...)` on the <img>, with the
 * frame clipping. No lightbox/zoom dependency: the interaction is pointer
 * bookkeeping the size of this file's existing close logic, and the smallest
 * library that does it is ~30 KB on a route that shows one image.
 *
 * ── ZOOM IS ON FOR BOTH CALLERS, DELIBERATELY ───────────────────────────────
 * Not gated behind `plate` or a new prop. The roadmap is what asked for it, but
 * "the picture in the viewer is too small to read" is the whole reason this
 * component exists, and an article screenshot has exactly the same problem. A
 * prop would have to be threaded, defaulted and then explained; there is no
 * caller for whom the answer is no.
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
 * is common in this corpus). Escape closes — it already did, so the zoom work
 * added nothing here. Focus moves to the close button on open and returns to
 * the CLICKED IMAGE on close — the caller passes the element, because returning
 * focus to the document body would dump a keyboard user back at the top of a
 * long article. Body scroll is locked and restored through the shared hook.
 *
 * The three zoom controls are real <button>s with Thai `aria-label`s, in the
 * tab order after the close control, reachable and operable by keyboard alone.
 *
 * Motion: Tailwind's transition utilities on the transform, so the global
 * `@media (prefers-reduced-motion: reduce)` clamp in globals.css already covers
 * it. Nothing extra is needed and nothing here animates in JS.
 *
 * NOT A FOCUS TRAP. Focus is moved in on open and restored on close, which is
 * what the two callers need; Tab can still walk out of the overlay into the
 * page behind it. Stated plainly rather than implied, because "focus moves to
 * the close button" reads like a trap and is not one. Adding a real trap means
 * a dependency or a hand-rolled ring, and neither was in scope when this moved
 * here, nor is it in scope for the zoom work.
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

  // ── zoom / pan ────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const frameRef = useRef(null);
  const imageRef = useRef(null);
  /**
   * REFS MIRROR THE TWO PIECES OF STATE, and they are not redundant.
   *
   * The pointer and wheel handlers compute the NEXT zoom/offset from the
   * current one, and they run from a native listener and from closures that
   * outlive the render they were made in. Reading the state variables there
   * gives whatever was current when the closure was created — the classic
   * stale-closure pan, where the picture snaps back to where the drag started
   * on the second move.
   */
  const zoomRef = useRef(MIN_ZOOM);
  const offsetRef = useRef({ x: 0, y: 0 });
  // pointerId -> {x, y}. ONE map serves both gestures: one entry is a drag, two
  // are a pinch, and the transition between them is just its size changing.
  const pointersRef = useRef(new Map());
  const dragOriginRef = useRef(null);
  const pinchRef = useRef(null);
  const draggedRef = useRef(false);

  /**
   * Keep the picture's own edges from being dragged inside the frame.
   *
   * The travel is what the scaled image has beyond the frame, halved because
   * the transform origin is the centre and the picture is centred in the frame:
   * it can move that far in either direction and no further. At fit the
   * overflow is 0 on both axes, so this pins the offset to the origin without
   * anything else having to know that panning is off.
   *
   * `offsetWidth` is the LAYOUT size and a transform does not change it, so
   * this reads the same number at every zoom level instead of compounding.
   */
  const clampOffset = useCallback((next, z) => {
    const frame = frameRef.current;
    const img = imageRef.current;
    if (!frame || !img) return { x: 0, y: 0 };
    const travelX = Math.max(0, (img.offsetWidth * z - frame.clientWidth) / 2);
    const travelY = Math.max(0, (img.offsetHeight * z - frame.clientHeight) / 2);
    return {
      x: Math.min(travelX, Math.max(-travelX, next.x)),
      y: Math.min(travelY, Math.max(-travelY, next.y)),
    };
  }, []);

  const applyOffset = useCallback((next) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const applyZoom = useCallback(
    (next) => {
      const z = snapZoom(next);
      zoomRef.current = z;
      setZoom(z);
      // Re-clamped on every zoom change, so stepping back down from 400% walks
      // the picture home instead of leaving it parked off-frame.
      applyOffset(clampOffset(offsetRef.current, z));
    },
    [applyOffset, clampOffset]
  );

  const resetZoom = useCallback(() => {
    zoomRef.current = MIN_ZOOM;
    setZoom(MIN_ZOOM);
    applyOffset({ x: 0, y: 0 });
  }, [applyOffset]);

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

  /**
   * EVERY OPEN STARTS AT FIT.
   *
   * The zoom outlives a close — this component stays mounted and only its
   * `image` goes null — so without this, closing at 300% and reopening drops
   * the reader into a corner of a picture they have not seen whole yet. Keyed
   * on the src as well as on `open`, because the article surface reuses one
   * instance for every picture in the prose and switching pictures is the same
   * event as opening one.
   */
  useEffect(() => {
    if (open) resetZoom();
  }, [open, image?.src, resetZoom]);

  /**
   * WHEEL TO ZOOM — a native listener, and it has to be one.
   *
   * React registers `onWheel` at the root as a PASSIVE listener, so
   * `preventDefault()` inside a React handler is ignored and warns. Without the
   * preventDefault the browser keeps its own scroll/zoom gesture and the page
   * moves under the viewer while the reader is trying to zoom the picture. So
   * this one is bound straight to the frame with `{ passive: false }`.
   */
  useEffect(() => {
    const el = frameRef.current;
    if (!open || !el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      applyZoom(zoomRef.current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, applyZoom]);

  if (!open || typeof document === 'undefined') return null;

  const name = image.alt?.trim() || 'ภาพในบทความ';
  const canPan = zoom > MIN_ZOOM;

  function onPointerDown(e) {
    // A press that starts on a control belongs to that control. Without this
    // the press bubbles here, a zoomed image starts panning under the finger,
    // and pressing − twice quickly drags the picture as a side effect.
    if (e.target?.closest?.('button')) return;

    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    /**
     * CAPTURED ON EVERY PRESS, not only when there is something to pan.
     *
     * Two reasons, and the second is the one that bites. A drag that leaves the
     * frame keeps feeding this element — without it the picture sticks the
     * moment the pointer crosses the edge, which is exactly when someone is
     * reaching for the far side of the map. And an UNCAPTURED press whose
     * pointerup lands outside the frame never reports back, so its entry stays
     * in the map forever and the NEXT press reads as a second finger and starts
     * a pinch nobody asked for.
     */
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (pointers.size === 2) {
      // A second finger arrived: this is a pinch, so abandon any drag that had
      // started rather than letting two gestures move the picture at once.
      const [a, b] = [...pointers.values()];
      pinchRef.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: zoomRef.current,
      };
      dragOriginRef.current = null;
      setDragging(false);
      return;
    }

    if (!canPan) return;
    draggedRef.current = false;
    dragOriginRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offsetRef.current.x,
      oy: offsetRef.current.y,
    };
    setDragging(true);
  }

  function onPointerMove(e) {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinch = pinchRef.current;
    if (pointers.size >= 2 && pinch && pinch.distance > 0) {
      const [a, b] = [...pointers.values()];
      applyZoom(pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
      return;
    }

    const origin = dragOriginRef.current;
    if (!origin) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.abs(dx) > DRAG_SLOP_PX || Math.abs(dy) > DRAG_SLOP_PX) draggedRef.current = true;
    applyOffset(clampOffset({ x: origin.ox + dx, y: origin.oy + dy }, zoomRef.current));
  }

  function onPointerEnd(e) {
    const pointers = pointersRef.current;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchRef.current = null;
    if (pointers.size === 0) {
      dragOriginRef.current = null;
      setDragging(false);
    }
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

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

        THE ZOOM CLUSTER TAKES THE OPPOSITE DECISION, and the same argument
        licenses it: it is anchored to the frame's bottom-RIGHT, diagonally
        opposite this top-right row, so no image and no viewport can bring the
        two together either. Giving it a row of its own as well would have cost
        the picture height at exactly the size where height is scarcest.
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

        IT IS ALSO WHAT MAKES ZOOM MEAN ANYTHING. This bound IS the fit size, so
        `scale(1)` is fit by construction and the percentages the readout shows
        are percentages of it. A transform does not participate in layout, so
        zooming never reopens the question this bound answers.

        `min-h-0` on the stage is what lets it shrink below its content in a
        column flex container — without it the row refuses to go under
        min-content and the centring is off.
      */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/*
          THE FRAME: the popup panel, and the thing that clips.

          It shrink-wraps the fitted picture, so at fit it sticks out past the
          artwork nowhere and the backdrop's click-to-close still reaches
          everywhere it used to. Zoomed, `overflow-hidden` is what keeps a 4x
          image inside the panel instead of spilling across the backdrop and
          under the close button.

          `touch-none` hands the browser's own pan/pinch gestures to this
          component. Without it a two-finger pinch zooms the PAGE behind the
          overlay and a one-finger drag scrolls it.

          The shadow moved here from the picture: an `overflow-hidden` ancestor
          clips its children's shadows, so left where it was it would have
          disappeared the moment this element was introduced.
        */}
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          // A pan ends in a click, and that click would reach the backdrop and
          // close the viewer the moment the reader let go. Swallowed ONLY when
          // a drag actually happened, so at fit — where no pan is possible —
          // this element is transparent to clicks and the picture's own
          // stopPropagation is still the only thing between a click on the
          // artwork and a close.
          onClick={(e) => {
            if (draggedRef.current) {
              e.stopPropagation();
              draggedRef.current = false;
            }
          }}
          className={`relative max-h-full max-w-full touch-none overflow-hidden rounded-lg shadow-2xl ${
            !canPan ? 'cursor-default' : dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
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

            IT IS NOT TRANSFORMED — the image inside it is. Scaling the plate as
            well would grow its padding with the picture and turn a thin white
            margin into a white border four times as thick; leaving it still
            makes it the window the artwork moves behind.
          */}
          {plate ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-full max-w-full items-center justify-center overflow-hidden bg-white p-2 sm:p-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={image.src}
                alt={image.alt || ''}
                // Or the browser's native image-drag starts instead of the pan,
                // and the reader gets a ghost thumbnail on the end of the cursor.
                draggable={false}
                style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})` }}
                className={`max-h-[calc(100vh-9rem)] max-w-[calc(100vw-6rem)] object-contain ${
                  dragging ? '' : 'transition-transform duration-9e-micro ease-9e'
                }`}
              />
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={imageRef}
              src={image.src}
              alt={image.alt || ''}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})` }}
              className={`max-h-[calc(100vh-9rem)] max-w-[calc(100vw-6rem)] rounded-lg object-contain ${
                dragging ? '' : 'transition-transform duration-9e-micro ease-9e'
              }`}
            />
          )}

          <ZoomControls
            zoom={zoom}
            onZoomIn={() => applyZoom(zoomRef.current + ZOOM_STEP)}
            onZoomOut={() => applyZoom(zoomRef.current - ZOOM_STEP)}
            onReset={resetZoom}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
