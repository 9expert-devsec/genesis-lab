'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { matchesRoutePattern } from '@/lib/floatingDock';
import { setOccupiedBox, clearOccupiedBox } from '@/lib/viewportBottomInset';
import { stickyBarOccupancyHeight } from '@/lib/stickyBarOccupancy';
import { CookieBanner, OPTIONAL_CATEGORIES } from './CookieBanner';
import {
  parseConsent,
  readConsentCookie,
  writeConsentCookie,
} from '@/lib/cookieConsentStore';
import { gtagConsentUpdate } from '@/lib/analytics/gtag';
import { consentSignalsFor } from '@/lib/analytics/consentMode';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CookieConsentBanner — the mount. CONSENT IS WIRED (round CB-B).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Renamed from `CookieBannerPreview` in CB-B, because the old name recorded a
 * status that is no longer true and a name that lies is worse than a stale
 * comment — a comment is read once, a name is read every time.
 *
 * What a decision does now, in this order:
 *
 *   1. gtag('consent','update', …) with the categories mapped onto Consent
 *      Mode v2 signals — see src/lib/analytics/consentMode.js
 *   2. write the first-party cookie (src/lib/cookieConsentStore.js)
 *   3. hide the banner
 *
 * Why that order is in handleDecision below, not here.
 *
 * ── WHAT THIS FILE OWNS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────
 * It owns the side effects: the tag call, the cookie, the route rule, the
 * positioning and the bottom-inset bookkeeping. CookieBanner itself stays
 * PRESENTATIONAL — no gtag, no storage, no document access — and
 * test/render/cookieBannerMarkup.test.mjs enforces that separation by
 * scanning the component's source for those very identifiers. That guard was
 * written as a temporary hold during the preview rounds; it is kept because
 * the separation it describes is permanent, not because the wiring is pending.
 *
 * ── THE DEFAULTS ARE NOT SET HERE ──────────────────────────────────────────
 * A `consent update` only means something after a `consent default`, and that
 * default has to be queued before gtag.js runs — which is a different file and
 * a different rendering phase. It lives in the inline bootstrap emitted by
 * src/components/analytics/Analytics.jsx. A returning visitor's stored choice
 * is applied as the DEFAULT there, so they are never denied-then-flipped; this
 * component's update is for the decision made in THIS page view.
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
 * dismissal survives every soft navigation without needing to be re-read from
 * storage on each one. Since CB-A3 a full reload no longer brings the banner
 * back either — that is now the cookie's job rather than the tree's.
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

export function shouldRenderCookieConsentBanner(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return true;
  return !BANNER_HIDDEN_PREFIXES.some((p) => matchesRoutePattern(pathname, p));
}

/** Stable publisher key for the bottom-inset store — one per mount, and there
 *  is exactly one mount. Named for the publisher, not the measurement. */
const OCCUPANCY_KEY = 'cookie-consent-banner';

export function CookieConsentBanner() {
  const pathname = usePathname();

  /**
   * ── DISMISSAL IS NOW PERSISTED (CB-A3) ────────────────────────────────────
   * CB-A2 kept this in memory only, on the grounds that fake persistence would
   * be harder to unpick than real persistence is to add. This round adds the
   * real thing: a first-party cookie, written on decision and read on mount.
   * See src/lib/cookieConsentStore.js for why a cookie and not localStorage —
   * the short version is that the wiring round has to read this value in a
   * SERVER component, before the Google tag loads.
   *
   * `null` is the third state and it is load-bearing: "not decided yet" is not
   * the same as "decided, everything off", and only the first should show the
   * banner. Starting at null and reading the cookie in the mount effect also
   * means the server and the first client render agree (both show nothing),
   * which is the same hydration-safety the `mounted` gate below provides.
   */
  const [decision, setDecision] = useState(null);
  const dismissed = decision !== null;

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
  useEffect(() => {
    // Read the stored decision in the SAME effect that reveals the banner, so
    // a returning visitor never gets a frame of banner before it is hidden
    // again. parseConsent returns null for anything it cannot trust — absent,
    // malformed, wrong schema version, or a key set that no longer matches
    // OPTIONAL_CATEGORIES — and null means "ask again", which is the only safe
    // response to a consent record we cannot read.
    setDecision(
      parseConsent(
        readConsentCookie(),
        OPTIONAL_CATEGORIES.map((c) => c.key),
      ),
    );
    setMounted(true);
  }, []);

  /**
   * The decision handler. Writes the cookie, then hides the banner.
   *
   * It records the categories the user actually ended up with — including any
   * they toggled by hand before pressing a button — rather than a bare
   * "dismissed" flag, because the wiring round needs to know WHICH categories
   * were granted in order to map them onto Consent Mode signals. A boolean
   * would force that round to either re-ask everyone or invent an answer.
   */
  const handleDecision = useCallback((categories) => {
    /* ── ORDER: TELL GOOGLE, THEN PERSIST, THEN DISMISS ────────────────────
     *
     * The update goes first because it is the only step with an outside
     * observer. If persisting threw — a full cookie jar, a hardened browser —
     * a consent-first order has still applied the user's choice to the tag for
     * this page view, and the banner reappears next time. The reverse order
     * would record a decision that was never acted on, which is the worse of
     * the two failures: the record says the user was asked and answered while
     * the tag carries on under the old state.
     *
     * `consent update` and not a second `consent default`: default is the
     * pre-tag state and may only be declared once, before the tag runs.
     * Everything after that is an update, and it is what the tag is waiting
     * for during the bootstrap's `wait_for_update` window.
     *
     * gtagConsentUpdate returns silently when window.gtag is absent, so a
     * blocked or failed gtag.js cannot break the banner. The bootstrap
     * publishes window.gtag before the library arrives, so in practice the
     * queue exists even when the network does not.
     */
    gtagConsentUpdate(consentSignalsFor(categories));
    writeConsentCookie(categories, new Date().toISOString());
    setDecision(categories);
  }, []);

  const visible = mounted && shouldRenderCookieConsentBanner(pathname) && !dismissed;

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
      data-cookie-consent-banner=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-70 p-3 sm:p-4"
    >
      {/*
        ── WHY 960px AND NOT THE SITE'S max-w-[1200px] ─────────────────────
        1200 is the SITE CONTENT container (103 uses in src/). This is a
        floating card, not page content, and at 1200 the copy ran to a single
        very long measure that read as a banner-shaped strip rather than a
        card.

        960 was chosen against the measured content, not by multiplying:
        the bottom row's three groups measure 128 (link) + 531 (toggles) +
        416 (buttons) = 1075, plus 40 of column gap and 48 of card padding =
        1163px to hold all three on ONE line. Every real narrowing therefore
        wraps that row, so the question is not "does it wrap" but "where".
        At 960 the usable width is 912, and link + gap + toggles = 679 sits
        comfortably on the first line with the buttons wrapping beneath,
        right-aligned by `ml-auto` — which is the reading order the row was
        built for. 1080 (an existing repo value) wraps identically but leaves
        353px of slack stranded on the first line; 900 (also existing) works
        but crowds the toggles toward the link.
      */}
      <div className="pointer-events-auto mx-auto max-w-[960px]" ref={cardRef}>
        <CookieBanner
          onDecision={handleDecision}
        />
      </div>
    </div>
  );
}
