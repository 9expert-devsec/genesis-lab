import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CoursesAdminClient } from '@/app/admin/courses/_components/CoursesAdminClient';

/**
 * The สถานะ column as it actually renders in the admin course list.
 *
 * The pure mapping is covered in test/pure/courseStatusBadge. This file covers
 * the two things that live in the MARKUP and that the pure test cannot see:
 *
 *   1. every row gets a badge, including the rows whose extension is missing or
 *      whose isPublished is absent — i.e. the mapping is wired up, not just
 *      correct in isolation
 *   2. the column count stays consistent. Adding a column has broken the
 *      rightmost cell on an admin list here before, and an empty-state `colSpan`
 *      left at its old value is invisible until the list happens to be empty.
 */

const COURSES = [
  { _id: 'id-published', course_id: 'PUB-01',  course_name: 'เผยแพร่อยู่' },
  { _id: 'id-hidden',    course_id: 'HID-01',  course_name: 'ถูกซ่อน' },
  { _id: 'id-undef',     course_id: 'UNDEF-01', course_name: 'ไม่มีคีย์ isPublished' },
  { _id: 'id-noext',     course_id: 'NOEXT-01', course_name: 'ไม่มี extension' },
];

/**
 * Deliberately shaped like a `.lean()` read: UNDEF-01's document simply has no
 * `isPublished` key (that is what Mongo returns when it was never written, and
 * .lean() does not apply the schema default), and NOEXT-01 has no entry at all.
 */
const EXTENSIONS = {
  'PUB-01':   { courseId: 'PUB-01',   urlAlias: '/pub-training-course', isPublished: true },
  'HID-01':   { courseId: 'HID-01',   urlAlias: '/hid-training-course', isPublished: false },
  'UNDEF-01': { courseId: 'UNDEF-01', urlAlias: '/undef-training-course' },
};

const html = renderToStaticMarkup(
  createElement(CoursesAdminClient, {
    courses: COURSES,
    extensions: EXTENSIONS,
    programs: [],
  }),
);

/** The row `<tr>` fragments of the table body, one per course. */
function rowFor(courseId) {
  const marker = `>${courseId}<`;
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `row for ${courseId} did not render`);
  const start = html.lastIndexOf('<tr', at);
  const end = html.indexOf('</tr>', at);
  return html.slice(start, end);
}

test('the header carries a สถานะ column', () => {
  const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
  assert.ok(thead.includes('สถานะ'), 'no สถานะ header cell');
});

test('the สถานะ header sits directly after URL Alias', () => {
  const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
  const alias = thead.indexOf('URL Alias');
  const status = thead.indexOf('สถานะ');
  const tags = thead.indexOf('Tags');

  assert.ok(alias !== -1 && status !== -1 && tags !== -1, 'headers missing');
  assert.ok(alias < status, 'สถานะ must come after URL Alias');
  assert.ok(status < tags, 'สถานะ must come before Tags');
});

test('a published course renders เผยแพร่', () => {
  assert.match(rowFor('PUB-01'), /เผยแพร่/);
});

test('a hidden course renders ซ่อน', () => {
  const row = rowFor('HID-01');
  assert.match(row, /ซ่อน/);
  assert.ok(!row.includes('เผยแพร่'), 'a hidden row must not also say เผยแพร่');
});

/**
 * The two rows with no production data behind them. Under a truthy check both
 * render ซ่อน — a live course reported as hidden.
 */
test('an extension with NO isPublished key renders เผยแพร่, not ซ่อน', () => {
  const row = rowFor('UNDEF-01');
  assert.match(row, /เผยแพร่/);
  assert.ok(!row.includes('ซ่อน'), 'absent isPublished must not read as hidden');
});

test('a course with NO extension document renders เผยแพร่, not a blank cell', () => {
  const row = rowFor('NOEXT-01');
  assert.match(row, /เผยแพร่/);
  assert.ok(!row.includes('ซ่อน'), 'a missing extension must not read as hidden');
});

/**
 * COLUMN COUNT. The empty-state cell spans the table, so it has to move with
 * the header — a stale colSpan is only visible when the list is empty, which is
 * the one moment the admin is already unsure whether the page is broken.
 */
test('header cell count and the empty-state colSpan agree', () => {
  const thead = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));

  // `<th[\s>]`, NOT `<th` — the latter also matches the `<thead` that opens
  // this very slice, which silently inflated the count by one and made this
  // test fail against correct markup on its first run.
  const headerCount = (thead.match(/<th[\s>]/g) ?? []).length;

  // 8 since the ลำดับ column landed. The NUMBER is not the point of this
  // assertion — the agreement between it and the empty-state colSpan below is,
  // and that is exactly what adding a column breaks.
  assert.equal(headerCount, 8, 'expected 8 header cells');

  const empty = renderToStaticMarkup(
    createElement(CoursesAdminClient, { courses: [], extensions: {}, programs: [] }),
  );
  // Case-insensitive: renderToStaticMarkup emits `colSpan`, the browser
  // reflects `colspan`, and this assertion should not depend on which.
  const colSpan = empty.match(/colspan="(\d+)"/i);

  assert.ok(colSpan, 'the empty state did not render a colspan');
  assert.equal(
    Number(colSpan[1]),
    headerCount,
    'the empty-state colSpan no longer matches the number of columns',
  );
});

/**
 * The floor that stops a seventh column squeezing the others instead of
 * scrolling — the defect the admin ARTICLES list hit, fixed there the same way.
 */
test('the table keeps a min-width so the last column is not squeezed', () => {
  assert.match(
    html,
    /<table[^>]*class="[^"]*min-w-\[900px\]/,
    'the courses table lost its min-w floor; with overflow-x-auto and w-full '
      + 'alone the columns compress instead of scrolling',
  );
});
