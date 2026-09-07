import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RANGE,
  RANGE_VALUES,
  dateRangeAt,
  normaliseRange,
} from '@/lib/dashboard/ranges';
import { readSource } from '../sourceScan.mjs';

/**
 * THE DEFAULT RANGE — what /admin shows when nobody has asked for anything.
 *
 * ══ THE DEFECT ══════════════════════════════════════════════════════════════
 * It was วันนี้, and round E1 measured what that meant in practice: the newest
 * registration is weeks old, so วันนี้ holds nothing, and the first thing the
 * dashboard told anyone was 0. Every card, every day. E3's empty state — which
 * names the most recent record — is a repair for a situation the default should
 * not have been creating.
 *
 * ── THE ASSERTIONS ARE AGAINST THE LITERAL 'all', NOT AGAINST DEFAULT_RANGE ─
 * Deliberately, and this is standing rule (4). Writing
 * `assert.equal(DEFAULT_RANGE, DEFAULT_RANGE)` in any disguise — including
 * `normaliseRange(undefined) === DEFAULT_RANGE` as the ONLY check — would pass
 * for every value the constant could ever hold, which is exactly the shape of
 * the four guards this repo has already shipped that could not fail. Round E3
 * shipped it twice in one file before catching it.
 *
 * So the value is pinned to the literal, ONCE, at the top. Everything else may
 * then use the constant freely, because that one assertion is what gives the
 * constant its meaning.
 */

test('default: the default range is ทั้งหมด — pinned to the literal', () => {
  assert.equal(
    DEFAULT_RANGE, 'all',
    'the default moved. If that is deliberate, change this literal and say why — '
    + 'it is the one assertion that gives DEFAULT_RANGE its meaning, and every '
    + 'other test in this file would follow the constant wherever it went.',
  );
});

test('default: it is a real range, not a value nothing can compute', () => {
  assert.ok(RANGE_VALUES.includes(DEFAULT_RANGE), 'the default is not in RANGE_VALUES');
  // And it reaches the window arithmetic without throwing.
  const win = dateRangeAt(DEFAULT_RANGE, new Date('2026-09-05T04:00:00.000Z'));
  assert.equal(win.from, null, 'ทั้งหมด must still be unbounded');
  assert.ok(win.to instanceof Date);
});

// ── 4. NO QUERY PARAMETER → ทั้งหมด. `?range=today` → today. ────────────────

test('default: no query parameter resolves to ทั้งหมด', () => {
  assert.equal(normaliseRange(undefined), 'all', 'a missing ?range= must land on ทั้งหมด');
  assert.equal(normaliseRange(''), 'all');
  assert.equal(normaliseRange(null), 'all');
});

test('default: ?range=today STILL WORKS and still means today', () => {
  /**
   * The round changes what NO parameter means, not what a parameter means. A
   * bookmark or a link carrying ?range=today has to keep working.
   */
  assert.equal(normaliseRange('today'), 'today');
  const win = dateRangeAt('today', new Date('2026-09-05T04:00:00.000Z'));
  assert.ok(win.from instanceof Date, 'today must still bound the window');
  assert.equal(win.from.getHours(), 0, 'and still start at midnight');
});

test('default: every other range is passed through untouched', () => {
  for (const range of RANGE_VALUES) {
    assert.equal(normaliseRange(range), range, `${range} was rewritten`);
  }
});

test('default: anything unrecognised degrades to the default, not to a crash', () => {
  // A `?range=` a browser can carry: a typo, an array (?range=a&range=b), an
  // object from a crafted query string. None may reach dateRangeAt.
  for (const junk of ['nonsense', 'TODAY', 'week ', 42, ['today'], { range: 'today' }, true]) {
    assert.equal(
      normaliseRange(junk), DEFAULT_RANGE,
      `${JSON.stringify(junk)} was not narrowed`,
    );
  }
});

// ── ONE DEFINITION, USED BY BOTH THE SERVER AND THE CONTROL ────────────────

test('default: no file re-declares the default as a literal', () => {
  /**
   * E4.3's real requirement: "one definition in the ranges module, used by both
   * the server and the control — not a string repeated in two places".
   *
   * Read as SOURCE, because the failure mode is a second copy appearing, and no
   * import graph or runtime check reveals that. Read from `.code` so a mention
   * inside a comment — this file's own explanations included — cannot fail it.
   */
  const PAGE   = readSource('src/app/admin/page.jsx');
  const ACTION = readSource('src/lib/actions/dashboard.js');
  const CLIENT = readSource('src/app/admin/_components/DashboardClient.jsx');

  for (const src of [PAGE, ACTION, CLIENT]) {
    assert.ok(src.code.length > 200, `${src.rel} scanned to nothing — this test is vacuous`);
    assert.match(
      src.withImports, /from '@\/lib\/dashboard\/ranges'/,
      `${src.rel} must import the default rather than restate it`,
    );
  }

  // The page: no inline range whitelist any more.
  assert.equal(
    /\['today',\s*'week',\s*'month',\s*'all'\]/.test(PAGE.code), false,
    'the page carries its own copy of RANGE_VALUES',
  );
  assert.match(PAGE.code, /normaliseRange\(sp\.range\)/);

  /**
   * The action: its RANGE parameter's default is the constant.
   *
   * Matched without the closing paren, deliberately. E4's custom range added
   * `from` and `to` after it, and pinning `)` here would have made this file
   * fail on a change it has no opinion about — it cares that the default is
   * DEFAULT_RANGE, not how many parameters follow. HOW MANY there are, and
   * which, is owned by the named allowlist in
   * test/fs/dashboardScopeEnforcement, which is where that question belongs.
   */
  assert.match(ACTION.code, /getDashboardMetrics\(range = DEFAULT_RANGE\b/);

  // The client: the value that means "no query parameter" is the constant.
  assert.match(CLIENT.code, /if \(val === DEFAULT_RANGE\) params\.delete\('range'\)/);
});

test('default: the client still OFFERS every range, including today', () => {
  // The default changing must not remove a button. RANGE_OPTIONS is the client's
  // list; it has to cover the vocabulary exactly.
  const CLIENT = readSource('src/app/admin/_components/DashboardClient.jsx');
  const literal = CLIENT.code.slice(
    CLIENT.code.indexOf('const RANGE_OPTIONS = ['),
    CLIENT.code.indexOf('];', CLIENT.code.indexOf('const RANGE_OPTIONS = [')) + 2,
  );
  assert.ok(literal.length > 40, 'RANGE_OPTIONS was not found — the scan is broken');
  for (const range of RANGE_VALUES) {
    assert.ok(literal.includes(`'${range}'`), `the ${range} button is gone`);
  }
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: normaliseRange really discriminates — it is not a pass-through', () => {
  // Without this, "junk becomes the default" would hold for a function that
  // returned its argument, as long as the default happened to be asked for.
  assert.notEqual(normaliseRange('nonsense'), 'nonsense');
  assert.equal(normaliseRange('week'), 'week', 'and it does not flatten everything to the default');
});

test('CONTROL: restoring วันนี้ as the default WOULD be caught', () => {
  /**
   * Control (c), reconstructed so the red line stays legible: breaking the real
   * constant reddens this whole file at once. This shows the literal pin at the
   * top is what does the catching — a `DEFAULT_RANGE === DEFAULT_RANGE` check
   * would not have noticed.
   */
  const asIfToday = 'today';
  assert.notEqual(asIfToday, 'all', 'the pinned literal separates the two');
  const pretendNormalise = (v) => (RANGE_VALUES.includes(v) ? v : asIfToday);
  assert.equal(pretendNormalise(undefined), 'today', 'the old behaviour, for contrast');
  assert.equal(normaliseRange(undefined), 'all', 'the new one');
});
