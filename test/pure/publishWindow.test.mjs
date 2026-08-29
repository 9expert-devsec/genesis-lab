import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WINDOW_START_WALL, WINDOW_END_WALL,
  windowStartFromInput, windowEndFromInput, toDateInput,
} from '@/lib/pageBuilder/publishWindow';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { isPubliclyVisible, invisibleReason } from '@/lib/pageBuilder/visibility';
// ADDED beside the statements above rather than folded into one.
import { SITE_TIME_ZONE, SITE_UTC_OFFSET } from '@/lib/articlePublishTime';
// Round 54, ADDED beside the statements above rather than folded into one.
// The three inline TZ blocks this file used restored with a delete, which is
// not a restore — see withTZ's header, and the note in promotionDateLabel.
import { withTZ } from '../withTZ.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 42, commit 1 — วันสิ้นสุด means the END of that day, in Asia/Bangkok.
 *
 * The reported defect: an author set วันสิ้นสุด to today and the page stopped
 * being visible today. Everything here is pure, because the fix is a pure
 * conversion — PublishDialog is a Radix portal and renders zero bytes under
 * renderToStaticMarkup, so a rule expressed inside it could not be asserted by
 * value at all. That is why the conversion moved out of the component.
 */

/** The day under test, and its two boundary instants in UTC. */
const DAY = '2026-08-28';
const LAST_VISIBLE_UTC = '2026-08-28T16:59:59.999Z'; // = 28 Aug 23:59:59.999 +07:00
const FIRST_HIDDEN_UTC = '2026-08-28T17:00:00.000Z'; // = 29 Aug 00:00:00.000 +07:00
const DAY_START_UTC = '2026-08-27T17:00:00.000Z';    // = 28 Aug 00:00:00.000 +07:00

const at = (iso) => new Date(iso).getTime();

/** A published page whose window ends on DAY. */
const endsToday = { status: 'published', publishStartDate: null, publishEndDate: windowEndFromInput(DAY) };

// ── the conversion ─────────────────────────────────────────────────────────

test('an END date is the LAST instant of that day, not the first', () => {
  assert.equal(windowEndFromInput(DAY), LAST_VISIBLE_UTC);
  // The defect, stated as the thing that must no longer be true.
  assert.notEqual(windowEndFromInput(DAY), DAY_START_UTC,
    'the end date is still pinned to the start of the day — the reported bug');
});

test('a START date is the FIRST instant of that day', () => {
  // Start-of-day is right for a start, and it is the opposite anchor — the two
  // are separate functions precisely so this cannot be flipped by a flag.
  assert.equal(windowStartFromInput(DAY), DAY_START_UTC);
  assert.notEqual(windowStartFromInput(DAY), windowEndFromInput(DAY));
});

test('the two wall times are the two ends of one day', () => {
  assert.equal(WINDOW_START_WALL, '00:00:00.000');
  assert.equal(WINDOW_END_WALL, '23:59:59.999');
});

// ── B: the zone is EXPLICIT, never the runtime's ──────────────────────────

/**
 * The defect the old line had, reproduced so the fix is measured against it
 * rather than against a description of it. `new Date('2026-08-28T00:00:00')`
 * has no zone designator and is parsed LOCALLY.
 */
const OLD_CONVERSION = (v) => new Date(`${v}T00:00:00`).toISOString();

test('the conversion does not depend on the machine that runs it', () => {
  const seen = new Set();
  for (const tz of ['Asia/Bangkok', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    withTZ(tz, () => seen.add(`${windowStartFromInput(DAY)}|${windowEndFromInput(DAY)}`));
  }
  assert.equal(seen.size, 1, `the window moved with the runtime zone: ${[...seen].join(' vs ')}`);
  assert.deepEqual([...seen], [`${DAY_START_UTC}|${LAST_VISIBLE_UTC}`]);
});

test('CONTROL: the OLD conversion really did move with the zone', () => {
  /**
   * Without this, "one answer across four zones" would pass for a test that
   * cannot tell zones apart at all — `process.env.TZ` is only read by some
   * Date paths, and a check that proved nothing about the old line would be
   * proving nothing about the new one either.
   */
  const seen = new Set();
  for (const tz of ['Asia/Bangkok', 'UTC', 'America/Los_Angeles']) {
    withTZ(tz, () => seen.add(OLD_CONVERSION(DAY)));
  }
  assert.ok(seen.size > 1,
    'the old conversion produced one answer across three zones, so this suite cannot '
    + 'observe the drift it claims the fix removes — the TZ mechanism is not working');
  assert.ok(seen.has('2026-08-27T17:00:00.000Z'), 'the Bangkok reading is missing');
  assert.ok(seen.has('2026-08-28T00:00:00.000Z'), 'the UTC reading is missing');
});

test('the zone is IMPORTED from the module that already owned it', () => {
  // A second copy of 'Asia/Bangkok' or '+07:00' is the drift
  // lib/articlePublishTime.js's header exists to prevent.
  const { code, withImports } = readSource('src/lib/pageBuilder/publishWindow.js');
  assert.match(withImports, /import \{ SITE_UTC_OFFSET, siteDateParts \} from '@\/lib\/articlePublishTime'/,
    'publishWindow no longer imports the site zone');
  for (const literal of ["'Asia/Bangkok'", "'+07:00'", '+0700']) {
    assert.equal(code.includes(literal), false,
      `publishWindow restates ${literal}. articlePublishTime.js owns the site zone; a second `
      + 'copy is what drifts when Thailand is not the only answer.');
  }
  // …and the constants it imports really are the ones this round decided on.
  assert.equal(SITE_TIME_ZONE, 'Asia/Bangkok');
  assert.equal(SITE_UTC_OFFSET, '+07:00');
});

test('CONTROL: the literal matcher does see a restated zone', () => {
  assert.equal("const OFF = '+07:00';".includes("'+07:00'"), true,
    'the literal matcher does not work, so the check above means nothing');
});

// ── J: the boundary, in both zones ────────────────────────────────────────

test('a page whose window ends TODAY is visible all of today', async (t) => {
  await t.test('visible at 00:00:00.000 Bangkok on that day', () => {
    assert.equal(isPubliclyVisible(endsToday, at(DAY_START_UTC)), true,
      'the page is already expired at the start of the day the author named');
  });

  await t.test('visible at 23:59:59.999 Bangkok — the LAST visible instant', () => {
    assert.equal(isPubliclyVisible(endsToday, at(LAST_VISIBLE_UTC)), true);
  });

  await t.test('NOT visible at 00:00:00.000 Bangkok the next day — the FIRST hidden one', () => {
    assert.equal(isPubliclyVisible(endsToday, at(FIRST_HIDDEN_UTC)), false);
    assert.equal(invisibleReason(endsToday, at(FIRST_HIDDEN_UTC)), 'expired');
  });

  await t.test('the two boundary instants are 1ms apart, and they straddle Bangkok midnight', () => {
    assert.equal(at(FIRST_HIDDEN_UTC) - at(LAST_VISIBLE_UTC), 1);
    // Legible in both zones: 16:59:59.999Z / 17:00:00.000Z is 23:59:59.999 /
    // 00:00:00.000 in Asia/Bangkok, which is the whole point of the decision.
    const inBangkok = (iso) => new Intl.DateTimeFormat('en-CA', {
      timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(iso));
    assert.match(inBangkok(LAST_VISIBLE_UTC), /^2026-08-28, 23:59:59$/);
    assert.match(inBangkok(FIRST_HIDDEN_UTC), /^2026-08-29, 00:00:00$/);
  });

  await t.test('CONTROL: the OLD conversion fails the very first case', () => {
    // The regression this round is about, asserted rather than described: with
    // the end pinned to the start of the day, the page is expired for all of it.
    const oldStyle = { status: 'published', publishStartDate: null, publishEndDate: DAY_START_UTC };
    assert.equal(isPubliclyVisible(oldStyle, at(DAY_START_UTC)), true, 'precondition: visible AT the instant');
    assert.equal(isPubliclyVisible(oldStyle, at(DAY_START_UTC) + 1), false,
      'the old value did NOT expire one millisecond into the day — the fixture does not '
      + 'reproduce the reported bug, so the cases above prove nothing');
    assert.equal(isPubliclyVisible(oldStyle, at(LAST_VISIBLE_UTC)), false);
  });
});

test('a START date opens the window at the start of its day', () => {
  const startsToday = { status: 'published', publishStartDate: windowStartFromInput(DAY), publishEndDate: null };
  assert.equal(isPubliclyVisible(startsToday, at(DAY_START_UTC)), true, 'not live at 00:00 on its own start day');
  assert.equal(isPubliclyVisible(startsToday, at(DAY_START_UTC) - 1), false, 'live one ms before it begins');
  assert.equal(invisibleReason(startsToday, at(DAY_START_UTC) - 1), 'published_future');
});

test('a one-day window is a whole day, both ends', () => {
  const oneDay = {
    status: 'published',
    publishStartDate: windowStartFromInput(DAY),
    publishEndDate: windowEndFromInput(DAY),
  };
  assert.equal(isPubliclyVisible(oneDay, at(DAY_START_UTC) - 1), false);
  assert.equal(isPubliclyVisible(oneDay, at(DAY_START_UTC)), true);
  assert.equal(isPubliclyVisible(oneDay, at(LAST_VISIBLE_UTC)), true);
  assert.equal(isPubliclyVisible(oneDay, at(FIRST_HIDDEN_UTC)), false);
  // …and it really is 24 hours to the millisecond.
  assert.equal(at(FIRST_HIDDEN_UTC) - at(DAY_START_UTC), 24 * 60 * 60 * 1000);
});

// ── reading a stored instant back into the box ────────────────────────────

test('the date box shows the BANGKOK calendar day, not the UTC one', () => {
  assert.equal(toDateInput(LAST_VISIBLE_UTC), DAY);
  assert.equal(toDateInput(DAY_START_UTC), DAY);
  // The old reading, and why it was wrong: the UTC slice of a Bangkok-authored
  // value is the day BEFORE what was typed. Both stored pages in the database
  // show exactly this.
  assert.equal(DAY_START_UTC.slice(0, 10), '2026-08-27');
  assert.notEqual(toDateInput(DAY_START_UTC), DAY_START_UTC.slice(0, 10));
});

test('a value round-trips through the box without walking', () => {
  // The compounding half of the old defect: read a day early, re-save a day
  // early, every time the dialog was opened and saved.
  let end = windowEndFromInput(DAY);
  for (let i = 0; i < 5; i += 1) end = windowEndFromInput(toDateInput(end));
  assert.equal(end, LAST_VISIBLE_UTC, 'the end date drifted across five round trips');

  let start = windowStartFromInput(DAY);
  for (let i = 0; i < 5; i += 1) start = windowStartFromInput(toDateInput(start));
  assert.equal(start, DAY_START_UTC, 'the start date drifted across five round trips');
});

test('CONTROL: the OLD pair DID walk backwards, one day per save', () => {
  // Without this, "no drift" would pass for a round trip that never moved for
  // an unrelated reason. This is the measured defect, reproduced.
  const oldTo = (v) => (v ? String(v).slice(0, 10) : '');
  withTZ('Asia/Bangkok', () => {
    let v = '2026-08-27T17:00:00.000Z'; // what a Bangkok browser stored for 28 Aug
    assert.equal(oldTo(v), '2026-08-27', 'precondition: the box already reads a day early');
    v = OLD_CONVERSION(oldTo(v));
    assert.equal(oldTo(v), '2026-08-26', 'the old pair did not walk — the fixture proves nothing');
  });
});

// ── the conversion is TOTAL ────────────────────────────────────────────────

test('an empty or unparseable box is NO bound, never a bound matching nothing', () => {
  for (const bad of ['', null, undefined, '   ', '2026-08', '28/08/2026', 'nonsense', '2026-13-01']) {
    assert.equal(windowStartFromInput(bad), null, `start accepted ${JSON.stringify(bad)}`);
    assert.equal(windowEndFromInput(bad), null, `end accepted ${JSON.stringify(bad)}`);
  }
  assert.equal(toDateInput(null), '');
  assert.equal(toDateInput('nonsense'), '');
});

test('a calendar date that does not exist is REFUSED, not rolled forward', () => {
  /**
   * The trap: `new Date('2026-02-31T00:00:00.000+07:00')` is NOT Invalid Date —
   * V8 rolls it into 3 March and returns a usable timestamp. Only a bad MONTH
   * gives NaN. A shape check plus a NaN check would store a window three days
   * past anything anybody typed.
   */
  for (const impossible of ['2026-02-31', '2026-02-29', '2026-04-31', '2026-06-31']) {
    assert.equal(windowEndFromInput(impossible), null, `${impossible} was accepted`);
    assert.equal(windowStartFromInput(impossible), null, `${impossible} was accepted`);
  }
  // …and a real leap day is still accepted.
  assert.equal(toDateInput(windowStartFromInput('2028-02-29')), '2028-02-29');
});

test('CONTROL: a NaN check ALONE would have accepted 31 February', () => {
  // Proves the round-trip guard is doing work rather than duplicating the
  // Number.isNaN one line above it.
  const naive = new Date(`2026-02-31T00:00:00.000${SITE_UTC_OFFSET}`);
  assert.equal(Number.isNaN(naive.getTime()), false,
    'V8 now rejects 31 February outright, so the round-trip guard is no longer load-bearing '
    + '— re-read publishWindow.js before simplifying it');
  assert.equal(toDateInput(naive.toISOString()), '2026-03-03');
});

// ── C: the RULE was not touched ───────────────────────────────────────────

/**
 * `isPubliclyVisible`, byte for byte as round 42 found it.
 *
 * The fix belongs at the CONVERSION: the rule `now > end` is correct once `end`
 * means what an author means, and visibility.js's header says it exists so the
 * route and the dialog cannot drift. Changing the comparison instead would put
 * the STORED VALUE and the RULE into disagreement — every other consumer of a
 * stored instant would still read 00:00 while one function privately knew
 * better. This pins that the round did what it said.
 */
const VISIBILITY_SOURCE = "export function isPubliclyVisible(page, now = Date.now()) {\n"
  + "  if (!page) return false;\n"
  + "  const start = page.publishStartDate ? new Date(page.publishStartDate).getTime() : null;\n"
  + "  const end   = page.publishEndDate   ? new Date(page.publishEndDate).getTime()   : null;\n"
  + "  if (end !== null && !Number.isNaN(end) && now > end) return false;\n"
  + "  if (page.status === 'published') return start === null || Number.isNaN(start) || now >= start;\n"
  + "  if (page.status === 'scheduled') return start !== null && !Number.isNaN(start) && now >= start;\n"
  + "  return false;\n}\n";

/** The function's own text, cut out of the raw file. */
function visibilityFunctionSource() {
  const raw = readSource('src/lib/pageBuilder/visibility.js').raw.replace(/\r\n/g, '\n');
  const i = raw.indexOf('export function isPubliclyVisible');
  if (i < 0) return '';
  const j = raw.indexOf('\n}\n', i);
  return j < 0 ? '' : raw.slice(i, j + 3);
}

test('isPubliclyVisible is byte-identical — the fix was NOT put in the rule', () => {
  assert.equal(visibilityFunctionSource(), VISIBILITY_SOURCE,
    'isPubliclyVisible changed. Round 42 fixes the CONVERSION, not the comparison: the rule '
    + '`now > end` is right once `end` means the end of the day, and moving the fix here would '
    + 'make the stored value and the rule disagree for every other consumer of the window.');
});

test('CONTROL: the extractor really does read the function, and would see an edit', () => {
  // Without this, "byte-identical" would pass for an extractor returning ''
  // compared against a constant that is also ''.
  const src = visibilityFunctionSource();
  assert.ok(src.length > 200, 'the extractor came back with almost nothing');
  assert.ok(src.includes('now > end'), 'the extractor is not reading the comparison');
  // The edit this round was told not to make, and what the pin would say about it.
  const edited = src.replace('now > end', 'now >= end');
  assert.notEqual(edited, VISIBILITY_SOURCE, 'the pin cannot tell > from >=');
});

test('nothing in the window module reaches into the rule', () => {
  const { withImports } = readSource('src/lib/pageBuilder/publishWindow.js');
  for (const name of ['isPubliclyVisible', 'invisibleReason', 'visibility']) {
    assert.equal(withImports.includes(name), false,
      `publishWindow reaches for '${name}' — the conversion decides what a date MEANS and the `
      + 'rule decides what follows; a module that did both would be the drift visibility.js '
      + 'was split out to prevent.');
  }
});

// ── F: the dialog's honesty line now agrees with the route ────────────────

/**
 * The dialog is a Radix portal and renders zero bytes under
 * renderToStaticMarkup (round 27 measured that), so its bottom line is
 * asserted the only way it can be: the `next` object it builds is rebuilt here
 * from the same two exported conversions, run through the same predicate, and
 * a source scan pins that the component really does build it that way.
 */
const VISIBLE_LINE = 'หลังบันทึก ผู้เข้าชมจะเปิดหน้านี้ได้';
const EXPIRED_REASON_TEXT = 'เลยวันสิ้นสุดแล้ว — หน้านี้เข้าไม่ได้ แม้สถานะจะเป็นเผยแพร่';

const honestyLine = (next, now) => (isPubliclyVisible(next, now)
  ? VISIBLE_LINE
  : `หลังบันทึก ผู้เข้าชมจะยังเปิดหน้านี้ไม่ได้ — ${EXPIRED_REASON_TEXT}`);

test('an end date of TODAY now reads as visible, and the route agrees', () => {
  const next = {
    status: 'published',
    publishStartDate: windowStartFromInput(''),
    publishEndDate: windowEndFromInput(DAY),
  };
  // Any instant inside the named day; the boundary itself is pinned above.
  const noon = at('2026-08-28T05:00:00.000Z'); // 12:00 in Bangkok

  assert.equal(isPubliclyVisible(next, noon), true, 'the route would 404 a page ending today');
  assert.equal(invisibleReason(next, noon), null);
  assert.equal(honestyLine(next, noon), VISIBLE_LINE);
});

test('CONTROL: the OLD value made the same dialog say "expired" on that day', () => {
  // The two surfaces agreed BEFORE the fix too — both were wrong together,
  // which is why the honesty line never caught this. What changed is the value
  // they both read.
  const oldNext = { status: 'published', publishStartDate: null, publishEndDate: DAY_START_UTC };
  const noon = at('2026-08-28T05:00:00.000Z');
  assert.equal(isPubliclyVisible(oldNext, noon), false);
  assert.equal(invisibleReason(oldNext, noon), 'expired');
  assert.equal(honestyLine(oldNext, noon),
    `หลังบันทึก ผู้เข้าชมจะยังเปิดหน้านี้ไม่ได้ — ${EXPIRED_REASON_TEXT}`);
  assert.notEqual(honestyLine(oldNext, noon), VISIBLE_LINE);
});

test('the dialog builds its window from these conversions and nothing else', () => {
  const { code, withImports } = readSource('src/components/pageBuilder/editor/PublishDialog.jsx');
  assert.match(withImports,
    /import \{ toDateInput, windowStartFromInput, windowEndFromInput \} from '@\/lib\/pageBuilder\/publishWindow'/,
    'the dialog no longer imports the window conversions');
  assert.match(code, /publishStartDate: windowStartFromInput\(start\)/, 'the start is not converted');
  assert.match(code, /publishEndDate: windowEndFromInput\(end\)/, 'the end is not converted');
  assert.match(code, /useState\(toDateInput\(page\?\.publishStartDate\)\)/, 'the start box is not read in Bangkok');
  assert.match(code, /useState\(toDateInput\(page\?\.publishEndDate\)\)/, 'the end box is not read in Bangkok');

  // …and the two defective lines are gone from the executed source, not merely
  // shadowed by the imports above.
  assert.equal(/new Date\(`\$\{v\}T00:00:00`\)/.test(code), false,
    'the ambient-zone conversion is still in PublishDialog');
  assert.equal(code.includes('String(v).slice(0, 10)'), false,
    'the UTC-slice read is still in PublishDialog');
  // The honesty line still runs the shared predicate rather than a paraphrase.
  assert.match(code, /isPubliclyVisible\(next\)/, 'the dialog stopped running the route’s predicate');
});

test('CONTROL: the defective-line matchers do recognise their subjects', () => {
  assert.equal(/new Date\(`\$\{v\}T00:00:00`\)/.test('const f = (v) => new Date(`${v}T00:00:00`).toISOString();'), true,
    'the ambient-zone matcher does not work, so the check above means nothing');
  assert.equal("const g = (v) => String(v).slice(0, 10);".includes('String(v).slice(0, 10)'), true,
    'the UTC-slice matcher does not work, so the check above means nothing');
});

test('the field hints tell the author which day and whose clock', () => {
  // The fix is invisible without this: nothing else on the surface says that
  // the named day is included, or that the day is a Thai one.
  const { code } = readSource('src/components/pageBuilder/editor/PublishDialog.jsx');
  assert.ok(code.includes('เข้าได้ถึงสิ้นวันนั้น (เวลาไทย)'),
    'the end-date field no longer says the named day is included');
  assert.ok(code.includes('เริ่มตั้งแต่ต้นวันนั้น (เวลาไทย)'),
    'the start-date field no longer says which instant it opens at');
});
