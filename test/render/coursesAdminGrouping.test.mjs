import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { CoursesAdminClient } from '@/app/admin/courses/_components/CoursesAdminClient';

/**
 * /admin/courses RENDERS THE STORED ORDER, folded into folders.
 *
 * test/pure/groupCoursesByProgram drives the grouping function directly and is
 * the stronger test. This is the other half — that the numbers the function
 * returns actually reach the markup, in the right cells, and that an unlisted
 * course is MARKED rather than numbered. A correct grouper wired to a column
 * that prints the row index would satisfy every pure assertion and still ship
 * the defect.
 *
 * ── WHAT THIS TIER CANNOT SEE ──────────────────────────────────────────────
 * That the array arrives ordered at all. `listPublicCourses` applies the order
 * at the origin, above its `includeHidden` early return; that is guarded in
 * test/fs/courseOrderOwnership and was verified against production on
 * 2026-08-14 (79 courses, CLAUDE 1-3, POWER-BI 1-5, MSE 1-11, 0 unlisted).
 * These fixtures hand the component an already-ordered array, as the page does.
 */

const course = (code, programId) => ({
  course_id: code,
  course_name: code,
  _id: `id-${code}`,
  program: { program_id: programId, _id: `oid-${programId}` },
});

const PROGRAMS = [
  { _id: 'oid-CLAUDE',   program_id: 'CLAUDE',   program_name: 'Claude AI' },
  { _id: 'oid-POWER-BI', program_id: 'POWER-BI', program_name: 'Power BI' },
];

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

function render(props = {}) {
  __setPathname('/admin/courses');
  __setSearchParams('');
  return renderToStaticMarkup(
    createElement(CoursesAdminClient, {
      courses: ROWS,
      extensions: {},
      programs: PROGRAMS,
      programCourseOrder: ORDER,
      programNames: PROGRAM_NAMES,
      q: '',
      program: '',
      type: '',
      ...props,
    })
  );
}

/**
 * The ลำดับ cell of every data row, in document order.
 *
 * Anchored on `<tbody>` and on the FIRST `<td>` of each row, so the folder
 * header (a `<th colspan>`) cannot be mistaken for a numbered row — which is
 * the failure that would make "numbering restarts" pass for the wrong reason.
 */
function positionCells(html) {
  return [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
}

/**
 * Folder headers: `[label, count]` pairs.
 *
 * The attribute match is CASE-INSENSITIVE. This renderer emits `colSpan="8"`
 * with the JSX casing intact rather than the lower-case DOM attribute, and a
 * matcher pinned to one spelling is a matcher that reports "no folders" the day
 * the other appears — which for a `deepEqual` against an expected list fails
 * loudly, but for the negative assertions elsewhere in this file would not.
 */
function folders(html) {
  return [...html.matchAll(/<th colspan="8"[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, '|').split('|').map((s) => s.trim()).filter(Boolean)
  );
}

// ── The folders ─────────────────────────────────────────────────────────────

test('the list is folded into one folder per program, each with its count', () => {
  assert.deepEqual(folders(render()), [
    ['Claude AI', '3 หลักสูตร'],
    ['Power BI', '2 หลักสูตร'],
  ]);
});

test('the folder count follows the FILTER, not the full catalogue', () => {
  // Filtering to one program must not leave the other folder's count on screen,
  // and must not report the unfiltered size of the folder that remains.
  const html = render({ program: 'oid-CLAUDE' });
  assert.deepEqual(folders(html), [['Claude AI', '3 หลักสูตร']]);
});

// ── The number restarts inside each folder ──────────────────────────────────

test('THE NUMBERING RESTARTS AT 1 INSIDE EACH FOLDER', () => {
  // The whole point of the column. A flat table would read 1,2,3,4,5.
  assert.deepEqual(positionCells(render()), ['1', '2', '3', '1', '2']);
});

test('the number comes from the stored list, not from the row position', () => {
  // Only the tail of the CLAUDE list is present; those courses keep 2 and 3.
  const html = render({
    courses: [course('VIBE-CODE-L1', 'CLAUDE'), course('VIBE-CODE-L2', 'CLAUDE')],
  });
  assert.deepEqual(positionCells(html), ['2', '3']);
});

test('CONTROL: the numbers vary with the stored list, so they are read not counted', () => {
  const html = render({
    programCourseOrder: { ...ORDER, CLAUDE: ['VIBE-CODE-L2', 'VIBE-CODE-L1', 'CLAUDE-AI'] },
  });
  assert.deepEqual(positionCells(html), ['3', '2', '1', '1', '2']);
});

// ── The unlisted tier is MARKED, never numbered ─────────────────────────────

test('an unlisted course is marked, and is NOT given a number', () => {
  const html = render({
    courses: [course('BRAND-NEW', 'CLAUDE'), ...ROWS],
  });
  const cells = positionCells(html);
  assert.equal(cells[0], 'ยังไม่จัดลำดับ', 'the unlisted row is not marked');
  // And the courses that DO have positions keep them — the unlisted row did not
  // push CLAUDE-AI off 1.
  assert.deepEqual(cells, ['ยังไม่จัดลำดับ', '1', '2', '3', '1', '2']);
});

test('no digit is rendered in an unlisted row at all', () => {
  const html = render({ courses: [course('BRAND-NEW', 'CLAUDE')] });
  assert.deepEqual(positionCells(html), ['ยังไม่จัดลำดับ']);
  assert.ok(!/<td[^>]*>\s*1\s*<\/td>/.test(html), 'an unlisted course was numbered 1');
});

test('the marker carries an explanation rather than standing alone', () => {
  const html = render({ courses: [course('BRAND-NEW', 'CLAUDE')] });
  assert.match(html, /title="ยังไม่อยู่ในลำดับ[^"]*"/, 'the marker has no title explaining it');
});

// ── The null order — read failed, or nothing seeded ─────────────────────────

test('a NULL order marks every row and says why, instead of a column of blanks', () => {
  const html = render({ programCourseOrder: null });
  assert.deepEqual(positionCells(html), Array(5).fill('ยังไม่จัดลำดับ'));
  assert.match(html, /ยังไม่มีลำดับที่บันทึกไว้/, 'no banner explains why nothing is numbered');
});

test('the banner is ABSENT when the order is present', () => {
  assert.ok(!/ยังไม่มีลำดับที่บันทึกไว้/.test(render()), 'the banner shows over a seeded order');
});

// ── The grouping survives the arrival of the write path ─────────────────────

/**
 * This case asserted "there is NO reorder control in the markup", which was
 * commit 1's ruling and is no longer true — commit 2 adds the drag. Rewritten
 * rather than deleted, because the property that mattered still holds: the
 * NUMBERING is read from the stored array, and a drag affordance must not
 * change that. A control appearing beside the number is fine; a control that
 * renumbers from render position is the defect.
 *
 * Which states offer the drag, and the limits the screen states about it, are
 * in test/render/coursesAdminReorder.
 */
test('the drag affordance does not disturb the stored numbering', () => {
  const html = render();
  assert.deepEqual(positionCells(html), ['1', '2', '3', '1', '2']);
  // The handle sits inside the ลำดับ cell, so the extractor above must still
  // read the NUMBER and not the handle's markup.
  assert.match(html, /aria-label="Drag handle"/, 'the drag affordance is missing entirely');
});

test('an unlisted row keeps its marker even with the drag offered', () => {
  const html = render({ courses: [course('BRAND-NEW', 'CLAUDE'), ...ROWS] });
  assert.equal(positionCells(html)[0], 'ยังไม่จัดลำดับ');
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the cell extractor finds real cells and skips folder headers', () => {
  // Every "unlisted is not numbered" assertion is a negative; a broken
  // extractor returning [] would satisfy them all.
  const cells = positionCells(render());
  assert.equal(cells.length, 5, `extractor found ${cells.length} rows, expected 5`);
  assert.ok(!cells.includes('Claude AI'), 'a folder header was read as a data row');
  assert.deepEqual(positionCells('<table><tbody></tbody></table>'), []);
});

test('CONTROL: the folder extractor is not returning a constant', () => {
  assert.equal(folders(render()).length, 2);
  assert.equal(folders(render({ program: 'oid-POWER-BI' })).length, 1);
});
