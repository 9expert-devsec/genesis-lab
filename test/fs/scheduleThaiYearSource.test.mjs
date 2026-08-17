import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * THE BUDDHIST YEAR COMES FROM `Intl`, NEVER FROM `+ 543`.
 *
 * ── WHY THIS GUARD IS AT THE SOURCE TIER AND NOT THE PURE ONE ───────────────
 * It has to be. `String(date.getFullYear() + 543).slice(-2)` and
 * `Intl.DateTimeFormat('th-TH', { year: '2-digit' })` return THE SAME STRING
 * for every year anyone will ever put in this table — 2026 → '69', 2027 → '70'
 * — because that is what the Buddhist era arithmetic is. A value assertion
 * cannot tell them apart, and a mutation swapping one for the other reddened
 * exactly zero tests until this file existed.
 *
 * They are still not the same thing. The hand-rolled version:
 *   · hardcodes an era offset that the locale is responsible for, so a th-TH
 *     rendering that is already Buddhist gets shifted a SECOND time — the prior
 *     incident in this repo;
 *   · silently produces a Gregorian year the moment someone formats the same
 *     Date through Intl elsewhere on the page and the two disagree;
 *   · cannot be reviewed by reading the output, which is the whole problem.
 *
 * So the rule is enforced on the text: the schedule surfaces contain no 543 and
 * ask the formatter instead. Comments are stripped by test/sourceScan.mjs, so
 * the docstrings in these very files explaining the ban do not satisfy it.
 */

const SCHEDULE_SURFACES = [
  'src/lib/schedule/monthWindow.js',
  'src/lib/schedule/roundDateLabel.js',
  'src/lib/schedule/scheduleTableLayout.js',
  'src/app/(public)/schedule/_components/ScheduleClient.jsx',
  // Added when the two round PICKERS (course detail, registration step 1)
  // stopped rendering English months and moved onto formatRoundDays. It is a
  // Thai-year surface now, and this guard is what stops the next `+ 543`.
  'src/components/registration/ScheduleCarousel.jsx',
  // Added when /admin/schedules gave up its own `${first}-${last}` label and
  // joined `formatRoundDays`. Its month columns are Intl-formatted Buddhist
  // years (TH_MONTH_FMT) and its round labels now come from the shared
  // formatter, so it is a Thai-year surface and this is what stops the next
  // `+ 543` appearing on it.
  'src/app/admin/schedules/_components/SchedulesAdminClient.jsx',
];

test('no schedule surface contains a 543 literal', () => {
  for (const rel of SCHEDULE_SURFACES) {
    const src = readSource(rel);
    assert.equal(
      /(?<![\w.])543(?![\w.])/.test(src.code),
      false,
      `${rel} hand-adds the Buddhist era offset — th-TH already does it`,
    );
  }
});

test('the year label asks Intl for the year PART, not for a sliced string', () => {
  /**
   * `{ year: '2-digit' }` formats as 'พ.ศ. 70'. Getting '70' out of it by
   * `.slice(-2)` or by splitting on a space is a guess about where the era
   * prefix ends — locale data that an ICU update may reword or reorder, with no
   * error when it does. `formatToParts` asks the question directly.
   */
  const src = readSource('src/lib/schedule/monthWindow.js');
  assert.match(src.code, /formatToParts\(/, 'monthYearLabel must use formatToParts');
  assert.match(src.code, /p\.type === 'year'/, 'and select the year part by name');
  assert.equal(
    /YEAR_ONLY[\s\S]{0,80}?\.(slice|split|substring|replace)\(/.test(src.code),
    false,
    'the era must not be removed by string surgery',
  );
});

test('every Thai date formatter on these surfaces goes through Intl', () => {
  // The positive half. Without it, deleting the year line entirely would
  // satisfy the "no 543" sweep above.
  const src = readSource('src/lib/schedule/monthWindow.js');
  const formatters = src.code.match(/new Intl\.DateTimeFormat\('th-TH'/g) ?? [];
  assert.equal(formatters.length, 4, 'month, month+year, year-only, and long month+year');
});

test('roundDateLabel asks Intl for BOTH the month and the year', () => {
  /**
   * The same positive half, for the round formatter. It matters more here than
   * anywhere else on the list: this module was written to retire five
   * hand-rolled formatters, THREE of which carried their own `MONTH_TH` array
   * and one of which hand-added 543. A "no 543" sweep is satisfied by a file
   * that does no Thai formatting at all, so the ban alone would not notice a
   * ninth copy of that array growing back beside the Intl calls.
   */
  const src = readSource('src/lib/schedule/roundDateLabel.js');
  const formatters = src.code.match(/new Intl\.DateTimeFormat\('th-TH'/g) ?? [];
  assert.equal(formatters.length, 2, 'the short month, and the 2-digit year');
  assert.match(src.code, /month: 'short'/);
  assert.match(src.code, /formatToParts\(/, 'the year must come out as a PART');
  assert.match(src.code, /p\.type === 'year'/);

  // And no hand-written month table beside them. The eight copies already in
  // src/ are exactly how these surfaces drifted apart in the first place.
  assert.equal(
    /'ม\.ค\.'/.test(src.code),
    false,
    'a ninth MONTH_TH array — the month is locale data, ask the formatter',
  );
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the 543 matcher DOES fire on the mutation it exists to catch', () => {
  /**
   * The exact mutant that slipped through the whole suite. Named as text so the
   * guard's subject is unmistakable.
   */
  const mutant = "return String(d.getFullYear() + 543).slice(-2);";
  assert.ok(/(?<![\w.])543(?![\w.])/.test(mutant));
  assert.ok(/(?<![\w.])543(?![\w.])/.test('const BE_OFFSET = 543;'));
  assert.ok(/(?<![\w.])543(?![\w.])/.test('year + 543'));
});

test('CONTROL: the matcher does NOT fire on a number that merely contains 543', () => {
  // 5430, 15430 and a 543 inside an identifier are not the era offset. An
  // unguarded match would go red on unrelated code and get deleted.
  for (const s of ['const n = 5430;', 'z-15430', 'const total543 = 1;', 'px-[1543px]']) {
    assert.equal(/(?<![\w.])543(?![\w.])/.test(s), false, `false positive on: ${s}`);
  }
});

test('CONTROL: the sweep is reading real code, not empty strings', () => {
  // A wrong path or a failed scrub returns '' and every "does not contain"
  // assertion passes together — the worst possible combination.
  for (const rel of SCHEDULE_SURFACES) {
    const src = readSource(rel);
    assert.ok(src.code.length > 500, `${rel} was not actually read`);
  }
  assert.match(readSource(SCHEDULE_SURFACES[0]).code, /export function monthYearLabel/);
});

test('CONTROL: a 543 DOES exist elsewhere in the repo — the ban is scoped, not universal', () => {
  /**
   * InhouseDetailClient's `fmtDate` hand-adds 543 to build a Thai date string,
   * and it is OUT OF SCOPE here. Firing the matcher on it proves this sweep is
   * scoped deliberately rather than passing because nothing in the repo could
   * ever match. If that file is ever converted to Intl this control goes red,
   * which is the correct moment to widen or retire it.
   */
  const elsewhere = walkSources('src')
    .filter((f) => !SCHEDULE_SURFACES.includes(f.rel))
    .filter((f) => /(?<![\w.])543(?![\w.])/.test(f.code))
    .map((f) => f.rel);
  assert.ok(
    elsewhere.length > 0,
    'the matcher found no 543 anywhere in src — it may be inert',
  );
});
