import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { EditorProvider, useEditor } from '@/components/pageBuilder/editor/EditorProvider';
import { CATALOGUE_KEYS } from '@/lib/pageBuilder/courseCatalogue';
import { readSource } from '../sourceScan.mjs';

/**
 * THE CATALOGUE REACHES THE EDITOR'S CONTEXT, AND IT IS THE PROJECTION.
 *
 * ── WHAT THIS STEP IS ──────────────────────────────────────────────────────
 * docs/course-picker-proposal.md §G step 2: both builder routes read the course
 * list, project it to {course_id, course_name}, and hand it down beside `tier`
 * — the read-only-prop pattern that directory already uses. NOTHING CONSUMES IT
 * YET. The picker that will is step 3.
 *
 * That is the reason the step exists on its own: an inert prop can be measured
 * — is the projection what actually crosses? — before any UI depends on the
 * answer. So this file pins the CHAIN, which step 3 will build on, and
 * test/pure/courseCatalogue pins the projection's shape and size.
 *
 * ── WHY THE PROVIDER IS RENDERED AND THE ROUTES ARE SOURCE-SCANNED ─────────
 * `EditorProvider` is a client component and React context resolves during a
 * server render, so a consumer child can read what it was given without any
 * DOM. The two routes cannot be rendered here at all: they are async server
 * components that `await requirePage('pages')` and reach the database. So their
 * half is a source claim, made explicitly rather than implied by the provider
 * test passing.
 *
 * `renderToStaticMarkup`, not a React root over jsdom: this suite runs every
 * file in ONE process and a root's globals leak into every markup test sharing
 * it — round 45 measured that taking the suite from 5 failures to 34.
 */

const CATALOGUE = [
  { course_id: 'CLAUDE-AI', course_name: 'Claude Cowork for Business' },
  { course_id: 'MSE-AI', course_name: 'Excel AI' },
];

const PAGE = { _id: 'p1', title: 'T', slug: 't', theme: 'default', sections: [] };
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };

/** Render a provider and report exactly what the context handed the consumer. */
function contextValue(props) {
  let seen = null;
  const Probe = () => { seen = useEditor(); return null; };
  renderToStaticMarkup(
    createElement(EditorProvider, { page: PAGE, pageId: 'p1', tier: TIER, ...props },
      createElement(Probe))
  );
  return seen;
}

// ── the chain ─────────────────────────────────────────────────────────────

test('the catalogue handed to the provider is the catalogue in the context', () => {
  const ctx = contextValue({ courses: CATALOGUE });
  assert.deepEqual(ctx.courses, CATALOGUE);
});

test('CONTROL: a provider given no catalogue exposes an empty one, never undefined', () => {
  // The default matters: step 3 will map over this, and `undefined.map` is a
  // crash on the one path — upstream down — that must degrade quietly.
  const ctx = contextValue({});
  assert.deepEqual(ctx.courses, []);
});

test('the catalogue sits BESIDE tier, not inside the page tree', () => {
  // It is server-resolved, read-only context — the same shape as `tier`. If it
  // ever landed in `state.page` it would enter the autosave payload and be
  // written into the document, which is a different and much worse thing.
  const ctx = contextValue({ courses: CATALOGUE });
  assert.deepEqual(ctx.tier, TIER);
  assert.equal('courses' in ctx.page, false, 'the catalogue leaked into the page tree');
  assert.equal(JSON.stringify(ctx.page).includes('CLAUDE-AI'), false);
});

test('the catalogue does NOT touch the resolver seam', () => {
  // The authority rule (§G step 2). `resolvedData` is what says whether an
  // authored code resolves; the catalogue is a list to choose FROM. They are
  // separate keys with separate lifetimes, and a catalogue that had been merged
  // into resolvedData would make the warnings read it — silently making the
  // catalogue authoritative for something.
  const ctx = contextValue({ courses: CATALOGUE });
  assert.deepEqual(ctx.resolvedData, {}, 'the catalogue reached the resolved-data map');
  assert.equal(ctx.courses !== ctx.resolvedData, true);
});

test('PageBuilderEditor forwards the prop rather than dropping it', () => {
  // The one component between the route and the provider. A missing forward is
  // invisible: everything still renders, the context just holds [].
  const src = readSource('src/components/pageBuilder/editor/PageBuilderEditor.jsx').code;
  assert.equal(/courses\s*=\s*\[\]/.test(src), true, 'the prop is not accepted');
  assert.equal(/courses=\{courses\}/.test(src), true, 'the prop is accepted and not passed on');
});

// ── both routes, and only these two ────────────────────────────────────────

const ROUTES = [
  'src/app/admin/pages/builder/[id]/edit/page.jsx',
  'src/app/admin/pages/builder/new/page.jsx',
];

test('BOTH builder routes read the catalogue and pass it down', () => {
  // Both, because a page builder opened from /new and one opened from /edit are
  // the same editor, and a picker that worked in one and not the other would be
  // reported as "the picker is broken" rather than "one route is".
  for (const rel of ROUTES) {
    const src = readSource(rel).withImports;
    assert.equal(src.includes("from '@/lib/pageBuilder/courseCatalogue'"), true, `${rel} does not import it`);
    assert.equal(/const courses = await catalogueOrEmpty\(\)/.test(src), true, `${rel} does not read it`);
    assert.equal(/courses=\{courses\}/.test(src), true, `${rel} does not pass it down`);
  }
});

test('the routes call catalogueOrEmpty — they do NOT project inline', () => {
  // An inline `.map` in a route is how the two drift apart, and how one of them
  // quietly starts shipping a third key. The projection has exactly one home.
  for (const rel of ROUTES) {
    const src = readSource(rel).code;
    assert.equal(src.includes('course_name'), false, `${rel} projects inline`);
    assert.equal(src.includes('listPublicCourses'), false, `${rel} reaches past the seam`);
  }
});

test('CONTROL: that reader can see the routes at all', () => {
  // A path typo, a moved route, a scrubber that returned '' — all of them
  // satisfy every "does not contain" line above vacuously.
  for (const rel of ROUTES) {
    const src = readSource(rel).code;
    assert.equal(src.length > 200, true, `${rel} scrubbed to ${src.length} chars`);
    assert.equal(src.includes('PageBuilderEditor'), true);
  }
});

// ── the projection is the contract, not a coincidence ─────────────────────

test('the declared key set is exactly two keys', () => {
  // Named here as well as in the pure test, because this is the file that says
  // what CROSSES. A third key added upstream costs every editor load, and the
  // number that would notice is this one.
  assert.deepEqual([...CATALOGUE_KEYS], ['course_id', 'course_name']);
});

/**
 * ── AMENDED IN ROUND 48 — the tripwire fired, as designed ─────────────────
 * Round 47 asserted that NOTHING consumed the catalogue, because step 2 was
 * inert and that was the point: the projection could be measured before any UI
 * depended on the answer. Its own note said step 3 would make the assertion
 * false on purpose and that it was written as a LIST so the day it changed, the
 * diff would name which file started reading it.
 *
 * It did exactly that. Step 3 turned it red with
 * `SettingsPanel.jsx, SectionContentEditor.jsx already reads it`.
 *
 * So the assertion is replaced rather than deleted, and it now says the useful
 * thing for a consumed catalogue: these files and no others. An unrelated
 * component quietly starting to read the catalogue — and so quietly treating a
 * snapshot as authoritative — is the failure worth catching from here on.
 */
test('the catalogue is consumed by EXACTLY the files on the picker path', () => {
  const editorDir = 'src/components/pageBuilder/editor/';
  const consumers = ['CanvasPanel.jsx', 'SettingsPanel.jsx', 'SectionPicker.jsx', 'StructurePanel.jsx',
    'EditorShell.jsx', 'EditorTopBar.jsx', 'SectionContentEditor.jsx', 'CoursePicker.jsx']
    .filter((f) => /\bcourses\b/.test(readSource(editorDir + f).code.replace(/bundle_courses/g, '')));
  assert.deepEqual(consumers, ['SettingsPanel.jsx', 'SectionContentEditor.jsx', 'CoursePicker.jsx']);
});

test('CONTROL: the reader can tell a consumer from a non-consumer', () => {
  // Otherwise the list above is satisfied by a matcher that answers the same
  // way for every file — in either direction.
  const editorDir = 'src/components/pageBuilder/editor/';
  const reads = (f) => /\bcourses\b/.test(readSource(editorDir + f).code.replace(/bundle_courses/g, ''));
  assert.equal(reads('CoursePicker.jsx'), true);
  assert.equal(reads('CanvasPanel.jsx'), false);
});
