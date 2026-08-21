import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists } from '../sourceScan.mjs';

/**
 * THE TWO SEAMS test/pure/previewViewportCaveat.test.mjs CANNOT REACH.
 *
 *   1. THAT THE TOOLBAR ACTUALLY ASKS. A perfect predicate nobody calls leaves
 *      the control lying exactly as before.
 *   2. THAT THE DOCSTRINGS STOPPED CLAIMING THE FALSE THING. The subject there
 *      IS a comment, so it can only be read from `raw` — and that is the one
 *      exception to this suite's strip-comments rule (see run.mjs).
 *
 * Both are shape guards on a client component, stated as such.
 *
 * ── WHAT THIS COMMIT DELIBERATELY DOES NOT ASSERT ─────────────────────────
 * Nothing here touches how the preview BEHAVES. The clamp is still a clamp and
 * VISIBILITY_CLASS is untouched; making the preview real is a later round. These
 * guards are written so they survive that round without modification EXCEPT the
 * docstring ones, which are supposed to go red when the claim becomes true again
 * — at which point the honest move is to rewrite them, not to delete them.
 */

const TOOLBAR = 'src/components/pageBuilder/editor/CanvasToolbar.jsx';
const PANEL = 'src/components/pageBuilder/editor/CanvasPanel.jsx';
const PURE = 'src/lib/pageBuilder/previewViewportCaveat.js';

test('CONTROL: the files under scan exist and were really read', () => {
  for (const rel of [TOOLBAR, PANEL, PURE]) {
    assert.ok(sourceExists(rel), `${rel} is missing`);
    assert.ok(readSource(rel).raw.length > 500, `${rel} read as almost nothing`);
  }
});

// ── 1. the toolbar imports the pure module AND calls it ─────────────────────

test('CanvasToolbar imports previewViewportCaveat', () => {
  // IMPORT ASSERTION → withImports. The CODE view has every import line removed,
  // so asking it about an import is asking about text that is not there.
  const { withImports } = readSource(TOOLBAR);
  assert.match(
    withImports,
    /import \{ previewViewportCaveat \} from '@\/lib\/pageBuilder\/previewViewportCaveat'/,
    'CanvasToolbar no longer imports the caveat module',
  );
});

test('CONTROL: that import is invisible to the CODE view', () => {
  // The precondition the standing rule requires: prove `code` really has been
  // stripped, so the assertion above cannot quietly be switched to `code` and
  // keep passing on nothing.
  const { code } = readSource(TOOLBAR);
  assert.doesNotMatch(code, /from '@\/lib\/pageBuilder\/previewViewportCaveat'/,
    'the CODE view still contains import lines — the withImports assertion above '
    + 'is no longer distinguishable from a code-view one');
  // …and the identifier IS still visible there, which is what makes the call
  // assertion below meaningful rather than a second reading of the import.
  assert.match(code, /previewViewportCaveat/);
});

test('CanvasToolbar CALLS it, on the live viewport, and renders what it returns', () => {
  const { code } = readSource(TOOLBAR);
  assert.match(code, /previewViewportCaveat\(previewViewport\)/,
    'the caveat is no longer computed from the live previewViewport');
  assert.match(code, /\{caveat && \(/, 'the returned copy is no longer conditionally rendered');
  assert.match(code, /<span>\{caveat\}<\/span>/,
    'the caveat is no longer rendered as visible text');
});

test('the caveat is VISIBLE text, not a title attribute', () => {
  const { code } = readSource(TOOLBAR);
  // The whole point of the UI half of this round. A tooltip does not answer a
  // control that appears to promise a device preview.
  assert.doesNotMatch(code, /title=\{caveat\}/,
    'the caveat became a tooltip — it has to be readable without hovering');
});

test('CONTROL: the call probe rejects an import-only file', () => {
  // Defect 5 in sourceScan.mjs: `import { x }` satisfies a plain includes('x').
  // Shown here to be distinguishable from a real call site.
  const importOnly = "import { previewViewportCaveat } from '@/lib/pageBuilder/previewViewportCaveat';";
  assert.doesNotMatch(importOnly, /previewViewportCaveat\(previewViewport\)/);
  assert.match("const caveat = previewViewportCaveat(previewViewport);", /previewViewportCaveat\(previewViewport\)/);
});

// ── 2. neither file still claims production-accurate reflow ─────────────────

const FALSE_CLAIM = /reflow under real (CSS )?media queries exactly as they will in production/;

test('the false claim is gone from BOTH docstrings', () => {
  // SUBJECT IS A COMMENT → read `raw`. Reading `code` here would pass vacuously
  // on any file, because the scrubber deletes the sentence under test.
  for (const rel of [TOOLBAR, PANEL]) {
    assert.doesNotMatch(readSource(rel).raw, FALSE_CLAIM,
      `${rel} still says sections reflow exactly as in production. They do not: the `
      + 'clamp is an outer max-width and Tailwind breakpoints are viewport media queries');
  }
});

test('CONTROL: the false-claim probe would still catch the old sentence', () => {
  // Discrimination. The exact wording that was in both files before this round,
  // put through the same regex — if this stops matching, the guard above has
  // become a guard against nothing and would sit green through a revert.
  const oldToolbar = 'so sections reflow under real CSS media queries exactly as they will in production.';
  const oldPanel = 'the real render inside reflows under real media queries at that width, exactly as it will in production.';
  assert.match(oldToolbar, FALSE_CLAIM, 'the probe no longer matches the toolbar sentence it was written for');
  // The panel's wording differs; pinned separately rather than pretending one
  // regex covers both.
  assert.match(oldPanel, /reflows under real media queries at that width, exactly as it will in production/);
  assert.doesNotMatch(readSource(PANEL).raw, /exactly as it will in production/,
    'CanvasPanel still carries its own version of the claim');
});

test('both docstrings state what IS true instead', () => {
  const toolbar = readSource(TOOLBAR).raw;
  const panel = readSource(PANEL).raw;
  // The parts that were always true and must survive: one real render, not an
  // iframe, ephemeral state.
  assert.match(toolbar, /NOT an iframe, NOT a re-render/, 'the toolbar lost the true part');
  assert.match(toolbar, /Ephemeral view state, never saved/, 'the toolbar lost the ephemeral-state note');
  assert.match(panel, /NOT an\s+\* *iframe|NOT an iframe/, 'the panel lost the true part');
  // …and the correction: breakpoints follow the window, visibility inverts.
  for (const [rel, src] of [[TOOLBAR, toolbar], [PANEL, panel]]) {
    assert.match(src, /invert|INVERT/, `${rel} does not mention that visibility inverts`);
    assert.match(src, /viewport|VIEWPORT|window/, `${rel} does not say what the breakpoints follow`);
  }
});

// ── 3. this commit changed no behaviour ─────────────────────────────────────

test('the clamp itself is untouched — this commit is documentation plus a caveat', () => {
  const { code } = readSource(PANEL);
  assert.match(code, /const VIEWPORT_MAXW = \{ desktop: null, tablet: 768, mobile: 390 \};/,
    'VIEWPORT_MAXW changed. The behavioural fix is a separate round on purpose; '
    + 'this commit has to survive without it and must not smuggle it in');
  assert.match(code, /style=\{clampWidth \? \{ maxWidth: clampWidth \} : undefined\}/,
    'the clamp is applied differently now — see above');
});

test('CONTROL: presets.js still carries the classes the caveat describes', () => {
  // The caveat's copy is only correct while these are viewport-breakpoint
  // classes. If VISIBILITY_CLASS ever stops using md:, the caveat is describing
  // something that no longer happens and must be rewritten with the fix.
  const presets = readSource('src/lib/pageBuilder/presets.js').code;
  assert.match(presets, /hidden md:block/, 'desktop_only is no longer a md: breakpoint class');
  assert.match(presets, /block md:hidden/, 'mobile_only is no longer a md: breakpoint class');
  assert.match(presets, /sm:grid-cols-2 lg:grid-cols-3/, 'the 3-column preset changed shape');
});
