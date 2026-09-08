import { test } from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../../next.config.mjs';
// Only the entry builder: this file checks the SEAM between the module and the
// config. The table's own claims — its size, its status code, its encoding rule
// — belong to test/pure/legacyOutlineRedirects.test.mjs and are not restated
// here, so a change to the batch reddens one file rather than two.
import { outlineRedirectEntries } from '../../src/lib/legacyOutlineRedirects.mjs';

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

/**
 * The five page-level rules, written out. Still an exact list, still bumped by
 * hand — the legacy-outline batch below is enumerated separately rather than
 * folded in here, because these five are the ones a human reads in review and
 * 162 file paths would bury them.
 */
const PAGE_REDIRECT_SOURCES = [
  '/cancellation-refund-policy',
  '/online-course',
  '/online-course/:path*',
  '/promotion',
  '/rpa-all-courses',
];

test('the page-level redirect table is EXACTLY these five sources', () => {
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
  const pageRules = REDIRECTS
    .map((r) => r.source)
    .filter((s) => !s.startsWith('/sites/') && !s.startsWith('/images/'))
    .sort();
  assert.deepEqual(pageRules, PAGE_REDIRECT_SOURCES);
});

test('CONTROL: deleting a page-level rule reddens, and the filter does not hide it', () => {
  // Two things at once, because the filter above is new and could itself be the
  // bug: a filter that dropped everything would make the assertion vacuous.
  const withoutPromotion = REDIRECTS.filter((r) => r.source !== '/promotion');
  const pageRules = withoutPromotion
    .map((r) => r.source)
    .filter((s) => !s.startsWith('/sites/') && !s.startsWith('/images/'))
    .sort();
  assert.notDeepEqual(pageRules, PAGE_REDIRECT_SOURCES);
  assert.equal(pageRules.length, 4, 'the filter is dropping page rules it should keep');
});

// ── the legacy course-outline batch ────────────────────────────────────────

test('the config carries EXACTLY the outline table, entry for entry', () => {
  // Exact set, both directions: a row silently dropped from the data module and
  // a rule appearing in the config that the module does not declare are
  // different defects, and this catches both.
  const declared = outlineRedirectEntries().map((e) => e.source).sort();
  const inConfig = REDIRECTS
    .map((r) => r.source)
    .filter((s) => s.startsWith('/sites/') || s.startsWith('/images/'))
    .sort();
  assert.deepEqual(inConfig, declared);
});

test('CONTROL: a config that never spread the table reddens the entry-for-entry check', () => {
  // The failure this guards against is the wiring being removed while the data
  // module stays perfectly intact — the module's own tests would all still
  // pass, and only this comparison would notice.
  const unwired = REDIRECTS.filter((r) => !r.source.startsWith('/sites/') && !r.source.startsWith('/images/'));
  const inConfig = unwired
    .map((r) => r.source)
    .filter((s) => s.startsWith('/sites/') || s.startsWith('/images/'));
  assert.equal(inConfig.length, 0);
  assert.notDeepEqual(inConfig, outlineRedirectEntries().map((e) => e.source).sort());
});

test('the config emits the batch at the SAME count the module declares', () => {
  // Guards the spread itself: `...outlineRedirectEntries()` silently becoming a
  // slice, a filter, or a single entry would leave every module-level test in
  // test/pure/legacyOutlineRedirects green while the config shipped a fraction
  // of the table.
  const inConfig = REDIRECTS.filter((r) => r.source.startsWith('/sites/') || r.source.startsWith('/images/'));
  assert.equal(inConfig.length, outlineRedirectEntries().length);
});

test('the config preserves each rule\'s destination and temporary status', () => {
  // The seam could carry all 162 sources and still mangle where they point or
  // what status they carry — `permanent` in particular is one key away from
  // becoming a 308 nobody can recall.
  const declared = new Map(outlineRedirectEntries().map((e) => [e.source, e]));
  for (const rule of REDIRECTS) {
    if (!rule.source.startsWith('/sites/') && !rule.source.startsWith('/images/')) continue;
    const want = declared.get(rule.source);
    assert.ok(want, `config carries ${rule.source}, which the module does not declare`);
    assert.equal(rule.destination, want.destination, `${rule.source} points somewhere else`);
    assert.equal(rule.permanent, false, `${rule.source} is not temporary`);
  }
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
