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
import { publishConsentDecision } from '@/lib/consentBroadcast';
import { subscribeOpenCookieSettings } from '@/lib/consentBroadcast';
import { CookieSettingsDialog } from './CookieSettingsDialog';
import { applyAll } from '@/lib/consentChoices';
import { choiceKind } from '@/lib/consentChoices';
import { reportConsentChoice } from '@/lib/consentStatsClient';

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
 *   3. broadcast it (src/lib/consentBroadcast.js), then hide the banner
 *
 * ── TWO LAYERS SINCE CB-C ───────────────────────────────────────────────────
 *   layer 1  CookieBanner — a non-modal region, bottom-left card on desktop,
 *            bottom sheet on a phone: ยอมรับทั้งหมด / ปฏิเสธทั้งหมด / ตั้งค่าเพิ่มเติม
 *   layer 2  CookieSettingsDialog — the modal with the per-category switches,
 *            also opened from the footer's "ตั้งค่าคุกกี้" (consentBroadcast's
 *            open-settings event) showing the STORED choice
 * Every decision, from either layer, goes through handleDecision below. Closing
 * layer 2 without pressing one of its three buttons is not a decision.
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
    /* ── THIRD, AND ONLY THIRD: TELL EVERYTHING THAT IS NOT GOOGLE ────────
     *
     * Added when the Meta pixel arrived. The two steps above are unchanged in
     * content and in order, and this one is deliberately behind both: it is
     * the step with the most listeners and the least ceremony, so it is also
     * the most likely to grow something that throws. Behind the cookie write,
     * a subscriber that breaks costs this page view's pixel and nothing else —
     * ahead of it, the same break would lose the RECORD of a decision the user
     * made, and the banner would ask again as if they never answered.
     *
     * Google is not on this channel. gtag is told directly, one line up,
     * because Consent Mode's update has to reach a tag that is already loaded
     * and waiting for it; routing that through a fan-out would add a hop to
     * the one consumer that must not miss it.
     *
     * publishConsentDecision swallows its own failures for the same reason
     * gtagConsentUpdate returns silently — see src/lib/consentBroadcast.js.
     */
    publishConsentDecision(categories);
    setDecision(categories);
    setSettingsOpen(false);
    setToastKey((n) => n + 1);
  }, []);

  /* ── LAYER 2: OPEN / CLOSE, AND WHERE FOCUS GOES BACK TO ────────────────
   *
   * The opener is remembered so focus returns to it on close. Layer 1 is
   * hidden while the dialog is open (one consent surface at a time), so when
   * the opener was layer 1's own "ตั้งค่าเพิ่มเติม" it has been unmounted by the
   * time the dialog closes; the re-rendered button is found by its data
   * attribute instead. The footer's control stays mounted and is focused
   * directly.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openerRef = useRef(null);
  const openSettings = useCallback((event) => {
    const fromEvent = event?.currentTarget;
    openerRef.current = fromEvent
      ?? (typeof document !== 'undefined' ? document.activeElement : null);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  useEffect(() => subscribeOpenCookieSettings(() => openSettings()), [openSettings]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (settingsOpen) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const target = openerRef.current;
    openerRef.current = null;
    // After the commit that re-shows layer 1, so its button exists to receive focus.
    requestAnimationFrame(() => {
      if (target && target.isConnected) { target.focus(); return; }
      document.querySelector('[data-cookie-layer1-settings]')?.focus();
    });
  }, [settingsOpen]);

  /**
   * Every button lands here: the decision first (handleDecision, unchanged in
   * content and order), THEN the aggregate counter (CB-C §4). The report is
   * fire-and-forget and comes last, so a slow or failed POST cannot delay the
   * banner closing or lose the decision. `action` is which button; `layer`
   * is 1 (the card) or 2 (the settings panel).
   */
  const decide = useCallback((categories, action, layer) => {
    handleDecision(categories);
    reportConsentChoice({
      choice: choiceKind(action),
      analytics: categories.analytics === true,
      marketing: categories.marketing === true,
      layer,
    });
  }, [handleDecision]);

  /** Layer 2's three buttons. */
  const decideFromSettings = useCallback(
    (categories, action) => decide(categories, action, 2),
    [decide],
  );

  /* ── THE CONFIRMATION ───────────────────────────────────────────────────
   * A small role="status" note after every decision, auto-dismissed after
   * ~4s. Keyed by a counter so a second decision restarts the timer. */
  const [toastKey, setToastKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  useEffect(() => {
    if (toastKey === 0) return undefined;
    setToastVisible(true);
    const t = setTimeout(() => setToastVisible(false), 4000);
    return () => clearTimeout(t);
  }, [toastKey]);

  const allowedHere = mounted && shouldRenderCookieConsentBanner(pathname);
  const visible = allowedHere && !dismissed && !settingsOpen;

  /**
   * ── THE COLLISION, AND HOW IT IS RESOLVED ─────────────────────────────────
   * FloatingActionDock is `fixed … bottom-8 right-4` at z-50 and holds the
   * back-to-top button and the chat launcher. Since CB-C the banner is a
   * 420px card at the bottom-LEFT on ≥768px — a different column from the dock,
   * so the dock does not move — and a full-width bottom sheet on a phone, where
   * the dock WOULD sit on top of it. z-70 keeps the banner above the dock in
   * either case; the published box below lifts the dock clear of the sheet so
   * the launcher never covers the buttons.
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

  if (!allowedHere) return null;

  return (
    <>
      <CookieSettingsDialog
        open={settingsOpen}
        initial={decision}
        onClose={closeSettings}
        onDecision={decideFromSettings}
      />
      {toastVisible && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-3 left-3 right-3 z-70 md:bottom-8 md:left-8 md:right-auto md:max-w-[420px]"
        >
          <p className="pointer-events-auto rounded-[12px] bg-9e-navy px-4 py-3 text-[13px] leading-snug text-white shadow-lg dark:bg-[var(--surface-raised)] dark:text-[var(--text-primary)]">
            บันทึกการตั้งค่าคุกกี้แล้ว · เปลี่ยนได้ที่ &quot;ตั้งค่าคุกกี้&quot; ท้ายเว็บ
          </p>
        </div>
      )}
      {visible && (
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
     * pointer-events-none on the wrapper with auto on the card keeps any gutter
     * click-through.
     */
    <div
      data-cookie-consent-banner=""
      className="pointer-events-none fixed bottom-3 left-3 right-3 z-70 md:bottom-8 md:left-8 md:right-auto md:w-[420px]"
    >
      {/*
        Desktop (md, ≥768px): a 420px card 32px in from the bottom-left —
        left: 32px; bottom: 32px; width: 420px. Phone: a bottom sheet 12px from
        each edge. Both fixed, so neither shifts layout.
      */}
      <div className="pointer-events-auto" ref={cardRef}>
        <CookieBanner
          onAcceptAll={() => decide(applyAll(true), 'accept_all', 1)}
          onRejectAll={() => decide(applyAll(false), 'reject_all', 1)}
          onOpenSettings={openSettings}
        />
      </div>
    </div>
      )}
    </>
  );
}
