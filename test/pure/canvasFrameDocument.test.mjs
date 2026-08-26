import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  syncStylesheets, syncRootClass, injectReset,
} from '@/components/pageBuilder/editor/useCanvasFrame';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { editorReducer, initialEditorState } from '@/components/pageBuilder/editor/editorReducer';
import { keyToPath, getAt } from '@/components/pageBuilder/editor/pagePath';

/**
 * The canvas moved into an iframe. What a fresh frame document does NOT inherit,
 * and the path a click takes out of it.
 *
 * ── WHY THESE FUNCTIONS TAKE TWO DOCUMENTS ────────────────────────────────
 * `syncStylesheets(frameDoc, sourceDoc)` names both rather than reading the
 * ambient global, which is what lets this file run them against two constructed
 * JSDOM documents instead of whatever `document` happens to be in a test
 * process. That shape is also just clearer at the call site — the function's
 * whole job is "copy from that one to this one".
 *
 * ── WHAT THIS FILE CANNOT SHOW, STATED ────────────────────────────────────
 * JSDOM has no layout engine and no CSS cascade worth the name, so nothing here
 * proves a media query resolved against the frame or that a font rendered. Those
 * are browser facts and were measured in one:
 * `scripts/_probe-canvas-frame.mjs`, which drives real Chrome against the real
 * served stylesheet. What this file pins is the WIRING those measurements
 * depend on — which is the part that can silently rot in a refactor.
 */

// ── a parent document shaped like the real one ─────────────────────────────

const PARENT_HTML = `<!doctype html>
<html class="__variable_454241 __variable_554fae">
<head>
  <link rel="stylesheet" href="/_next/static/css/app/layout.css?v=1">
</head>
<body><iframe id="f"></iframe></body></html>`;

function twoDocuments(html = PARENT_HTML) {
  const dom = new JSDOM(html, { url: 'http://localhost:3000/admin/pages/builder/1/edit' });
  const parent = dom.window.document;
  const frame = parent.getElementById('f').contentDocument;
  return { parent, frame };
}

// ── 1. the stylesheets are cloned, by absolute href ────────────────────────

test('the frame receives the parent stylesheet links', () => {
  const { parent, frame } = twoDocuments();
  assert.equal(frame.querySelectorAll('link[rel="stylesheet"]').length, 0, 'the frame started with a sheet');

  syncStylesheets(frame, parent);

  const cloned = [...frame.head.querySelectorAll('link[rel="stylesheet"]')];
  assert.equal(cloned.length, 1);
  // ABSOLUTE, not the relative attribute value: the frame is about:blank, and a
  // relative href there resolves against a base URL not worth reasoning about.
  assert.equal(cloned[0].href, 'http://localhost:3000/_next/static/css/app/layout.css?v=1');
  assert.equal(cloned[0].hasAttribute('data-pb-cloned'), true, 'the clone is unmarked, so a re-sync cannot find it');
});

test('CONTROL: a frame that was never synced has no stylesheet at all', () => {
  // Without this, "the frame has one sheet" could be true of a frame that
  // inherited it, and the function under test would be doing nothing.
  const { frame } = twoDocuments();
  assert.equal(frame.querySelectorAll('link[rel="stylesheet"]').length, 0);
});

test('a re-sync adds the new href and removes the stale one', () => {
  /**
   * The development case: Next restamps the stylesheet query on every CSS edit.
   * A clone left behind would keep applying the OLD rules underneath the new
   * ones, which is worse than having no sheet — it looks almost right.
   */
  const { parent, frame } = twoDocuments();
  syncStylesheets(frame, parent);
  parent.querySelector('link').setAttribute('href', '/_next/static/css/app/layout.css?v=2');
  syncStylesheets(frame, parent);

  const hrefs = [...frame.head.querySelectorAll('link[data-pb-cloned]')].map((l) => l.href);
  assert.deepEqual(hrefs, ['http://localhost:3000/_next/static/css/app/layout.css?v=2']);
});

test('CONTROL: a re-sync with nothing changed does not duplicate the link', () => {
  const { parent, frame } = twoDocuments();
  syncStylesheets(frame, parent);
  syncStylesheets(frame, parent);
  syncStylesheets(frame, parent);
  assert.equal(frame.head.querySelectorAll('link[data-pb-cloned]').length, 1);
});

// ── 2. the root class list, which is fonts AND theme ───────────────────────

test('the frame mirrors the parent root class list', () => {
  const { parent, frame } = twoDocuments();
  assert.equal(frame.documentElement.className, '', 'the frame started with classes');

  syncRootClass(frame, parent);

  assert.equal(frame.documentElement.className, '__variable_454241 __variable_554fae');
});

test('the mirror carries the theme class, and follows it changing', () => {
  /**
   * next-themes writes its class onto the same element the font variables live
   * on, so one mirror covers both. The admin sidebar has a LIVE toggle, so the
   * second half — that a later change propagates — is the half that matters.
   */
  const { parent, frame } = twoDocuments();
  syncRootClass(frame, parent);
  assert.equal(frame.documentElement.classList.contains('dark'), false);

  parent.documentElement.classList.add('dark');
  syncRootClass(frame, parent);
  assert.equal(frame.documentElement.classList.contains('dark'), true);
  assert.equal(frame.documentElement.className, '__variable_454241 __variable_554fae dark');

  parent.documentElement.classList.remove('dark');
  syncRootClass(frame, parent);
  assert.equal(frame.documentElement.classList.contains('dark'), false,
    'the mirror is add-only — the canvas would stay dark after the toggle went back');
});

test('CONTROL: dropping the mirror is exactly what loses the fonts and the theme', () => {
  /**
   * ── THE FONT TRAP, AS A TEST ─────────────────────────────────────────────
   * The generated classes on the parent root are the ONLY definition of the
   * font custom properties, and the Tailwind stacks reach the real faces only
   * through those properties — the human family name in front of them is not a
   * face anyone has installed. A frame without the classes therefore loses both
   * self-hosted families silently.
   *
   * JSDOM cannot show the fallback, so what is asserted here is the CONDITION:
   * skip the mirror and the frame carries neither the font classes nor the
   * theme class. The consequence was measured in Chrome — with the mirror the
   * heading computes to "LINE Seed Sans TH", without it to "Times New Roman"
   * (scripts/_probe-canvas-frame.mjs, CONTROL_noRootClassMirror).
   */
  const { parent, frame } = twoDocuments();
  parent.documentElement.classList.add('dark');
  syncStylesheets(frame, parent);   // styles yes…
  // …mirror deliberately NOT called.

  assert.equal(frame.documentElement.className, '');
  assert.equal(/__variable_/.test(frame.documentElement.className), false,
    'the font variable classes arrived by some other route — this control no longer discriminates');
  assert.equal(frame.documentElement.classList.contains('dark'), false);

  // …and the same frame, once mirrored, has both.
  syncRootClass(frame, parent);
  assert.match(frame.documentElement.className, /__variable_/);
  assert.equal(frame.documentElement.classList.contains('dark'), true);
});

// ── 3. the margin reset ────────────────────────────────────────────────────

test('the reset is injected once, however many times it is asked for', () => {
  const { frame } = twoDocuments();
  injectReset(frame);
  injectReset(frame);
  const styles = [...frame.head.querySelectorAll('style[data-pb-reset]')];
  assert.equal(styles.length, 1);
  assert.match(styles[0].textContent, /margin:0/);
});

// ── 4. a click inside the frame still reaches the reducer ──────────────────

const PAGE = {
  slug: 's', title: 'T', pageType: 'general', status: 'draft', theme: 'default',
  showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', seo: {}, jsonLd: {}, slugHistory: [], sections: [],
};
const sec = (id, type, content) => ({
  id, type, content, name: '', enabled: true, sortOrder: 0,
  settings: {}, style: {}, layout: {}, advanced: {},
});

test('a click on a section INSIDE the frame document selects that section', () => {
  /**
   * The whole path the canvas's handler takes, run over the real markup sitting
   * in a real (JSDOM) frame document: closest() from the deepest node the author
   * could have clicked → the data attribute SectionRenderer stamped → keyToPath
   * → the reducer → the selected section.
   *
   * What is NOT covered here is React delivering the event across the frame
   * boundary at all. That is a react-dom property, measured in real Chrome twice
   * (scripts/_probe-iframe-portal.mjs in round 19; re-confirmed this round), and
   * it is not something a DOM-less assertion can or should restate.
   */
  const sections = [
    sec('a', 'heading', { text: 'หนึ่ง', level: 'h2', align: 'left' }),
    sec('b', 'container', { children: [sec('b1', 'heading', { text: 'ลูก', level: 'h3', align: 'left' })] }),
  ];
  const markup = sections.map((s, i) => renderToStaticMarkup(
    createElement(SectionRenderer, { section: s, depth: 0, path: ['sections', i], resolvedData: null }),
  )).join('');

  const { frame } = twoDocuments();
  frame.body.innerHTML = `<div data-pb-canvas="">${markup}</div>`;

  // The deepest element under the pointer for the NESTED heading — the case that
  // proves closest() picks the innermost section rather than its container.
  const deep = frame.querySelector('[data-pb-path="sections.1.content.children.0"] h3');
  assert.ok(deep, 'the nested section did not render inside the frame');

  const el = deep.closest('[data-pb-path]');
  const path = keyToPath(el.dataset.pbPath);
  assert.deepEqual(path, ['sections', 1, 'content', 'children', 0],
    'the path did not round-trip through the data attribute');

  const before = initialEditorState({ page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0' });
  const after = editorReducer(before, { type: 'SELECT', path });
  assert.deepEqual(after.selection, path);
  assert.equal(getAt(after.page, after.selection).id, 'b1', 'the selection points at a different section');
});

test('CONTROL: a click on nothing selects nothing, and the deep case was not a top-level hit', () => {
  const { frame } = twoDocuments();
  frame.body.innerHTML = '<div data-pb-canvas=""><p id="bare">outside any section</p></div>';
  const el = frame.getElementById('bare').closest('[data-pb-path]');
  assert.equal(el, null, 'closest() found a section where there is none');

  const before = initialEditorState({ page: { ...PAGE, sections: [] }, pageId: 'p1', updatedAt: 'T0' });
  const after = editorReducer(before, { type: 'SELECT', path: null });
  assert.equal(after.selection, null);
});
