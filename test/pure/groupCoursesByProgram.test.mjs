import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupCoursesByProgram, NO_PROGRAM_LABEL } from '@/lib/courses/groupCoursesByProgram';
import { orderCoursesGlobally } from '@/lib/courses/courseOrder';

/**
 * The folders, the counts, and the number in each folder.
 *
 * A pure function, so this drives it for real. What it CANNOT reach is whether
 * /admin/courses is handed an ordered array in the first place — that is
 * `listPublicCourses` applying the order above its `includeHidden` early
 * return, guarded in test/fs/courseOrderOwnership, and verified against
 * production on 2026-08-14: the admin branch returned 79 courses, CLAUDE 1-3,
 * POWER-BI 1-5, MSE 1-11, with 0 of 79 unlisted.
 */

const course = (code, programId, extra = {}) => ({
  course_id: code,
  course_name: code,
  _id: `id-${code}`,
  program: programId ? { program_id: programId, _id: `oid-${programId}` } : undefined,
  ...extra,
});

const PROGRAM_NAMES = { CLAUDE: 'Claude AI', 'POWER-BI': 'Power BI' };
const ORDER = {
  CLAUDE:     ['CLAUDE-AI', 'VIBE-CODE-L1', 'VIBE-CODE-L2'],
  'POWER-BI': ['POWER-BI', 'POWER-BI-ADV'],
};

const ROWS = [
  course('CLAUDE-AI', 'CLAUDE'),
  course('VIBE-CODE-L1', 'CLAUDE'),
  course('VIBE-CODE-L2', 'CLAUDE'),
  course('POWER-BI', 'POWER-BI'),
  course('POWER-BI-ADV', 'POWER-BI'),
];

const group = (rows = ROWS, opts = {}) =>
  groupCoursesByProgram(rows, {
    programCourseOrder: ORDER,
    programNames: PROGRAM_NAMES,
    ...opts,
  });

// ── Folders ─────────────────────────────────────────────────────────────────

test('one folder per program, named and counted', () => {
  const groups = group();
  assert.deepEqual(groups.map((g) => g.programId), ['CLAUDE', 'POWER-BI']);
  assert.deepEqual(groups.map((g) => g.programName), ['Claude AI', 'Power BI']);
  assert.deepEqual(groups.map((g) => g.count), [3, 2]);
});

test('the count equals the rows actually in the folder', () => {
  // The count is rendered beside the folder name; a count that disagrees with
  // the rows under it is worse than no count.
  for (const g of group()) assert.equal(g.count, g.rows.length);
});

test('folders appear in first-appearance order, not alphabetically', () => {
  // The incoming array is already the site's order (program rank, then rank
  // within the program). Re-sorting folders here would be a second ordering
  // scheme free to disagree with the public site.
  const reversed = [...ROWS].reverse();
  assert.deepEqual(group(reversed).map((g) => g.programId), ['POWER-BI', 'CLAUDE']);
});

test('a program whose rows are not contiguous still folds into ONE folder', () => {
  const interleaved = [
    course('CLAUDE-AI', 'CLAUDE'),
    course('POWER-BI', 'POWER-BI'),
    course('VIBE-CODE-L1', 'CLAUDE'),
  ];
  const groups = group(interleaved);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.programId === 'CLAUDE').count, 2);
});

test('a course with no program gets its own named folder rather than an empty one', () => {
  const groups = group([course('ORPHAN', null)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].programId, '');
  assert.equal(groups[0].programName, NO_PROGRAM_LABEL);
});

test('a program with no resolvable name falls back to its id, never to blank', () => {
  const groups = group([course('X', 'UNKNOWN-PROG')]);
  assert.equal(groups[0].programName, 'UNKNOWN-PROG');
});

// ── The number ──────────────────────────────────────────────────────────────

test('THE NUMBER RESTARTS AT 1 INSIDE EACH FOLDER', () => {
  const groups = group();
  assert.deepEqual(groups[0].rows.map((r) => r.position), [1, 2, 3]);
  assert.deepEqual(groups[1].rows.map((r) => r.position), [1, 2]);
});

test('the number is the position in the STORED list, not the row position', () => {
  // Only the second and third CLAUDE courses are present. They keep 2 and 3 —
  // renumbering them 1 and 2 would show an order no write would reproduce.
  const groups = group([
    course('VIBE-CODE-L1', 'CLAUDE'),
    course('VIBE-CODE-L2', 'CLAUDE'),
  ]);
  assert.deepEqual(groups[0].rows.map((r) => r.position), [2, 3]);
});

test('the stored list is matched case-insensitively, as the comparator does', () => {
  // course_id has no canonical casing upstream; codes are stored upper-cased.
  const groups = group([course('claude-ai', 'CLAUDE')]);
  assert.equal(groups[0].rows[0].position, 1);
  assert.equal(groups[0].rows[0].unlisted, false);
});

// ── The unlisted tier ───────────────────────────────────────────────────────

test('a course absent from its list is marked unlisted and has NO position', () => {
  const groups = group([course('BRAND-NEW', 'CLAUDE')]);
  assert.equal(groups[0].rows[0].unlisted, true);
  assert.equal(groups[0].rows[0].position, null);
});

test('an unlisted course is not numbered by where it sits on screen', () => {
  // THE DEFECT THIS FILE EXISTS FOR. The live comparator sorts unlisted FIRST,
  // so numbering by render position would print 1 against BRAND-NEW and push
  // CLAUDE-AI — which really is first in the stored list — down to 2.
  const groups = group([
    course('BRAND-NEW', 'CLAUDE'),
    course('CLAUDE-AI', 'CLAUDE'),
    course('VIBE-CODE-L1', 'CLAUDE'),
  ]);
  assert.deepEqual(groups[0].rows.map((r) => r.position), [null, 1, 2]);
  assert.deepEqual(groups[0].rows.map((r) => r.unlisted), [true, false, false]);
});

test('the unlisted tier really does lead — the annotation matches the live sort', () => {
  // Drives the REAL comparator rather than asserting the claim by hand: if
  // orderCoursesGlobally ever stopped putting unlisted first, the note above
  // would be wrong and this reddens.
  const ordered = orderCoursesGlobally(
    [course('CLAUDE-AI', 'CLAUDE', { createdAt: '2020-01-01' }),
     course('BRAND-NEW', 'CLAUDE', { createdAt: '2026-01-01' })],
    { programRank: new Map([['CLAUDE', 0]]), courseOrderByProgram: new Map(Object.entries(ORDER)) }
  );
  assert.equal(ordered[0].course_id, 'BRAND-NEW', 'unlisted no longer leads');
  assert.equal(group(ordered)[0].rows[0].unlisted, true);
});

test('a program with an EMPTY stored list makes every one of its courses unlisted', () => {
  const groups = group([course('A', 'EMPTY-PROG')], { programCourseOrder: { 'EMPTY-PROG': [] } });
  assert.deepEqual(groups[0].rows.map((r) => r.unlisted), [true]);
});

// ── The null order — read failed, or nothing seeded ─────────────────────────

test('a NULL order makes every course unlisted rather than numbering them 1..n', () => {
  const groups = group(ROWS, { programCourseOrder: null });
  assert.deepEqual(groups.flatMap((g) => g.rows).map((r) => r.position), [null, null, null, null, null]);
  assert.ok(groups.flatMap((g) => g.rows).every((r) => r.unlisted));
  // Folders and counts still work, so the table is usable while the banner
  // explains why there are no numbers.
  assert.deepEqual(groups.map((g) => g.count), [3, 2]);
});

// ── Input safety ────────────────────────────────────────────────────────────

test('the input array is never mutated or re-sorted', () => {
  const input = [...ROWS];
  const snapshot = input.map((c) => c.course_id);
  group(input);
  assert.deepEqual(input.map((c) => c.course_id), snapshot);
  // and the rows come out in the order they went in
  assert.deepEqual(
    group(input).flatMap((g) => g.rows).map((r) => r.course.course_id),
    snapshot
  );
});

test('empty and non-array inputs return no folders rather than throwing', () => {
  assert.deepEqual(groupCoursesByProgram([]), []);
  assert.deepEqual(groupCoursesByProgram(null), []);
  assert.deepEqual(groupCoursesByProgram(undefined), []);
});

test('a course with no course_id is unlisted rather than matching an empty code', () => {
  const groups = group([{ program: { program_id: 'CLAUDE' } }]);
  assert.equal(groups[0].rows[0].unlisted, true);
  assert.equal(groups[0].rows[0].position, null);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: positions vary with the stored list, so they are read not invented', () => {
  const flipped = group(ROWS, {
    programCourseOrder: { ...ORDER, CLAUDE: ['VIBE-CODE-L2', 'VIBE-CODE-L1', 'CLAUDE-AI'] },
  });
  assert.deepEqual(flipped[0].rows.map((r) => r.position), [3, 2, 1]);
});

test('CONTROL: every assertion above would fail on a grouper that returned nothing', () => {
  const groups = group();
  assert.ok(groups.length > 0);
  assert.ok(groups.every((g) => g.rows.length > 0));
});
