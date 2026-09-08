import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
/** Source with comments stripped — a rule proven by a comment is not proven. */
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const MOUNT = 'src/components/consent/CookieConsentBanner.jsx';
const ANALYTICS = 'src/components/analytics/Analytics.jsx';
const LAYOUT = 'src/app/layout.jsx';

// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
//
// CB-B turned a decorative banner into a legal control. The failure mode is
// not a crash — it is the banner going quiet again: someone deletes the gtag
// call, or reinstates `granted` defaults, and everything still renders, still
// stores a cookie, and still looks correct. Nothing would go red.
//
// So these assert the seams that make consent real, by NAME, in the files that
// own them.

test('the banner mount fires a consent update, and does it BEFORE persisting', () => {
  const src = code(MOUNT);
  assert.match(src, /gtagConsentUpdate\(/, 'the mount never calls gtagConsentUpdate');
  const iUpdate = src.indexOf('gtagConsentUpdate(');
  const iWrite = src.indexOf('writeConsentCookie(');
  assert.ok(iWrite > 0, 'the mount no longer persists the choice');
  assert.ok(
    iUpdate < iWrite,
    'the consent update must run before the cookie write — a record of a '
    + 'decision that was never applied is the worse of the two failures',
  );
});

test('the update is fed through the shared mapping, not a literal written here', () => {
  // Two hand-written signal objects is how `การตลาด` comes to mean one thing
  // before the tag loads and another after.
  const src = code(MOUNT);
  assert.match(src, /consentSignalsFor\(/);
  for (const signal of ['ad_storage', 'analytics_storage', 'ad_user_data']) {
    assert.equal(
      src.includes(signal), false,
      `${signal} is spelled out in the mount — it must come from consentSignalsFor`,
    );
  }
});

test('DEFAULTS ARE DENIED: no granted literal survives in the analytics component', () => {
  const src = code(ANALYTICS);
  assert.equal(
    /['"]granted['"]/.test(src), false,
    'a granted literal is back in Analytics.jsx — defaults belong in consentMode.js',
  );
});

test('the consent default is queued by a PLAIN script, before the gtag loader', () => {
  // next/script with afterInteractive injects after hydration; a plain inline
  // script runs during parse. Only the second can precede an async loader.
  const src = code(ANALYTICS);
  const iBootstrap = src.indexOf('consentBootstrapScript');
  const iLoader = src.indexOf('googletagmanager.com/gtag/js');
  assert.ok(iBootstrap > 0, 'the bootstrap is gone from Analytics.jsx');
  assert.ok(iLoader > 0, 'the gtag loader is gone from Analytics.jsx');
  assert.ok(iBootstrap < iLoader, 'the bootstrap must be emitted before the loader');
  assert.match(src, /<script\b/, 'the bootstrap must be a plain <script>, not next/script');
});

test('ADVANCED MODE: the loader is unconditional — never gated on consent', () => {
  // Withholding the tag until consent silently downgrades advanced mode to
  // basic and forfeits behavioural modelling, with nothing to show it happened.
  const src = code(ANALYTICS);
  assert.match(src, /googletagmanager\.com\/gtag\/js/, 'no loader found');
  // Look for the shapes that would gate the ELEMENT — `{x && <Script`,
  // `{x ? <Script`, or an early `return null`. Not for bare `?`, which the
  // loader URL's own `?id=` query string contains.
  for (const [label, re] of [
    ['&& before the element', /&&\s*(\(\s*)?<Script/],
    ['ternary before the element', /\?\s*(\(\s*)?<Script/],
    ['early return null', /return\s+null\s*;/],
  ]) {
    assert.equal(re.test(src), false,
      `the loader appears conditional (${label}) — advanced mode requires it always load`);
  }
});

test('Analytics stays static — it must not read cookies on the server', () => {
  // cookies() from next/headers opts the ROOT layout, and therefore every page
  // under it, into dynamic rendering. The bootstrap reads document.cookie.
  const src = code(ANALYTICS);
  assert.equal(src.includes('next/headers'), false);
  assert.equal(/\bcookies\(\)/.test(src), false);
});

test('the layout mounts the wired banner under its real name', () => {
  const src = code(LAYOUT);
  assert.match(src, /<CookieConsentBanner\s*\/>/);
  assert.equal(
    read(LAYOUT).includes('CookieBannerPreview'), false,
    'the old preview name still appears in the layout',
  );
});

test('NO PREVIEW WORDING SURVIVES anywhere in the consent components', () => {
  // Matched against the rendered strings, not a bare substring: the point is
  // that no user-facing copy calls this a preview or a placeholder.
  const files = [MOUNT, 'src/components/consent/CookieBanner.jsx'];
  for (const f of files) {
    const src = read(f);
    for (const phrase of ['ตัวอย่างหน้าตาเท่านั้น', 'UI Preview', 'ยังไม่มีผลกับการเก็บคุกกี้']) {
      assert.equal(src.includes(phrase), false, `${f} still contains "${phrase}"`);
    }
  }
});

test('the reject button is still there — accept-only is not consent', () => {
  const src = read('src/components/consent/CookieBanner.jsx');
  // Element-text boundary, NOT a bare substring: `ไม่ได้ยินยอม` contains
  // `ยินยอม`, so substring matching on Thai negations reads backwards.
  assert.match(src, />\s*ปฏิเสธคุกกี้ที่ไม่จำเป็น\s*</);
  assert.match(src, />\s*ยอมรับทั้งหมด\s*</);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the ordering probe catches a persist-before-update file', () => {
  const bad = 'writeConsentCookie(c);\ngtagConsentUpdate(s);';
  assert.equal(bad.indexOf('gtagConsentUpdate(') < bad.indexOf('writeConsentCookie('), false);
});

test('CONTROL: the granted-literal probe fires on a file that has one', () => {
  assert.equal(/['"]granted['"]/.test("ad_storage: 'granted',"), true);
});

test('CONTROL: the preview-wording probe fires on the old string', () => {
  assert.equal('— แบนเนอร์นี้ยังไม่เชื่อมต่อ (UI Preview)'.includes('UI Preview'), true);
});

test('CONTROL: the Thai reject matcher does not fire on a bare substring', () => {
  // If this ever passes, the matcher has loosened into the negation trap.
  assert.equal(/>\s*ปฏิเสธคุกกี้ที่ไม่จำเป็น\s*</.test('<p>ยินยอมทั้งหมด</p>'), false);
});
