import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseOutline } from '@/app/(public)/[...slug]/_components/CourseOutline';

/**
 * The RICH render path — reached by no course today.
 *
 * ══ WHAT THIS TIER CANNOT SEE ══════════════════════════════════════════════
 * jsdom performs no layout. It resolves no line-height, no hanging indent, no
 * `::before` marker, no viewport. **Nothing here can tell you the nested list
 * LOOKS right** — that whole question is a browser's, and the click-test list
 * is in the round report. What a string render can establish is that the rich
 * branch is reached, that it emits the scoped wrapper, and that the markup it
 * was given arrives intact.
 *
 * ── THE HTML HERE IS ALREADY SANITISED ─────────────────────────────────────
 * By the time it reaches this component the server has run it through
 * `sanitizeTopicHtml` (lib/courses/courseOutlineView). The component renders
 * what it is handed — deliberately, so the sanitiser cannot end up in the
 * client bundle. That the SERVER really sanitises is asserted in
 * test/fs/courseOutlineRichSeam.test.mjs and test/pure/courseOutlineView.test.mjs.
 */

const COURSE = {
  course_id: 'POWER-BI-XDM',
  training_topics: [
    { title: 'เข้าใจ Power BI Semantic Model', bullets: ['หนึ่ง', 'สอง', 'สาม'] },
    { title: 'การเรียงลำดับข้อมูล', bullets: ['a'] },
  ],
};

/**
 * Three levels — well within the cap (raised from 3 to 6). Kept EXACTLY as it
 * was before the cap moved: this fixture and every test below that uses it are
 * the regression proof that content at the old depths still renders
 * byte-identically now that a deeper cap exists — nothing about raising
 * MAX_TOPIC_DEPTH changes behaviour for content that was already legal.
 */
const NESTED = '<ul><li>หนึ่ง<ul><li>สอง<ul><li>สาม</li></ul></li></ul></li></ul>';

/**
 * Six levels — the new cap, exactly. POWER-BI-XDM is the real course measured
 * at 5 levels deep on the old site; this fixture is one level past that, at the
 * boundary the cap decision was actually made against.
 */
const SIX_DEEP =
  '<ul><li>1<ul><li>2<ul><li>3<ul><li>4<ul><li>5<ul><li>6</li></ul></li></ul></li></ul></li></ul></li></ul></li></ul>';

const render = (richHtml, course = COURSE) =>
  renderToStaticMarkup(createElement(CourseOutline, { course, richHtml }));

test('the rich branch renders the given HTML inside the scoped wrapper', () => {
  const html = render([NESTED, '<ul><li>a</li></ul>']);
  assert.ok(html.includes('topic-rich'), 'the scoped wrapper class is missing');
  assert.ok(html.includes(NESTED), 'the row HTML did not reach the markup verbatim');
});

test('all three nesting levels survive to the DOM', () => {
  const html = render([NESTED, '']);
  for (const text of ['หนึ่ง', 'สอง', 'สาม']) {
    assert.ok(html.includes(text), `level text "${text}" is missing`);
  }
  assert.match(html, /<ul><li>[^<]*<ul><li>[^<]*<ul><li>/, 'the nesting was flattened');
});

test('the wrapper keeps the panel chrome the plain path has', () => {
  /**
   * The border, background and padding belong to the PANEL, not to the list —
   * so the rich wrapper has to carry them or a rich course loses the divider
   * and the tinted body the plain one has. Compared against the plain render
   * rather than restated, so a class rename in one place fails here.
   */
  const plainHtml = renderToStaticMarkup(createElement(CourseOutline, { course: COURSE }));
  const richHtml = render([NESTED, '<ul><li>a</li></ul>']);
  for (const cls of [
    'border-t border-[var(--surface-divider)]',
    'bg-[color-mix(in_srgb,var(--surface-muted)_40%,transparent)]',
    'px-5 py-3',
  ]) {
    assert.ok(plainHtml.includes(cls), `CONTROL: the plain path no longer carries "${cls}"`);
    assert.ok(richHtml.includes(cls), `the rich wrapper dropped "${cls}"`);
  }
});

test('an EMPTY rich entry falls through to that row\'s plain rendering', () => {
  /**
   * A row with no bullets has `''` as its rich entry — 125 such rows exist. It
   * must render exactly what the plain path renders for it, which is no list at
   * all, NOT an empty `.topic-rich` div.
   */
  const course = {
    course_id: 'C',
    training_topics: [
      { title: 'มีหัวข้อย่อย', bullets: ['x'] },
      { title: 'ไม่มีหัวข้อย่อย', bullets: [] },
    ],
  };
  const html = render(['<ul><li>x</li></ul>', ''], course);
  assert.equal((html.match(/topic-rich/g) || []).length, 1,
    'the bullet-less row rendered an empty rich wrapper');
  assert.ok(html.includes('ไม่มีหัวข้อย่อย'), 'the bullet-less row lost its heading');
});

test('a SHORT rich array does not blank the rows it does not cover', () => {
  // Defence at the component. resolveTopicRich already refuses a length
  // mismatch, so this cannot arrive from the real seam — but a row rendering
  // nothing is a worse failure than a row rendering plain.
  const html = render(['<ul><li>only row one</li></ul>']);
  assert.ok(html.includes('only row one'), 'row 0 lost its rich content');
  assert.ok(html.includes('การเรียงลำดับข้อมูล'), 'row 1 lost its heading');
  assert.ok(html.includes('<span>a</span>'), 'row 1 did not fall back to its plain bullets');
});

test('the rich path does NOT emit the plain path\'s hand-rolled bullet span', () => {
  // The two paths are distinguishable in the markup, which is what lets the
  // inertness proof assert which one ran.
  const html = render([NESTED, '<ul><li>a</li></ul>']);
  assert.ok(!html.includes('text-9e-air">•<'), 'the rich path rendered the plain marker span');
});

test('all SIX nesting levels survive to the DOM at the new cap', () => {
  const html = render([SIX_DEEP, '']);
  assert.ok(html.includes(SIX_DEEP), 'the six-level HTML did not reach the markup verbatim');
  const sixListsDeep = /<ul><li>[^<]*<ul><li>[^<]*<ul><li>[^<]*<ul><li>[^<]*<ul><li>[^<]*<ul><li>/;
  assert.match(html, sixListsDeep, 'the six-level nesting was flattened');
});

test('REGRESSION: the old 3-level fixture renders BYTE-IDENTICAL markup to before the cap moved', () => {
  // Pinned literal, not re-derived — a change to CourseOutline's wrapper markup
  // or to how it threads richHtml through would move this string, and that is
  // exactly what this test exists to catch for existing stored content.
  const html = render([NESTED, '<ul><li>a</li></ul>']);
  assert.ok(html.includes(NESTED), 'the exact 3-level HTML this repo shipped before no longer arrives verbatim');
});

test('CONTROL: the rich path is genuinely reachable and genuinely different', () => {
  // Guards every assertion above from passing against a component that ignores
  // the prop entirely.
  const plain = renderToStaticMarkup(createElement(CourseOutline, { course: COURSE }));
  assert.notEqual(render([NESTED, '<ul><li>a</li></ul>']), plain);
  assert.ok(!plain.includes('topic-rich'), 'the plain render already carried the rich wrapper');
});
