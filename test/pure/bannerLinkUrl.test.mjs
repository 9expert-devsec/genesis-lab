import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDangerousLinkUrl,
  resolveBannerLink,
  warnBlockedBannerLink,
} from '@/lib/bannerLinkUrl';
import { safeUrl } from '@/lib/pageBuilder/safeUrl';

/**
 * src/lib/bannerLinkUrl.js — the banner link_url blocklist and classifier.
 *
 * ── THE DEFECT THIS FILE IS BUILT AROUND ────────────────────────────────────
 * The first implementation normalised with `new RegExp('[\s...]', 'g')` — a
 * STRING literal, where `\s` is not a valid escape and silently collapses to a
 * bare `s`. The character class became one that strips THE LETTER "s", so
 * `javascript:alert(1)` normalised to `javacript:alert(1)`, matched nothing on
 * the blocklist, and was emitted as a live href. The guard was inverted by a
 * typo in a quoting rule and still read as correct.
 *
 * That bug was caught by an ad-hoc check BEFORE these tests existed, which
 * means every test below was written against already-correct code and none of
 * them can claim, on its own, that it would have caught it. So the claim is
 * made the only way it can be: the string-literal form is reinstated and the
 * suite is run. It goes red here. That result is recorded in the commit report,
 * not asserted — a test cannot verify its own controls.
 *
 * ── CONTROL CHARACTERS ARE BUILT WITH String.fromCharCode ───────────────────
 * NOT typed as literals. A raw TAB or NUL in a source file is invisible in a
 * diff, survives no copy-paste, and is silently rewritten by editors and
 * tooling — a test whose subject is "control characters inside a scheme" must
 * not depend on one surviving a round trip through a text pipeline.
 */

const TAB = String.fromCharCode(9);
const NUL = String.fromCharCode(0);
const NEWLINE = String.fromCharCode(10);

// ── the blocklist ───────────────────────────────────────────────────────────

test('javascript: is refused', () => {
  assert.equal(isDangerousLinkUrl('javascript:alert(1)'), true);
});

test('the scheme match is case-insensitive', () => {
  assert.equal(isDangerousLinkUrl('JaVaScRiPt:alert(1)'), true);
  assert.equal(isDangerousLinkUrl('DATA:text/html,x'), true);
});

test('leading whitespace does not smuggle a dangerous scheme past the check', () => {
  assert.equal(isDangerousLinkUrl('   javascript:alert(1)'), true);
  assert.equal(isDangerousLinkUrl(`${NEWLINE}javascript:alert(1)`), true);
});

test('REGRESSION: a TAB *inside* the scheme is refused', () => {
  // Browsers strip tab/LF/CR from anywhere in a URL, so `java<TAB>script:` and
  // `javascript:` navigate identically. This is the exact shape the
  // string-literal regex bug let through.
  assert.equal(isDangerousLinkUrl(`java${TAB}script:alert(1)`), true);
});

test('REGRESSION: a NUL inside the scheme is refused', () => {
  assert.equal(isDangerousLinkUrl(`java${NUL}script:alert(1)`), true);
  // And with both, in the middle of the word rather than at a tidy boundary.
  assert.equal(isDangerousLinkUrl(`ja${NUL}va${TAB}script:alert(1)`), true);
});

test('data: is refused — it can carry text/html and execute', () => {
  assert.equal(isDangerousLinkUrl('data:text/html,<script>alert(1)</script>'), true);
});

test('vbscript: is refused', () => {
  assert.equal(isDangerousLinkUrl('vbscript:msgbox(1)'), true);
});

test('ordinary https links are not refused', () => {
  assert.equal(isDangerousLinkUrl('https://9expert.co.th/course/excel'), false);
  assert.equal(isDangerousLinkUrl('http://9expert.co.th'), false);
});

test('site-relative paths are not refused', () => {
  assert.equal(isDangerousLinkUrl('/course/excel'), false);
  assert.equal(isDangerousLinkUrl('#section'), false);
});

test('mailto: and tel: are not refused', () => {
  assert.equal(isDangerousLinkUrl('mailto:info@9expert.co.th'), false);
  assert.equal(isDangerousLinkUrl('tel:+6621234567'), false);
});

test('a path that merely CONTAINS a dangerous word stays clickable', () => {
  // The blocklist is a SCHEME test, not a substring search. An article about
  // JavaScript is an ordinary page and must not lose its link.
  assert.equal(isDangerousLinkUrl('/blog/javascript:tips-and-tricks'), false);
  assert.equal(isDangerousLinkUrl('https://9expert.co.th/tag/javascript'), false);
  assert.equal(isDangerousLinkUrl('/downloads/data:sets'), false);
});

test('a non-string link_url is not dangerous (it is simply absent)', () => {
  assert.equal(isDangerousLinkUrl(undefined), false);
  assert.equal(isDangerousLinkUrl(null), false);
  assert.equal(isDangerousLinkUrl(42), false);
});

// ── controls ────────────────────────────────────────────────────────────────

test('CONTROL: the split-scheme cases are not passing vacuously', () => {
  // If these raw values ALREADY started with "javascript:", the two REGRESSION
  // tests above would pass without any normalisation happening at all, and a
  // broken strip would go unnoticed. They do not — the normalisation is what
  // makes those tests pass, so those tests are live.
  assert.equal(`java${TAB}script:alert(1)`.toLowerCase().startsWith('javascript:'), false);
  assert.equal(`java${NUL}script:alert(1)`.toLowerCase().startsWith('javascript:'), false);
});

test('CONTROL: this is a BLOCKLIST — safeUrl would drop what it lets through', () => {
  // The design decision, pinned so it cannot be "tidied" into safeUrl later
  // without someone deliberately deleting this test. A typo'd scheme is not
  // dangerous, it is just broken, and a broken link the browser complains
  // about is strictly better feedback than a banner that silently does nothing.
  const typo = 'htp://9expert.co.th';
  assert.equal(isDangerousLinkUrl(typo), false, 'a typo must not be treated as an attack');
  assert.equal(resolveBannerLink(typo).href, typo, 'the blocklist must pass a typo through');
  assert.equal(safeUrl(typo), null, 'safeUrl is the allowlist that WOULD drop it');
  // Same for a schemeless host — the other typo an admin actually makes.
  assert.equal(resolveBannerLink('www.9expert.co.th').href, 'www.9expert.co.th');
  assert.equal(safeUrl('www.9expert.co.th'), null);
});

// ── the classifier ──────────────────────────────────────────────────────────

test('an absent or blank link_url resolves to "none"', () => {
  for (const v of [undefined, null, '', '   ', `${TAB}${NEWLINE}`]) {
    const link = resolveBannerLink(v);
    assert.equal(link.kind, 'none', `expected none for ${JSON.stringify(v)}`);
    assert.equal(link.href, null);
  }
});

test('a dangerous link resolves to "blocked" with NO href', () => {
  const link = resolveBannerLink('javascript:alert(1)');
  assert.equal(link.kind, 'blocked');
  assert.equal(link.href, null, 'a blocked link must never surface an href to render');
});

test('http(s) resolves to "external"', () => {
  assert.equal(resolveBannerLink('https://9expert.co.th').kind, 'external');
  assert.equal(resolveBannerLink('http://9expert.co.th').kind, 'external');
});

test('protocol-relative resolves to "external", not "internal"', () => {
  // `//evil.example/x` leaves the site. Handing it to next/link as though it
  // were a path produces a broken route AND skips rel="noopener".
  const link = resolveBannerLink('//cdn.example.com/promo');
  assert.equal(link.kind, 'external');
  assert.equal(link.href, '//cdn.example.com/promo');
});

test('mailto: resolves to "plain" — never next/link, never target=_blank', () => {
  const link = resolveBannerLink('mailto:info@9expert.co.th');
  assert.equal(link.kind, 'plain');
  assert.equal(link.href, 'mailto:info@9expert.co.th');
});

test('tel: resolves to "plain"', () => {
  assert.equal(resolveBannerLink('tel:+6621234567').kind, 'plain');
  assert.equal(resolveBannerLink('TEL:+6621234567').kind, 'plain');
});

test('a site-relative path resolves to "internal"', () => {
  assert.equal(resolveBannerLink('/course/excel').kind, 'internal');
});

test('a fragment resolves to "internal"', () => {
  assert.equal(resolveBannerLink('#promotions').kind, 'internal');
});

test('surrounding whitespace is trimmed out of the emitted href', () => {
  // The stored field is `trim: true` in the schema, but the classifier is what
  // renders, and an href with a trailing newline in it is not the same string.
  assert.equal(resolveBannerLink('  /course/excel  ').href, '/course/excel');
  assert.equal(resolveBannerLink(`${NEWLINE}https://9expert.co.th${TAB}`).href, 'https://9expert.co.th');
});

// ── the refusal is observable ───────────────────────────────────────────────

/**
 * console.warn is captured SYNCHRONOUSLY — patch, call, restore, with no await
 * anywhere between. The runner uses concurrency:true with isolation:'none', so
 * every test in the suite shares one global console; a patch held across an
 * await point could swallow an unrelated file's output. Nothing can interleave
 * inside a synchronous body.
 */
function captureWarnings(fn) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => { lines.push(args.join(' ')); };
  try { fn(); } finally { console.warn = original; }
  return lines;
}

test('a refused link warns ONCE, naming the _id and title', () => {
  const banner = { _id: 'pure-warn-once', title: 'โปรโมชั่นหน้าแรก', link_url: 'javascript:alert(1)' };
  const lines = captureWarnings(() => {
    warnBlockedBannerLink(banner);
    warnBlockedBannerLink(banner);
    warnBlockedBannerLink(banner);
  });
  assert.equal(lines.length, 1, 'a carousel re-renders constantly — one line, not a flood');
  assert.match(lines[0], /pure-warn-once/, 'the _id must be in the message to be lookup-able');
  assert.match(lines[0], /โปรโมชั่นหน้าแรก/, 'the title must be there to be recognisable');
  assert.match(lines[0], /link_url/, 'the message must name the field');
});

test('CONTROL: the once-per-banner dedupe is not a global mute', () => {
  // If `alreadyWarned` were a boolean rather than a per-_id set, the first
  // blocked banner in the app would silence every later one — the exact
  // silent-drop failure the warning exists to prevent.
  const lines = captureWarnings(() => {
    warnBlockedBannerLink({ _id: 'pure-warn-a', title: 'A', link_url: 'javascript:1' });
    warnBlockedBannerLink({ _id: 'pure-warn-b', title: 'B', link_url: 'data:x' });
  });
  assert.equal(lines.length, 2);
  assert.match(lines[0], /pure-warn-a/);
  assert.match(lines[1], /pure-warn-b/);
});
