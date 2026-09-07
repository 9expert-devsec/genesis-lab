import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { readSource, walkSources, countCallSites } from '../sourceScan.mjs';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { CourseForm } from '@/app/admin/courses/_components/CourseForm';

/**
 * The READ side's shape: what it queries, what it never writes, and the panels
 * it must not disturb.
 *
 * Behaviour lives in test/pure/courseVersionDiff and
 * test/render/courseVersionHistory. This file asks the questions those cannot:
 * whether the LIST query really refuses the snapshot, whether anything in the
 * new UI can write, and whether all three tab panels are still in the DOM.
 */

const ACTIONS = 'src/lib/actions/course-versions.js';
const PANEL = 'src/app/admin/courses/_components/CourseVersionHistory.jsx';
const FORM = 'src/app/admin/courses/_components/CourseForm.jsx';

const code = (rel) => readSource(rel).code;
const raw = (rel) => readSource(rel).raw;
/** Comments stripped, imports kept — for "this file never REFERENCES x". */
const refs = (rel) => readSource(rel).withImports;

const COURSE = {
  _id: '692d39b52ee07293c9131fd8',
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio',
  course_price: 7500,
  course_type_public: true,
};
const EXTENSION = {
  courseId: 'COPILOT-STU',
  gallery: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', alt: '', order: 0 }],
  isPublished: true,
};
const renderEdit = () =>
  renderToStaticMarkup(createElement(CourseForm, {
    mode: 'edit', initial: COURSE, skills: [],
    programs: [{ _id: 'p1', program_name: 'Data' }],
    allCourses: [COURSE], extension: EXTENSION,
  }));

// ── V2 — the list query must not select the snapshot ────────────────────────

/**
 * A snapshot is 7.5 KB on the smallest real course and 20.3 KB on the largest,
 * measured across all 79; the metadata beside it is a couple of hundred bytes.
 * A list that carried snapshots would move close to half a megabyte per
 * tab-open to render rows showing a number, a date and a name — and the ratio
 * worsens as the rich editors get used, because those are what dominate a
 * snapshot.
 */
test('V2: the list query projects AWAY the snapshot', () => {
  const src = code(ACTIONS);
  const fn = src.slice(src.indexOf('export async function listCourseVersions'));
  const body = fn.slice(0, fn.indexOf('export async function', 10));

  assert.match(body, /\.select\('-snapshot'\)/,
    'the list query does not exclude the snapshot');
  assert.doesNotMatch(body, /\.select\([^)]*[^-]snapshot/,
    'the list query selects the snapshot somewhere');
});

test('V2: the rows the list RETURNS carry no snapshot key at all', () => {
  const src = code(ACTIONS);
  const fn = src.slice(src.indexOf('export async function listCourseVersions'));
  // Bounded from the mapper to the NEXT catch AFTER it — the function opens
  // with a permission try/catch, so an unanchored `indexOf('} catch')` finds
  // that one and slices backwards to an empty string, which would make this
  // assertion vacuous rather than red.
  const from = fn.indexOf('rows: rows.map');
  const mapped = fn.slice(from, fn.indexOf('} catch', from));
  assert.ok(from > 0 && mapped.length > 0, 'CONTROL: the row mapper is still identifiable');
  assert.doesNotMatch(mapped, /snapshot/,
    'a snapshot key is mapped onto the wire for the list');
});

test('V2: the diff action returns COMPUTED CHANGES, not the two snapshots', () => {
  const src = code(ACTIONS);
  const fn = src.slice(src.indexOf('export async function getCourseVersionDiff'));
  // `changes:` is returned; `snapshot:` is not.
  assert.match(fn, /changes:/, 'the diff does not return changes');
  assert.doesNotMatch(fn, /\n\s*snapshot:/,
    'a whole snapshot is returned to the client — only changed fields may travel');
});

test('CONTROL: the projection matcher would SEE a snapshot selection', () => {
  // Guards the two assertions above from passing by matching nothing.
  const sample = ".select('snapshot createdAt')";
  assert.match(sample, /\.select\([^)]*[^-]snapshot/);
});

// ── read only, everywhere ───────────────────────────────────────────────────

test('nothing in the history UI can write — no restore, no rollback, no delete', () => {
  for (const rel of [PANEL, 'src/lib/courses/courseVersionDiff.js']) {
    const src = refs(rel);
    for (const forbidden of [
      'recordCourseContentVersion', 'recordCourseFileReplacement',
      'commitCourseVersion', 'captureCoursePreImage',
      'updateCourse', 'saveCourseExtension', 'deleteOne', 'deleteMany',
      'findOneAndUpdate', 'findByIdAndDelete', 'restore', 'rollback',
    ]) {
      assert.equal(src.includes(forbidden), false, `${rel} references ${forbidden}`);
    }
  }
});

test('the two READ actions only ever read', () => {
  const src = code(ACTIONS);
  const readSide = src.slice(src.indexOf('export async function listCourseVersions'));
  for (const forbidden of ['.create(', '.updateOne(', '.deleteOne(', '.deleteMany(',
    '.findOneAndUpdate(', '.findByIdAndUpdate(', '.findOneAndDelete(', '.save(']) {
    assert.equal(readSide.includes(forbidden), false, `the read side calls ${forbidden}`);
  }
});

test('the writer, the model and the snapshot builder were not touched', () => {
  // 5c51f87 shipped these and this round may not change them. Their content is
  // not asserted here — only that this round did not have to edit them, which
  // the commit diff shows and this pins against a later drift.
  const writer = raw('src/lib/courses/courseVersionWriter.js');
  assert.match(writer, /export async function recordCourseContentVersion/);
  assert.match(writer, /export async function recordCourseFileReplacement/);
  const model = raw('src/models/CourseVersion.js');
  assert.match(model, /collection: 'course_versions'/);
});

// ── B7 — the existing menu permission, no new key ───────────────────────────

test('B7: both read actions gate on the SAME courses menu key', () => {
  const src = code(ACTIONS);
  const readSide = src.slice(src.indexOf('export async function listCourseVersions'));
  assert.equal(countCallSites(readSide, 'requireAdmin'), 2, 'a read action is ungated');
  assert.equal((readSide.match(/requireAdmin\('courses'\)/g) ?? []).length, 2);
  assert.equal(/requireAdmin\('(?!courses')/.test(readSide), false,
    'a second page key was introduced');
});

test('B7: a refusal is REPORTED, not swallowed into an empty list', () => {
  // The write path swallows a denial because it must never fail a save. Here an
  // empty answer would read as "this course has no history" to someone who
  // simply may not see it — a lie the UI could never correct.
  const src = code(ACTIONS);
  const readSide = src.slice(src.indexOf('export async function listCourseVersions'));
  assert.match(readSide, /reason: 'forbidden'/);
  assert.match(raw(PANEL), /ไม่มีสิทธิ์/, 'the panel does not distinguish a refusal from an empty history');
});

// ── V8 — every panel stays in the DOM ───────────────────────────────────────

test('V8: all THREE tab panels are in the rendered output at once', () => {
  const html = renderEdit();
  assert.match(html, /name="course_name"/, 'the course body left the DOM');
  assert.match(html, /YouTube Video ID/, 'the gallery panel left the DOM');
  assert.match(html, /ประวัติการแก้ไข/, 'the history panel left the DOM');
});

test('V8: adding the third tab did not unmount the other two', () => {
  // The invariant, restated against the FORM rather than the tab helper: the
  // save and the dirty check both read `new FormData(form)`, so a body that is
  // conditionally rendered contributes no keys and blanks the course on save.
  const html = renderEdit();
  const hiddenPanels = html.match(/class="hidden"/g) ?? [];
  assert.ok(hiddenPanels.length >= 2,
    `expected at least 2 hidden panels beside the active one, found ${hiddenPanels.length}`);
});

test('V8: the history tab exists on EDIT and not on create', () => {
  const editHtml = renderEdit();
  assert.match(editHtml, /ประวัติการแก้ไข/);

  const createHtml = renderToStaticMarkup(createElement(CourseForm, {
    mode: 'create', initial: null, skills: [], programs: [], allCourses: [], extension: null,
  }));
  assert.doesNotMatch(createHtml, /ประวัติการแก้ไข/,
    'a course being created has no history and no code to key one by');
});

test('the tab count pin moves from 2 to 3, deliberately', () => {
  const html = renderEdit();
  const tabs = html.match(/class="border-b-2 px-4 py-2 text-sm font-medium/g) ?? [];
  assert.equal(tabs.length, 3, `expected exactly 3 tabs, found ${tabs.length}`);
});

// ── B1 — it loads on open, not on page load ─────────────────────────────────

/**
 * ── AN ASSERTION WAS DELETED HERE. DO NOT RESTORE IT. ──────────────────────
 *
 * This test used to open with:
 *
 *   assert.match(src, /if \(!active \|\| state\.status !== 'idle'/,
 *     'the fetch is not gated on activation and a fresh state');
 *
 * That expression was the BUG. `state.status` in the dependency array of the
 * effect that wrote `state.status` made the effect re-enter, cancel its own
 * in-flight request through its cleanup, and then refuse to reissue it — the
 * tab spun forever while the server returned 200 with correct data.
 *
 * The assertion did not merely miss the defect. It PINNED it, as though the
 * deadlock were the design, and it would have gone red when the deadlock was
 * removed.
 *
 * It is deleted rather than rewritten against the fixed expression, because a
 * regex over source cannot tell a correct guard from a broken one — it sees
 * only that some characters are present. Rewriting it would recreate exactly
 * the failure it just caused, one expression later.
 *
 * WHAT COVERS THIS NOW: test/render/courseVersionHistoryLoad drives the real
 * component through a real React root and asserts the BEHAVIOUR the deleted
 * line was reaching for — that the tab loads once, on open, and reaches its
 * list. That is a claim source text cannot make.
 *
 * The surviving assertion below is about a different file and a different
 * claim: that the FORM tells the panel whether its tab is open. It is a wiring
 * fact with no behavioural twin here, so it stays.
 */
test('B1: the form tells the panel whether its tab is open', () => {
  // The panel is mounted from the first paint, so it cannot infer activation
  // from being mounted — a bare mount effect would fire on every page load,
  // which is the thing B1 forbids.
  assert.match(raw(FORM), /active=\{activeTab === TAB\.HISTORY\}/,
    'the form does not tell the panel whether its tab is open');
});

test('B1: the edit PAGE does not query version history server-side', () => {
  const page = refs('src/app/admin/courses/[courseId]/edit/page.jsx');
  for (const name of ['listCourseVersions', 'getCourseVersionDiff', 'CourseVersion']) {
    assert.equal(page.includes(name), false,
      `the edit page reaches ${name} — history would load on every page open`);
  }
});

// ── B5 — the empty state explains itself ────────────────────────────────────

test('B5: the empty state says WHY it is empty, not just that it is', () => {
  const src = raw(PANEL);
  assert.match(src, /ก่อนหน้านั้นไม่ได้ถูกบันทึกไว้/,
    'the empty state does not explain that earlier edits were never recorded');
  assert.match(src, /จึงไม่ใช่ข้อผิดพลาด/,
    'the empty state does not tell the admin this is not a bug');
  assert.match(src, /เวอร์ชันแรกจะถูกสร้างขึ้นเมื่อกดบันทึก/,
    'the empty state does not say what would populate it');
});

// ── the only callers, still ─────────────────────────────────────────────────

test('the read actions have exactly the callers they were built for', () => {
  const found = [];
  for (const file of walkSources('src')) {
    if (file.rel === ACTIONS) continue;
    if (/listCourseVersions|getCourseVersionDiff/.test(file.withImports)) found.push(file.rel);
  }
  assert.deepEqual(found.sort(), [PANEL], 'the read actions gained a caller');
});

test('a schedule edit still mints nothing — round 2 guard, restated for the read side', () => {
  const src = refs('src/lib/actions/schedules.js');
  for (const name of ['listCourseVersions', 'getCourseVersionDiff', 'CourseVersion']) {
    assert.equal(src.includes(name), false);
  }
});

// ── the standing import rule ────────────────────────────────────────────────

test('every identifier this round added is imported where it is used', () => {
  const form = raw(FORM);
  assert.match(form, /import \{ TAB, DEFAULT_TAB, panelClass \} from '@\/lib\/courses\/courseEditorTabs';/);
  assert.match(form, /import \{ CourseVersionHistory \} from '\.\/CourseVersionHistory';/);
  // The statements they were added beside are intact.
  assert.match(form, /import \{ courseEditorSignature, isCourseEditorDirty \} from '@\/lib\/courses\/courseFormDirty';/);
  assert.match(form, /import \{ CourseGalleryEditor \} from '\.\/CourseGalleryEditor';/);
  assert.match(form, /import \{ captureCoursePreImage, commitCourseVersion \} from '@\/lib\/actions\/course-versions';/);

  const actions = raw(ACTIONS);
  assert.match(actions, /import \{ VERSION_KIND \} from '@\/lib\/courses\/courseSnapshot';/);
  assert.match(actions, /import \{ diffSnapshots, summariseChanges, VERSION_PAGE_SIZE \} from '@\/lib\/courses\/courseVersionDiff';/);
  assert.match(actions, /import \{ recordCourseContentVersion \} from '@\/lib\/courses\/courseVersionWriter';/,
    'the statement the new imports were added beside was replaced');

  const panel = raw(PANEL);
  assert.match(panel, /import \{ listCourseVersions, getCourseVersionDiff \} from '@\/lib\/actions\/course-versions';/);
  assert.match(panel, /import \{ FIELD_KIND \} from '@\/lib\/courses\/courseVersionDiff';/);
});

test('the use-server module exports ONLY async functions', () => {
  // A plain `export const` in a 'use server' file is a BUILD ERROR. This is why
  // VERSION_PAGE_SIZE lives in courseVersionDiff instead.
  const src = code(ACTIONS);
  const bad = src.match(/^export (?!async function)/gm) ?? [];
  assert.deepEqual(bad, [], 'a non-async export would fail `next build`');
});
