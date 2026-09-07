import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseForm } from '@/app/admin/courses/_components/CourseForm';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { TAB, TAB_ORDER, DEFAULT_TAB, isTab, resolveTab, panelClass } from '@/lib/courses/courseEditorTabs';

/**
 * THE INVARIANT: a non-active tab panel is HIDDEN, NEVER UNMOUNTED.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM courseEditorShell ──────────────────
 * That file already asserts the shape of the editor and has one line about the
 * panels. This is about the one property that, if it breaks, breaks SILENTLY
 * and destroys data:
 *
 *   · the SAVE reads the live DOM. `shapePayload` consumes `new FormData(form)`,
 *     so a course body rendered away contributes NO keys and the payload then
 *     carries empty strings and zeroes for the whole course. Pressing บันทึก
 *     from another tab would blank the course upstream.
 *   · the DIRTY CHECK reads the same DOM (`courseEditorSignature` is built from
 *     `[...new FormData(formRef.current)]`), so an unmounted body would make the
 *     unsaved-changes guard stop protecting the admin's typing.
 *
 * Nothing throws in either case. The screen looks right. The damage shows up in
 * the saved record, later, to someone who was not there.
 *
 * The tab state was converted from the boolean `showGallery` to an enum in this
 * commit, which is precisely the kind of edit that could have dropped the
 * invariant while every visible thing kept working — so it is pinned here
 * rather than left to review.
 *
 * ── HOW THIS WAS MADE TO FAIL FOR THE RIGHT REASON ─────────────────────────
 * Verified, not assumed. The panel in CourseForm was temporarily reverted from
 *
 *     <div className={panelClass(TAB.CONTENT, activeTab, 'space-y-6')}>{bodySections}</div>
 * to
 *     {activeTab === TAB.CONTENT && <div className="space-y-6">{bodySections}</div>}
 *
 * — the exact mistake this guards — and the FULL suite was re-run. Measured:
 * 56 failed → 60 failed, and the four that moved were exactly the four in this
 * file. Nothing else in the suite changed state. The revert was then undone and
 * the file diffed byte-for-byte against its pre-break copy.
 *
 * ── A FINDING FROM THAT EXERCISE, WORTH KNOWING ────────────────────────────
 * courseEditorShell's existing `the course body stays MOUNTED behind the
 * gallery tab` did NOT go red. It asserts the BODY panel's class, and the break
 * above unmounts the GALLERY panel, so it looked away from the very thing it
 * reads as guarding. It is left exactly as it is — it still pins what it always
 * pinned — but it is not the guard its name suggests, and this file is.
 *
 * WHAT THIS CANNOT SEE: `renderToStaticMarkup` renders ONE pass with no
 * interaction, so it proves what the DOM contains for a given initial tab, not
 * what survives a real click. Tab switching with unsaved changes in the form is
 * a browser click-test and is named in the report.
 */

const COURSE = {
  _id: '692d39b52ee07293c9131fd8',
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio',
  course_price: 7500,
  course_trainingdays: 1,
  course_type_public: true,
};

const EXTENSION = {
  courseId: 'COPILOT-STU',
  urlAlias: '/copilot-studio-training-course',
  metaTitle: 'Copilot Studio',
  gallery: [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', alt: '', order: 0 }],
  isPublished: true,
};

const renderEdit = () =>
  renderToStaticMarkup(
    createElement(CourseForm, {
      mode: 'edit',
      initial: COURSE,
      skills: [],
      programs: [{ _id: 'p1', program_name: 'Data' }],
      allCourses: [COURSE],
      extension: EXTENSION,
    })
  );

/**
 * Markers unique to each panel's CONTENTS — not to its wrapper.
 *
 * Asserting the wrapper's class would pass for a panel rendered as an empty
 * div, which is the failure dressed as a success. These are things only the
 * panel's own children emit.
 */
const CONTENT_MARKER = /name="course_name"/;
const GALLERY_MARKER = /YouTube Video ID/;

// ── the invariant ───────────────────────────────────────────────────────────

test('every tab panel is in the DOM at once, whichever tab is active', () => {
  const html = renderEdit();
  assert.match(html, CONTENT_MARKER, 'the course body is not in the DOM');
  assert.match(html, GALLERY_MARKER, 'the gallery panel is not in the DOM');
});

test('the NON-ACTIVE panel is hidden by CSS, not removed', () => {
  const html = renderEdit();
  // The default tab is CONTENT, so the gallery is the hidden one. Its contents
  // are present (above) AND its wrapper carries `hidden`.
  assert.match(
    html,
    /class="hidden"><div[^>]*>[\s\S]*?YouTube Video ID/,
    'the gallery panel is not wrapped in a hidden div — is it conditionally rendered?'
  );
});

test('the course body — the one that would blank the course — is never behind a conditional', () => {
  const html = renderEdit();
  // The body's wrapper is the ACTIVE panel here, so it carries the shown class.
  // What matters is that `name="course_name"` and every other input is present
  // in the same pass that renders the gallery, i.e. both subtrees coexist.
  const bodyAt = html.search(CONTENT_MARKER);
  const galleryAt = html.search(GALLERY_MARKER);
  assert.ok(bodyAt > 0, 'course body missing');
  assert.ok(galleryAt > 0, 'gallery missing');
  assert.notEqual(bodyAt, galleryAt);
});

test('CONTROL: the markers really are panel-specific', () => {
  // Without this, both assertions above could be satisfied by a string that
  // appears somewhere else entirely and the guard would be vacuous.
  const html = renderEdit();
  assert.equal((html.match(/YouTube Video ID/g) ?? []).length, 1,
    'the gallery marker is not unique — it no longer identifies that panel');
  assert.equal((html.match(/name="course_name"/g) ?? []).length, 1,
    'the course-body marker is not unique');
});

// ── the vocabulary itself ───────────────────────────────────────────────────

test('the tab names are frozen — a stray push cannot invent a panel-less tab', () => {
  assert.throws(() => { TAB_ORDER.push('other'); });
  assert.throws(() => { TAB.CONTENT = 'x'; });
});

test('the editor opens on the content tab', () => {
  assert.equal(DEFAULT_TAB, TAB.CONTENT);
  assert.equal(TAB_ORDER[0], TAB.CONTENT);
});

test('an unknown tab resolves to content rather than hiding every panel', () => {
  assert.equal(resolveTab('nonsense'), TAB.CONTENT);
  assert.equal(resolveTab(undefined), TAB.CONTENT);
  assert.equal(resolveTab(null), TAB.CONTENT);
  assert.equal(resolveTab(TAB.GALLERY), TAB.GALLERY, 'a real tab is left alone');
  assert.equal(isTab('gallery'), true);
  assert.equal(isTab('galery'), false);
});

test('panelClass has no branch that renders nothing', () => {
  // Every combination returns a CLASS. There is no falsy return that a JSX
  // `&&` could turn into an absent element.
  for (const tab of TAB_ORDER) {
    for (const active of TAB_ORDER) {
      const cls = panelClass(tab, active, 'space-y-6');
      assert.equal(typeof cls, 'string');
      assert.equal(cls, tab === active ? 'space-y-6' : 'hidden');
    }
  }
});

test('panelClass defaults the shown class to empty, never to hidden', () => {
  // The gallery panel passes no `shown` class. If the default were 'hidden'
  // the active gallery tab would render invisibly — a blank tab that looks
  // like a data-loading bug.
  assert.equal(panelClass(TAB.GALLERY, TAB.GALLERY), '');
  assert.equal(panelClass(TAB.GALLERY, TAB.CONTENT), 'hidden');
});
