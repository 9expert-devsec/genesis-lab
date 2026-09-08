/**
 * Google Consent Mode v2 — the signal model, and the snippet that installs it.
 *
 * ══ ADVANCED MODE. THE TAG LOADS WITH CONSENT DENIED. ══════════════════════
 *
 * The tags still load on every page even when everything is denied. That is
 * the whole difference between advanced and basic mode, and it is deliberate:
 * with the tag present-but-denied, Google receives cookieless pings it can use
 * for behavioural modelling; withholding the script until consent forfeits that
 * modelling permanently for those visitors. So do NOT "optimise" this by
 * skipping the loader when consent is absent — that silently converts advanced
 * mode into basic mode and the loss does not show up anywhere as an error.
 *
 * What denied actually means: Google's tags still run, but they store nothing
 * on the device. No `_ga`, no `_gcl_*`. See the closing line of the round
 * report for what a rejecting visitor still transmits.
 *
 * ── WHY security_storage IS ALWAYS GRANTED ─────────────────────────────────
 * It covers fraud prevention and authentication — the strictly-necessary
 * category, which is not a choice under PDPA/GDPR and is not offered as a
 * toggle in the banner. Granting it is not a loophole: it is the one signal
 * that is lawful without consent.
 */

import { OPTIONAL_CATEGORY_KEYS } from '@/lib/consentCategories';

/**
 * The four signals the banner's optional categories control, plus the three
 * that are not user-controllable.
 *
 * `security_storage` is granted here and everywhere. Everything else starts
 * denied, and this object IS the state a first-time visitor is in.
 */
export const DENIED_DEFAULTS = Object.freeze({
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
});

/**
 * Category → signal mapping. ONE definition, used by both the `consent default`
 * that runs before the tag and the `consent update` the banner fires, so the
 * two can never disagree about what "การตลาด" means.
 *
 *   จำเป็น       → security_storage        (always granted, no toggle)
 *   วิเคราะห์     → analytics_storage
 *   ด้านฟังก์ชัน  → functionality_storage + personalization_storage
 *   การตลาด      → ad_storage + ad_user_data + ad_personalization
 *
 * @param {{analytics?: boolean, functional?: boolean, marketing?: boolean}|null} categories
 *        A parsed consent record, or null for "no decision yet".
 */
export function consentSignalsFor(categories) {
  if (!categories || typeof categories !== 'object') return { ...DENIED_DEFAULTS };
  const g = (on) => (on === true ? 'granted' : 'denied');
  return {
    ad_storage: g(categories.marketing),
    ad_user_data: g(categories.marketing),
    ad_personalization: g(categories.marketing),
    analytics_storage: g(categories.analytics),
    functionality_storage: g(categories.functional),
    personalization_storage: g(categories.functional),
    security_storage: 'granted',
  };
}

/**
 * The inline bootstrap that runs BEFORE gtag.js.
 *
 * ══ WHY THIS IS A PLAIN INLINE SCRIPT AND NOT A SERVER-READ COOKIE ═════════
 *
 * cookieConsentStore.js was written expecting the SERVER to read the cookie and
 * emit the right defaults into the SSR HTML. Measured cost of doing that:
 * `cookies()` from next/headers opts the calling route into DYNAMIC rendering,
 * and this runs in the ROOT layout — so every one of the 52 currently
 * prerendered pages would stop being static. That is a large, permanent
 * performance regression for a marketing site, paid to answer a question the
 * browser can answer for itself.
 *
 * An inline <script> in the SSR HTML executes during parse, synchronously,
 * before the async gtag.js has loaded — the identical guarantee, at zero
 * rendering cost. So the cookie is read here, from `document.cookie`, and the
 * store's reasoning still holds in the part that mattered: a COOKIE rather than
 * localStorage, because localStorage does not exist until scripts run and this
 * has to be decided in the same tick.
 *
 * ── IT REVALIDATES, RATHER THAN TRUSTING, WHAT IT READS ────────────────────
 * The validation below mirrors parseConsent(): schema version, an object (not
 * an array), an EXACT key-set match, and real booleans — `"false"` is a string
 * and is truthy, which is the classic way a denied record becomes a granted
 * one. Anything that fails ANY check falls through to DENIED_DEFAULTS and the
 * banner asks again. There is exactly one safe response to a consent record we
 * cannot read, and it is to not assume consent.
 *
 * Duplicating those rules in two languages is a real drift risk, so it is not
 * left to inspection: test/pure/consentBootstrap.test.mjs EXECUTES this string
 * against a fake document and asserts the same table of accept/reject cases
 * that cookieConsentStore.test.mjs asserts against parseConsent.
 *
 * ── EVERY COMMAND IS QUEUED HERE, INCLUDING THE CONFIGS ────────────────────
 * gtag commands are pushed onto dataLayer and processed when the library
 * arrives, so ordering within this script is what matters, not ordering
 * against the network. `consent default` is first, before `js` and both
 * `config` calls — that ordering is the entire contract of advanced mode.
 *
 * ── NO COMMENTS IN THE EMITTED STRING ─────────────────────────────────────
 * Everything explaining this snippet lives in THIS docblock, not inside the
 * template literal: the generated source ships inline in the HTML of every
 * page, so a comment in there is bytes paid for by every visitor on every
 * load. One note that would otherwise belong beside the code: it writes
 * `window.dataLayer.push`, not the bare `dataLayer` of Google's copy-paste
 * snippet. Identical in a browser, where the property IS a global — the
 * explicit form is what lets the test execute this against a fake window.
 *
 * `url_passthrough` keeps ad click ids (gclid) travelling in the URL when
 * ad_storage is denied, and `ads_data_redaction` further redacts ad identifiers
 * while denied. Both only do anything in the denied state, which is exactly the
 * state a first-time visitor is now in.
 *
 * @param {{ga4Id: string, adsId: string, cookieName: string, schemaVersion: number}} opts
 * @returns {string} JavaScript source, for a <script> tag's inner HTML.
 */
export function consentBootstrapScript({ ga4Id, adsId, cookieName, schemaVersion }) {
  const denied = JSON.stringify(DENIED_DEFAULTS);
  const keys = JSON.stringify([...OPTIONAL_CATEGORY_KEYS].sort());
  return `
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = gtag;
var c = ${denied};
try {
  var m = document.cookie.match(/(?:^|; )${cookieName}=([^;]*)/);
  if (m) {
    var p = JSON.parse(decodeURIComponent(m[1]));
    var k = p && p.categories;
    if (p && p.v === ${schemaVersion} && k && typeof k === 'object' && !Array.isArray(k)) {
      var got = Object.keys(k).sort();
      var want = ${keys};
      var ok = got.length === want.length && got.every(function (x, i) { return x === want[i]; })
        && got.every(function (x) { return typeof k[x] === 'boolean'; });
      if (ok) {
        var y = 'granted', n = 'denied';
        c = {
          ad_storage: k.marketing ? y : n,
          ad_user_data: k.marketing ? y : n,
          ad_personalization: k.marketing ? y : n,
          analytics_storage: k.analytics ? y : n,
          functionality_storage: k.functional ? y : n,
          personalization_storage: k.functional ? y : n,
          security_storage: y
        };
      }
    }
  }
} catch (e) {}
gtag('consent', 'default', c);
gtag('set', 'url_passthrough', true);
gtag('set', 'ads_data_redaction', true);
gtag('js', new Date());
gtag('config', '${ga4Id}', { send_page_view: false });
gtag('config', '${adsId}');
`.trim();
}
