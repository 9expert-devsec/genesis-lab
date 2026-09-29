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
const PIXEL = 'src/components/analytics/MetaPixel.jsx';
const TRACKER = 'src/components/analytics/MetaPixelPageTracker.jsx';
const PIXEL_LIB = 'src/lib/analytics/metaPixel.js';
const CONFIG = 'src/lib/analytics/config.js';
const CONSENT_MODE = 'src/lib/analytics/consentMode.js';
const LAYOUT = 'src/app/layout.jsx';
const NEXT_CONFIG = 'next.config.mjs';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SEAMS THE META PIXEL HANGS ON.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * test/render/metaPixelConsentGate proves the BEHAVIOUR — that nothing is
 * requested without consent. This file guards the structural facts around it
 * that a behavioural test cannot see going wrong, because each of them fails
 * silently and in the flattering direction:
 *
 *   · the pixel stops being mounted at all (nothing breaks, nothing tracks)
 *   · Analytics.jsx acquires a client dependency and the whole site stops
 *     being prerendered (nothing breaks, everything gets slower)
 *   · the CSP loses a host (nothing breaks TODAY — the header is Report-Only)
 *   · the decision stops being broadcast (consent works, but only on reload)
 */

// ── THE MOUNT ───────────────────────────────────────────────────────────────

test('the layout mounts the pixel AND its page tracker', () => {
  const src = code(LAYOUT);
  assert.match(src, /<MetaPixel\s*\/>/, 'the pixel is not mounted');
  assert.match(src, /<MetaPixelPageTracker\s*\/>/, 'the page tracker is not mounted');
});

test('the page tracker is inside the EXISTING Suspense, the pixel is not', () => {
  // The pixel calls no URL hook, so a boundary of its own would be ceremony.
  // The tracker sits in the existing one beside its GA4 sibling.
  const src = code(LAYOUT);
  const iPixel = src.indexOf('<MetaPixel />');
  const iSuspense = src.indexOf('<Suspense');
  const iTracker = src.indexOf('<MetaPixelPageTracker />');
  const iClose = src.indexOf('</Suspense>');
  assert.ok(iPixel > 0 && iSuspense > 0 && iTracker > 0 && iClose > 0);
  assert.ok(iPixel < iSuspense, 'the pixel was moved inside a Suspense boundary');
  assert.ok(
    iTracker > iSuspense && iTracker < iClose,
    'the Meta page tracker is not inside the Suspense boundary',
  );
});

// ── ANALYTICS.JSX IS UNTOUCHED ──────────────────────────────────────────────

test('ANALYTICS.JSX KNOWS NOTHING ABOUT META — it must stay a server component', () => {
  /*
   * The pixel's whole load decision depends on a cookie only the browser may
   * read. Putting any of that in Analytics.jsx would make it a client
   * component, or worse make it call cookies(), and either one opts the ROOT
   * layout — and with it every prerendered page on the site — into dynamic
   * rendering. See the long note in src/lib/analytics/consentMode.js.
   */
  const src = code(ANALYTICS);
  for (const token of ['fbq', 'facebook', 'MetaPixel', 'META_PIXEL_ID']) {
    assert.equal(
      src.toLowerCase().includes(token.toLowerCase()), false,
      `Analytics.jsx now references "${token}" — it must stay Meta-free and static`,
    );
  }
  assert.equal(src.includes("'use client'"), false, 'Analytics.jsx became a client component');
});

test('the pixel components ARE client components', () => {
  for (const f of [PIXEL, TRACKER]) {
    assert.match(read(f), /^'use client';/, `${f} is missing its 'use client' directive`);
  }
});

// ── THE LOAD GATE ───────────────────────────────────────────────────────────

test('THE LOADER IS CONDITIONAL — the inverse of the Google rule one file over', () => {
  // test/fs/consentWiring asserts the OPPOSITE of this about Analytics.jsx,
  // deliberately. Google's denied tag earns cookieless modelling; Meta's earns
  // nothing, so a denied-but-loaded pixel is a free gift of IP and user agent.
  const src = code(PIXEL);
  assert.match(
    src, /return null;/,
    'the pixel component has no early return — it may be rendering unconditionally',
  );
  assert.match(
    src, /marketing !== true/,
    'the gate is no longer a strict `marketing !== true` test',
  );
});

test('the gate tests for a LITERAL true, never a truthy value', () => {
  // `"false"` is a string and is truthy — the classic way a denied record
  // becomes a granted one. parseConsent rejects it; this is the second line.
  const src = code(PIXEL);
  assert.match(src, /marketing === true/, 'the broadcast handler lost its strict check');
  assert.equal(
    /marketing\s*\?\s*</.test(src), false,
    'the gate became a truthiness test',
  );
});

test('the library URL lives in ONE place', () => {
  // Two spellings is how the CSP comes to allow a host nothing requests, and
  // requests a host it does not allow.
  assert.match(code(PIXEL_LIB), /FBEVENTS_SRC = 'https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js'/);
  assert.equal(
    code(PIXEL).includes('connect.facebook.net'), false,
    'the component hardcodes the URL instead of importing FBEVENTS_SRC',
  );
});

test('the pixel id is hardcoded in config.js, beside GA4_ID and ADS_ID', () => {
  const src = code(CONFIG);
  assert.match(src, /export const META_PIXEL_ID = '\d+';/, 'META_PIXEL_ID is missing or not a digit run');
  // And nowhere else: a second copy is a second thing to change.
  assert.equal(
    code(PIXEL).includes('1256361497884237'), false,
    'the pixel id is spelled out in the component too',
  );
});

// ── THE BROADCAST ───────────────────────────────────────────────────────────

test('THE EXISTING ORDER SURVIVES: gtag update, THEN the cookie write', () => {
  // Unchanged from test/fs/consentWiring, restated here because this round
  // inserted a third step into that function and the risk was reordering it.
  const src = code(MOUNT);
  const iUpdate = src.indexOf('gtagConsentUpdate(');
  const iWrite = src.indexOf('writeConsentCookie(');
  assert.ok(iUpdate > 0 && iWrite > 0);
  assert.ok(iUpdate < iWrite, 'the consent update no longer precedes the cookie write');
});

test('the broadcast is published LAST — after both existing steps', () => {
  /*
   * It is the step with the most listeners and the least ceremony, so it is
   * the most likely to grow something that throws. Behind the cookie write, a
   * broken subscriber costs this page view's pixel. Ahead of it, the same
   * break loses the RECORD of a decision the user made, and the banner asks
   * again as if they never answered.
   */
  const src = code(MOUNT);
  const iWrite = src.indexOf('writeConsentCookie(');
  const iPublish = src.indexOf('publishConsentDecision(');
  assert.ok(iPublish > 0, 'the decision is never broadcast — consent would need a reload');
  assert.ok(iPublish > iWrite, 'the broadcast was moved ahead of the cookie write');
});

test('the broadcast is a window event, NOT a React context', () => {
  // A context provider would have to wrap the tree from the root layout,
  // which is the same class of regression as calling cookies() there.
  const src = code('src/lib/consentBroadcast.js');
  assert.match(src, /addEventListener\(/);
  assert.match(src, /dispatchEvent\(/);
  assert.equal(src.includes('createContext'), false, 'the broadcast became a React context');
});

test('the pixel subscribes to the broadcast AND reads the cookie', () => {
  // Either one alone is a half-working gate: cookie-only ignores a decision
  // made in this page view, broadcast-only ignores a returning visitor.
  const src = code(PIXEL);
  assert.match(src, /subscribeConsentDecision\(/);
  assert.match(src, /parseConsent\(\s*readConsentCookie\(\)/);
});

// ── THE DOCUMENTED REASONING ────────────────────────────────────────────────

test('consentMode.js explains why Meta is gated and Google is not', () => {
  /*
   * Not a style rule. The advanced-mode note in that file tells the reader, at
   * length, NOT to gate the loader on consent. Someone who reads it and then
   * finds MetaPixel.jsx doing exactly that will reasonably conclude one of the
   * two is a mistake — and the cheap "fix" is to remove the gate. The
   * counter-argument has to live next to the argument.
   */
  /*
   * Read as PROSE, not as source: the phrases this looks for are wrapped
   * across comment lines, so `* ` and the newlines are flattened first. A
   * matcher that did not would go red on a re-wrap, which teaches the next
   * person to delete the test rather than keep the note.
   */
  const prose = read(CONSENT_MODE).replace(/^\s*\*\s?/gm, '').replace(/\s+/g, ' ');
  assert.match(prose, /connect\.facebook\.net/, 'consentMode.js never mentions the pixel host');
  assert.ok(
    prose.includes('modelling') && prose.includes('IP address'),
    'the note no longer states the trade: Google earns modelling, Meta earns nothing',
  );
});

// ── THE CSP ─────────────────────────────────────────────────────────────────

/** The Report-Only policy, split into directives, read from the real config. */
function cspDirectives() {
  const src = read(NEXT_CONFIG);
  const out = new Map();
  for (const name of ['script-src', 'connect-src', 'img-src', 'style-src', 'frame-src', 'default-src', 'font-src', 'media-src']) {
    const m = src.match(new RegExp(`"${name} ([^"]*)"`));
    if (m) out.set(name, m[1].split(/\s+/).filter(Boolean));
  }
  return out;
}

test('CSP: script-src allows connect.facebook.net', () => {
  assert.ok(
    cspDirectives().get('script-src').includes('https://connect.facebook.net'),
    'fbevents.js would be blocked the moment the CSP is enforced',
  );
});

test('CSP: connect-src allows connect.facebook.net AND www.facebook.com', () => {
  const connect = cspDirectives().get('connect-src');
  assert.ok(connect.includes('https://connect.facebook.net'));
  assert.ok(connect.includes('https://www.facebook.com'), 'the event endpoint is not allowed');
});

test('CSP: img-src allows www.facebook.com — the pixel beacons are images', () => {
  assert.ok(cspDirectives().get('img-src').includes('https://www.facebook.com'));
});

test('CSP: EXACTLY three additions, and no other directive gained a Facebook host', () => {
  /*
   * The guard against a broad "just allow facebook everywhere" edit. Four
   * tokens total: one in script-src, two in connect-src, one in img-src.
   * frame-src in particular must NOT gain one — nothing here embeds Facebook,
   * and an allowed frame host is a clickjacking surface bought for nothing.
   */
  const counts = [...cspDirectives()].map(
    ([name, tokens]) => [name, tokens.filter((t) => t.includes('facebook')).length],
  );
  assert.deepEqual(
    counts.filter(([, n]) => n > 0).sort(),
    [['connect-src', 2], ['img-src', 1], ['script-src', 1]],
  );
});

test('CSP: still Report-Only — this round does not start enforcing', () => {
  // Adding the hosts ahead of enforcement is the whole point; flipping the
  // header at the same time would make any breakage impossible to attribute.
  assert.match(read(NEXT_CONFIG), /key: 'Content-Security-Policy-Report-Only'/);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the CSP parser really reads the file, not an empty map', () => {
  // Without this every CSP assertion above is satisfied by a parser that
  // returns nothing and an `.includes` on an empty array... which would throw.
  // The real risk is the opposite: a renamed directive silently yielding
  // undefined. So pin a host that has nothing to do with this round.
  const d = cspDirectives();
  assert.ok(d.size >= 6, `only ${d.size} directives parsed — the matcher has drifted`);
  assert.ok(d.get('script-src').includes('https://cdn.omise.co'), 'the parser lost existing hosts');
});

test('CONTROL: the three-addition count would SEE a fourth', () => {
  // Driven against a hand-built map shaped like the real one.
  const fake = new Map([
    ['script-src', ["'self'", 'https://connect.facebook.net']],
    ['frame-src', ['https://www.facebook.com']],
  ]);
  const counts = [...fake].map(([n, t]) => [n, t.filter((x) => x.includes('facebook')).length]);
  assert.deepEqual(counts.sort(), [['frame-src', 1], ['script-src', 1]]);
});

test('CONTROL: the Analytics.jsx token scan fires on a file that has one', () => {
  assert.equal("import { MetaPixel } from 'x';".toLowerCase().includes('metapixel'), true);
});

test('CONTROL: the ordering probe catches a broadcast-before-cookie file', () => {
  const bad = 'publishConsentDecision(c);\nwriteConsentCookie(c);';
  assert.equal(bad.indexOf('publishConsentDecision(') > bad.indexOf('writeConsentCookie('), false);
});
