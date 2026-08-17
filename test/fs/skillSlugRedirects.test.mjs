import { test } from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../../next.config.mjs';

// A renamed skill leaves its old catalog URL behind, and the catch-all does NOT
// 404 it — it falls through to the generic `-all-courses` branch, which lists
// the ENTIRE catalog and returns 200. So the only thing standing between a
// renamed skill and an indexable soft-404 is a line in next.config.mjs, and a
// line in a config file is exactly the kind of thing that gets "tidied".
//
// Measured 2026-08-04: upstream renamed RPA → Automation and changed `skill_id`
// RPA → AUT, so /rpa-all-courses can no longer resolve to a skill.
//
// ── WHAT THIS GUARD CANNOT SEE ─────────────────────────────────────────────
//
// 1. It reads the CONFIG, not the server. It proves the rule is declared with
//    `permanent: true`; it cannot prove Next actually serves a 308, that Vercel
//    deployed this build, or that no edge rule shadows it. No tier here starts
//    a server.
// 2. It cannot prove the DESTINATION works. `/automation-all-courses` resolves
//    only because a `skill_page_configs` row with urlSlug `automation-all-courses`
//    exists in MongoDB, and no tier here reaches a database. If an admin deletes
//    that row this guard stays green while the redirect starts pointing at a
//    soft-404 of its own. The one thing it CAN check locally is that the
//    destination is not itself a redirect source — see the loop test below.
// 3. It says nothing about the OTHER 34 `-all-courses` slugs (27 program
//    configs + 7 live skill configs, measured 2026-08-04). Those resolve
//    through their own config rows and never reach the generic branch. If one
//    of them is renamed upstream it produces this same defect, silently, and
//    nothing here notices — that is the class finding, reported separately.

/** The declared table, resolved once. `redirects()` is async by Next's contract. */
const REDIRECTS = await nextConfig.redirects();

/**
 * THE CHECK, as a pure function so a control can feed it a doctored table.
 *
 * Returns a reason string for every way the rule can be wrong, or null when it
 * is right. A boolean would collapse "missing" and "temporary" into one answer,
 * and those two failures want different fixes.
 */
function redirectProblem(table, source, destination) {
  const rows = table.filter((r) => r.source === source);
  if (rows.length === 0) return `no redirect declared for ${source}`;
  if (rows.length > 1) return `${rows.length} redirects declared for ${source}`;
  const [row] = rows;
  if (row.destination !== destination) {
    return `${source} points at ${row.destination}, expected ${destination}`;
  }
  // `permanent: true` is 308 and is cached by browsers and search engines;
  // `false` is 307 and teaches them nothing. For a URL with SEO history the
  // difference is the entire point of adding the rule.
  if (row.permanent !== true) return `${source} is not permanent`;
  return null;
}

/** A destination that is itself a source is a redirect chain — or a loop. */
function chainedDestinations(table) {
  const sources = new Set(table.map((r) => r.source));
  return table.filter((r) => sources.has(r.destination)).map((r) => r.source).sort();
}

// ── the guard ──────────────────────────────────────────────────────

test('/rpa-all-courses redirects PERMANENTLY to /automation-all-courses', () => {
  assert.equal(
    redirectProblem(REDIRECTS, '/rpa-all-courses', '/automation-all-courses'),
    null
  );
});

test('CONTROL: flipping it to a temporary redirect reddens', () => {
  // The assertion the brief asked for by name. Without it, `redirectProblem`
  // could ignore `permanent` entirely and the test above would still pass.
  const temporary = REDIRECTS.map((r) =>
    r.source === '/rpa-all-courses' ? { ...r, permanent: false } : r
  );
  assert.equal(
    redirectProblem(temporary, '/rpa-all-courses', '/automation-all-courses'),
    '/rpa-all-courses is not permanent'
  );
});

test('CONTROL: a missing rule and a mis-aimed rule are reported differently', () => {
  // Two failures, two messages — and together they prove the check is not a
  // function that returns null for everything.
  const removed = REDIRECTS.filter((r) => r.source !== '/rpa-all-courses');
  assert.equal(
    redirectProblem(removed, '/rpa-all-courses', '/automation-all-courses'),
    'no redirect declared for /rpa-all-courses'
  );

  const misaimed = REDIRECTS.map((r) =>
    r.source === '/rpa-all-courses' ? { ...r, destination: '/training-course' } : r
  );
  assert.equal(
    redirectProblem(misaimed, '/rpa-all-courses', '/automation-all-courses'),
    '/rpa-all-courses points at /training-course, expected /automation-all-courses'
  );
});

test('the redirect table is EXACTLY these five sources', () => {
  // An exact set, not a `.some()`: the pre-existing rules
  // (/online-course, /online-course/:path*, /promotion) are load-bearing too,
  // and a subset check would let any of them be deleted in silence. Adding a
  // redirect is meant to bump this list in the same commit.
  //
  // /cancellation-refund-policy joined the table with the legal centre: the
  // refund page is served at /refund-policy, but the policy calls itself the
  // Cancellation & Refund Policy throughout, so the longer URL is the one a
  // person guesses. Without the rule it falls through to [...slug] and gets
  // answered by a course lookup.
  assert.deepEqual(
    REDIRECTS.map((r) => r.source).sort(),
    [
      '/cancellation-refund-policy',
      '/online-course',
      '/online-course/:path*',
      '/promotion',
      '/rpa-all-courses',
    ]
  );
});

test('CONTROL: an extra source reddens the exact-set check', () => {
  const extra = [...REDIRECTS, { source: '/anything', destination: '/', permanent: true }];
  assert.notDeepEqual(
    extra.map((r) => r.source).sort(),
    REDIRECTS.map((r) => r.source).sort()
  );
});

test('no redirect destination is itself a redirect source (no chain, no loop)', () => {
  // A chain costs a second round trip and dilutes the signal a 308 carries; a
  // loop is a dead URL. Cheap to check here, invisible in review once the table
  // is longer than a screen.
  assert.deepEqual(chainedDestinations(REDIRECTS), []);
});

test('CONTROL: a chained destination IS reported', () => {
  // Pairs with the test above — otherwise `chainedDestinations` returning a
  // constant [] would satisfy it forever.
  const chained = [
    ...REDIRECTS,
    { source: '/automation-all-courses', destination: '/training-course', permanent: true },
  ];
  assert.deepEqual(chainedDestinations(chained), ['/rpa-all-courses']);
});
