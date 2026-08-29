import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatThaiDate, dateRangeLabel } from '@/lib/promotions/promotionDateLabel';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';
import { windowEndFromInput } from '@/lib/pageBuilder/publishWindow';
import { readSource } from '../sourceScan.mjs';
// Round 54, ADDED beside the statements above rather than folded into one.
import { withTZ } from '../withTZ.mjs';

/**
 * ROUND 43, commit 2 — /promotions was naming a UTC day to a Bangkok audience.
 *
 * The page is a SERVER component with `revalidate = 3600`, so exactly one zone
 * decides and on Vercel it is UTC. The old formatter read `getDate()` /
 * `getMonth()` / `getFullYear()` off the runtime.
 *
 * Every assertion below FORCES `process.env.TZ`, because the defect is
 * invisible on a Bangkok laptop — which is where it survived being noticed.
 */

const PAGE = 'src/app/(public)/promotions/page.jsx';
const MODULE = 'src/lib/promotions/promotionDateLabel.js';

/**
 * ── ROUND 54: THIS HELPER USED TO LEAK ITS LAST ZONE ──────────────────────
 * It restored with a delete, and TZ is normally unset, so that branch is the
 * one that ran. Deleting TZ does NOT put the OS zone back — withTZ's header
 * measured that, and round 54 measured it again on this clone: after this file
 * ran, the process was left in Pacific/Kiritimati, the last zone in ZONES.
 *
 * The runner is one process shared by every file, so that zone was the ambient
 * zone for whatever ran next until some withTZ caller assigned a real value
 * back. Now it is the shared helper. Every assertion below is unchanged — only
 * the restore moved.
 */
const inZone = withTZ;

const ZONES = ['UTC', 'Asia/Bangkok', 'America/Los_Angeles', 'Pacific/Kiritimati'];

/**
 * The two builder rows the probe found, with the value each actually stores
 * and the last day it is actually visible.
 *
 * "Last visible day" is computed from the RULE, not asserted by hand:
 * `isPubliclyVisible` expires on `now > end`, so the stored instant is the
 * last visible one and the Bangkok day it falls in is the honest answer.
 */
const REAL_ROWS = Object.freeze([
  ['/expo002', '2026-08-28T17:00:00.000Z', '29 ส.ค. 2569', '28 ส.ค. 2569'],
  ['/ex-pro-1', '2026-07-20T17:00:00.000Z', '21 ก.ค. 2569', '20 ก.ค. 2569'],
]);

// ── the label is the same in every zone ───────────────────────────────────

test('the label does not move with the machine that renders it', () => {
  for (const [slug, stored, truth] of REAL_ROWS) {
    const seen = new Set(ZONES.map((tz) => inZone(tz, () => formatThaiDate(stored))));
    assert.equal(seen.size, 1, `${slug}: the label moved with the runtime zone: ${[...seen].join(' vs ')}`);
    assert.deepEqual([...seen], [truth], `${slug}: the label is not the last visible Bangkok day`);
  }
});

test('CONTROL: the OLD formatter really did move, and really was wrong', () => {
  /**
   * The defect reproduced, so the fix is measured against it rather than
   * against a description. Without this, "one answer across four zones" would
   * pass for a test that cannot observe a zone at all.
   */
  const oldFormat = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
  };

  for (const [slug, stored, truth, utcAnswer] of REAL_ROWS) {
    const seen = new Set(ZONES.map((tz) => inZone(tz, () => oldFormat(stored))));
    assert.ok(seen.size > 1,
      `${slug}: the old formatter gave one answer across four zones, so this suite cannot `
      + 'observe the drift it claims the fix removes — the TZ mechanism is not working');
    // …and what Vercel specifically rendered was the wrong day.
    assert.equal(inZone('UTC', () => oldFormat(stored)), utcAnswer, `${slug}: the UTC reading changed`);
    assert.notEqual(utcAnswer, truth, `${slug}: the fixture does not actually straddle midnight`);
  }
});

test('the "last visible day" is the RULE’s answer, not this test’s opinion', () => {
  /**
   * The reference the fix is scored against, derived rather than asserted. If
   * `isPubliclyVisible` ever stops treating the stored instant as visible, this
   * goes red and the label's target moves with it.
   */
  for (const [slug, stored, truth] of REAL_ROWS) {
    const page = { status: 'published', publishStartDate: null, publishEndDate: stored };
    const endInstant = new Date(stored).getTime();
    assert.equal(isPubliclyVisible(page, endInstant), true,
      `${slug}: the page is NOT visible at its own end instant — the reference is wrong`);
    assert.equal(isPubliclyVisible(page, endInstant + 1), false,
      `${slug}: the page is still visible one ms past its end`);
    assert.equal(formatThaiDate(stored), truth,
      `${slug}: the label does not name the last day the page is visible`);
  }
});

test('a post-round-42 end date labels the day the author typed', () => {
  // The values this surface will hold from now on: 23:59:59.999 Bangkok. The
  // ambient and pinned readings agree for these, which is why the 21 MSDB rows
  // (stored at 16:59Z) were never wrong.
  const stored = windowEndFromInput('2026-08-28');
  for (const tz of ZONES) {
    assert.equal(inZone(tz, () => formatThaiDate(stored)), '28 ส.ค. 2569', `wrong in ${tz}`);
  }
});

// ── the range line, and totality ──────────────────────────────────────────

test('the range line keeps its exact shape', () => {
  assert.equal(dateRangeLabel(null, '2026-08-28T17:00:00.000Z'), 'วันนี้ - 29 ส.ค. 2569');
  // The START is deliberately not shown — unchanged from what the page did.
  assert.equal(dateRangeLabel('2026-01-01T00:00:00.000Z', '2026-08-28T17:00:00.000Z'),
    dateRangeLabel(null, '2026-08-28T17:00:00.000Z'));
});

test('a missing or unparseable end shows no range at all', () => {
  for (const bad of [null, undefined, '', 'nonsense', NaN]) {
    assert.equal(formatThaiDate(bad), null, `formatThaiDate accepted ${String(bad)}`);
    assert.equal(dateRangeLabel(null, bad), null, `dateRangeLabel accepted ${String(bad)}`);
  }
});

test('every month renders, and the 1-12 month is not read as a 0-11 index', () => {
  /**
   * The one arithmetic bug this move could have introduced: `siteDateParts`
   * returns `month` as 1-12, and the array is 0-11. An off-by-one would be
   * invisible for eleven months of any single fixture.
   */
  const EXPECTED = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  for (let m = 1; m <= 12; m += 1) {
    // Midday Bangkok on the 15th, so no boundary can shift the month.
    const iso = new Date(Date.UTC(2026, m - 1, 15, 5, 0, 0)).toISOString();
    assert.equal(formatThaiDate(iso), `15 ${EXPECTED[m - 1]} 2569`, `month ${m} rendered wrong`);
  }
  // …and no rendering ever produced "undefined", which is what an off-by-one
  // would give for December.
  const dec = new Date(Date.UTC(2026, 11, 15, 5, 0, 0)).toISOString();
  assert.equal(formatThaiDate(dec).includes('undefined'), false);
});

// ── one definition, and the page uses it ──────────────────────────────────

test('the page formats no date of its own any more', () => {
  const { code, withImports } = readSource(PAGE);
  assert.match(withImports, /import \{ dateRangeLabel \} from '@\/lib\/promotions\/promotionDateLabel'/,
    'the page no longer imports the shared label');
  for (const ambient of ['getFullYear()', 'getMonth()', 'getDate()']) {
    assert.equal(code.includes(ambient), false,
      `the promotions page still reads ${ambient} — that is the runtime's zone, and on Vercel `
      + 'it is UTC while the audience is in Bangkok');
  }
  assert.equal(code.includes('THAI_MONTHS'), false, 'the page still holds its own month array');
});

test('CONTROL: the ambient-getter matcher recognises its subjects', () => {
  const planted = 'return `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear() + 543}`;';
  for (const ambient of ['getFullYear()', 'getMonth()', 'getDate()']) {
    assert.equal(planted.includes(ambient), true,
      `the matcher for ${ambient} does not work, so the check above means nothing`);
  }
});

test('the zone is imported, and restated nowhere', () => {
  const { code, withImports } = readSource(MODULE);
  assert.match(withImports, /import \{ siteDateParts \} from '@\/lib\/articlePublishTime'/,
    'the label module no longer imports the site zone');
  // Same patterns round 43's preview-expiry guard uses — by shape, not by
  // quoting, because a template literal slips past a quoted-literal check.
  for (const pattern of [/Asia\/Bangkok/, /\+\s*07:?00/, /\b25200000\b/]) {
    assert.equal(pattern.test(code), false,
      `the label module restates the zone (${pattern}). lib/articlePublishTime.js owns it.`);
  }
});

test('the page and the module are the only two files in this pair', () => {
  // A third copy of the range line would be the drift the move exists to stop.
  const { code } = readSource(PAGE);
  assert.equal(code.includes('วันนี้ - '), false,
    'the page builds the range string itself again');
  assert.match(readSource(MODULE).code, /return `วันนี้ - \$\{end\}`;/,
    'the module no longer owns the range string');
});
