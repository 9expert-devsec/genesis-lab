import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeCoursePreview } from '@/lib/navmenu/coursePreview';

/**
 * The mega menu's Col 4 card must show the name of the ROW it previews.
 *
 * ── THE DEFECT THIS PINS ───────────────────────────────────────────────────
 * A course was renamed upstream from "…Copilot Studio1" to "…Copilot Studio".
 * `nav_menu_cache` still held the old name (its cron runs 3-hourly), and the
 * open menu showed, at the same moment:
 *   · the Col 3 course list  → OLD name  (snapshot)
 *   · the hovered card       → NEW name  (upstream detail response)
 *   · the group's card       → OLD name  (snapshot's firstCover)
 * One course, two names, one screen.
 *
 * The fixture below is that exact disagreement: a row carrying the snapshot's
 * OLD name, and a cover object that still carries the detail endpoint's NEW
 * one. The cover is deliberately given a `course_name` it should no longer
 * have — getCoursePreview does not return one any more, and the point of these
 * assertions is that it would not matter if it started again. The composition
 * must be immune, not merely paired with a well-behaved caller.
 *
 * ── WHY THE EXPECTED VALUE IS THE STALE ONE ────────────────────────────────
 * Reading these and thinking "surely the fresh name is better" is the mistake
 * this file exists to prevent. Uniformly stale is the goal. Half-stale is what
 * we had, and a menu that shows two names for one course tells a visitor the
 * site is broken in a way that one out-of-date name never does. The staleness
 * WINDOW is a real and separate problem; it is not solved by making one of
 * three surfaces secretly fresh.
 */

const ROW = Object.freeze({
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio1', // the snapshot's, stale
  urlAlias: 'copilot-studio-training-course',
});

const COVER_CARRYING_A_FRESHER_NAME = Object.freeze({
  course_id: 'COPILOT-STU',
  course_name: 'AI Agents with Microsoft Copilot Studio', // the detail endpoint's
  course_cover_url: 'https://res.cloudinary.com/x/cover.webp',
  urlAlias: 'copilot-stu-fresh-alias',
});

test('the name comes from the ROW even when the cover carries a different one', () => {
  const preview = composeCoursePreview(ROW, COVER_CARRYING_A_FRESHER_NAME);

  assert.equal(
    preview.course_name,
    'AI Agents with Microsoft Copilot Studio1',
    'the card must show the name of the row the user hovered — the snapshot\'s — ' +
      'not the one that arrived on the cover response'
  );
  assert.notEqual(
    preview.course_name,
    COVER_CARRYING_A_FRESHER_NAME.course_name,
    'the two names differ in this fixture on purpose; if they are equal here the ' +
      'fixture has stopped testing anything'
  );
});

test('the cover contributes the image, and nothing else', () => {
  const preview = composeCoursePreview(ROW, COVER_CARRYING_A_FRESHER_NAME);

  assert.equal(preview.course_cover_url, 'https://res.cloudinary.com/x/cover.webp');

  // Identity and alias come from the row, so the card's href is derived from
  // the same two fields as the Col 3 link (`urlAlias || course_id`). A card
  // that navigated somewhere the hovered row would not is the same class of
  // defect as the name, one field over.
  assert.equal(preview.course_id, 'COPILOT-STU');
  assert.equal(
    preview.urlAlias,
    'copilot-studio-training-course',
    'the alias must come from the row, not from the cover lookup'
  );
});

test('the composed shape has exactly the four fields, so nothing rides along', () => {
  // Not decoration. The guarantee is "no spread of `cover`", and a spread is
  // invisible in a per-field assertion — every check above still passes if the
  // literal gains `...cover` ABOVE the four fields it sets. The key set is
  // what catches that, because the cover's stray fields would show up here.
  assert.deepEqual(
    Object.keys(composeCoursePreview(ROW, COVER_CARRYING_A_FRESHER_NAME)).sort(),
    ['course_cover_url', 'course_id', 'course_name', 'urlAlias']
  );
});

test('a failed cover lookup keeps the name instead of blanking the card', () => {
  // Deliberate behaviour change. The name used to arrive on the same response
  // as the image, so losing the image lost the name and the caller rendered
  // the empty placeholder. The name is in hand before the fetch now, so a null
  // cover degrades to "correct title, placeholder image".
  const preview = composeCoursePreview(ROW, null);
  assert.equal(preview.course_name, 'AI Agents with Microsoft Copilot Studio1');
  assert.equal(preview.course_cover_url, null);
});

test('no usable row is the only case that yields nothing', () => {
  assert.equal(composeCoursePreview(null, COVER_CARRYING_A_FRESHER_NAME), null);
  assert.equal(composeCoursePreview({}, COVER_CARRYING_A_FRESHER_NAME), null);
  assert.equal(
    composeCoursePreview({ course_name: 'no id' }, COVER_CARRYING_A_FRESHER_NAME),
    null,
    'a name without an id cannot be linked to anything, so it is not a preview'
  );
});

test('a row with no name of its own renders empty, not the cover’s', () => {
  // The failure mode a fallback chain invites: `row.course_name || cover.course_name`
  // reads as harmless defensiveness and reintroduces the entire defect for any
  // row whose name is falsy. Both falsy shapes are covered because the two
  // operators fail on different ones and only one of them is caught by either:
  //   ''        → `||` falls through to the cover, `??` does not
  //   undefined → both fall through to the cover
  // syncNavMenuData maps `c.course_name ?? ''`, so empty-string rows are real.
  const empty = composeCoursePreview(
    { course_id: 'COPILOT-STU', course_name: '' },
    COVER_CARRYING_A_FRESHER_NAME
  );
  assert.equal(empty.course_name, '', 'an empty row name stays empty');

  const missing = composeCoursePreview(
    { course_id: 'COPILOT-STU' },
    COVER_CARRYING_A_FRESHER_NAME
  );
  assert.equal(missing.course_name, '', 'a missing row name does not fall back to the cover');
});
