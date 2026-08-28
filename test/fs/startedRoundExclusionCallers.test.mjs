import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * WHO OPTS OUT OF THE STARTED-ROUND EXCLUSION, AND NOBODY ELSE.
 *
 * ── WHY A SOURCE GUARD ──────────────────────────────────────────────────────
 * The exclusion is ON BY DEFAULT in `getAllSchedules` and
 * `listSchedulesByCourse`, so a public surface gets the rule by existing. The
 * risk is therefore not that a surface forgets to opt IN — it is that a surface
 * opts OUT, and the only way to see the whole set at once is to sweep the tree.
 * A render test can only see the surface it renders, and the three legitimate
 * opt-outs are on three different admin screens.
 *
 * ── THE THREE, AND WHY EACH ONE IS ALLOWED ──────────────────────────────────
 *   admin/page.jsx                 the dashboard's open-rounds count. Must keep
 *                                  agreeing with the /admin/schedules table it
 *                                  links to.
 *   admin/registrations/[id]       the round picker for a CORRECTION. The
 *                                  correction most likely to be needed is the
 *                                  one made on the training day itself.
 *   lib/actions/registrations.js   updateRegistrationRound's validation, which
 *                                  enforces "the round belongs to this course"
 *                                  from that same list. A narrower list here
 *                                  would REFUSE a legitimate correction.
 *
 * …plus one PUBLIC caller which opts out to CLASSIFY rather than to show:
 *   registration/public/RegisterPageContent — partitions the fetch so a
 *                                  `?class=` link to a round that started this
 *                                  morning can be told apart from a stale id.
 *                                  It renders only the not-started half.
 *
 * Comments are stripped by test/sourceScan.mjs, so the docstrings that discuss
 * `includeStarted` do not trip these sweeps.
 */

const OPT_OUTS = [
  'src/app/admin/page.jsx',
  'src/app/admin/registrations/[id]/page.jsx',
  'src/lib/actions/registrations.js',
  'src/app/(public)/registration/public/RegisterPageContent.jsx',
];

const FETCH_MODULE = 'src/lib/api/schedules.js';

test('the exclusion is applied by DEFAULT in both public fetch helpers', () => {
  /**
   * The positive half, and the load-bearing one: if either helper stopped
   * filtering, every absence assertion below would still pass while the defect
   * was back everywhere at once.
   */
  const code = readSource(FETCH_MODULE).code;
  const calls = code.match(/excludeStartedRounds\(/g) ?? [];
  assert.equal(calls.length, 2, 'expected getAllSchedules and listSchedulesByCourse to filter');

  // And each guards on the opt-out rather than filtering unconditionally, which
  // would leave the admin callers with no way to see a started round.
  assert.match(code, /if\s*\(\s*includeStarted\s*\)\s*return\s+res/, 'getAllSchedules opt-out');
  assert.match(code, /if\s*\(\s*options\.includeStarted\s*\)\s*return\s+res/, 'listSchedulesByCourse opt-out');
});

test('the boundary comes from siteTodayKey, and there is no second clock', () => {
  /**
   * One timezone source. `siteTodayKey` is Bangkok-pinned and lives beside
   * `siteCurrentYear` on the existing SITE_TIME_ZONE; a local `new Date()` read
   * for the boundary would reintroduce the seven-hour hole the helper closes.
   */
  const src = readSource(FETCH_MODULE);
  assert.ok(
    src.withImports.includes("from '@/lib/articlePublishTime'"),
    'the fetch module does not import the site clock',
  );
  assert.match(src.code, /siteTodayKey\(\)/, 'the boundary is not read from siteTodayKey');
});

test('`from` is STILL derived the way it was — deliberately not moved to Bangkok', () => {
  /**
   * A UTC `from` is the same day as Bangkok's or ONE EARLIER, never later, so
   * the fetch returns a superset and the Bangkok-pinned filter narrows it
   * exactly. Moving it would additionally change how many rows the admin
   * dashboard counts for seven hours a day — an admin behaviour change this
   * round is not making. Pinned so the "tidy-up" is a deliberate decision.
   */
  const code = readSource(FETCH_MODULE).code;
  assert.match(code, /const today = new Date\(\);/);
  assert.match(code, /today\.getFullYear\(\)/);
  assert.match(code, /listSchedules\(\{\s*from:\s*`\$\{yyyy\}-\$\{mm\}-\$\{dd\}`/);
});

test('listSchedules itself is UNTOUCHED — /admin/schedules must not change', () => {
  /**
   * The admin table is the one surface that must keep showing rounds that have
   * started and rounds that have finished, and `listSchedules` is its only
   * caller. The filter must not have leaked into it.
   */
  const code = readSource(FETCH_MODULE).code;
  const listSchedulesBody = /export async function listSchedules\(\{[\s\S]*?\n\}/.exec(code);
  assert.ok(listSchedulesBody, 'listSchedules not found');
  assert.equal(
    /excludeStartedRounds|siteTodayKey|includeStarted/.test(listSchedulesBody[0]),
    false,
    'listSchedules now filters — the admin table would lose started rounds',
  );

  const admin = readSource('src/app/admin/schedules/page.jsx').code;
  assert.equal(
    /includeStarted|excludeStartedRounds/.test(admin),
    false,
    '/admin/schedules should not need to know this rule exists',
  );
});

test('EXACTLY the four known callers opt out — no others anywhere in src/', () => {
  /**
   * The sweep that a named list cannot do: a fifth opt-out in a file nobody
   * thought to list is precisely how a public surface quietly gets its started
   * rounds back.
   */
  const optingOut = walkSources('src')
    .filter((f) => /includeStarted\s*:\s*true/.test(f.code))
    .map((f) => f.rel)
    .sort();
  assert.deepEqual(
    optingOut,
    [...OPT_OUTS].sort(),
    'the set of includeStarted callers changed — every entry needs a written reason',
  );
});

test('the home page filters on the READ, not only on the cron write', () => {
  /**
   * `syncLandingData` calls `listSchedulesByCourse`, so the snapshot is already
   * filtered when written — and that is not enough. The cron runs every three
   * hours, so a write-time-only filter would leave a round that started at
   * midnight on the most-visited page on the site for up to three hours, against
   * ~30 minutes everywhere else.
   */
  const src = readSource('src/lib/landing/getLandingData.js');
  assert.ok(
    src.withImports.includes("from '@/lib/schedule/roundHasStarted'"),
    'getLandingData does not import the exclusion',
  );
  assert.match(src.code, /excludeStartedRounds\(/, 'the snapshot is served unfiltered');
  assert.match(src.code, /siteTodayKey\(\)/, 'and without a Bangkok-pinned boundary');

  // The cron's own output is deliberately NOT changed.
  const sync = readSource('src/lib/landing/syncLandingData.js').code;
  assert.equal(
    /includeStarted|excludeStartedRounds/.test(sync),
    false,
    'syncLandingData was changed — the ruling was to filter on the read',
  );
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the opt-out probe DOES fire on each of the four, individually', () => {
  /**
   * The sweep above compares a set. If the probe matched nothing the comparison
   * would fail loudly — but if it matched everything it would also "pass" for
   * one wrong reason, so each file is checked to really carry the flag.
   */
  for (const rel of OPT_OUTS) {
    assert.match(
      readSource(rel).code,
      /includeStarted:\s*true/,
      `${rel} is listed as an opt-out but does not carry the flag`,
    );
  }
});

test('CONTROL: the probe does NOT fire on a caller that merely mentions it', () => {
  const consumer = "const { items } = await listSchedulesByCourse(id, { limit: 20 });";
  assert.equal(/includeStarted\s*:\s*true/.test(consumer), false);
  const falseFlag = 'listSchedulesByCourse(id, { includeStarted: false })';
  assert.equal(/includeStarted\s*:\s*true/.test(falseFlag), false, 'an explicit false is not an opt-out');
});

test('CONTROL: the sweep is reading real code, not empty strings', () => {
  for (const rel of [...OPT_OUTS, FETCH_MODULE, 'src/lib/landing/getLandingData.js']) {
    assert.ok(readSource(rel).code.length > 300, `${rel} was not actually read`);
  }
  assert.ok(walkSources('src').length > 100, 'the tree walk found almost nothing');
});
