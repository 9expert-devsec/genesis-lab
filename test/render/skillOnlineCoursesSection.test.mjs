import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SkillPageClient } from '@/app/(public)/skill/[slug]/_components/SkillPageClient';

/**
 * The skill page's online-courses section: the program page's
 * ProgramOnlineCoursesSection and OnlineCourseCard, mounted on SkillPageClient
 * with the rows the route filtered by skill.
 *
 * Measured 2026-10-07 upstream: BUSINESS 14, AI 7, DATA 7, POWERPLATFORM 3,
 * AUT 2, DEV 0, DES 0 — so "absent" is a live state on two of seven skills.
 *
 * Text is matched at element boundaries (`>label<`), source assertions run on
 * comment-scrubbed source — the rules programOnlineCoursesSection earned.
 */

const HEADING = 'หลักสูตรออนไลน์ใน Skill นี้';

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

const online = (n) => ({
  _id: `oid-${n}`,
  o_course_id: `ONL-AI-${n}`,
  o_course_name: `Online AI course ${n}`,
  o_course_price: 1990,
  website_urls: [`https://academy.9experttraining.com/courses/ai-${n}`],
  skills: [SKILL],
  program: PROGRAM,
});

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(SkillPageClient, {
      skill: SKILL,
      coursesByProgram: [{ program: PROGRAM, courses: [COURSE] }],
      totalCourses: 1,
      currentYear: 2026,
      skillSlugs: SLUGS,
      ...props,
    })
  );

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const SRC = 'src/app/(public)/skill/[slug]/_components/SkillPageClient.jsx';
const scrubbed = () =>
  readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('with online courses, the section renders under the skill heading', () => {
  const html = render({ onlineCourses: [online(1), online(2)] });
  assert.match(html, new RegExp(`>${HEADING}<`));
  assert.ok(dom(html).querySelector('section#online-courses'), 'the section is mounted');
});

test('one OnlineCourseCard per row, and the count pill equals the row count', () => {
  for (const n of [1, 3, 14]) {
    const rows = Array.from({ length: n }, (_, i) => online(i));
    const section = dom(render({ onlineCourses: rows })).querySelector('section#online-courses');
    assert.equal(section.querySelectorAll('article').length, n, `cards for n=${n}`);
    assert.equal(section.querySelector('h2').nextElementSibling.textContent.trim(), String(n));
  }
});

test('the card is OnlineCourseCard — its ดูรายละเอียด CTA links to the course', () => {
  const section = dom(render({ onlineCourses: [online(1)] })).querySelector('section#online-courses');
  const hrefs = [...section.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.ok(hrefs.includes('https://academy.9experttraining.com/courses/ai-1'), hrefs.join(', '));
  assert.match(section.innerHTML, /ดูรายละเอียด/);
});

test('zero online courses renders NO section and no heading — the program page\'s empty case', () => {
  for (const onlineCourses of [[], undefined]) {
    const html = render({ onlineCourses });
    assert.equal(dom(html).querySelector('section#online-courses'), null);
    assert.ok(!html.includes(HEADING), `heading leaked for ${JSON.stringify(onlineCourses)}`);
  }
});

test('CONTROL: the rest of the page still renders when the section is absent', () => {
  const html = render({ onlineCourses: [] });
  assert.match(html, />Claude AI Level 1</, 'the per-program grid is unaffected');
});

test('position: after the per-program grids, before FAQ and related articles', () => {
  const doc = dom(render({ onlineCourses: [online(1)] }));
  const section = doc.querySelector('section#online-courses');
  const grids = section.previousElementSibling;
  assert.ok(grids?.textContent.includes('Claude AI Level 1'), 'the per-program grids sit directly above');

  const code = scrubbed();
  const at = (s) => code.indexOf(s);
  assert.ok(at('<ProgramOnlineCoursesSection') > at('coursesByProgram.map'), 'after the grids');
  assert.ok(at('<ProgramOnlineCoursesSection') < at('<FaqAccordionSection'), 'before the FAQ');
  assert.ok(at('<FaqAccordionSection') < at('<ProgramArticlesSection'), 'FAQ still before articles');
});

test('it reuses the program page component, not a fork', () => {
  assert.match(
    scrubbed(),
    /import \{ ProgramOnlineCoursesSection \} from '@\/components\/program\/ProgramOnlineCoursesSection'/
  );
});
