import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaqAccordionItem, FaqAccordionSection } from '@/components/faq/FaqAccordionSection';

/**
 * The FAQ accordion's reveal — the RENDERED half.
 *
 * The source guards, the compiled-CSS assertions and the repo-wide sweep live in
 * test/fs/revealCeilings.test.mjs. THE SPLIT IS NOT TIDINESS: importing
 * test/twCompile.mjs into a file that also renders React breaks the render — its
 * CJS require of tailwind.config.js pulls in a second copy of React and every
 * hook throws "Invalid hook call". Measured in 11e460d, and this file follows it.
 *
 * ══ WHAT THIS TIER CANNOT SEE ══════════════════════════════════════════════
 * JSDOM PERFORMS NO LAYOUT — no heights, no resolved `fr` tracks, no
 * transitions. **Nothing here can assert that an answer is unclipped.** That is
 * the whole defect and it is checked by a human in a browser; the click-test
 * list is in the round report. What a string render CAN establish is that the
 * markup carries the mechanism that makes collapse possible, and that the whole
 * answer reaches the DOM rather than being capped by the component.
 *
 * ── ONLY THE FAQ COMPONENT IS RENDERED HERE ────────────────────────────────
 * MasterclassDetailClient is the other file fixed this round and is NOT rendered:
 * it is a ~1,100-line page component taking course/faqs/instructors, with
 * effects that read `window`, measure DOM boxes and register scroll listeners.
 * Standing it up would be a fixture exercise about the page, not about the four
 * classes this round changed, and its reveal is guarded at source and through
 * the real Tailwind compiler in the fs half — which is where the claim actually
 * lives. Saying so beats a render test that props its way to a green.
 */

/** A LocalFaq document in the shape the page passes down (`question_th` / `answer_html`). */
const LONG_ANSWER_HTML = [
  '<p>', 'ก'.repeat(240), '</p>',
  '<ul>', Array.from({ length: 12 }, (_, i) => `<li>item ${i + 1}</li>`).join(''), '</ul>',
  '<p>', 'ข'.repeat(240), '</p>',
].join('');

const FAQ = {
  _id: 'faq-1',
  question_th: 'เริ่มต้นเรียน AI ต้องมีพื้นฐานอะไรมาก่อนบ้าง ?',
  answer_html: LONG_ANSWER_HTML,
  is_active: true,
};

const item = () => renderToStaticMarkup(createElement(FaqAccordionItem, { faq: FAQ }));

test('the FAQ grid item carries min-h-0 AND overflow-hidden', () => {
  /**
   * BOTH, and neither alone. `min-h-0` is what lets the 0fr track reach zero —
   * a grid item's `min-height` is `auto` and refuses to shrink under min-content
   * — and `overflow-hidden` is what clips during the transition. Drop either and
   * the accordion misbehaves in a different way, so both are pinned.
   */
  assert.ok(
    item().includes('min-h-0 overflow-hidden'),
    'the FAQ grid item lost min-h-0 and/or overflow-hidden — without min-h-0 the '
    + 'answer cannot close at all, without overflow-hidden it spills while opening',
  );
});

test('a closed FAQ renders the 0fr track, and the answer is STILL in the DOM', () => {
  /**
   * FaqAccordionItem defaults to CLOSED (`useState(false)`), which is the
   * opposite of CourseOutline and means the closed branch IS reachable in a
   * static render — the thing 11e460d could only assert at source.
   *
   * The second half matters as much as the first: collapsed must mean "height
   * zero", never "content removed". If the component ever started conditionally
   * rendering the answer, the reveal would stop animating and the text would
   * vanish from the page source for crawlers and Ctrl+F alike.
   */
  const html = item();
  assert.ok(html.includes('grid-rows-[0fr]'), 'a closed answer is not on a 0fr track');
  assert.ok(!html.includes('grid-rows-[1fr]'), 'a closed answer rendered the OPEN track');
  assert.ok(html.includes('item 12<'), 'the collapsed answer is missing from the DOM entirely');
});

test('no max-height class and no inline height reach the rendered FAQ', () => {
  /**
   * The class guards in the fs half cannot see a ceiling reintroduced as an
   * inline style — `style={{ maxHeight: … }}` is invisible to a class matcher
   * and re-creates the identical bug. There is a live precedent for that exact
   * shape in this repo (InstructorQuote.jsx:185).
   */
  const html = item();
  assert.ok(!/max-h-/.test(html), 'a max-height utility reached the markup');
  assert.ok(!/style="[^"]*max-height/i.test(html), 'an inline max-height reached the markup');
  assert.ok(!/style="[^"]*[^-]height/i.test(html), 'an inline height reached the markup');
});

test('the whole answer reaches the DOM — every block of it', () => {
  // The length is the assertion. A short fixture exercises the same classes and
  // would have passed against the 384px ceiling too, proving nothing.
  const html = item();
  for (let i = 1; i <= 12; i += 1) {
    assert.ok(html.includes(`item ${i}<`), `list item ${i} is missing from the markup`);
  }
  assert.ok(html.includes('ก'.repeat(240)), 'the first paragraph was truncated');
  assert.ok(html.includes('ข'.repeat(240)), 'the last paragraph was truncated');
});

test('the section renders one item per FAQ and nothing when there are none', () => {
  const many = renderToStaticMarkup(createElement(FaqAccordionSection, {
    faqs: [FAQ, { ...FAQ, _id: 'faq-2', question_th: 'คำถามที่สอง' }],
  }));
  assert.equal((many.match(/grid-rows-\[0fr\]/g) || []).length, 2, 'expected one reveal per FAQ');
  assert.equal(
    renderToStaticMarkup(createElement(FaqAccordionSection, { faqs: [] })), '',
    'an empty FAQ list must render nothing at all — no heading, no empty box',
  );
});

test('CONTROL: the fixture is genuinely taller than the ceiling that was there', () => {
  // ~500 characters of Thai plus a 12-item list. On the ~296px text column a
  // phone gives this component, that is far past 384px — which is the case the
  // measurement found already clipping in production.
  assert.ok(LONG_ANSWER_HTML.length > 500, 'the fixture shrank below the ceiling it must exceed');
  assert.ok(item().length > 800, 'the tall fixture is not reaching the markup');
});

test('CONTROL: the render is real — the question and the answer both appear', () => {
  // Guards every "does NOT contain" assertion above from passing because the
  // component rendered nothing at all.
  const html = item();
  assert.ok(html.includes('เริ่มต้นเรียน AI'), 'the question did not render');
  assert.ok(html.includes('<ul>'), 'the answer HTML did not render');
});
