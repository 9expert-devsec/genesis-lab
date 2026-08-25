'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { matchesRoutePattern } from '@/lib/floatingDock';
import { setOccupiedBox, clearOccupiedBox } from '@/lib/viewportBottomInset';
import { stickyBarOccupancyHeight } from '@/lib/stickyBarOccupancy';
import { CookieBanner } from './CookieBanner';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CookieBannerPreview — TEMPORARY. DELETE THIS WHOLE FILE IN THE WIRING ROUND.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Round CB-A2. Puts CookieBanner on screen so the team can review it in real
 * page context. Consent is STILL NOT WIRED: nothing here writes a cookie,
 * touches localStorage, or calls gtag. Analytics.jsx and the Consent Mode
 * defaults (`granted`) are untouched.
 *
 * This file is the entire preview apparatus — the warning strip, the
 * session-only dismissal, the positioning. The wiring round deletes it and
 * mounts CookieBanner through a real consent provider instead, which is why
 * none of the temporary parts live inside CookieBanner itself.
 *
 * ── WHY IT IS SAFE TO SHOW A NON-FUNCTIONAL CONSENT BANNER ──────────────────
 * genesis-lab is not in production. Real users are still on the old site, so
 * the audience for this is the team. The warning strip below is what keeps it
 * honest even for them: a reviewer who sees a cookie banner reasonably assumes
 * it works, and "it's only a preview" is not visible from the page.
 *
 * ── WHY THE ROOT LAYOUT AND NOT (public)/layout.jsx ─────────────────────────
 * Two reasons, both measured rather than stylistic:
 *
 *   1. The home page is at src/app/page.jsx — OUTSIDE the (public) route group
 *      (there is no (public)/page.jsx). Mounting in that group's layout would
 *      leave the banner off the single most-reviewed page on the site.
 *   2. Session dismissal is React state, and state lives as long as its tree.
 *      (public)/layout.jsx and the home page are DIFFERENT trees, so crossing
 *      between them unmounts and remounts this component and the dismissal
 *      resets. src/app/layout.jsx spells this out as the reason
 *      FloatingActionDock was moved out of the (public) layout: "Two mounts
 *      are two separate React trees … anything the dock holds is destroyed in
 *      transit."
 *
 * Mounting once in the root layout gives one tree for the whole app, so a
 * dismissal survives every soft navigation — and a full reload still brings
 * the banner back, which is the behaviour this round wants.
 */

/**
 * Route prefixes the preview banner stays off.
 *
 * Deliberately ONLY /admin, matching DOCK_HIDDEN_PREFIXES: authenticated
 * internal UI with its own chrome, where public marketing furniture floating
 * over the page would be wrong. /preview/[slug] is NOT excluded, for the
 * reason src/lib/floatingDock.js already gives about the chat launcher — a
 * preview that hides chrome the live page has is a preview that lies.
 *
 * Fails OPEN (an unusable pathname renders) for the same reason the dock does:
 * not knowing where we are is not evidence that we are in the admin.
 */
const BANNER_HIDDEN_PREFIXES = ['/admin'];

export function shouldRenderCookieBannerPreview(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return true;
  return !BANNER_HIDDEN_PREFIXES.some((p) => matchesRoutePattern(pathname, p));
}

/** Stable publisher key for the bottom-inset store — one per mount, and there
 *  is exactly one mount. Named for the publisher, not the measurement. */
const OCCUPANCY_KEY = 'cookie-banner-preview';

/**
 * The temporary warning strip.
 *
 * Amber rather than the CI blues on purpose: every other colour on this card
 * is brand chrome, and the point of this strip is that it is NOT part of the
 * design. It has to read as scaffolding. Amber is not in the 9e palette, so
 * these are literal hex — correct here, because a token would imply the strip
 * belongs to the design system, and it is scheduled for deletion.
 *
 * role="status" rather than "alert": it describes the page's condition and
 * should not interrupt whatever a screen-reader user is currently reading.
 */
function PreviewNotice() {
  return (
    <div
      role="status"
      className="flex w-full items-start gap-2 rounded-lg border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 dark:border-[#B45309] dark:bg-[#2A2113]"
    >
      <TriangleAlert
        className="mt-px h-4 w-4 shrink-0 text-[#B45309] dark:text-[#FBBF24]"
        aria-hidden="true"
      />
      <p className="text-xs leading-[1.5] text-[#78350F] dark:text-[#FDE68A]">
        <strong className="font-semibold">ตัวอย่างหน้าตาเท่านั้น (UI Preview)</strong>{' '}
        — แบนเนอร์นี้ยังไม่เชื่อมต่อระบบจัดการคุกกี้ การกดปุ่มหรือเปิด/ปิดตัวเลือกใด ๆ
        ยังไม่มีผลกับการเก็บคุกกี้หรือการติดตามข้อมูลจริง
        และระบบจะไม่บันทึกการตั้งค่าของคุณไว้
      </p>
    </div>
  );
}

export function CookieBannerPreview() {
  const pathname = usePathname();

  // Session-only, in-memory, and that is the whole specification. NOT a
  // cookie, NOT localStorage, NOT sessionStorage. A fake persistence now would
  // be harder to unpick later than real persistence is to add, and it would
  // also be the one thing a reviewer could mistake for the feature working.
  // Consequence, intended: a full page reload brings the banner back.
  const [dismissed, setDismissed] = useState(false);

  const cardRef = useRef(null);
  const [box, setBox] = useState({ height: 0, left: 0, right: 0 });

  /**
   * ── WHY IT DOES NOT RENDER UNTIL AFTER MOUNT (CLS) ────────────────────────
   * Measured, not theorised. Rendering this in the SSR HTML scored CLS 0.069 on
   * desktop, and the layout-shift API named the banner's own wrapper as the
   * source: the card is anchored to the BOTTOM edge, so when the Thai webfont
   * swaps in and the copy reflows to a different height, the card's TOP moves.
   * A bottom-anchored box that changes height always shifts, and `fixed` does
   * not exempt it — `fixed` only stops it from shifting OTHER content.
   *
   * Deferring one commit means the first and only time this element is laid
   * out, the fonts have already settled, so its position never changes and it
   * contributes nothing. The cost is that the banner is absent from the SSR
   * HTML and appears a frame later. For a preview that is free; when this is
   * wired for real, a banner that flashes in late is a known trade and should
   * be re-judged against the CLS it buys.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const visible = mounted && shouldRenderCookieBannerPreview(pathname) && !dismissed;

  /**
   * ── THE COLLISION, AND HOW IT IS RESOLVED ─────────────────────────────────
   * FloatingActionDock is `fixed … bottom-8 right-4` at z-50 and holds the
   * back-to-top button and the chat launcher. This banner spans the full width
   * of the bottom edge, so on every viewport — not just mobile — the dock
   * would sit on top of it.
   *
   * It is NOT resolved by hardcoding a bottom offset into the dock or by a
   * breakpoint. src/lib/viewportBottomInset.js exists precisely for this: the
   * banner PUBLISHES the box it occupies at the bottom edge, and the dock,
   * which already subscribes, lifts by whatever it measures in its own column.
   * Neither side learns the other exists, and no magic number is written twice.
   *
   * That is also why nothing in FloatingActionDock.jsx changed in this round.
   */
  const measure = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right <= rect.left) return; // unusable — keep the last good span
    // Height must reach the viewport's bottom edge, not just the card: the
    // wrapper adds padding beneath the card, and a dock that cleared only the
    // card would still overlap that gap.
    const height = Math.max(0, window.innerHeight - rect.top);
    setBox((prev) =>
      prev.height === height && prev.left === rect.left && prev.right === rect.right
        ? prev
        : { height, left: rect.left, right: rect.right },
    );
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const el = cardRef.current;
    if (!el) return undefined;

    measure();

    // ResizeObserver, not a window listener: the banner's height changes when
    // the pill row wraps, which happens on font load and on zoom — neither of
    // which fires a resize event. Window resize is still needed because
    // `height` is derived from window.innerHeight, which the observer on this
    // element cannot see change.
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [visible, measure]);

  // Publish. `stickyBarOccupancyHeight` is the shared rule the other bottom
  // publishers use; passing `dismissed` through it means a dismissal zeroes the
  // inset by the same code path rather than a second condition written here.
  useEffect(() => {
    setOccupiedBox(OCCUPANCY_KEY, {
      height: stickyBarOccupancyHeight({
        dismissed: !visible,
        revealed: true,
        cardHeight: box.height,
        bottomOffset: 0,
      }),
      left: box.left,
      right: box.right,
    });
  }, [visible, box]);

  // Teardown. Unconditional, so no branch can leave a stale box behind — which
  // would strand the dock floating above furniture that is gone.
  useEffect(() => () => clearOccupiedBox(OCCUPANCY_KEY), []);

  if (!visible) return null;

  return (
    /*
     * FIXED, so there is no layout shift. The banner is out of normal flow
     * entirely: it never occupies space in <main>, so content below it does not
     * move when it appears or when it is dismissed, and it contributes nothing
     * to CLS. (Reserving space for it instead would guarantee a shift, and CLS
     * is a Core Web Vitals ranking signal.)
     *
     * z-70 is the next free rung on the ladder in tailwind.config.js —
     * documented there as reserved for future chrome, which this is. It sits
     * above the dock (50) and the header (60) so consent chrome is not covered
     * by page chrome, and below the whole overlay tier: SitePopup (9000), the
     * chat panel (9500), the image lightbox (9600) and the mobile drawer
     * (9999) all still win, which is correct — each of those is something the
     * user opened deliberately.
     *
     * pointer-events-none on the wrapper with auto on the card keeps the
     * padding gutter click-through, so the banner does not create a dead strip
     * across the bottom of every page.
     */
    <div
      data-cookie-banner-preview=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-70 p-3 sm:p-4"
    >
      <div className="pointer-events-auto mx-auto max-w-[1200px]" ref={cardRef}>
        <CookieBanner
          notice={<PreviewNotice />}
          onDecision={() => setDismissed(true)}
        />
      </div>
    </div>
  );
}
