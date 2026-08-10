import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseSectionLinks } from '@/lib/courseSectionNav';

/**
 * Which in-page jump links a course has.
 *
 * The rule moved out of SidebarNav so the desktop sidebar and the mobile tab
 * strip cannot disagree about it. The interesting property is not the list —
 * it is the FILTER: every entry is gated on whether its target section will
 * actually render, because a link to a section that is not on the page scrolls
 * nowhere and reads as a broken page.
 *
 * Pure: no DOM, no React, no module state, so no lane discipline is needed.
 */

// A course with every section present. Each test removes exactly one thing, so
// a filter that stopped consulting its condition shows up as a link that
// refuses to disappear.
const FULL = {
  course_teaser: 'teaser',
  course_objectives: ['a'],
  course_target_audience: ['a'],
  course_prerequisites: ['a'],
  course_system_requirements: ['a'],
  training_topics: ['a'],
  course_roadmap_desktop_url: 'https://example.com/a.png',
};

const ALL_FLAGS = { hasSchedules: true, hasRelated: true, hasFaqs: true };
const idsFor = (course, flags = ALL_FLAGS) =>
  courseSectionLinks({ course, ...flags }).map((l) => l.id);

test('a fully-populated course gets every link, in reading order', () => {
  assert.deepEqual(idsFor(FULL), [
    'schedule',
    'description',
    'objective',
    'target',
    'prerequisite',
    'requirement',
    'outline',
    'roadmap',
    'faq',
    'related',
  ]);
});

test('every link disappears when ITS OWN section is absent, and only that one', () => {
  // One case per entry. The `remaining` check is what makes this more than ten
  // smoke tests: a filter that dropped the wrong link, or dropped two, fails
  // here even though the target link did vanish.
  const cases = [
    ['schedule', { ...FULL }, { ...ALL_FLAGS, hasSchedules: false }],
    ['description', { ...FULL, course_teaser: '' }, ALL_FLAGS],
    ['objective', { ...FULL, course_objectives: [] }, ALL_FLAGS],
    ['target', { ...FULL, course_target_audience: [] }, ALL_FLAGS],
    ['prerequisite', { ...FULL, course_prerequisites: [] }, ALL_FLAGS],
    ['requirement', { ...FULL, course_system_requirements: [] }, ALL_FLAGS],
    ['outline', { ...FULL, training_topics: [] }, ALL_FLAGS],
    ['roadmap', { ...FULL, course_roadmap_desktop_url: null }, ALL_FLAGS],
    ['faq', { ...FULL }, { ...ALL_FLAGS, hasFaqs: false }],
    ['related', { ...FULL }, { ...ALL_FLAGS, hasRelated: false }],
  ];

  const everything = idsFor(FULL);
  for (const [id, course, flags] of cases) {
    const got = idsFor(course, flags);
    assert.equal(got.includes(id), false, `#${id} must not be linked when its section is absent`);
    assert.deepEqual(
      got,
      everything.filter((x) => x !== id),
      `removing ${id} must remove exactly one link`
    );
  }
});

test('CONTROL: the absence probe would notice a filter that stopped filtering', () => {
  // Without this, `got.includes(id) === false` could be passing because the
  // fixture never produced the link in the first place.
  assert.equal(idsFor(FULL).includes('roadmap'), true, 'roadmap IS present when it should be');
  const unfiltered = [{ id: 'roadmap', show: false }]; // a filter that ignores `show`
  assert.equal(unfiltered.map((l) => l.id).includes('roadmap'), true, 'and an unfiltered list keeps it');
});

test('roadmap needs EITHER url — desktop or mobile alone is enough', () => {
  assert.equal(idsFor({ ...FULL, course_roadmap_desktop_url: null }).includes('roadmap'), false);
  assert.equal(
    idsFor({ ...FULL, course_roadmap_desktop_url: null, course_roadmap_mobile_url: 'm.png' })
      .includes('roadmap'),
    true,
    'the mobile url alone still means there is a roadmap to jump to'
  );
});

test('a course with nothing produces no links at all', () => {
  // Both renderings return null on an empty list rather than an empty shell.
  assert.deepEqual(
    courseSectionLinks({
      course: {},
      hasSchedules: false,
      hasRelated: false,
      hasFaqs: false,
    }),
    []
  );
});

test('a missing or nullish course does not throw', () => {
  // The page can render before the course shape is complete; a jump-link list
  // is not worth a crash.
  for (const course of [undefined, null, {}]) {
    assert.deepEqual(
      courseSectionLinks({ course, hasSchedules: false, hasRelated: false, hasFaqs: false }),
      []
    );
  }
});

test('every entry carries the three fields both renderings need', () => {
  for (const link of courseSectionLinks({ course: FULL, ...ALL_FLAGS })) {
    assert.equal(typeof link.id, 'string', 'id is the anchor target');
    assert.ok(link.id.length > 0);
    assert.equal(typeof link.label, 'string', 'label is what the user reads');
    assert.ok(link.label.length > 0);
    assert.ok(link.icon, 'icon is a component both renderings place');
  }
});

test('ids are unique — two links to one anchor would be a silent duplicate tab', () => {
  const ids = idsFor(FULL);
  assert.equal(new Set(ids).size, ids.length);
});
