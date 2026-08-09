import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseSectionTabs } from '@/app/(public)/[...slug]/_components/CourseSectionTabs';
import { SidebarNav } from '@/app/(public)/[...slug]/_components/SidebarNav';
import { SECTION_ANCHOR_CLASS, courseSectionLinks } from '@/lib/courseSectionNav';
import { readSource, scrubSource } from '../sourceScan.mjs';

/**
 * The mobile section tab strip, and the one thing that makes it safe to add:
 * the sidebar's copy of the same links must not render below lg.
 *
 * ── THE DEFECT THE OBVIOUS IMPLEMENTATION SHIPS ─────────────────────────────
 * The links live in the <aside>, which reflows to the BOTTOM of the page below
 * lg. Adding a strip at the top without hiding that copy renders the same
 * navigation TWICE — usable tabs up top, a dead duplicate at the bottom. It
 * looks correct in any screenshot of the top of the page and is wrong on every
 * real one, which is exactly why it is asserted here rather than eyeballed.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * It renders to a string: no layout, no scrolling, no viewport. So "sticky
 * actually sticks", "the strip scrolls horizontally", "an anchor jump lands
 * below the chrome rather than under it", and how any of it looks at a real
 * breakpoint are click-tested by a human and by nothing else. What is checked
 * here is which classes and which links reach the DOM.
 */

const COURSE = {
  course_teaser: 'teaser',
  course_objectives: ['a'],
  training_topics: ['a'],
};
const FLAGS = { hasSchedules: true, hasRelated: true, hasFaqs: true };

const tabsHtml = (props = {}) =>
  renderToStaticMarkup(createElement(CourseSectionTabs, { course: COURSE, ...FLAGS, ...props }));
const sidebarHtml = (props = {}) =>
  renderToStaticMarkup(createElement(SidebarNav, { course: COURSE, ...FLAGS, ...props }));

/** The strip's own root element, by its test anchor. */
function strip(html) {
  const m = html.match(/<nav[^>]*data-course-section-tabs[^>]*>/);
  if (!m) {
    throw new Error(
      'the tab strip did not render, or lost its data-course-section-tabs anchor. ' +
        'A missing root would make every class check below pass vacuously, so this ' +
        'throws rather than returning an empty string.'
    );
  }
  return m[0];
}

// ── exactly one copy of the links per breakpoint ────────────────────────────

test('the strip is mobile-only and the sidebar is desktop-only — never both', () => {
  assert.match(strip(tabsHtml()), /\blg:hidden\b/, 'the strip disappears at lg');

  const sidebar = sidebarHtml();
  assert.match(sidebar, /\bhidden\b/, 'the sidebar copy is hidden by default...');
  assert.match(sidebar, /\blg:block\b/, '...and only appears at lg');
});

test('CONTROL: the breakpoint probes are not matching everything', () => {
  // Without this, `lg:hidden` and `hidden lg:block` could both be "present"
  // because the probes match some unrelated utility.
  assert.equal(/\blg:hidden\b/.test(sidebarHtml()), false, 'the sidebar is not lg:hidden');
  assert.equal(/\blg:block\b/.test(strip(tabsHtml())), false, 'the strip is not lg:block');
});

test('both renderings list the SAME links — one source, two presentations', () => {
  const expected = courseSectionLinks({ course: COURSE, ...FLAGS }).map((l) => l.id);
  assert.ok(expected.length > 1, 'the fixture produces several links');

  const hrefsIn = (html) => [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefsIn(tabsHtml()), expected, 'the strip links to every section, in order');
  assert.deepEqual(hrefsIn(sidebarHtml()), expected, 'and so does the sidebar');
});

test('CONTROL: the href probe would notice a link that went missing', () => {
  // Fired at a course with fewer sections: the two lists must SHRINK together,
  // so "they match" is not a comparison of two constants.
  const lean = { course_teaser: 'teaser' };
  const flags = { hasSchedules: false, hasRelated: false, hasFaqs: false };
  const hrefsIn = (html) => [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefsIn(tabsHtml({ course: lean, ...flags })), ['description']);
  assert.deepEqual(hrefsIn(sidebarHtml({ course: lean, ...flags })), ['description']);
});

test('a course with no linkable sections renders no strip at all', () => {
  const html = tabsHtml({ course: {}, hasSchedules: false, hasRelated: false, hasFaqs: false });
  assert.equal(html, '', 'no empty shell, no stray border');
});

// ── the sticky geometry ─────────────────────────────────────────────────────

test('the strip sticks at the height the header actually occupies', () => {
  const tag = strip(tabsHtml());
  assert.match(tag, /\bsticky\b/, 'sticky is a ruling, not an option');
  assert.match(tag, /\btop-20\b/, 'pinned at 80px — the header container is h-20');
});

test('the offset matches the real header, read from the header itself', () => {
  // Not a hardcoded 80: the header's own source is the authority. If it ever
  // stops being h-20, this goes red instead of the strip quietly overlapping.
  const header = readSource('src/components/layout/PublicHeaderClient.jsx');
  assert.match(header.code, /\bh-20\b/, 'the header container is still h-20 (80px)');
  assert.match(header.code, /\bsticky\b/, 'and it is still sticky, so it stays in the way');
  assert.match(strip(tabsHtml()), /\btop-20\b/, 'the strip offsets by exactly that');
});

test('the strip sits below the header and out of the dock and bar tiers', () => {
  const tag = strip(tabsHtml());
  const z = Number(tag.match(/\bz-(\d+)\b/)[1]);
  assert.equal(z, 30, 'z-30, the lowest free rung on the documented ladder');
  assert.ok(z < 60, 'under PublicHeader (z-60), which slides over it');
  assert.ok(z < 50, 'under FloatingActionDock and the sidebar (z-50)');
  assert.ok(z < 40, 'under CourseStickyCTA (z-40)');
  assert.ok(z > 0, 'but above ordinary flow content, which is z-auto');
});

test('the strip is full-bleed, with the inset on the scroll track instead', () => {
  const tag = strip(tabsHtml());
  // Deliberate: the hero above is edge-to-edge below lg and the body below is
  // px-4, so the strip had to pick one. Full-bleed keeps the scroll track
  // reaching the edge; the px-4 moves inside so the first tab still lines up.
  assert.equal(/\bpx-4\b/.test(tag), false, 'the strip itself carries no horizontal inset');
  assert.match(tabsHtml(), /<ul[^>]*\bpx-4\b/, 'the scroll container does');
  assert.match(tabsHtml(), /<ul[^>]*\boverflow-x-auto\b/, 'and it is the thing that scrolls');
});

// ── the anchor offset, single-sourced ───────────────────────────────────────

test('the anchor offset clears header + strip below lg and reverts at lg', () => {
  assert.equal(SECTION_ANCHOR_CLASS, 'scroll-mt-36 lg:scroll-mt-24');
  // 80 (header h-20) + 48 (strip h-12) + 16 (the breathing room the original
  // lone 96px already had over the 80px header) = 144px = scroll-mt-36.
  // The height is declared on the row, which is what gives the strip its own
  // height — the root adds only a 1px border.
  assert.match(tabsHtml(), /<ul[^>]*\bh-12\b/, 'the strip row really is 48px tall');
});

test('CONTROL: the offset is not simply the old value', () => {
  // The whole point is that it CHANGED below lg. Without this, "the constant
  // exists" would pass for a constant that still says scroll-mt-24.
  assert.notEqual(SECTION_ANCHOR_CLASS, 'scroll-mt-24');
  assert.match(SECTION_ANCHOR_CLASS, /^scroll-mt-\d+\s+lg:scroll-mt-24$/, 'lg is unchanged');
});

test('every anchor on this page uses the constant, not a literal', () => {
  // Read as CODE, not raw: these files discuss the offset in prose, and a raw
  // scan would read the explanation as the defect — the wrong turn recorded in
  // the heroBannerPointerCapture guard.
  const anchors = [
    'src/app/(public)/[...slug]/page.jsx',
    'src/app/(public)/[...slug]/_components/ContentSection.jsx',
    'src/app/(public)/[...slug]/_components/RelatedCourses.jsx',
    'src/app/(public)/[...slug]/_components/ScheduleSection.jsx',
  ];
  for (const rel of anchors) {
    const src = readSource(rel);
    assert.match(src.code, /SECTION_ANCHOR_CLASS/, `${rel} uses the constant`);
    assert.equal(
      /scroll-mt-\d/.test(src.code),
      false,
      `${rel} must not also carry a literal offset — four copies that must agree ` +
        `is the shape this repo keeps paying for`
    );
  }
});

test('CONTROL: the literal-offset probe fires on a literal, and prose is stripped', () => {
  assert.equal(/scroll-mt-\d/.test('<section className="scroll-mt-24">'), true, 'it sees a literal');
  assert.equal(
    /scroll-mt-\d/.test('<section className={SECTION_ANCHOR_CLASS}>'),
    false,
    'and not the constant'
  );
  // And the reason `.code` is used above rather than `.raw`: the constant's own
  // docstring spells scroll-mt-36 out to explain the arithmetic, so a raw scan
  // would report correct code as carrying a literal.
  assert.ok(
    /scroll-mt-36/.test(readSource('src/lib/courseSectionNav.js').raw),
    'the raw module really does name it in prose, or this control is empty'
  );
  assert.equal(
    /scroll-mt-\d/.test(scrubSource('// 80 + 48 + 16 = 144px = scroll-mt-36\n')),
    false,
    'a comment naming the class is not code'
  );
});
