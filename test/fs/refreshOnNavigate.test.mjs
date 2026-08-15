import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * THE STALE-ROW GUARD, AND AN HONEST STATEMENT OF WHAT IT IS.
 *
 * The defect: /admin/registrations reached by client navigation showed a list
 * missing a just-created record; F5 on the same URL showed it. The chrome, the
 * header and the URL all agreed — only the rows were behind.
 *
 * ── THIS FILE CANNOT OBSERVE THAT DEFECT, AND NOTHING IN THIS SUITE CAN ─────
 * It lives entirely in Next's client Router Cache: an in-memory, per-session
 * store of RSC payloads, invalidated by history traversal semantics and by
 * `router.refresh()`. Reproducing it needs a running Next client router, a real
 * navigation and a second one — no unit runner has any of those, and stubbing
 * the router would mean asserting against my own stub.
 *
 * So this file guards the WIRING and the two details of it that are easy to get
 * wrong and silent when wrong. The behavioural proof is a click-test, recorded
 * in the commit message and NOT counted as a test.
 */

const PAGE = readSource('src/app/admin/registrations/page.jsx');
const COMP = readSource('src/components/admin/RefreshOnNavigate.jsx');

test('the registrations page mounts RefreshOnNavigate', () => {
  assert.match(PAGE.code, /<RefreshOnNavigate\s*\/>/, 'the page does not mount the refresher');
});

test('the refresher actually calls router.refresh()', () => {
  assert.match(COMP.code, /router\.refresh\(\)/, 'nothing invalidates the Router Cache');
});

test('it renders nothing — it is a behaviour, not UI', () => {
  assert.match(COMP.code, /return null;/, 'the refresher injects DOM');
});

/**
 * THE SKIP FLAG IS MODULE SCOPE, NOT A REF.
 *
 * It exists to skip the refresh on a freshly loaded document, whose payload
 * arrived inlined in the HTML and cannot be stale. A `useRef` would make it
 * PER-INSTANCE, so it would also skip the first effect run of every remount —
 * and a Back navigation into this route is exactly a remount. The guard would
 * then suppress the refresh in the one case it was written for, silently, with
 * every assertion above still green.
 */
test('the fresh-document flag is module scope, not a useRef', () => {
  assert.ok(!/useRef/.test(COMP.code),
    'a per-instance ref would skip the refresh on the remount this exists to catch');
  const flag = /^let\s+documentIsFresh\s*=\s*true;/m.exec(COMP.code);
  assert.ok(flag, 'no module-scope fresh-document flag');
  assert.ok(
    flag.index < COMP.code.indexOf('export function RefreshOnNavigate'),
    'the flag is declared inside the component — it would reset on every mount'
  );
});

/**
 * THE SEARCH DEPENDENCY IS A STRING.
 *
 * `useSearchParams()` returns a NEW object on every render. Passing it into the
 * dependency array makes the effect run every render, and the effect calls
 * `router.refresh()`, which causes a render. That is an infinite refresh loop
 * against the database — the worst available failure here, and invisible in any
 * source review that does not know the hook's identity semantics.
 */
test('the effect depends on the searchParams STRING, never the object', () => {
  assert.match(COMP.code, /useSearchParams\(\)\.toString\(\)/,
    'searchParams is not reduced to a string before becoming a dependency');
  const deps = /\}, \[([^\]]*)\]\);/.exec(COMP.code);
  assert.ok(deps, 'no dependency array found');
  assert.match(deps[1], /\bpathname\b/, 'the effect does not react to a path change');
  assert.match(deps[1], /\bsearch\b/, 'the effect does not react to a query change');
  assert.ok(!/searchParams/.test(deps[1]), 'the raw searchParams object is a dependency — refresh loop');
});

/**
 * CONTROL: the matchers are pointed at real files with real content.
 *
 * Every assertion above is a `match` over one of two sources. A wrong path
 * throws in `readSource`, but a matcher pointed at the wrong CONTENT would pass
 * green forever.
 */
test('CONTROL: both scanned sources are real, non-empty code', () => {
  assert.ok(COMP.code.length > 200, `the component scrubbed to ${COMP.code.length} chars`);
  assert.ok(PAGE.code.length > 400, `the page scrubbed to ${PAGE.code.length} chars`);
  assert.match(COMP.code, /export function RefreshOnNavigate/);
  assert.match(PAGE.code, /export default async function Page/);
});

/**
 * NO `loading.js` UNDER admin — the reason the refresh cannot flash.
 *
 * `router.refresh()` keeps the current tree mounted and swaps in the new payload
 * when it arrives, so the only way a fallback could appear is a Suspense
 * boundary between the layout and this page. Adding a `loading.js` under
 * src/app/admin would create exactly that, and would turn a silent background
 * refresh into a visible spinner on every navigation. This pins the claim the
 * component's header makes, so that a future `loading.js` lands as a red test
 * rather than as a flicker somebody has to notice.
 */
test('no loading.js exists under src/app/admin — the no-flash claim', () => {
  // `.rel` — walkSources returns readSource RECORDS, not path strings. Testing
  // the regex against the record stringifies it to "[object Object]", matches
  // nothing, and passes vacuously forever. Caught by this very assertion staying
  // green while a loading.jsx sat in the tree.
  const found = walkSources('src/app/admin')
    .map((s) => s.rel)
    .filter((rel) => /\/loading\.(js|jsx|mjs)$/.test(rel));
  assert.deepEqual(found, [], `a loading boundary would make the refresh visible: ${found.join(', ')}`);
});
