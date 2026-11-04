import Script from 'next/script';
import { GA4_ID, ADS_ID, GTM_ID, GTM_ENABLED } from '@/lib/analytics/config';
import { consentBootstrapScript } from '@/lib/analytics/consentMode';
import { CONSENT_COOKIE, CONSENT_SCHEMA_VERSION } from '@/lib/cookieConsentStore';

/**
 * GA4 + Google Ads, under Consent Mode v2 ADVANCED.
 *
 * Renders two things and no UI:
 *   1. a PLAIN inline <script> that installs the consent defaults, and
 *   2. the async gtag.js loader.
 *
 * ══ THE ORDER OF THOSE TWO IS THE ENTIRE POINT ═════════════════════════════
 *
 * `gtag('consent','default',…)` MUST be queued before the Google tag runs, or
 * the tag briefly operates with no consent state at all and may write storage
 * before being told not to. That window is the whole defect Consent Mode
 * exists to close.
 *
 * A plain <script> — not next/script — is what guarantees it. It sits in the
 * SSR HTML and executes during parse, synchronously, before an `async` external
 * script can possibly have arrived. `next/script` with strategy
 * `afterInteractive` injects AFTER hydration, so two afterInteractive tags are
 * ordered relative to each other but both run late; that is what this file did
 * before, and it is why the defaults were previously just hardcoded `granted`
 * with no way to be anything else.
 *
 * NOT `strategy="beforeInteractive"` either: it is hoisted by the framework,
 * which makes the ordering a property of Next's internals rather than of the
 * document, and it is the kind of thing that changes in a minor release. The
 * document order of a plain script is not going to change.
 *
 * ── THIS COMPONENT STAYS STATIC ────────────────────────────────────────────
 * It deliberately does NOT read the cookie server-side. Doing so means
 * `cookies()` from next/headers, which opts this root layout — and therefore
 * every page under it — into dynamic rendering. See the long note in
 * consentMode.js. The bootstrap reads document.cookie itself instead, in the
 * same tick, and this component remains prerenderable.
 *
 * ── WHY THE TAG STILL LOADS WHEN EVERYTHING IS DENIED ──────────────────────
 * Advanced mode. Removing the loader for non-consenting visitors looks like a
 * privacy improvement and is really a downgrade to basic mode: it forfeits the
 * cookieless modelling that advanced mode buys, silently and permanently.
 *
 * ── GTM MODE (NEXT_PUBLIC_GTM_ID set) ──────────────────────────────────────
 * The same two things, in the same order: the bootstrap (consent default, then
 * the gtm.js start event — no gtag config, see consentMode.js), and then
 * gtm.js INSTEAD of gtag/js. Never both: two loaders would be two Google
 * tags, and the container's own Google tag is the only one there should be.
 *
 * No <noscript> iframe. Google's snippet has one, and it loads the container
 * for visitors without JavaScript with no consent state at all — the exact
 * window this component exists to close.
 *
 * The loader is ONE unconditional <Script> whose URL is chosen at build time —
 * not two elements behind a condition — so the advanced-mode guard in
 * test/fs/consentWiring.test.mjs still sees a tag that always loads.
 */
const LOADER = GTM_ENABLED
  ? { id: 'gtm-src', src: `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}` }
  : { id: 'gtag-src', src: `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}` };

export function Analytics() {
  return (
    <>
      <script
        id="gtag-consent-bootstrap"
        // eslint-disable-next-line react/no-danger -- generated from a pure,
        // tested function; see test/pure/consentBootstrap.test.mjs, which
        // EXECUTES this string rather than pattern-matching it.
        dangerouslySetInnerHTML={{
          __html: consentBootstrapScript({
            ga4Id: GA4_ID,
            adsId: ADS_ID,
            cookieName: CONSENT_COOKIE,
            schemaVersion: CONSENT_SCHEMA_VERSION,
            gtmId: GTM_ID,
          }),
        }}
      />
      <Script
        id={LOADER.id}
        strategy="afterInteractive"
        src={LOADER.src}
        async
      />
    </>
  );
}
