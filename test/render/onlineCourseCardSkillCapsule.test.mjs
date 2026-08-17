import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { OnlineCourseCard } from '@/app/_components/home/OnlineCourseCard';

/**
 * The online card's skill capsule — same rule as the in-class card's.
 *
 * ── THE ONE THING THAT IS DIFFERENT, AND IT IS THE INTERESTING PART ────────
 * Every other link on this card LEAVES THE SITE: the thumbnail, the title and
 * the "ดูรายละเอียด" CTA all carry `target="_blank"` to 9Expert Academy, where
 * these courses actually run. The capsule does not — it points at our own
 * catalogue, in place. That asymmetry is deliberate (the capsule means "this
 * skill", not "this course") and it is pinned below, because the obvious
 * "consistency" edit is to give the capsule a `target` too, which would be
 * wrong.
 *
 * MEASURED, and NOT solved here: those catalogue pages list PUBLIC courses
 * only. /ai-all-courses showed 18 course links on 2026-08-17 — the 18 public AI
 * courses — while the 6 online AI courses are absent from it. So an online
 * card's capsule leads to a page containing none of the online courses. See the
 * commit message; the fix is a catalogue-side question, not a capsule one.
 */

const SLUGS = {
  ai: 'ai-all-courses',
  dev: 'programming-all-courses',
  business: 'business-all-courses',
};

const skill = (id, name, code) => ({ _id: id, skill_id: code, skill_name: name });
const AI = skill('68d4f556581cb350290597d1', 'AI', 'AI');
const BUS = skill('68d4f506581cb350290597c6', 'Business', 'BUSINESS');
const DEV = skill('68d4f5b3581cb350290597de', 'Development', 'DEV');
const GHOST = skill('deadbeef', 'Ghost', 'NOPE');

const COURSE = {
  o_course_id: 'ONL-COPILOT-STU',
  o_course_name: 'Copilot for Students',
  o_course_price: 0,
  o_number_lessons: 8,
  website_urls: ['https://academy.9experttraining.com/courses/copilot'],
  skills: [AI, BUS],
};

const render = (course = COURSE, props = {}) =>
  renderToStaticMarkup(
    createElement(OnlineCourseCard, { course, skillSlugs: SLUGS, ...props })
  );

const dom = (html) =>
  new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;

function capsules(doc) {
  const row = doc.querySelector('.mb-2.flex.flex-wrap.gap-1');
  return row ? [...row.children] : [];
}

test('resolvable capsules render anchors to the catalog pages', () => {
  const caps = capsules(dom(render()));
  assert.deepEqual(caps.map((c) => c.tagName), ['A', 'A']);
  assert.deepEqual(
    caps.map((c) => c.getAttribute('href')),
    ['/ai-all-courses', '/business-all-courses']
  );
});

test('THE Development case holds here too', () => {
  const href = capsules(dom(render({ ...COURSE, skills: [DEV] })))[0].getAttribute('href');
  assert.equal(href, '/programming-all-courses');
  assert.ok(!/development/i.test(href), `href derived from the label: ${href}`);
});

test('an unresolvable capsule stays an inert <span>', () => {
  const caps = capsules(dom(render({ ...COURSE, skills: [AI, GHOST] })));
  assert.deepEqual(caps.map((c) => c.tagName), ['A', 'SPAN']);
  assert.equal(caps[1].getAttribute('href'), null);
});

test('an empty slug map renders spans and does not throw', () => {
  for (const map of [{}, undefined]) {
    const caps = capsules(dom(render(COURSE, { skillSlugs: map })));
    assert.equal(caps.length, 2);
    assert.ok(caps.every((c) => c.tagName === 'SPAN'));
  }
});

test('the capsule link is INTERNAL while every other link on the card is not', () => {
  /**
   * The asymmetry, asserted from both sides so neither can drift alone: the
   * capsule must stay same-tab, and the outbound links must stay outbound. A
   * "make it consistent" edit in either direction reddens this.
   */
  const doc = dom(render());
  const caps = capsules(doc);
  for (const cap of caps) {
    assert.equal(cap.getAttribute('target'), null, 'the capsule must not open a new tab');
    assert.equal(cap.getAttribute('rel'), null);
    assert.ok(cap.getAttribute('href').startsWith('/'), 'the capsule must be a root-relative URL');
  }

  const outbound = [...doc.querySelectorAll('a')].filter((a) => !caps.includes(a));
  assert.ok(outbound.length >= 3, `expected the card's 3 outbound links, found ${outbound.length}`);
  for (const a of outbound) {
    assert.equal(a.getAttribute('target'), '_blank', `${a.getAttribute('href')} stopped opening externally`);
    assert.match(a.getAttribute('rel') ?? '', /noopener/);
  }
});

test('no capsule anchor is nested inside another anchor', () => {
  // This card's thumbnail, title and CTA are all anchors, so the nesting
  // question is live here in a way it is not on the in-class card.
  const doc = dom(render());
  for (const a of doc.querySelectorAll('a')) {
    assert.equal(
      a.parentElement.closest('a'), null,
      `an <a href="${a.getAttribute('href')}"> is nested inside another <a>`
    );
  }
});

test('the capsule carries the hover affordance and no local focus ring', () => {
  const cls = capsules(dom(render()))[0].getAttribute('class');
  assert.match(cls, /hover:border-9e-action/);
  assert.match(cls, /transition-colors/);
  assert.ok(!/focus-visible:/.test(cls), `the capsule overrides the global focus ring: ${cls}`);
});
