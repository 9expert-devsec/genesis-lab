import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE SERVER/CLIENT SEAM for section 7's rich bullets.
 *
 * ══ THE RULING THIS ENFORCES ═══════════════════════════════════════════════
 * `sanitizeTopicHtml` MUST NOT reach the client bundle. It pulls
 * `sanitize-html`, and `topicRichState` pulls `parse5` through `topicHtml`.
 * Neither has any business being shipped to a browser to re-sanitise stored
 * content on every page view.
 *
 * `CourseOutline` is a CLIENT component and cannot stop being one — it owns the
 * accordion's open/closed state. So the sanitising happens in
 * lib/courses/courseOutlineView, called from `CourseDetail`, which is a SERVER
 * component in page.jsx that already holds `extension`.
 *
 * ── WHAT A SOURCE GUARD CAN AND CANNOT SAY ─────────────────────────────────
 * It cannot inspect a webpack bundle. What it CAN establish is the precondition
 * that decides the bundle: a `'use client'` module's import graph is what gets
 * shipped, so "the client component does not import the sanitiser, directly or
 * through the view module" is the checkable form of the ruling.
 *
 * Every read is `.code` / `.withImports` through sourceScan — both files
 * discuss parse5, sanitize-html and the seam by name in prose, so a raw-text
 * scan would match the explanation instead of the code.
 */

const CLIENT = 'src/app/(public)/[...slug]/_components/CourseOutline.jsx';
const VIEW = 'src/lib/courses/courseOutlineView.js';
const PAGE = 'src/app/(public)/[...slug]/page.jsx';

test('CourseOutline is still a client component', () => {
  // The whole seam exists because of this. If it ever became a server
  // component the indirection would be unnecessary — and the reader should be
  // told that rather than left to wonder why the prop exists.
  const { raw } = readSource(CLIENT);
  assert.match(raw.slice(0, 40), /^['"]use client['"]/, 'CourseOutline lost its use-client directive');
});

test('the CLIENT component imports NO sanitiser and NO parser, directly or transitively', () => {
  /**
   * Read WITH imports: a "does not import" guard read from import-stripped
   * source passes vacuously, which is defect 5 in sourceScan's header.
   *
   * `courseOutlineView` is on the list because importing IT would pull the
   * whole chain — that is the transitive route, and it is the one a future edit
   * would most plausibly take ("just call the helper from the component").
   */
  const { withImports } = readSource(CLIENT);
  for (const forbidden of [
    'sanitizeTopicHtml',
    'sanitize-html',
    'parse5',
    'courses/topicHtml',
    'courses/topicRichState',
    'courses/courseOutlineView',
  ]) {
    assert.ok(
      !withImports.includes(forbidden),
      `CourseOutline.jsx pulls "${forbidden}" into the CLIENT bundle — the ruling `
      + 'is that sanitisation happens server-side; the component must receive '
      + 'already-clean HTML as a prop',
    );
  }
});

test('CONTROL: that reader really can see this file\'s imports', () => {
  // Proves the six assertions above are not passing because the read came back
  // empty. The imports CourseOutline legitimately has must be visible.
  const { withImports } = readSource(CLIENT);
  assert.ok(withImports.includes("from 'react'"), 'the reader found no imports at all');
  assert.ok(withImports.includes('@/lib/utils'), 'the cn import is not visible');
  assert.ok(withImports.includes('./ContentSection'), 'the ContentSection import is not visible');
});

test('the SERVER view module is the one that sanitises', () => {
  const { withImports, code } = readSource(VIEW);
  assert.ok(withImports.includes('sanitizeTopicHtml'), 'the view module stopped importing the sanitiser');
  assert.ok(withImports.includes('resolveTopicRich'), 'the view module stopped importing the decision function');
  assert.match(
    code, /sanitizeTopicHtml\(/,
    'the sanitiser is imported but never CALLED — an import alone cleans nothing',
  );
});

test('the view module has no client directive — it must stay server-only', () => {
  const { raw } = readSource(VIEW);
  assert.ok(!/^['"]use client['"]/.test(raw.trim()), 'the view module was marked use-client');
});

test('the page wires the prepared prop into the client component', () => {
  /**
   * The seam only exists if it is actually used. Without this the view module
   * could be perfect and unreferenced, and every course would render plain
   * forever with nothing saying why.
   */
  const { code, withImports } = readSource(PAGE);
  assert.ok(withImports.includes('courses/courseOutlineView'), 'page.jsx does not import the prep');
  assert.match(
    code, /richHtml=\{prepareOutlineRichHtml\(\{ course, extension \}\)\}/,
    'CourseOutline is not being given the server-prepared HTML',
  );
});

test('the page passing it is a SERVER component', () => {
  // If page.jsx ever gained a use-client directive, the prep would run in the
  // browser and the ruling would be silently violated with every guard above
  // still green.
  const { raw } = readSource(PAGE);
  assert.ok(!/^['"]use client['"]/.test(raw.trim()), 'page.jsx became a client component');
});

// ── the plain path must not become an HTML path ────────────────────────────

test('the plain path renders through React escaping, not dangerouslySetInnerHTML', () => {
  /**
   * `List<mailmessage>` (UIPATH) is the row that makes this load-bearing: the
   * only angle bracket in 4,443 measured values, and not markup. Escaped it
   * reads correctly; routed through innerHTML the browser eats it as an unknown
   * element and the text disappears.
   *
   * Anchored on the plain path's own markup rather than on a count of
   * dangerouslySetInnerHTML, because the rich path legitimately has one.
   */
  const { code } = readSource(CLIENT);
  assert.match(
    code, /<span>\{bullet\}<\/span>/,
    'the plain path stopped rendering its bullet as an escaped React child',
  );
  assert.equal(
    (code.match(/dangerouslySetInnerHTML/g) || []).length, 1,
    'CourseOutline has more than one dangerouslySetInnerHTML — the plain path '
    + 'must never be routed through innerHTML',
  );
});

test('the rich wrapper is scoped, so its list markers cannot leak', () => {
  /**
   * This page also renders admin-authored HTML — CourseRoadmap's SVG and the
   * FAQ accordion's `prose` answers. A bare `ul li::before` rule would repaint
   * both, and the FAQ answers are the ones an admin would notice.
   */
  const { code } = readSource(CLIENT);
  assert.match(code, /className="topic-rich/, 'the rich wrapper lost its scoping class');

  const css = readSource('src/app/globals.css').raw;
  const block = css.slice(css.indexOf('.topic-rich'));
  const selectors = [...block.matchAll(/^(\.[^\s{,]+[^{]*)\{/gm)].map((m) => m[1].trim());
  assert.ok(selectors.length >= 5, `only ${selectors.length} .topic-rich rules found`);
  for (const sel of selectors) {
    assert.ok(
      sel.startsWith('.topic-rich'),
      `a rule in the topic-rich block is not scoped to it: "${sel}" — it would `
      + 'repaint the FAQ answers and the roadmap on the same page',
    );
  }
});

test('CONTROL: the CSS block exists and defines three distinct depth markers', () => {
  // Guards the scoping sweep above from passing because it found no rules, and
  // pins that all three levels actually get a marker — the cap is 3 and
  // clampDepth lifts anything deeper, so a 4th is unreachable by construction.
  const css = readSource('src/app/globals.css').raw;
  assert.ok(css.includes('.topic-rich'), 'the scoped block is gone');
  const markers = [...css.matchAll(/\.topic-rich[^{]*::before\s*\{[^}]*content:\s*'([^']+)'/g)]
    .map((m) => m[1]);
  assert.equal(new Set(markers).size, 3, `expected 3 distinct depth markers, got ${JSON.stringify(markers)}`);
});

// ── no ceiling may come back on this path ──────────────────────────────────

test('the reveal still has NO fixed max-height ceiling', () => {
  /**
   * 11e460d replaced a max-h-[800px] ceiling that was clipping content
   * mid-line. Nested content is TALLER than flat content, so a ceiling
   * reintroduced now would clip sooner and on more courses. Asserted here as
   * well as in revealCeilings because this is the round that makes the panels
   * grow.
   */
  const { code } = readSource(CLIENT);
  const ceilings = [...code.matchAll(/max-h-\[[^\]]+\]|max-h-(?:\d+|full|screen|min|max|fit)/g)]
    .map((m) => m[0]);
  assert.deepEqual(ceilings, [], `a max-height ceiling is back: ${ceilings.join(', ')}`);
  assert.ok(code.includes('grid-rows-[0fr]'), 'the grid-track reveal is gone');
});
