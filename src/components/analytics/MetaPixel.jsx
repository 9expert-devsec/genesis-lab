'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { FBEVENTS_SRC, initMetaPixel, setMetaPixelConsent } from '@/lib/analytics/metaPixel';
import { parseConsent, readConsentCookie } from '@/lib/cookieConsentStore';
import { OPTIONAL_CATEGORY_KEYS } from '@/lib/consentCategories';
import { subscribeConsentDecision } from '@/lib/consentBroadcast';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  MetaPixel — loads fbevents.js, and ONLY after marketing consent.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Renders nothing until marketing is granted. Not a hidden element, not a
 * denied tag: nothing, and therefore no request to connect.facebook.net. The
 * reason that differs from how gtag.js is handled two components over lives in
 * src/lib/analytics/metaPixel.js and in the advanced-mode docblock in
 * consentMode.js — Google's denied tag buys cookieless modelling, Meta has no
 * equivalent, so a denied-but-loaded pixel is a pure giveaway of IP and user
 * agent.
 *
 * ── TWO INPUTS, ONE RULE ────────────────────────────────────────────────────
 * The stored cookie, read once on mount, and the broadcast from
 * src/lib/consentBroadcast.js, which is how a decision made in THIS page view
 * arrives. Both are fed through the same `marketing === true` test; a visitor
 * who accepts on the banner gets the pixel without a reload, and a visitor who
 * arrives with the cookie already set gets it without waiting for one.
 *
 * ── WHY THE COOKIE IS READ IN AN EFFECT AND NOT DURING RENDER ───────────────
 * Same rule the consent banner follows. Reading document.cookie in a render
 * (even via a lazy useState initialiser) makes the server render and the first
 * client render disagree — the server has no cookie and would emit nothing
 * while the client emits a <script> — which is a hydration mismatch. Deferring
 * one commit costs a frame and nothing else; the pixel is not on the critical
 * path for anything the visitor can see.
 *
 * ── WHY next/script AND NOT THE BASE CODE'S OWN INSERT ──────────────────────
 * Meta's snippet builds a <script> element and inserts it before the first one
 * in the document. next/script does the same job with `afterInteractive`, but
 * the framework owns the element's lifecycle, deduplicates by `id` across
 * re-renders and route changes, and keeps the load off the critical path.
 * Hand-inserting would re-insert on every commit unless guarded by hand.
 *
 * Crucially the ORDERING problem that forced Analytics.jsx to use a plain
 * inline <script> does not exist here. There, `consent default` had to be
 * queued before an async library could arrive. Here the stub, `init` and
 * `consent grant` are all installed SYNCHRONOUSLY by initMetaPixel below,
 * before this component even asks for the script — so by the time fbevents.js
 * lands, its queue already holds the commands in the right order, whenever it
 * happens to land.
 */
export function MetaPixel() {
  /**
   * `null` is the third state and it is load-bearing, exactly as it is in
   * CookieConsentBanner: "not read yet" is not "read, and denied". Only a
   * literal `true` ever loads anything.
   */
  const [marketing, setMarketing] = useState(null);

  useEffect(() => {
    const apply = (categories) => setMarketing(categories?.marketing === true);

    apply(parseConsent(readConsentCookie(), OPTIONAL_CATEGORY_KEYS));

    // The unsubscribe is returned directly — subscribeConsentDecision hands
    // back a teardown function for this shape.
    return subscribeConsentDecision(apply);
  }, []);

  useEffect(() => {
    if (marketing === null) return;
    if (marketing) {
      // Idempotent, and it does the whole install: stub, init, consent grant.
      // Safe to call on every grant; the second one returns immediately.
      initMetaPixel();
    } else {
      // Only does anything if the pixel was ALREADY loaded — a revoke for a
      // pixel that never loaded is already true. See setMetaPixelConsent for
      // why a revoke is not, and cannot be, an unload.
      setMetaPixelConsent(false);
    }
  }, [marketing]);

  // Nothing requested, nothing rendered, for a visitor who has not granted.
  if (marketing !== true) return null;

  return (
    <Script
      id="meta-pixel"
      strategy="afterInteractive"
      src={FBEVENTS_SRC}
    />
  );
}
