import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCourseStatusBadge,
  COURSE_STATUS,
} from '@/lib/courses/courseStatusBadge';

/**
 * The four rows of the publication mapping, and why two of them can only be
 * reached by fixture.
 *
 * Measured over the real catalogue on 2026-08-12: 78 courses, 78 extension
 * documents, ZERO missing extensions, and `isPublished: true` on every one.
 * So the two interesting rows — an absent `isPublished`, and a course with no
 * extension at all — have NO production data behind them today and cannot be
 * covered by anything except a fixture.
 *
 * They are also the two that will actually fire later: a course created before
 * the field existed, or one whose extension has never been saved. A truthy
 * check (`Boolean(ext?.isPublished)`) passes every test written against today's
 * data and renders both of those as ซ่อน — a false statement about a live
 * course, on the screen an admin acts from. That is the whole reason this
 * module exists as a pure function rather than an inline ternary.
 */

test('isPublished === false → ซ่อน', () => {
  const badge = resolveCourseStatusBadge({ isPublished: false });
  assert.equal(badge.label, 'ซ่อน');
  assert.equal(badge.status, 'hidden');
  assert.equal(badge.isPublished, false);
});

test('isPublished === true → เผยแพร่', () => {
  const badge = resolveCourseStatusBadge({ isPublished: true });
  assert.equal(badge.label, 'เผยแพร่');
  assert.equal(badge.status, 'published');
  assert.equal(badge.isPublished, true);
});

/**
 * `.lean()` skips Mongoose document hydration, so `default: true` is NEVER
 * applied on read — an extension saved without the key reads back `undefined`.
 * Same trap, same fix, as shouldShowPinBadge (lib/articlePositioning.js:88).
 */
test('isPublished === undefined → เผยแพร่ (the schema default, not blank)', () => {
  const badge = resolveCourseStatusBadge({ urlAlias: '/x-training-course' });
  assert.equal(badge.label, 'เผยแพร่');
  assert.equal(badge.status, 'published');
});

test('no extension document at all → เผยแพร่ (nothing has hidden it)', () => {
  for (const absent of [undefined, null]) {
    const badge = resolveCourseStatusBadge(absent);
    assert.equal(
      badge.label,
      'เผยแพร่',
      `an extension of ${String(absent)} must still resolve to a badge`,
    );
    assert.equal(badge.status, 'published');
  }
});

/**
 * TOTALITY. The column must never render an empty cell — a blank badge on a
 * status column reads as "unknown" and there is no unknown state.
 */
test('the mapping is TOTAL — every input yields a renderable badge', () => {
  const inputs = [
    { isPublished: false },
    { isPublished: true },
    { isPublished: undefined },
    {},
    undefined,
    null,
    // Values that are neither true nor false. They are not expected from the
    // schema, but the function must still land on one badge rather than
    // returning nothing.
    { isPublished: 0 },
    { isPublished: '' },
    { isPublished: 'false' },
    { isPublished: null },
  ];

  for (const input of inputs) {
    const badge = resolveCourseStatusBadge(input);
    assert.ok(badge, `no badge for ${JSON.stringify(input)}`);
    assert.ok(
      badge.label === 'เผยแพร่' || badge.label === 'ซ่อน',
      `unexpected label ${badge.label} for ${JSON.stringify(input)}`,
    );
    assert.ok(badge.badge && badge.dot, 'badge must carry classes to render');
  }
});

/**
 * The two words are the ones the edit form already uses (CourseForm.jsx:1108).
 * Pinned so a third vocabulary cannot appear for the same field — "Publish" /
 * "Draft" was the original ask and was rejected precisely because ซ่อน means
 * hidden, not unfinished.
 */
test('the vocabulary is exactly the form’s two words', () => {
  assert.equal(COURSE_STATUS.published.label, 'เผยแพร่');
  assert.equal(COURSE_STATUS.hidden.label, 'ซ่อน');
  assert.deepEqual(Object.keys(COURSE_STATUS).sort(), ['hidden', 'published']);
});

/**
 * Colour comes from CSS VARIABLES, which globals.css redefines under `.dark`,
 * and never from the Tailwind `9e-green-*` classes, which are literal hex and
 * identical in both themes. A badge built from those would be a light-mode
 * badge shown on a dark surface.
 */
test('badge classes are theme-aware tokens, not fixed Tailwind colours', () => {
  for (const key of Object.keys(COURSE_STATUS)) {
    const { badge, dot } = COURSE_STATUS[key];
    const all = `${badge} ${dot}`;

    assert.ok(
      all.includes('var(--'),
      `${key} must colour itself from CSS variables, got: ${all}`,
    );
    assert.ok(
      !/(^|\s)(bg|text|border)-9e-green-/.test(all),
      `${key} uses a Tailwind 9e-green class, which does not flip with the `
        + `theme: ${all}`,
    );
    assert.ok(
      !/#[0-9a-fA-F]{3,8}/.test(all),
      `${key} contains a raw hex colour: ${all}`,
    );
  }
});
