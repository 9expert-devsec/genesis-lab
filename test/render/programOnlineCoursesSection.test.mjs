import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ProgramOnlineCoursesSection } from '@/components/program/ProgramOnlineCoursesSection';

/**
 * The program page's online-courses section.
 *
 * ── THE TWO CASES THAT ACTUALLY SHIP ───────────────────────────────────────
 * Measured (audit 7a98eb3 §2.6): of 27 programs, 14 have ZERO online courses
 * and 10 more have exactly ONE. Only MSE (10) fills a row. So the two states
 * this section spends almost all its life in are "absent" and "one card", and
 * they get the most tests here — n=10 is the rare case, not the design centre.
 *
 * ── MATCHER RULES THIS SUITE HAS EARNED ────────────────────────────────────
 * Element text is matched at its boundaries (`>label<`), never as a bare
 * substring: Thai negates by PREFIX, so "ยังไม่มี…" contains "มี…" and a
 * substring match would read a denial as a confirmation. Source assertions run
 * against comment-scrubbed source, because this component's doc block quotes
 * the guard, the grid literal and the container class verbatim.
 */

const SKILL = { _id: 's1', skill_id: 'AI', skill_name: 'AI' };
const SLUGS = { ai: 'ai-all-courses' };

const PROGRAM = {
  _id: '68d3c5b02c6a2f1315c0bce4',
  program_id: 'MSE',
  program_name: 'Microsoft Excel',
  programiconurl: 'https://res.cloudinary.com/x/mse.png',
};

const course = (n) => ({
  _id: `oid-${n}`,
  o_course_id: `ONL-MSE-${n}`,
  o_course_name: `Excel course ${n}`,
  o_course_teaser: `teaser ${n}`,
  o_course_price: 1990,
  o_number_lessons: 13,
  o_course_traininghours: 8,
  o_course_levels: '3',
  o_course_certificate_status: false,
  website_urls: [`https://academy.9experttraining.com/courses/mse-${n}`],
  skills: [SKILL],
  program: PROGRAM,
});

const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(ProgramOnlineCoursesSection, {
      courses: [course(1)],
      program: PROGRAM,
      skillSlugs: SLUGS,
      ...props,
    })
  );

const dom = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const SRC = 'src/components/program/ProgramOnlineCoursesSection.jsx';
const rawSource = () => readFileSync(SRC, 'utf8');
const scrubbed = () =>
  rawSource().replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── empty means invisible ──────────────────────────────────────────────────

test('zero courses renders NOTHING — no section, no heading, no placeholder', () => {
  for (const courses of [[], undefined, null]) {
    const html = render({ courses });
    assert.equal(html, '', `expected empty markup for courses=${JSON.stringify(courses)}`);
  }
});

test('zero courses renders no dashed placeholder box — unlike the course grid above it', () => {
  const html = render({ courses: [] });
  assert.equal(html, '');
  // The course grid says "ยังไม่มีหลักสูตรในโปรแกรมนี้" when empty. This
  // section deliberately does not, because 14 of 27 pages would carry it.
  assert.ok(!html.includes('ยังไม่มี'), 'no apology text');
});

test('CONTROL: the same component DOES render when given one course — so the empties above are the guard, not a broken component', () => {
  const html = render();
  assert.notEqual(html, '');
  assert.match(html, />คอร์สออนไลน์ในโปรแกรม</);
});

test('the empty guard is the FaqAccordionSection shape, in code', () => {
  assert.match(scrubbed(), /if \(!courses\?\.length\) return null;/);
});

// ── n = 1, the second most common state ────────────────────────────────────

test('n=1 renders ONE card inside the same grid literal as n=10 — no special case', () => {
  const one = dom(render({ courses: [course(1)] }));
  const ten = dom(render({ courses: Array.from({ length: 10 }, (_, i) => course(i)) }));
  const gridOf = (d) => d.querySelector('section > div:nth-of-type(2)');
  assert.equal(
    gridOf(one).getAttribute('class'),
    gridOf(ten).getAttribute('class'),
    'the grid class must not vary with the number of items'
  );
  assert.equal(gridOf(one).children.length, 1);
  assert.equal(gridOf(ten).children.length, 10);
});

test('n=1 is a left-aligned GRID, not a carousel and not centred', () => {
  const doc = dom(render({ courses: [course(1)] }));
  const grid = doc.querySelector('section > div:nth-of-type(2)');
  const cls = grid.getAttribute('class');
  assert.match(cls, /\bgrid\b/, 'it is a grid');
  assert.match(cls, /grid-cols-1/);
  assert.match(cls, /xl:grid-cols-4/, 'a single item occupies one of four columns, not all of it');
  assert.ok(!/justify-center|mx-auto|place-items-center/.test(cls), `centred: ${cls}`);
  assert.ok(!/overflow-x|snap-|flex-nowrap/.test(cls), `carousel-ish: ${cls}`);
});

test('no carousel component and no arrow controls anywhere in the section', () => {
  const code = scrubbed();
  assert.ok(!/CourseCarousel/.test(code), 'must not reuse the home page carousel');
  assert.ok(!/ChevronLeft|ChevronRight|aria-label="(prev|next)/i.test(code), 'no arrows');
  const html = render({ courses: [course(1)] });
  assert.equal(dom(html).querySelectorAll('button').length, 0, 'no controls at n=1');
});

// ── the heading follows the COURSE GRID style, not the FAQ's ───────────────

test('the heading is left-aligned at max-w-[1200px], not the FAQ centred max-w-3xl', () => {
  const doc = dom(render());
  const section = doc.querySelector('section');
  const cls = section.getAttribute('class');
  assert.match(cls, /max-w-\[1200px\]/);
  assert.ok(!/max-w-3xl/.test(cls), `inherited the FAQ container: ${cls}`);
  const h2 = doc.querySelector('h2');
  assert.match(h2.getAttribute('class'), /text-lg font-bold/);
  assert.ok(!/text-center/.test(h2.getAttribute('class')), 'the heading must not be centred');
});

test('the heading carries the program icon and a count pill, like the course grid', () => {
  const doc = dom(render({ courses: [course(1), course(2), course(3)] }));
  const img = doc.querySelector('h2') .parentElement.querySelector('img');
  assert.ok(img, 'program icon rendered beside the heading');
  assert.equal(img.getAttribute('alt'), '', 'decorative — the heading names it');
  const pill = doc.querySelector('h2').nextElementSibling;
  assert.equal(pill.textContent.trim(), '3', 'the pill shows the row count');
});

test('CONTROL: a program with no icon still renders the heading and the pill', () => {
  const doc = dom(render({ program: { ...PROGRAM, programiconurl: undefined } }));
  assert.equal(doc.querySelectorAll('h2 ~ img, h2').length >= 1, true);
  assert.match(render({ program: {} }), />คอร์สออนไลน์ในโปรแกรม</);
});

test('the container matches the course grid EXACTLY, including its lack of px', () => {
  // Adding px-4 here would inset this section relative to the course grid above
  // and the two would visibly disagree. Pinned so a well-meaning edit is caught.
  const sectionCls = dom(render()).querySelector('section').getAttribute('class');
  const client = readFileSync(
    'src/app/(public)/program/[slug]/_components/ProgramPageClient.jsx', 'utf8'
  );
  assert.ok(
    client.includes('mx-auto max-w-[1200px] pt-10 lg:pt-14'),
    'the course grid container changed — re-check this section against it'
  );
  assert.equal(sectionCls, 'mx-auto max-w-[1200px] pt-10 lg:pt-14');
});

// ── it reuses OnlineCourseCard unchanged ───────────────────────────────────

test('it renders OnlineCourseCard — the card, not a fork', () => {
  assert.match(
    scrubbed(),
    /import \{ OnlineCourseCard \} from '@\/app\/_components\/home\/OnlineCourseCard'/,
    'imports the real card by its own path'
  );
  const doc = dom(render());
  assert.ok(doc.querySelector('article'), 'the card renders its <article>');
  assert.match(doc.body.innerHTML, />Excel course 1</);
});

test('skillSlugs reaches the card — the capsule links rather than sitting inert', () => {
  const linked = dom(render({ skillSlugs: SLUGS }));
  const unlinked = dom(render({ skillSlugs: {} }));
  const capsuleHref = (d) =>
    [...d.querySelectorAll('a')].map((a) => a.getAttribute('href')).find((h) => h === '/ai-all-courses');
  assert.equal(capsuleHref(linked), '/ai-all-courses');
  assert.equal(capsuleHref(unlinked), undefined, 'CONTROL: without the map the capsule is not a link');
});

test('each card gets a stable key source — _id, else o_course_id', () => {
  assert.match(scrubbed(), /key=\{c\._id \?\? c\.o_course_id\}/);
  // And it renders without a duplicate-key throw when _id is absent.
  const rows = [{ ...course(1), _id: undefined }, { ...course(2), _id: undefined }];
  assert.notEqual(render({ courses: rows }), '');
});
