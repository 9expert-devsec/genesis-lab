import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseHero } from '@/app/(public)/[...slug]/_components/CourseHero';

/**
 * The hero's course-type pills say what a course IS SOLD AS, from the two flags
 * an admin actually edits.
 *
 * ── WHAT THE OLD MARKUP ACTUALLY DID ────────────────────────────────────────
 * It looked like three delivery formats and was not:
 *
 *   `Classroom`  rendered on `course_type_public` — the right field under a
 *                name that means something else entirely
 *   `Hybrid`     an UNCONDITIONAL literal, tied to no field at all. Every
 *                course on the site claimed to be hybrid.
 *   `Inhouse`    rendered on `course_type_inhouse` — the only correct one
 *
 * So neither "Classroom" nor "Hybrid" was a field, and nothing is orphaned by
 * removing them. The genuine `Classroom` / `Hybrid` vocabulary lives on
 * /schedule and in search results, comes from a SCHEDULE's `type`, and means
 * where a round is held. That is a different concept and stays untouched.
 *
 * ── THE TWO EDGE CASES, DECIDED ─────────────────────────────────────────────
 * BOTH true → two pills. Not a choice between them: 49 of the 77 upstream
 * courses have both set, MSE-L1 among them.
 *
 * NEITHER true → nothing renders, container included. Measured before choosing:
 * 0 of 77 courses are in that state today, so no course loses a pill it used to
 * have — but 9fd1a85 made unchecking Public actually save, so the state is now
 * reachable by an admin edit instead of unreachable. A placeholder pill was
 * rejected because it would assert something the data does not say; the empty
 * flex row was rejected because `mb-4` survives an empty container and leaves a
 * 16px gap under the duration line.
 */

const BASE = {
  course_id: 'DA-PBI',
  course_name: 'Power BI Desktop',
  course_price: 12000,
  course_trainingdays: 2,
  course_traininghours: 12,
};

const render = (flags) =>
  renderToStaticMarkup(
    createElement(CourseHero, {
      course: { ...BASE, ...flags },
      heroColor: '#005CFF',
      gallery: [],
    })
  );

/** Text of every pill in the type row, in document order. */
const PILL = /<span class="rounded-full border[^"]*"[^>]*>([^<]+)<\/span>/g;
const pillsIn = (html) => [...html.matchAll(PILL)].map((m) => m[1].trim());

// ── the two flags ───────────────────────────────────────────────────────────

test('both flags true renders BOTH pills — the MSE-L1 case', () => {
  const pills = pillsIn(render({ course_type_public: true, course_type_inhouse: true }));
  assert.deepEqual(pills, ['Public', 'Inhouse']);
});

test('public only renders just Public', () => {
  const pills = pillsIn(render({ course_type_public: true, course_type_inhouse: false }));
  assert.deepEqual(pills, ['Public']);
});

test('inhouse only renders just Inhouse — 28 of the 77 upstream courses', () => {
  const pills = pillsIn(render({ course_type_public: false, course_type_inhouse: true }));
  assert.deepEqual(pills, ['Inhouse']);
});

test('neither flag renders no pills AND no empty container', () => {
  const html = render({ course_type_public: false, course_type_inhouse: false });
  assert.deepEqual(pillsIn(html), []);
  // The container carries `mb-4`, so an empty one is a visible 16px gap rather
  // than nothing. Assert the element itself is absent, not merely childless.
  assert.doesNotMatch(
    html,
    /<div class="mb-4 flex flex-wrap gap-2"><\/div>/,
    'the pill row rendered empty — that is a ghost margin, not an absence'
  );
});

// ── controls ────────────────────────────────────────────────────────────────

test('CONTROL: the pill probe can see pills at all', () => {
  // Without this, every deepEqual against [] above passes vacuously the moment
  // the markup changes shape and the regex stops matching anything.
  assert.ok(
    pillsIn(render({ course_type_public: true })).length > 0,
    'the pill regex matches nothing — the assertions above are vacuous'
  );
});

test('CONTROL: Classroom and Hybrid are gone from the hero in every state', () => {
  // `Hybrid` was unconditional, so the all-false case is the one that would
  // still emit it if the literal came back.
  for (const flags of [
    { course_type_public: true, course_type_inhouse: true },
    { course_type_public: true, course_type_inhouse: false },
    { course_type_public: false, course_type_inhouse: true },
    { course_type_public: false, course_type_inhouse: false },
  ]) {
    const html = render(flags);
    assert.doesNotMatch(html, /\bClassroom\b/, `Classroom is back: ${JSON.stringify(flags)}`);
    assert.doesNotMatch(html, /\bHybrid\b/, `Hybrid is back: ${JSON.stringify(flags)}`);
  }
});

test('CONTROL: absent flags behave as false, not as "unknown"', () => {
  // A course object that predates the fields entirely must not crash or render
  // a pill — `undefined` is not `true`.
  assert.deepEqual(pillsIn(render({})), []);
});
