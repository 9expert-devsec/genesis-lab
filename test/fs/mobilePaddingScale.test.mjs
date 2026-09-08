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
const HIGHLIGHT = 'src/components/pageBuilder/sections/highlight_grid.jsx';

const CSS = await compile([{ raw: 'px-2 md:px-4 px-4 p-4 md:p-6 p-6', extension: 'html' }]);

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

// ── 2. highlight_grid's BOX ────────────────────────────────────────────────

test('the highlight_grid box carries the mobile padding and the desktop one', () => {
  const { code } = readSource(HIGHLIGHT);
  const box = /className="([^"]*rounded-9e-lg[^"]*)"/.exec(code);
  assert.ok(box, 'the per-child box is gone from highlight_grid');

  const pads = box[1].split(/\s+/).filter((c) => /^(?:md:)?p-\d+$/.test(c));
  assert.deepEqual(pads, ['p-4', 'md:p-6'],
    'highlight_grid\'s box padding moved. docs/mobile-padding.md §D measured it as the ONLY '
    + 'layer that compounds beyond the shell inset, at 24px a side before this round.');
});

test('those compile to 16px on mobile and 24px from md up', () => {
  assert.deepEqual(declarationsFor(CSS, 'p-4'), ['padding: 1rem']);
  assert.deepEqual(declarationsFor(CSS, 'md:p-6'), ['padding: 1.5rem']);
});

test('CONTROL: highlight_grid\'s desktop padding is UNCHANGED from before round 73', () => {
  assert.deepEqual(declarationsFor(CSS, 'md:p-6'), declarationsFor(CSS, 'p-6'),
    'the desktop box padding is no longer the 1.5rem that shipped before round 73');
  assert.notDeepEqual(declarationsFor(CSS, 'p-4'), declarationsFor(CSS, 'p-6'),
    'mobile and desktop compile to the same padding, so this round changed nothing');
});

/**
 * ROUND 78 REPLACED THIS TEST'S SUBJECT, AND THE REPLACEMENT IS THE POINT.
 *
 * It used to assert that `border-l-4` and `border-l-[color:var(--pb-accent-fill)]`
 * SURVIVED — round 73 added it so a later spacing change could not remove the
 * accent bar as a side effect. Round 78 removed the bar deliberately, by name,
 * which is exactly the case that guard was written to distinguish from an
 * accident. So the assertion is INVERTED rather than deleted: the bar must now
 * be ABSENT, and everything round 24/70/73 built around it must still be here.
 *
 * Deleting it instead would leave nothing watching this box, and the next
 * spacing change could quietly restore or re-remove any of these.
 */
test('the accent bar is GONE, and nothing else about the box moved', () => {
  const { code } = readSource(HIGHLIGHT);
  const box = /className="([^"]*rounded-9e-lg[^"]*)"/.exec(code)[1];
  const classes = box.split(/\s+/);

  for (const gone of ['border-l-4', 'border-l-[color:var(--pb-accent-fill)]']) {
    assert.equal(classes.includes(gone), false,
      `round 78 removed the accent bar, but the box still carries ${gone}`);
  }
  // The whole class attribute, not just the split list — a variant spelling
  // (`md:border-l-4`, `border-l-[…]`) would slip past the list check.
  assert.equal(/border-l/.test(box), false,
    `the box still carries a left-border class: ${box}`);

  // What round 24/70/73 built around it, all of which stays.
  for (const cls of ['border', 'border-[var(--surface-border)]', 'rounded-9e-lg', 'p-4', 'md:p-6']) {
    assert.ok(classes.includes(cls), `the box lost ${cls}`);
  }
  // …and it must still stretch its child, which is round 70's half of this box.
  assert.ok(classes.includes('grid'),
    'the box stopped being a single-cell grid — round 70 made it one so its child fills the row');
});

test('CONTROL: the assertion above names the bar, so restoring it fails', () => {
  /**
   * A test that only checks for ABSENCE passes trivially against an empty
   * string, a renamed component, or a regex that stopped matching. This feeds
   * the pre-round-78 class attribute through the same checks and requires them
   * to fail — so a green above means the bar is gone, not that the test is.
   */
  const restored = 'grid rounded-9e-lg border border-[var(--surface-border)] '
    + 'border-l-4 border-l-[color:var(--pb-accent-fill)] bg-9e-ice/50 p-4 md:p-6 dark:bg-[#0D1B2A]/40';
  assert.ok(/border-l/.test(restored),
    'the control string no longer contains a left border — it has stopped being a control');
  assert.ok(restored.split(/\s+/).includes('border-l-4'));
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

  const PADDING = /(?<![\w-])(?:md:)?p[xlr]?-\d/;
  assert.equal(PADDING.test(src('two_column')), false,
    'two_column gained a padding — round 73 was a shell + highlight_grid change and nothing else');

  /**
   * ── ROUND E NARROWED THIS FOR card_grid, AND MADE THE ARGUMENT ─────────
   * The blanket check above used to cover `card_grid` too. It fired this round,
   * which is the guard working: round 73 pinned the exclusion "so a later round
   * has to make the argument rather than let the exclusion erode", and round E
   * is that round.
   *
   * THE ARGUMENT. What round 73 was protecting is card_grid's own LAYOUT
   * wrapper — the element that lays the grid out — from silently acquiring
   * padding as a side effect of a spacing change. That element is untouched and
   * is still asserted above at `'grid gap-6'`, with no padding of any kind.
   *
   * What round E added is an OPT-IN per-item box (`layout.itemFrame:
   * 'bordered'`), absent by default, whose padding is `highlight_grid`'s
   * `p-4 md:p-6` copied verbatim — round 73's OWN scale, at round 73's own
   * breakpoint. So this is not a new padding decision reaching card_grid; it is
   * round 73's padding travelling with the box it has always belonged to.
   *
   * The check is therefore narrowed, not dropped: card_grid may hold padding
   * inside THAT ONE STRING and nowhere else, and the string must still be the
   * one highlight_grid uses.
   */
  const cardGrid = src('card_grid');
  const BOX_STRING = /["'`]([^"'`]*\bbg-9e-ice\/50\b[^"'`]*)["'`]/;
  const box = BOX_STRING.exec(cardGrid);
  assert.notEqual(box, null,
    'card_grid no longer holds the item-frame box — if the option was removed, restore the blanket padding check');
  assert.match(box[1], /(?<![\w-])p-4 md:p-6(?![\w-])/,
    'the item-frame box no longer carries round 73 own p-4 md:p-6 scale');
  assert.equal(PADDING.test(cardGrid.replace(box[1], '')), false,
    'card_grid gained a padding OUTSIDE the opt-in item-frame box — that is the thing round 73 pinned');
  // …and the box is still highlight_grid's, not a scale invented here.
  const hg = BOX_STRING.exec(src('highlight_grid'));
  assert.notEqual(hg, null, 'highlight_grid no longer holds the box this one was copied from');
  assert.equal(box[1], hg[1],
    'the two copies of the item-frame box have drifted apart');
});
