import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ProgramPageClient } from '@/app/(public)/program/[slug]/_components/ProgramPageClient';
import { SkillPageClient } from '@/app/(public)/skill/[slug]/_components/SkillPageClient';

/**
 * THE PROGRAM PAGE'S CARD CONTAINER HAS THE SKILL PAGE'S SIDE PADDING.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * On a phone, /claude-ai-all-courses (a PROGRAM page) drew its course cards
 * edge to edge; /ai-all-courses (a SKILL page) drew the same CourseCard inside
 * side padding. Both are one route — [...slug] probes loadProgram then
 * loadSkill — rendering ProgramPageClient and SkillPageClient. The skill
 * page's per-program block sits in `px-4 lg:px-6`; the program page's course
 * grid section carried no `px-*` at ANY breakpoint, so on desktop it also
 * overhung the page's own hero (which has `px-4 … lg:px-6`) by 24px a side.
 * ProgramOnlineCoursesSection had copied that padding-less container to
 * stay column-aligned with the grid, so both program sections take the fix.
 *
 * ── WHY EQUALITY AGAINST THE SKILL PAGE, NOT A PIXEL ───────────────────────
 * The claim is "the program page matches the skill page", so the assertion
 * reads the padding utilities off BOTH rendered containers and compares them.
 * A hardcoded `px-4` here would drift the moment the skill page moved and
 * would say nothing about the program page still matching it. The full
 * responsive set is compared — base and `lg:` — because the desktop
 * misalignment was as real as the mobile one.
 *
 * Class strings, not pixels: jsdom applies no CSS. What is pinned is that the
 * two containers ask Tailwind for the same horizontal padding at every
 * breakpoint.
 */

const SKILL = { _id: 's1', skill_id: 'AI', skill_name: 'AI', skill_description: 'AI skill' };
const SLUGS = { ai: 'ai-all-courses' };

const PROGRAM = {
  _id: '68d3c5b02c6a2f1315c0bce5',
  program_id: 'CLAUDE-AI',
  program_name: 'Claude AI',
  programiconurl: 'https://res.cloudinary.com/x/claude.png',
};

const COURSE = {
  _id: 'c1',
  course_id: 'CLD-L1',
  course_name: 'Claude AI Level 1',
  course_price: 9500,
  skills: [SKILL],
  program: PROGRAM,
};

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const programDoc = dom(renderToStaticMarkup(
  createElement(ProgramPageClient, {
    program: PROGRAM,
    config: {},
    courses: [COURSE],
    currentYear: 2026,
    skillSlugs: SLUGS,
  }),
));

const skillDoc = dom(renderToStaticMarkup(
  createElement(SkillPageClient, {
    skill: SKILL,
    coursesByProgram: [{ program: PROGRAM, courses: [COURSE] }],
    totalCourses: 1,
    currentYear: 2026,
    skillSlugs: SLUGS,
  }),
));

const classes = (el) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/**
 * The card container: the nearest `mx-auto` `max-w-[1200px]` ancestor of the
 * course grid. Located from the grid upward rather than by a fixed selector
 * so the claim survives a re-nesting — what matters is which box the cards'
 * side padding is read from.
 */
function cardContainer(doc) {
  // The grid that holds the CARDS — the program hero is also a responsive
  // grid, so the course name disambiguates.
  const grid = [...doc.querySelectorAll('div')].find((d) => {
    const c = classes(d);
    return c.includes('grid') && c.includes('grid-cols-1')
      && c.some((x) => /^(sm|lg|xl):grid-cols-/.test(x))
      && d.textContent.includes(COURSE.course_name);
  });
  assert.ok(grid, 'no course grid rendered');
  let el = grid.parentElement;
  while (el && !(classes(el).includes('mx-auto') && classes(el).includes('max-w-[1200px]'))) {
    el = el.parentElement;
  }
  assert.ok(el, 'the course grid has no mx-auto max-w-[1200px] container');
  return el;
}

/** Every horizontal-padding utility on an element, at every breakpoint. */
const paddingX = (el) => classes(el).filter((c) => /^([a-z]+:)?px-/.test(c)).sort();

const programPad = paddingX(cardContainer(programDoc));
const skillPad = paddingX(cardContainer(skillDoc));

test('the skill page (the reference) pads its card container at base AND lg', () => {
  // The reference has to be non-trivial, or "equal" could mean "both empty".
  assert.ok(skillPad.some((c) => /^px-/.test(c)), `skill page has no base px: ${skillPad.join(' ')}`);
  assert.ok(skillPad.some((c) => /^lg:px-/.test(c)), `skill page has no lg px: ${skillPad.join(' ')}`);
});

test('the program page card container has EXACTLY the skill page\'s horizontal padding', () => {
  assert.deepEqual(programPad, skillPad, 'the two pages disagree on side padding');
});

test('the program page\'s online-courses section carries the same padding as its course grid', () => {
  // It copied the padding-less container to stay column-aligned with the
  // grid; it must follow the grid now that the grid is padded. The section
  // renders only when there are online courses, so one is supplied here.
  const doc = dom(renderToStaticMarkup(createElement(ProgramPageClient, {
    program: PROGRAM, config: {}, courses: [COURSE], currentYear: 2026, skillSlugs: SLUGS,
    onlineCourses: [{
      _id: 'o1', o_course_id: 'ONL-1', o_course_name: 'Online 1', o_course_price: 1990,
      website_urls: ['https://academy.9experttraining.com/courses/x'], skills: [SKILL], program: PROGRAM,
    }],
  })));
  const online = doc.querySelector('section#online-courses');
  assert.ok(online, 'the online-courses section did not render with one online course');
  assert.deepEqual(paddingX(online), programPad);
  assert.deepEqual(paddingX(online), skillPad);
});

test('CONTROL: the padding reader sees breakpoints — it is not a base-only compare', () => {
  // A reader that dropped `lg:` prefixes would let the two pages agree on
  // mobile and silently differ on desktop, which is the half of the defect
  // that was invisible on a phone.
  const probe = dom('<div class="mx-auto max-w-[1200px] px-4 lg:px-6"></div>').querySelector('div');
  assert.deepEqual(paddingX(probe), ['lg:px-6', 'px-4']);
  const base = dom('<div class="px-4"></div>').querySelector('div');
  assert.notDeepEqual(paddingX(base), paddingX(probe));
});
