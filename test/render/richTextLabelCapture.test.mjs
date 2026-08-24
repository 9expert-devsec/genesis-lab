import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 55 — the rich-text editor was inside a <label>, so clicking it pressed
 * the bold button.
 *
 * TWO SYMPTOMS, ONE CAUSE. Typed text came out bold from the first character,
 * and merely clicking the text toggled bold. `Field` renders a `<label>`, a
 * `<label>` with no `for` forwards a click on any non-interactive part of
 * itself to its FIRST LABELABLE DESCENDANT, and `<button>` is labelable — so
 * the toolbar's first button, ตัวหนา, became the control for the whole field.
 * Clicking into the editor to start typing IS such a click, which is why the
 * author was already in bold before the first keystroke.
 *
 * The mark is REAL rather than a CSS weight: what runs is Tiptap's own
 * `toggleBold` command, so it lands in the stored document as a bold mark.
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE, SAID FIRST ─────────────────────────
 * Tiptap does NOT initialise under `renderToStaticMarkup` — `useEditor` returns
 * null on the server — so the toolbar is absent from this markup and no test
 * here can count its buttons or click one. That is a real limit, and it is why
 * a static "every label holds at most one control" sweep would NOT have caught
 * this defect: the buttons are invisible to it.
 *
 * What IS assertable here, and is the property that matters: the rich_text
 * editor emits NO <label> at all, so there is nothing for a stray click to be
 * forwarded to. The mechanism itself is pinned separately on a constructed
 * fixture, and the mounted before/after is measured in
 * scripts/_probe-round55-richtext-drive.mjs (a child process — a React root
 * over jsdom leaks globals into every markup test sharing this one).
 */

const panel = (type, content) => renderToStaticMarkup(createElement(SectionContentEditor, {
  type, content, patch: () => {}, resolved: undefined, courses: [],
}));

const doc = (markup) => new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;

const RICH = { doc: { type: 'doc', content: [] } };

// ── THE FIX ────────────────────────────────────────────────────────────────

test('the rich_text editor is NOT wrapped in a label', () => {
  const d = doc(panel('rich_text', RICH));
  assert.equal(d.querySelectorAll('label').length, 0,
    'a <label> is back around the rich text editor — a click on the text will press its first button');
});

test('…and it still carries its caption', () => {
  // FieldBlock emits the same caption markup Field did, so the field looks
  // identical. Losing the caption would be a different regression.
  assert.ok(panel('rich_text', RICH).includes('เนื้อหา'), 'the field lost its caption');
});

test('the source uses FieldBlock, which is the thing that has no label', () => {
  /**
   * A rendered assertion cannot tell "uses FieldBlock" from "uses a Field that
   * happens to render nothing today". The distinction is the whole fix, so the
   * source says it.
   */
  const src = readSource('src/components/pageBuilder/editor/SectionContentEditor.jsx').code;
  assert.match(src, /<FieldBlock label="เนื้อหา">/, 'the rich text field is no longer a FieldBlock');
  assert.ok(!/<Field label="เนื้อหา">/.test(src), 'the label-rendering wrapper is back');
});

// ── THE MECHANISM, PINNED ON A FIXTURE ────────────────────────────────────

test('CONTROL — a label around a toolbar DOES make its first button the control', () => {
  /**
   * The defect, reproduced on a fixture, because the real toolbar cannot be
   * rendered in this tier. Without this the test above would be asserting the
   * absence of something never shown to be harmful.
   *
   * `label.control` is the browser's own answer to "what does a click here
   * activate", and jsdom implements it.
   */
  const d = doc(
    '<label><span>เนื้อหา</span><div class="editor">'
    + '<button type="button" aria-label="ตัวหนา">B</button>'
    + '<button type="button" aria-label="ตัวเอียง">I</button>'
    + '<div contenteditable="true"><p>ข้อความ</p></div>'
    + '</div></label>'
  );
  const label = d.querySelector('label');
  assert.equal(label.control?.getAttribute('aria-label'), 'ตัวหนา',
    'a label over a toolbar no longer targets the first button — re-read the fix, its reason may have expired');

  // …and the same markup in a div captures nothing.
  const safe = doc(
    '<div><span>เนื้อหา</span><div class="editor">'
    + '<button type="button" aria-label="ตัวหนา">B</button>'
    + '<div contenteditable="true"><p>ข้อความ</p></div>'
    + '</div></div>'
  );
  assert.equal(safe.querySelector('label'), null, 'the safe fixture grew a label');
});

test('CONTROL — a contenteditable is NOT labelable, which is why the click travels on', () => {
  // The reason the editing surface cannot absorb its own click: only button,
  // input, select, textarea, output, meter and progress are labelable, and a
  // contenteditable div is none of them.
  const d = doc('<label><div contenteditable="true"><p>x</p></div><button type="button" aria-label="ตัวหนา">B</button></label>');
  assert.equal(d.querySelector('label').control?.getAttribute('aria-label'), 'ตัวหนา',
    'the contenteditable absorbed the label — then the defect would not exist');
});

// ── F: A SEPARATE CORRECTNESS ISSUE, FOUND ON THE WAY ─────────────────────

test('the toolbar cancels mousedown so a click does not steal the selection', () => {
  /**
   * NOT the cause of the reported symptoms — the label capture was. This is a
   * second defect found while tracing it: pressing a toolbar button moves focus
   * out of the contenteditable and the browser collapses the selection, so the
   * command applies to a cursor instead of to the highlighted words.
   *
   * Source-level because the toolbar does not render in this tier at all.
   */
  const src = readSource('src/components/pageBuilder/editor/richText/RichTextEditor.jsx').code;
  assert.match(src, /onMouseDown=\{\(e\)\s*=>\s*e\.preventDefault\(\)\}/,
    'a toolbar click can steal the selection from the editor again');
});

// ── D: THE BLAST RADIUS, MEASURED RATHER THAN ASSUMED ─────────────────────

test('every OTHER field wraps at most one control, so none of them captures', () => {
  /**
   * If the cause were in `Field` itself, every field would be suspect. It is
   * not: a `<label>` around ONE input is exactly what a label is for, and that
   * is what every other field is. Measured across every content editor rather
   * than argued.
   *
   * STATED LIMIT: this sweep cannot see the rich text toolbar, because Tiptap
   * does not render on the server. It is evidence about the OTHER fields, and
   * it is not what guards rich_text — the label-count test above is.
   */
  const LABELABLE = 'button, input, select, textarea, output, meter, progress';
  const TYPES = [
    ['heading', { text: 'x', level: 'h2' }],
    ['cta', { heading: 'x', buttonLabel: 'go', buttonHref: '/a' }],
    ['notice', { text: 'x', variant: 'info' }],
    ['price_card', { title: 'x', price: '9', features: ['a'] }],
    ['stat_card', { value: '1', label: 'x', icon: 'rocket' }],
    ['icon_card', { icon: 'rocket', title: 'x', description: 'y' }],
    ['custom_html', { html: '<p>x</p>' }],
    ['custom_css', { css: 'p{color:red}' }],
    ['course_card', { courseId: 'MSE-AI' }],
    ['course_schedule', { courseId: 'MSE-AI', limit: 0 }],
  ];
  const offenders = [];
  let labelsSeen = 0;
  for (const [type, content] of TYPES) {
    for (const label of doc(panel(type, content)).querySelectorAll('label')) {
      labelsSeen += 1;
      const n = label.querySelectorAll(LABELABLE).length;
      if (n > 1) offenders.push(`${type}: a label holds ${n} controls`);
    }
  }
  assert.ok(labelsSeen >= 20, `the sweep saw only ${labelsSeen} labels — it is not covering the panel`);
  assert.deepEqual(offenders, []);
});
