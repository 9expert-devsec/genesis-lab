import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists } from '../sourceScan.mjs';

/**
 * The canvas device toggle, now that it tells the truth.
 *
 * ══ THIS FILE WAS REWRITTEN, NOT EXTENDED, AND THAT WAS THE PLAN ═══════════
 *
 * Its previous version guarded a DIFFERENT commit: the one that replaced a
 * false claim ("sections reflow exactly as they will in production") with a
 * caveat, deliberately without fixing anything. It pinned the clamp expression
 * and VIEWPORT_MAXW verbatim, so that the behavioural fix "cannot be smuggled in
 * through" the documentation commit — and it said, in its own docstring, that
 * the docstring guards were "supposed to go red when the claim becomes true
 * again — at which point the honest move is to rewrite them, not to delete
 * them."
 *
 * The claim is true again. This is that rewrite. The tripwire worked: it made
 * this round go and read what the previous one had promised, rather than
 * quietly replacing it.
 *
 * ── WHAT IS GUARDED HERE AND WHAT IS NOT ──────────────────────────────────
 * Source SHAPE only — the wiring the browser measurements depend on. Whether a
 * media query actually re-based is a browser fact, measured in Chrome by
 * scripts/_probe-canvas-frame.mjs; whether the frame document gets styles and
 * the root class is exercised against real DOM in
 * test/pure/canvasFrameDocument.test.mjs. Neither belongs in a text scan.
 */

const TOOLBAR = 'src/components/pageBuilder/editor/CanvasToolbar.jsx';
const PANEL = 'src/components/pageBuilder/editor/CanvasPanel.jsx';
const HOOK = 'src/components/pageBuilder/editor/useCanvasFrame.js';
const RETIRED = 'src/lib/pageBuilder/previewViewportCaveat.js';

test('CONTROL: the files under scan exist and were really read', () => {
  for (const rel of [TOOLBAR, PANEL, HOOK]) {
    assert.ok(sourceExists(rel), `${rel} is missing`);
    assert.ok(readSource(rel).raw.length > 500, `${rel} read as almost nothing`);
  }
});

// ── 1. the caveat module is gone, and nothing reaches for it ────────────────

test('previewViewportCaveat is deleted and unimported', () => {
  /**
   * Its own docstring named itself as the thing to delete once the preview
   * stopped lying: "when the fix lands, this is the thing to delete, along with
   * the toolbar's call to it." Both halves are asserted, because a deleted
   * module with a live import is a build error and a live import of a module
   * that still exists is the fix not having happened.
   */
  assert.equal(sourceExists(RETIRED), false,
    'the caveat module is still on disk. The preview no longer needs a caveat about '
    + 'breakpoints — it has a real viewport.');

  for (const rel of [TOOLBAR, PANEL]) {
    assert.doesNotMatch(readSource(rel).withImports, /previewViewportCaveat/,
      `${rel} still references the retired module`);
  }
});

test('CONTROL: the existence probe answers TRUE for a file that is there', () => {
  // Otherwise "the module is gone" would also be true of a probe that can never
  // find anything, and would sit green over a file that was never removed.
  assert.equal(sourceExists(TOOLBAR), true);
  assert.equal(sourceExists('src/lib/pageBuilder/presets.js'), true);
});

// ── 2. the canvas is portalled into a frame ────────────────────────────────

test('CanvasPanel renders an iframe and portals the canvas into its document', () => {
  const { code, withImports } = readSource(PANEL);

  // IMPORT ASSERTIONS → withImports. The CODE view has import lines removed, so
  // asking it about an import asks about text that is not there.
  assert.match(withImports, /import \{ createPortal \} from 'react-dom'/,
    'the portal import is gone');
  assert.match(withImports, /import \{ useCanvasFrame \} from '\.\/useCanvasFrame'/,
    'the frame hook is no longer used');

  assert.match(code, /<iframe/, 'the canvas is not in a frame');
  assert.match(code, /createPortal\(canvas, frameDoc\.body\)/,
    'the canvas is no longer portalled into the frame document — a second React root '
    + 'or a re-render would break dispatch staying in scope');
});

test('the two handlers stay on the PORTALLED subtree, not on the frame element', () => {
  /**
   * ── THE ONE THING THAT MAKES SELECTION SURVIVE THE BOUNDARY ─────────────
   * react-dom attaches its delegated listener set to a portal's CONTAINER, so
   * handlers on the portalled tree fire inside the frame. Handlers moved onto
   * the <iframe> element in the parent document would receive nothing at all —
   * events inside a frame do not cross into the parent — and the failure is
   * silent: the canvas would simply stop selecting.
   *
   * Measured in Chrome (round 19's probe, re-confirmed this round); pinned here
   * as the shape those measurements assume.
   */
  const { code } = readSource(PANEL);
  const start = code.indexOf('const canvas = (');
  // Bounded from START, not from the file: the empty-state branch has its own
  // earlier return, and slicing to the first one gives an empty string that
  // every match below would then fail against for the wrong reason.
  const canvas = code.slice(start, code.indexOf('return (', start));
  assert.ok(canvas.length > 200, 'the canvas subtree was not located');
  assert.match(canvas, /onClickCapture=\{onClickCapture\}/, 'the select handler left the canvas subtree');
  assert.match(canvas, /onMouseOver=\{onMouseOver\}/, 'the hover handler left the canvas subtree');
  assert.match(canvas, /data-pb-canvas=""/, 'the canvas marker left the subtree');

  const frameEl = code.slice(code.indexOf('<iframe'), code.indexOf('{frameDoc ?'));
  assert.equal(/onClick|onMouseOver/.test(frameEl), false,
    'a handler is on the iframe element. Events inside a frame never reach the parent, '
    + 'so it would fire for nothing.');
});

test('the capture-phase preventDefault survives — it is now the ONLY navigation guard', () => {
  /**
   * The leave guard's listener is on the PARENT document and cannot see a click
   * inside the frame (measured: parentDocumentCaptureSawFrameClick === false).
   * So this preventDefault is the whole of what stops a link in a section from
   * navigating. It used to be belt and braces; it is now the brace.
   */
  const { code } = readSource(PANEL);
  const handler = code.slice(code.indexOf('const onClickCapture'), code.indexOf('const onMouseOver'));
  assert.match(handler, /e\.preventDefault\(\)/, 'the canvas would navigate on a link click');
  assert.match(handler, /e\.stopPropagation\(\)/);
});

// ── 3. the clamp is gone; the width is the frame's ─────────────────────────

test('the device widths are the FRAME width, not an outer max-width', () => {
  const { code } = readSource(PANEL);

  assert.match(code, /export const VIEWPORT_WIDTH = \{ desktop: null, tablet: 768, mobile: 390 \};/,
    'the width map changed shape — the browser measurements were taken against these three');

  assert.equal(/VIEWPORT_MAXW/.test(code), false, 'the old clamp map is still here');
  assert.equal(/maxWidth: clampWidth/.test(code), false,
    'the outer max-width clamp is back. That is the thing that could not drive a media '
    + 'query, which is the whole reason for the frame.');
  assert.match(code, /style=\{\{ width: frameWidth \? `\$\{frameWidth\}px` : '100%' \}\}/,
    'the frame width is applied some other way — a max-width or a class would not set the '
    + "frame's viewport");
});

test('CONTROL: the clamp probe would still catch the expression it replaced', () => {
  // Discrimination. The exact expression the panel carried before this round,
  // run through the same probes — if these stop matching, the assertions above
  // have become guards against nothing and would sit green through a revert.
  const old = "style={clampWidth ? { maxWidth: clampWidth } : undefined}";
  assert.match(old, /maxWidth: clampWidth/);
  assert.match('const VIEWPORT_MAXW = { desktop: null, tablet: 768, mobile: 390 };', /VIEWPORT_MAXW/);
});

// ── 4. no content-driven height, by ruling ─────────────────────────────────

test('the frame is NOT sized to its content', () => {
  /**
   * A decision, not an omission. Sizing a frame to its content feeds the height
   * back into the layout that produced it, and advanced.customHtml lets an
   * author put a viewport-height box inside the very box being measured. The
   * frame is pinned to its column and scrolls itself instead; the second
   * scrollbar is the accepted cost, and a real phone has one too.
   *
   * Asserted across BOTH files so the mechanism cannot arrive in whichever one
   * is not being looked at.
   */
  for (const rel of [PANEL, HOOK]) {
    assert.equal(/ResizeObserver/.test(readSource(rel).code), false,
      `${rel} observes size. If content-height sync is genuinely needed, that is a round `
      + 'with its own verification — not a line added here.');
  }
});

test('CONTROL: the hook DOES use MutationObserver, so the probe is not blind to observers', () => {
  // The ResizeObserver assertion must not be passing because the scanner cannot
  // see observers at all. The hook has two MutationObservers by design.
  const { code } = readSource(HOOK);
  assert.match(code, /new MutationObserver/);
  assert.equal((code.match(/new MutationObserver/g) ?? []).length, 2,
    'the head-sync and root-class observers are not both present');
});

// ── 5. the docstrings say what is true now ─────────────────────────────────

const FALSE_CLAIM = /reflow under real (CSS )?media queries exactly as they will in production/;

test('neither file has re-acquired the old over-claim', () => {
  // SUBJECT IS A COMMENT → read `raw`. The CODE view deletes the sentence under
  // test, so this would pass vacuously against it.
  for (const rel of [TOOLBAR, PANEL]) {
    assert.doesNotMatch(readSource(rel).raw, FALSE_CLAIM, `${rel} over-claims again`);
  }
});

test('CONTROL: the over-claim probe still matches the sentence it was written for', () => {
  const oldToolbar = 'so sections reflow under real CSS media queries exactly as they will in production.';
  assert.match(oldToolbar, FALSE_CLAIM,
    'the probe no longer matches the sentence it exists to catch, and would sit green through a revert');
});

test('both docstrings name the frame and what it does not reproduce', () => {
  const toolbar = readSource(TOOLBAR).raw;
  const panel = readSource(PANEL).raw;
  for (const [rel, src] of [[TOOLBAR, toolbar], [PANEL, panel]]) {
    assert.match(src, /frame|FRAME/, `${rel} does not say the canvas is framed`);
    assert.match(src, /viewport|VIEWPORT/, `${rel} does not say what the breakpoints follow now`);
  }
  // The part that must NOT be lost in the rewrite: this is still ephemeral view
  // state, and the published page is untouched.
  assert.match(toolbar, /Ephemeral view state, never saved/, 'the toolbar lost the ephemeral-state note');
  assert.match(panel, /published page is untouched|presets\.js/,
    'the panel no longer says the published page is unaffected');
});
