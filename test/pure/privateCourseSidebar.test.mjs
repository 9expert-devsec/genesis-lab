import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

import { toPrivateCourseView } from '@/lib/courses/privateCourseView';
import { courseSectionLinks } from '@/lib/courseSectionNav';
import { richSectionPresence } from '@/lib/courses/richSectionPresence';

/**
 * Round 3b: the private sidebar lists EVERY kept section that renders.
 *
 * Round 3 only pinned the absent half (no schedule/roadmap/faq/related). The
 * bug it missed, seen on COPILOT-CUS-2607-2: the body sections render from
 * `extension.*Rich` OR the plain field, the nav checked only the plain field,
 * so a section that existed only as rich text was on the page and not in the
 * sidebar or the mobile strip (both read courseSectionLinks).
 *
 * Fixtures are the STORED shapes: a `private_courses` document as `.lean()`
 * returns it — the four list fields at their schema default `[]` because the
 * admin filled only the rich editors — and its CourseExtension row carrying
 * the rich copies.
 */

const KEPT = ['description', 'objective', 'target', 'prerequisite', 'requirement', 'outline'];
const DROPPED = ['schedule', 'roadmap', 'faq', 'related'];

const STORED = Object.freeze({
  _id: '6721aa00000000000000c0de',
  course_id: 'COPILOT-CUS-2607-2',
  course_name: 'Microsoft Copilot Chat',
  course_teaser: 'Copilot Chat for one client.',
  course_trainingdays: 1,
  course_traininghours: 6,
  course_price: 0,
  course_netprice: 0,
  course_levels: '1',
  course_type_public: false,
  course_type_inhouse: true,
  course_workshop_status: true,
  course_certificate_status: true,
  program: '6650aa0000000000000000a1',
  skills: [],
  course_objectives: [],
  course_target_audience: [],
  course_prerequisites: [],
  course_system_requirements: [],
  training_topics: [{ title: 'Topic 1', bullets: ['a'] }],
  course_roadmap_desktop_url: 'https://res.cloudinary.com/x/roadmap-d.svg',
  privateProgram: null,
  privateSkills: [],
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:00:00.000Z',
  __v: 0,
});

const EXTENSION = Object.freeze({
  courseId: 'COPILOT-CUS-2607-2',
  urlAlias: '/microsoft-copilot-chat-training-course-2',
  isPublished: true,
  descriptionRich: '',
  objectivesRich: '<ol><li>Use Copilot Chat safely</li></ol>',
  targetAudienceRich: '<ul><li>Office staff</li></ul>',
  prerequisitesRich: '<p>Basic Windows</p>',
  systemRequirementsRich: '<p>Microsoft 365 account</p>',
});

// Exactly what CourseDetail hands both navs on a private page.
const privateLinks = (course, extension) =>
  courseSectionLinks({
    course: toPrivateCourseView(course),
    hasSchedules: false,
    hasRelated: false,
    hasFaqs: false,
    rich: richSectionPresence(extension),
  }).map((l) => l.id);

test('a private course whose six kept sections exist (four as rich text only) lists all six', () => {
  const shown = privateLinks(STORED, EXTENSION);
  assert.deepEqual(shown, KEPT, 'all six kept sections, in reading order');
  for (const id of DROPPED) assert.ok(!shown.includes(id), `${id} is listed`);
});

test('the same six when every section is plain, and a rich-only description counts too', () => {
  const plain = {
    ...STORED,
    course_objectives: ['o'],
    course_target_audience: ['t'],
    course_prerequisites: ['p'],
    course_system_requirements: ['r'],
  };
  assert.deepEqual(privateLinks(plain, { courseId: STORED.course_id }), KEPT);
  const richTeaser = { ...STORED, course_teaser: '' };
  assert.deepEqual(privateLinks(richTeaser, { ...EXTENSION, descriptionRich: '<p>Body</p>' }), KEPT);
});

test('an EMPTY rich body is no section — the nav and the component use one predicate', () => {
  const blank = { ...EXTENSION, objectivesRich: '<p><br></p>', targetAudienceRich: '   ' };
  const shown = privateLinks(STORED, blank);
  assert.ok(!shown.includes('objective') && !shown.includes('target'));
  assert.ok(shown.includes('prerequisite'), 'CONTROL: the others are still listed');
});

test('page.jsx hands both navs the rich flags, for every course', () => {
  const page = readSource('src/app/(public)/[...slug]/page.jsx').code;
  assert.match(page, /const richSections = richSectionPresence\(extension\);/, 'no isPrivate gate');
  for (const nav of ['CourseSectionTabs', 'SidebarNav']) {
    assert.match(page, new RegExp(`<${nav}[^>]*?rich=\\{richSections\\}[^>]*?/>`), `${nav} gets the flags`);
  }
  for (const nav of ['SidebarNav', 'CourseSectionTabs']) {
    const src = readSource(`src/app/(public)/[...slug]/_components/${nav}.jsx`).code;
    assert.match(src, /courseSectionLinks\(\{ course, hasSchedules, hasRelated, hasFaqs, rich \}\)/, `${nav} forwards them`);
  }
});

test('CONTROL: without the rich flags the four rich-only sections vanish — the reported defect', () => {
  const shown = courseSectionLinks({
    course: toPrivateCourseView(STORED), hasSchedules: false, hasRelated: false, hasFaqs: false,
  }).map((l) => l.id);
  assert.deepEqual(shown, ['description', 'outline']);
});
