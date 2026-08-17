import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { readSource } from '../sourceScan.mjs';

/**
 * The skill capsule is a LINK when — and only when — the slug map answers.
 *
 * ── THE ONE CASE THAT MATTERS MOST ─────────────────────────────────────────
 * `Development`. Its capsule prints "Development" and its page is
 * `/programming-all-courses`; the two share no stem. Every wrong implementation
 * of this feature produces `/development-all-courses`, which 404s, and the
 * capsule looks perfect either way. So that pair is asserted directly rather
 * than left to the resolver's own unit tests — this is the surface where the
 * displayed text and the URL sit two lines apart and could be confused.
 *
 * ── NO REACT ROOT ──────────────────────────────────────────────────────────
 * `renderToStaticMarkup` to a string, then that string injected into a jsdom
 * fragment for the DOM questions (ancestor chains, attribute reads). The runner
 * is `isolation: 'none'`, so a `createRoot` here would leak a global `document`
 * into every other render test in the process.
 */

const CURRENT_YEAR = 2026;

/** The live map, measured 2026-08-17 (lower-cased SkillPageConfig.skillId). */
const SLUGS = {
  ai: 'ai-all-courses',
  dev: 'programming-all-courses',
  data: 'data-all-courses',
};

const skill = (id, name, code) => ({ _id: id, skill_id: code, skill_name: name });

const DEV = skill('68d4f5b3581cb350290597de', 'Development', 'DEV');
const AI = skill('68d4f556581cb350290597d1', 'AI', 'AI');
const GHOST = skill('deadbeef', 'Ghost', 'NOPE');

const COURSE = {
  _id: 'c1',
  course_id: 'PYTHON-L1',
  course_name: 'Python Level 1',
  course_price: 9000,
  course_trainingdays: 2,
  course_type_public: true,
  skills: [DEV],
  schedules: [],
};

const render = (course = COURSE, props = {}) =>
  renderToStaticMarkup(
    createElement(CourseCard, {
      course,
      currentYear: CURRENT_YEAR,
      skillSlugs: SLUGS,
      ...props,
    })
  );

/** Parse static markup into a queryable DOM without mounting React. */
function dom(html) {
  return new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;
}

/** The capsule elements, in order — whatever tag they ended up as. */
function capsules(doc) {
  // The capsule row is the only `flex-wrap gap-1` strip on the card.
  const row = doc.querySelector('.mb-2.flex.flex-wrap.gap-1');
  return row ? [...row.children] : [];
}

// ── the link ────────────────────────────────────────────────────────────────

test('a resolvable capsule renders an <a> to the catalog page', () => {
  const doc = dom(render());
  const [cap] = capsules(doc);
  assert.ok(cap, 'no capsule rendered');
  assert.equal(cap.tagName, 'A');
  assert.equal(cap.getAttribute('href'), '/programming-all-courses');
  assert.equal(cap.textContent.trim(), 'Development');
});

test('THE Development case: the href is not built from the printed text', () => {
  /**
   * Stated as its own test with its own failure message because this is the
   * assertion that would have caught every wrong version of this feature.
   */
  const doc = dom(render());
  const href = capsules(doc)[0].getAttribute('href');
  assert.equal(href, '/programming-all-courses');
  assert.notEqual(href, '/development-all-courses');
  assert.ok(
    !/development/i.test(href),
    `the capsule's href was derived from its label: ${href}`
  );
});

test('each capsule links to its OWN skill', () => {
  const doc = dom(render({ ...COURSE, skills: [DEV, AI] }));
  const hrefs = capsules(doc).map((c) => c.getAttribute('href'));
  assert.deepEqual(hrefs, ['/programming-all-courses', '/ai-all-courses']);
});

// ── the fallback ────────────────────────────────────────────────────────────

test('an unresolvable capsule stays an inert <span>', () => {
  const doc = dom(render({ ...COURSE, skills: [GHOST] }));
  const [cap] = capsules(doc);
  assert.equal(cap.tagName, 'SPAN');
  assert.equal(cap.getAttribute('href'), null);
  assert.equal(cap.textContent.trim(), 'Ghost');
});

test('an EMPTY slug map renders every capsule as a span, and does not throw', () => {
  // The degraded path: getPageLinkability fails closed to {}. The card must
  // still render, unlinked — never a dead href, never an exception.
  for (const map of [{}, undefined]) {
    const doc = dom(render(COURSE, { skillSlugs: map }));
    const caps = capsules(doc);
    assert.equal(caps.length, 1);
    assert.equal(caps[0].tagName, 'SPAN');
    assert.equal(caps[0].textContent.trim(), 'Development');
  }
});

test('resolvable and unresolvable capsules coexist on one card', () => {
  // The mixed row is the state a half-configured skill actually produces, and
  // it is where an implementation that branches once for the whole row breaks.
  const doc = dom(render({ ...COURSE, skills: [DEV, GHOST, AI] }));
  const caps = capsules(doc);
  assert.deepEqual(caps.map((c) => c.tagName), ['A', 'SPAN', 'A']);
  assert.deepEqual(
    caps.map((c) => c.getAttribute('href')),
    ['/programming-all-courses', null, '/ai-all-courses']
  );
});

test('the card still renders at most three capsules', () => {
  // Pre-existing behaviour the link substitution must not have changed.
  const many = [DEV, AI, skill('d3', 'Data', 'DATA'), GHOST, skill('d5', 'Fifth', 'X')];
  assert.equal(capsules(dom(render({ ...COURSE, skills: many }))).length, 3);
});

// ── the invalid-HTML question Round A asked ─────────────────────────────────

test('no capsule anchor is nested inside another anchor', () => {
  /**
   * Round A established that the card wrapper is an <article> and the capsule
   * row has no <a>/<Link> ancestor, which is what makes this substitution legal
   * at all. Pinned HERE, on the rendered tree, because the thing that would
   * break it is a future change to the CARD — wrapping it in a link — not to
   * this row. An <a> inside an <a> is invalid HTML and browsers silently
   * restructure it.
   */
  const doc = dom(render({ ...COURSE, skills: [DEV, AI] }));
  const anchors = [...doc.querySelectorAll('a')];
  assert.ok(anchors.length >= 3, `expected the card's own links plus capsules, got ${anchors.length}`);
  for (const a of anchors) {
    assert.equal(
      a.parentElement.closest('a'), null,
      `an <a href="${a.getAttribute('href')}"> is nested inside another <a>`
    );
  }
});

test('CONTROL: the nesting probe DOES fire on a genuinely nested anchor', () => {
  // Without this the assertion above could pass because the probe never fires.
  const doc = dom('<a href="/outer"><a href="/inner">x</a></a>');
  // jsdom's parser mirrors a browser and un-nests the pair, so build it
  // explicitly — the probe, not the parser, is the subject.
  const outer = doc.createElement('a');
  const inner = doc.createElement('a');
  outer.appendChild(inner);
  doc.body.appendChild(outer);
  assert.notEqual(inner.parentElement.closest('a'), null);
});

// ── the styling rules this round is bound by ────────────────────────────────

test('the capsule carries a hover affordance and no local focus ring', () => {
  const doc = dom(render());
  const cls = capsules(doc)[0].getAttribute('class');
  assert.match(cls, /hover:text-9e-action/);
  assert.match(cls, /hover:border-9e-action/);
  assert.match(cls, /transition-colors/);
  // The app-wide `*:focus-visible` rule in globals.css already paints the ring.
  assert.ok(!/focus-visible:/.test(cls), `the capsule overrides the global focus ring: ${cls}`);
  assert.ok(!/outline-none/.test(cls), 'the capsule removes its own outline');
});

test('no capsule sets --tw-ring-color inline', () => {
  /**
   * An inline custom property is GLOBAL to the element and would repaint the
   * app-wide `*:focus-visible` rule for it. Asserted on the rendered markup
   * rather than the source, so a value arriving through a variable is caught.
   */
  const doc = dom(render({ ...COURSE, skills: [DEV, GHOST] }));
  for (const cap of capsules(doc)) {
    const style = cap.getAttribute('style');
    assert.ok(!style || !/--tw-ring-/.test(style), `capsule sets a ring variable inline: ${style}`);
  }
});

test('the class strings are COMPLETE LITERALS, never assembled', () => {
  /**
   * The /schedule round hover shipped dead because its class was built with a
   * template literal: Tailwind scans TEXT and never evaluates it, so the
   * rendered markup was perfect and the CSS rule did not exist.
   *
   * This is the source-level half. The half that actually proves the rules
   * EXIST is test/fs/tailwindArbitraryValueRules, which compiles this file.
   */
  const { code } = readSource('src/app/(public)/training-course/_components/CourseCard.jsx');
  const dynamic = [...code.matchAll(/className=\{([^}]*)\}/g)].map((m) => m[1].trim());
  for (const expr of dynamic) {
    assert.ok(
      !/`/.test(expr),
      `a className is assembled from a template literal, which Tailwind cannot see: ${expr}`
    );
  }
  // And the capsule's own strings are present verbatim, as plain attributes.
  assert.match(code, /className="rounded-full border border-gray-100 px-2 py-0\.5 text-xs text-9e-slate-dp-50 transition-colors/);
});
