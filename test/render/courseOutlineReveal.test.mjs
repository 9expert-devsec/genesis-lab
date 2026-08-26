import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../sourceScan.mjs';
import { CourseOutline } from '@/app/(public)/[...slug]/_components/CourseOutline';

/**
 * The outline accordion's reveal — the RENDERED half.
 *
 * The source guards and the compiled-CSS assertions live in
 * test/fs/courseOutlineReveal.test.mjs. THE SPLIT IS NOT TIDINESS: importing
 * test/twCompile.mjs into a file that also renders React breaks the render.
 * That module reads tailwind.config.js through a CJS require, which pulls in a
 * second copy of React, and every hook then throws "Invalid hook call" —
 * CourseOutline uses useState, so it cannot render at all. Measured while
 * writing this, not guessed; the two halves are one subject in two tiers.
 *
 * ══ WHAT THIS TIER CANNOT SEE ══════════════════════════════════════════════
 * JSDOM PERFORMS NO LAYOUT — no heights, no resolved `fr` tracks, no
 * transitions. **Nothing here can assert that content is unclipped.** That is
 * the whole defect, and it is checked by a human in a browser; the click-test
 * list is in the round report. What a string render CAN establish is that the
 * markup carries the mechanism which makes collapse possible, and that every
 * bullet reaches the DOM rather than being capped by the component.
 */

/**
 * A course in the shape GET /api/ai/public-course returns, sized like the row
 * that actually broke: 27 bullets under one title, the real POWER-BI-XDM row 0.
 * The count is the point — a 2-bullet fixture exercises the same classes and
 * would have passed against the 800px ceiling too, proving nothing.
 */
const TALL_COURSE = {
  course_id: 'POWER-BI-XDM',
  training_topics: [
    {
      title: 'เข้าใจ Power BI Semantic Model',
      bullets: Array.from({ length: 27 }, (_, i) => `bullet ${i + 1}`),
    },
    { title: 'การใช้เครื่องมือช่วยเสริมประสิทธิภาพ', bullets: ['a', 'b'] },
  ],
};

const markup = () => renderToStaticMarkup(createElement(CourseOutline, { course: TALL_COURSE }));

test('the grid item can shrink below its content — min-h-0 AND overflow-hidden', () => {
  /**
   * BOTH, and neither alone. A grid item's `min-height` is `auto`, which refuses
   * to shrink under min-content, so `min-h-0` is what lets the 0fr track ever
   * reach zero; `overflow-hidden` is what clips the content mid-transition.
   * Drop either and the panel misbehaves in a different way, so both are pinned.
   */
  const html = markup();
  assert.ok(
    html.includes('min-h-0 overflow-hidden'),
    'the grid item lost min-h-0 and/or overflow-hidden — without min-h-0 the '
    + 'panel cannot close at all, without overflow-hidden it spills while opening',
  );
});

test('the open panel renders the 1fr track and EVERY one of its 27 bullets', () => {
  const html = markup();
  assert.ok(html.includes('grid-rows-[1fr]'), 'the open panel is not on a 1fr track');
  // All 27 — the count IS the assertion. Nothing in the component may cap it.
  for (let i = 1; i <= 27; i += 1) {
    assert.ok(html.includes(`bullet ${i}<`), `bullet ${i} is missing from the markup`);
  }
});

test('no inline height, max-height or style survives onto the reveal wrapper', () => {
  /**
   * The class guards in the fs half cannot see a ceiling reintroduced as an
   * inline style — `style={{ maxHeight: … }}` is invisible to a class matcher
   * and would re-create the identical bug. There is a live precedent for that
   * exact shape in this repo (InstructorQuote.jsx:185 sets maxHeight inline).
   */
  const html = markup();
  assert.ok(!/style="[^"]*max-height/i.test(html), 'an inline max-height reached the markup');
  assert.ok(!/style="[^"]*[^-]height/i.test(html), 'an inline height reached the markup');
});

test('the closed state is reachable and collapses to a 0fr track', () => {
  /**
   * Asserted at SOURCE, not by rendering, and the reason is worth stating
   * rather than hiding: every topic defaults to OPEN, so a static render never
   * reaches the closed state, and this suite has no click harness — 109 of 110
   * render tests use renderToStaticMarkup. What is checkable is that the false
   * branch of the ternary is a ZERO track, and the fs half proves
   * `grid-rows-[0fr]` compiles to a real `grid-template-rows: 0fr`. Together
   * those are the claim. Neither is a measured height, because nothing in this
   * suite can measure one.
   */
  const { code } = readSource('src/app/(public)/[...slug]/_components/CourseOutline.jsx');
  assert.match(
    code,
    /open \? 'grid-rows-\[1fr\]' : 'grid-rows-\[0fr\]'/,
    'the open/closed branches are not the 1fr/0fr pair the reveal depends on',
  );
});

test('CONTROL: the fixture is genuinely taller than the ceiling that was there', () => {
  // A short fixture would exercise the same classes and would have passed
  // against the 800px ceiling too, proving nothing about the defect.
  assert.equal(TALL_COURSE.training_topics[0].bullets.length, 27);
  assert.ok(markup().includes('bullet 27<'), 'the tall fixture is not reaching the markup');
});

test('CONTROL: the render is real — the heading and toggle are present', () => {
  // Guards every "does NOT contain" assertion above from passing because the
  // component rendered nothing at all.
  const html = markup();
  assert.ok(html.includes('หัวข้อการฝึกอบรม'), 'the section heading did not render');
  assert.ok(html.includes('เข้าใจ Power BI Semantic Model'), 'the row title did not render');
  assert.ok(html.length > 1000, `the render is suspiciously short (${html.length} chars)`);
});
