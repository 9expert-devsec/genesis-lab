import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, declarationsFor } from '../twCompile.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 73 — THE MOBILE SIDE INSET, AND THE DESKTOP VALUE IT MUST NOT MOVE.
 *
 * ── IT REPLACES test/fs/mobilePaddingBaseline, WHICH FIRED AS DESIGNED ─────
 * That file was round 72's self-retiring tripwire: it pinned `px-4` as the
 * single source of the per-level compounding and said, in its own header, that
 * when the class changed the correct response was to DELETE it rather than
 * update the expectation. Round 73 changed the class, so it is gone and this
 * takes over the job — with the difference that this one pins BOTH halves of a
 * responsive value, which is the thing that can now go wrong.
 *
 * highlight_grid's box is the OTHER half of round 73 and is asserted here too,
 * from the commit that changes it.
 *
 * ── WHY THE COMPILED CSS AND NOT JUST THE CLASS STRING ────────────────────
 * `px-2 md:px-4` in the markup is a STRING. Whether the stylesheet turns it
 * into 8px below 768px and 16px above is a different question, and the only
 * thing that can answer it is compiling Tailwind and looking — the defect
 * test/fs/tailwindArbitraryValueRules exists for. This round tells an author a
 * distance changed on their phone and not on their desktop, so both numbers
 * have to be real.
 *
 * ── COMPILED AT MODULE SCOPE ──────────────────────────────────────────────
 * Not in a test the others read: round 71 measured that the suite runs every
 * file in one process (isolation:'none'), so a sync test does not wait for an
 * async sibling to fill a module-level `let`. Top-level await removes the
 * ordering question instead of answering it.
 */

const RENDERER = 'src/components/pageBuilder/SectionRenderer.jsx';

const CSS = await compile([{ raw: 'px-2 md:px-4 px-4', extension: 'html' }]);

// ── 1. THE SHELL'S INSET ───────────────────────────────────────────────────

test('the section wrapper carries the mobile inset and the desktop one, and nothing else', () => {
  /**
   * Source is read COMMENT-STRIPPED — this file's own header and the
   * component's spell these classes out in prose, and a raw scan would count
   * them and fail against a correct file (defect 1/2 in sourceScan's header).
   */
  const { code } = readSource(RENDERER);
  const body = code.slice(code.indexOf('export function SectionRenderer'));
  const horizontal = [...body.matchAll(/(?<![\w-])((?:md:)?px-\d+(?:\.\d+)?|(?:md:)?px-\[[^\]]+\])(?![\w-])/g)]
    .map((m) => m[1]);

  assert.deepEqual(horizontal, ['px-2', 'md:px-4'],
    'the section wrapper\'s horizontal inset moved. It is the SINGLE source of the per-level '
    + 'compounding docs/mobile-padding.md §D measured, so any change here restates that '
    + 'document\'s §B table — re-run scripts/_measure-round73-padding-change.mjs and update it.');
});

test('those two classes compile to 8px on mobile and 16px from md up', () => {
  assert.deepEqual(declarationsFor(CSS, 'px-2'), ['padding-left: 0.5rem', 'padding-right: 0.5rem']);
  assert.deepEqual(declarationsFor(CSS, 'md:px-4'), ['padding-left: 1rem', 'padding-right: 1rem']);
});

test('CONTROL: the desktop value is UNCHANGED from what shipped before round 73', () => {
  /**
   * This round is a mobile-only reduction. The failure it is guarding against
   * is a change that also moves desktop — which would silently reflow every
   * published page at every width rather than only on a phone.
   *
   * `md:px-4` compiling to the same 1rem that the bare `px-4` compiled to is
   * the whole claim, so both are compiled and compared rather than asserted.
   */
  assert.deepEqual(declarationsFor(CSS, 'md:px-4'), declarationsFor(CSS, 'px-4'),
    'the desktop inset is no longer the 1rem that shipped before round 73');
  assert.notDeepEqual(declarationsFor(CSS, 'px-2'), declarationsFor(CSS, 'px-4'),
    'mobile and desktop compile to the SAME distance, so this round changed nothing — the '
    + 'assertions above would pass on a no-op');
});

test('CONTROL: md: is the author\'s own tablet button, not an invented breakpoint', () => {
  // Round 65's rule. 768px is VIEWPORT_WIDTH.tablet in CanvasPanel, so the two
  // sizes land on buttons the author already has.
  const { code } = readSource('src/components/pageBuilder/editor/CanvasPanel.jsx');
  assert.match(code, /VIEWPORT_WIDTH = \{[^}]*tablet:\s*768/,
    'CanvasPanel\'s tablet viewport is no longer 768px, so md: no longer matches the button the '
    + 'author uses to check this — pick the breakpoint that does, or say why not');
  assert.match(CSS, /@media\s*\(min-width:\s*768px\)/,
    'md: does not compile to a 768px min-width in this config');
});

// ── 3. WHAT THIS ROUND DID NOT TOUCH (§F) ──────────────────────────────────

test('card_grid and two_column keep their gutters — neither compounds at mobile', () => {
  /**
   * Round 72 §A measured that every grid gutter is INERT at 390px: COLUMNS_CLASS
   * collapses to one column below `sm` and RATIO_CLASS below `lg`, so nothing
   * splits on a phone and no gap costs horizontal space. They were therefore
   * out of scope, and that is pinned so a later round has to make the argument
   * rather than let the exclusion erode.
   */
  const src = (t) => readSource(`src/components/pageBuilder/sections/${t}.jsx`).code;
  assert.match(src('card_grid'), /'grid gap-6'/, 'card_grid gutter moved');
  assert.match(src('two_column'), /'grid grid-cols-1 gap-8'/, 'two_column between-columns gap moved');
  assert.equal((src('two_column').match(/flex flex-col gap-6/g) ?? []).length, 2,
    'two_column no longer has exactly two inside-column stacks at gap-6');
  for (const t of ['card_grid', 'two_column']) {
    assert.equal(/(?<![\w-])(?:md:)?p[xlr]?-\d/.test(src(t)), false,
      `${t} gained a padding — round 73 was a shell + highlight_grid change and nothing else`);
  }
});
