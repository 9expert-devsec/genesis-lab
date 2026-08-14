import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { CoursesAdminClient } from '@/app/admin/courses/_components/CoursesAdminClient';

/**
 * The reorder affordance, and the two things the screen must say about itself.
 *
 * ── WHAT THIS TIER CAN AND CANNOT CARRY ────────────────────────────────────
 * It cannot dispatch a drag: there is no DOM and no event loop here, and the
 * drop handler is where the reorder actually happens. What it CAN pin is
 * whether the affordance is offered at all — which is the safety property,
 * because a save writes the whole group and an offer made in the wrong state is
 * the defect. The payload itself is driven for real in
 * test/pure/courseOrderEditing; the write shape in test/fs/courseOrderWriteShape.
 *
 * The behavioural half — that a drag then a save produces the arranged array —
 * is a click-test, recorded in the commit. It is not a test and is not counted
 * as one.
 */

const course = (code, programId) => ({
  course_id: code,
  course_name: code,
  _id: `id-${code}`,
  program: { program_id: programId, _id: `oid-${programId}` },
});

const PROGRAMS = [{ _id: 'oid-CLAUDE', program_id: 'CLAUDE', program_name: 'Claude AI' }];
const PROGRAM_NAMES = { CLAUDE: 'Claude AI' };
const ORDER = { CLAUDE: ['CLAUDE-AI', 'VIBE-CODE-L1', 'VIBE-CODE-L2'] };
const ROWS = [
  course('CLAUDE-AI', 'CLAUDE'),
  course('VIBE-CODE-L1', 'CLAUDE'),
  course('VIBE-CODE-L2', 'CLAUDE'),
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

const handleCount = (html) => (html.match(/aria-label="Drag handle"/g) ?? []).length;
const draggableRows = (html) => (html.match(/<tr[^>]*draggable="true"/gi) ?? []).length;

// ── The affordance appears only when a save would be safe ──────────────────

test('an unfiltered view with a stored order offers a handle per row', () => {
  const html = render();
  assert.equal(handleCount(html), 3);
  assert.equal(draggableRows(html), 3, 'the rows are not draggable');
});

test('a NULL stored order offers NO drag at all', () => {
  // The read failed or nothing is seeded. A save here would invent an order out
  // of a failure and stamp it 'arranged', which the re-seed will not overwrite.
  const html = render({ programCourseOrder: null });
  assert.equal(handleCount(html), 0, 'a drag handle appeared over an absent order');
  assert.equal(draggableRows(html), 0);
  assert.match(html, /ยังไม่มีลำดับที่บันทึกไว้/, 'the null banner from f596901 is gone');
});

test('a SEARCH filter withdraws the drag, and says why', () => {
  const html = render({ q: 'CLAUDE' });
  assert.equal(handleCount(html), 0, 'a drag handle survived a narrowing filter');
  assert.equal(draggableRows(html), 0);
  assert.match(html, /ปิดการจัดลำดับชั่วคราวเพราะกำลังกรองรายการอยู่/, 'no reason is given');
});

test('a TYPE filter withdraws the drag too', () => {
  const html = render({ type: 'public', courses: [] });
  assert.equal(handleCount(html), 0);
});

test('the PROGRAM filter keeps the drag — it selects whole groups', () => {
  const html = render({ program: 'oid-CLAUDE' });
  assert.equal(handleCount(html), 3, 'filtering to one program withdrew the drag unnecessarily');
});

// ── The screen states its own limits ───────────────────────────────────────

test('THE SCREEN SAYS IT ORDERS THE PROGRAM DIMENSION ONLY', () => {
  // A course holds an independent position in each skill list it belongs to and
  // nothing here touches those. A field that stays silent about its own reach is
  // the defect this round was told not to repeat.
  const html = render();
  assert.match(html, /ไม่มีผลกับหน้า Skill/, 'the screen does not say the skill dimension is untouched');
  assert.match(html, /เมกะเมนู/, 'the screen does not mention the mega menu at all');
});

test('THE SCREEN SAYS THE MEGA MENU FOLLOWS ONLY ON THE NEXT SYNC', () => {
  // The menu renders from the nav_menu_cache snapshot, not a live read, so a
  // successful save changes nothing an admin can see there until a sync runs.
  const html = render();
  assert.match(html, /snapshot/, 'the snapshot caveat is missing');
  assert.match(html, /sync/i, 'nothing tells the admin a sync is needed');
  assert.match(html, /href="\/admin\/cache"/, 'no route to the place a sync can be run');
});

test('the limits are stated where the drag is, not on every state', () => {
  // Shown with the affordance they qualify. On a blocked screen the reason for
  // the block is the useful sentence, and stacking both reads as noise.
  const blocked = render({ programCourseOrder: null });
  assert.ok(!/ไม่มีผลกับหน้า Skill/.test(blocked), 'the scope notice shows where no drag is offered');
});

// ── The read-only behaviour of f596901 survives ────────────────────────────

test('the stored positions still render, and restart per folder', () => {
  const html = render({
    courses: [...ROWS, course('POWER-BI', 'POWER-BI')],
    programCourseOrder: { ...ORDER, 'POWER-BI': ['POWER-BI'] },
    programNames: { ...PROGRAM_NAMES, 'POWER-BI': 'Power BI' },
    programs: [...PROGRAMS, { _id: 'oid-POWER-BI', program_id: 'POWER-BI', program_name: 'Power BI' }],
  });
  const cells = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  assert.deepEqual(cells, ['1', '2', '3', '1']);
});

test('an unlisted course is still MARKED rather than numbered, drag or no drag', () => {
  const html = render({ courses: [course('BRAND-NEW', 'CLAUDE'), ...ROWS] });
  assert.match(html, /ยังไม่จัดลำดับ/, 'the unlisted marker was lost when the drag landed');
  // and it still gets no number: four rows, three numbers
  const cells = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
  assert.deepEqual(cells, ['ยังไม่จัดลำดับ', '1', '2', '3']);
});

test('a clean group renders NO save control — nothing to save', () => {
  const html = render();
  assert.ok(!/บันทึกลำดับ/.test(html), 'a save button is offered over an unchanged group');
  assert.ok(!/ยังไม่บันทึก/.test(html), 'the dirty banner shows on a clean group');
});

// ── Controls ───────────────────────────────────────────────────────────────

test('CONTROL: the handle and draggable probes are not returning 0 always', () => {
  // Four assertions above are "no handle appeared". A broken probe satisfies
  // every one of them forever.
  assert.equal(handleCount(render()), 3);
  assert.equal(draggableRows(render()), 3);
  assert.equal(handleCount('<table></table>'), 0);
});

test('CONTROL: the two states really are different documents', () => {
  const on = render();
  const off = render({ programCourseOrder: null });
  assert.notEqual(on, off);
  assert.ok(on.length > 500 && off.length > 500, 'a render collapsed to near-nothing');
});
