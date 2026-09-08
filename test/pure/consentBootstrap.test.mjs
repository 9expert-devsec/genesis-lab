import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DENIED_DEFAULTS,
  consentSignalsFor,
  consentBootstrapScript,
} from '@/lib/analytics/consentMode';
import { OPTIONAL_CATEGORY_KEYS } from '@/lib/consentCategories';
import { CONSENT_COOKIE, CONSENT_SCHEMA_VERSION, serialiseConsent } from '@/lib/cookieConsentStore';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// The consent bootstrap is a STRING of JavaScript that runs before the Google
// tag, in a plain inline <script>. Nothing else in this repo is shaped like
// that, and the usual way to test it — assert the string contains 'denied' —
// proves nothing about what it DOES.
//
// So these tests EXECUTE it, against a fake `window`/`document`, and read the
// commands it queued onto dataLayer. That makes the drift risk the file's own
// header names — the same validation rules written twice, once in
// parseConsent() and once in generated JS — into something checkable rather
// than something to be careful about.

/** Run the bootstrap against a fake document.cookie; return the queued commands. */
function runBootstrap(cookieString) {
  const src = consentBootstrapScript({
    ga4Id: 'G-TEST', adsId: 'AW-TEST',
    cookieName: CONSENT_COOKIE, schemaVersion: CONSENT_SCHEMA_VERSION,
  });
  const win = {};
  const doc = { cookie: cookieString ?? '' };
  // `window`/`document` as parameters, and `this` bound to win, because the
  // script assigns `window.dataLayer` and declares a global `function gtag`.
  new Function('window', 'document', src).call(win, win, doc);
  return {
    commands: (win.dataLayer ?? []).map((args) => Array.from(args)),
    win,
  };
}

/** The argument object of the first `gtag('consent','default', …)` call. */
function defaultSignals(commands) {
  const hit = commands.find((c) => c[0] === 'consent' && c[1] === 'default');
  return hit ? hit[2] : null;
}

/** A cookie header carrying a valid, current-schema record. */
function cookieFor(categories) {
  return `${CONSENT_COOKIE}=${encodeURIComponent(serialiseConsent(categories, new Date().toISOString()))}`;
}

// ── THE MAPPING ─────────────────────────────────────────────────────────────

test('a first-time visitor is denied on every controllable signal', () => {
  for (const [signal, value] of Object.entries(DENIED_DEFAULTS)) {
    if (signal === 'security_storage') continue;
    assert.equal(value, 'denied', `${signal} must default to denied`);
  }
});

test('security_storage is granted, and is the ONLY signal that is', () => {
  assert.equal(DENIED_DEFAULTS.security_storage, 'granted');
  const granted = Object.entries(DENIED_DEFAULTS).filter(([, v]) => v === 'granted');
  assert.deepEqual(granted.map(([k]) => k), ['security_storage']);
});

test('all four Consent Mode v2 signals are present, plus the three others', () => {
  // Naming them literally: a missing signal is not an error anywhere, it just
  // silently leaves that storage class unspecified.
  for (const s of [
    'ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage',
    'functionality_storage', 'personalization_storage', 'security_storage',
  ]) {
    assert.ok(s in DENIED_DEFAULTS, `${s} missing from the defaults`);
  }
});

test('each category grants exactly the signals it owns, and no others', () => {
  const cases = [
    [{ analytics: true, functional: false, marketing: false }, ['analytics_storage']],
    [{ analytics: false, functional: true, marketing: false },
      ['functionality_storage', 'personalization_storage']],
    [{ analytics: false, functional: false, marketing: true },
      ['ad_storage', 'ad_user_data', 'ad_personalization']],
  ];
  for (const [categories, expected] of cases) {
    const out = consentSignalsFor(categories);
    const granted = Object.entries(out)
      .filter(([k, v]) => v === 'granted' && k !== 'security_storage')
      .map(([k]) => k).sort();
    assert.deepEqual(granted, [...expected].sort(), JSON.stringify(categories));
  }
});

test('accepting everything grants every signal; rejecting grants only security', () => {
  const all = consentSignalsFor({ analytics: true, functional: true, marketing: true });
  assert.equal(Object.values(all).every((v) => v === 'granted'), true);

  const none = consentSignalsFor({ analytics: false, functional: false, marketing: false });
  assert.deepEqual(none, { ...DENIED_DEFAULTS });
});

test('a null / absent decision is denied, not granted', () => {
  for (const junk of [null, undefined, 'yes', 0, []]) {
    assert.deepEqual(consentSignalsFor(junk), { ...DENIED_DEFAULTS }, String(junk));
  }
});

// ── THE EXECUTED BOOTSTRAP ──────────────────────────────────────────────────

test('ORDERING: consent default is queued BEFORE js and before either config', () => {
  // The entire contract of advanced mode. If `config` reaches the tag first,
  // the tag has already acted before being told what it may store.
  const { commands } = runBootstrap('');
  const kinds = commands.map((c) => `${c[0]}${c[0] === 'config' ? ` ${c[1]}` : ''}`);
  const iConsent = kinds.indexOf('consent');
  const iJs = kinds.indexOf('js');
  const iGa = kinds.findIndex((k) => k.startsWith('config G-'));
  const iAds = kinds.findIndex((k) => k.startsWith('config AW-'));
  assert.ok(iConsent >= 0, 'no consent command was queued');
  assert.ok(iConsent < iJs, `consent (${iConsent}) must precede js (${iJs})`);
  assert.ok(iConsent < iGa, `consent (${iConsent}) must precede config GA4 (${iGa})`);
  assert.ok(iConsent < iAds, `consent (${iConsent}) must precede config Ads (${iAds})`);
});

test('with no cookie, the executed default is exactly DENIED_DEFAULTS', () => {
  assert.deepEqual(defaultSignals(runBootstrap('').commands), { ...DENIED_DEFAULTS });
});

test('url_passthrough and ads_data_redaction are both set', () => {
  const { commands } = runBootstrap('');
  const sets = commands.filter((c) => c[0] === 'set');
  assert.deepEqual(
    Object.fromEntries(sets.map((c) => [c[1], c[2]])),
    { url_passthrough: true, ads_data_redaction: true },
  );
});

test('window.gtag is installed, so the update helper has something to call', () => {
  // gtagConsentUpdate() returns silently when window.gtag is absent. If the
  // bootstrap did not publish it, every banner decision would be a no-op that
  // looks like it worked.
  const { win } = runBootstrap('');
  assert.equal(typeof win.gtag, 'function');
});

test('A STORED CHOICE BECOMES THE DEFAULT — no denied-then-flip for returning visitors', () => {
  const { commands } = runBootstrap(cookieFor({ analytics: true, functional: false, marketing: true }));
  assert.deepEqual(defaultSignals(commands), {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
  });
  // And it is applied as `default`, not as a later `update`.
  assert.equal(commands.some((c) => c[0] === 'consent' && c[1] === 'update'), false,
    'the bootstrap must not emit an update — that is the banner\'s job');
});

test('the bootstrap agrees with consentSignalsFor for every combination', () => {
  // Eight combinations, both implementations, same answer. This is the drift
  // check the two-languages problem actually needs.
  for (const analytics of [false, true]) {
    for (const functional of [false, true]) {
      for (const marketing of [false, true]) {
        const categories = { analytics, functional, marketing };
        assert.deepEqual(
          defaultSignals(runBootstrap(cookieFor(categories)).commands),
          consentSignalsFor(categories),
          JSON.stringify(categories),
        );
      }
    }
  }
});

// ── AN UNREADABLE RECORD MUST DENY, NOT GUESS ───────────────────────────────

test('every untrustworthy cookie falls back to denied', () => {
  const bad = {
    'not json': `${CONSENT_COOKIE}=%7Bnope`,
    'wrong schema version': `${CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify({ v: CONSENT_SCHEMA_VERSION + 1, categories: { analytics: true, functional: true, marketing: true } }))}`,
    'categories is an array': `${CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify({ v: CONSENT_SCHEMA_VERSION, categories: [] }))}`,
    'missing a key': `${CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify({ v: CONSENT_SCHEMA_VERSION, categories: { analytics: true, functional: true } }))}`,
    'an extra key': `${CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify({ v: CONSENT_SCHEMA_VERSION, categories: { analytics: true, functional: true, marketing: true, ads: true } }))}`,
    'string "false" instead of boolean': `${CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify({ v: CONSENT_SCHEMA_VERSION, categories: { analytics: 'false', functional: 'false', marketing: 'false' } }))}`,
    'string "true" instead of boolean': `${CONSENT_COOKIE}=${encodeURIComponent(
      JSON.stringify({ v: CONSENT_SCHEMA_VERSION, categories: { analytics: 'true', functional: 'true', marketing: 'true' } }))}`,
    'a different cookie entirely': 'some_other=1',
    'empty': '',
  };
  for (const [label, cookie] of Object.entries(bad)) {
    assert.deepEqual(defaultSignals(runBootstrap(cookie).commands), { ...DENIED_DEFAULTS }, label);
  }
});

test('the record is found even when it is not the first cookie in the header', () => {
  const real = cookieFor({ analytics: true, functional: true, marketing: true });
  const { commands } = runBootstrap(`other=1; ${real}; another=2`);
  assert.equal(defaultSignals(commands).analytics_storage, 'granted');
});

test('a cookie whose NAME merely ends with ours is not mistaken for it', () => {
  // `x9e_cookie_consent=` must not match. The regex anchors on start-or-"; ".
  const granted = encodeURIComponent(
    serialiseConsent({ analytics: true, functional: true, marketing: true }, new Date().toISOString()));
  const { commands } = runBootstrap(`x${CONSENT_COOKIE}=${granted}`);
  assert.deepEqual(defaultSignals(commands), { ...DENIED_DEFAULTS });
});

test('the bootstrap never throws, whatever the cookie header contains', () => {
  for (const junk of ['', '=', ';;;', `${CONSENT_COOKIE}=`, `${CONSENT_COOKIE}=%E0%A4%A`, 'a=b; c']) {
    assert.doesNotThrow(() => runBootstrap(junk), junk);
  }
});

test('the key set it validates against is the one the store parses against', () => {
  // Not a re-statement of the list: this asserts the GENERATED SOURCE carries
  // the same keys, so adding a fourth category cannot update one and not the
  // other without a test going red.
  const src = consentBootstrapScript({
    ga4Id: 'G-X', adsId: 'AW-X', cookieName: CONSENT_COOKIE, schemaVersion: CONSENT_SCHEMA_VERSION,
  });
  for (const k of OPTIONAL_CATEGORY_KEYS) {
    assert.ok(src.includes(`"${k}"`), `${k} is not validated by the bootstrap`);
  }
});

// ── CONTROLS: every probe above must be able to go red ──────────────────────

test('CONTROL: the executed-default probe reports granted when it IS granted', () => {
  const all = defaultSignals(runBootstrap(
    cookieFor({ analytics: true, functional: true, marketing: true })).commands);
  assert.equal(all.analytics_storage, 'granted');
  assert.notDeepEqual(all, { ...DENIED_DEFAULTS });
});

test('CONTROL: the ordering probe would catch a consent command queued late', () => {
  const commands = [['js', 1], ['config', 'G-X'], ['consent', 'default', {}]].map((c) => c);
  const kinds = commands.map((c) => c[0]);
  assert.equal(kinds.indexOf('consent') < kinds.indexOf('js'), false,
    'a late consent command must be detectable as out of order');
});

test('CONTROL: runBootstrap really does observe the cookie it is given', () => {
  const a = defaultSignals(runBootstrap('').commands);
  const b = defaultSignals(runBootstrap(
    cookieFor({ analytics: true, functional: false, marketing: false })).commands);
  assert.notDeepEqual(a, b, 'the harness ignores its cookie argument — every case above is vacuous');
});
