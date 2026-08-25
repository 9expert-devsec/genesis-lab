import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { SectionPickerBody } from '@/components/pageBuilder/editor/SectionPicker';
import { compile, declarationsFor, escapeClass } from '../twCompile.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * ── ROUND 10: THE PICKER "SHRINKS" WHEN A FILTER NARROWS THE LIST ──────────
 *
 * WHAT WAS ACTUALLY WRONG, MEASURED RATHER THAN REASONED. Headless Chrome,
 * viewport 1400x600, the same component in two filter states:
 *
 *                       ทั้งหมด (27)   การ์ด (5)
 *     outer width          832px         832px     ← never moved
 *     clientWidth          815px         830px     ← moved, by 15px
 *     grid columns       189.75px      193.50px
 *     search box           783px         798px
 *
 * The border box is rock solid. What changes is the CONTENT box: 27 types
 * overflow `max-h-[calc(100dvh-4rem)]`, `overflow-y-auto` puts a classic
 * scrollbar inside the border, and 15px of usable width disappears. Filter down
 * to 5 and it comes back. Every card and the search field resize with it, which
 * is why a screenshot comparison reads as "the dialog is wider" — the part a
 * reader looks at genuinely is.
 *
 * ── WHAT WAS *NOT* WRONG, AND IS THEREFORE NOT TESTED AS IF IT WERE ────────
 * The round's brief offered three candidate mechanisms. All three were checked
 * and all three were innocent, so none of them gets a test pretending it was
 * the fix:
 *   - shrink-to-fit: there is no `w-fit`/`max-w-fit`/intrinsic sizing anywhere
 *     on the shell. `width` is a definite `min(52rem, calc(100vw - 2rem))`.
 *   - `auto-fit`/`auto-fill`: the grid never used them.
 *   - a `min-w-0` shrink wrapper between Content and the grid: there is none.
 *
 * The grid template IS pinned below, but honestly labelled: it is the mechanism
 * that ALREADY held width correctly (fixed tracks reserve their width with
 * fewer items to place — measured: four 193.5px columns for five cards), not
 * the thing that broke. It is worth a guard because switching it to `auto-fit`
 * would introduce exactly the defect that was reported.
 *
 * ── WHAT THIS TIER CANNOT DO ───────────────────────────────────────────────
 * jsdom has NO layout engine: `offsetWidth` is 0 for everything, always. Not
 * one assertion in this file measures a pixel, and none of them would have
 * caught the original defect on its own — the markup was correct throughout and
 * so was every class string. The defect lived in the rendered box model.
 *
 * The real confirmation was a headless-Chrome measurement over the dev server's
 * OWN compiled stylesheet, before and after, across fifteen viewport sizes; the
 * numbers above are from it. What this file can do is guard the two things that
 * are mechanically checkable and whose loss would bring the defect back: that
 * the classes involved COMPILE TO REAL RULES, and that nothing about them
 * varies with filter state.
 */

const SRC = 'src/components/pageBuilder/editor/SectionPicker.jsx';

function bodyDoc({ query = '', activeGroup = 'all', canUseAdvanced = true } = {}) {
  return new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(SectionPickerBody, {
    query, activeGroup, canUseAdvanced,
    onQueryChange: () => {}, onGroupChange: () => {}, onPick: () => {},
  }))}</body>`).window.document;
}

/** The four filter states the defect report compared, plus the empty one. */
const STATES = [
  { label: 'ทั้งหมด, 27 types', props: {} },
  { label: 'การ์ด pill, 5 types', props: { activeGroup: 'card' } },
  { label: 'search → 1 type', props: { query: 'ไทม์ไลน์' } },
  { label: 'search → 0 types', props: { query: 'zzzzไม่มีzzzz' } },
  { label: 'non-developer', props: { canUseAdvanced: false } },
];

// ── 0. the instrument this file depends on ─────────────────────────────────

test('escapeClass escapes a comma the way Tailwind writes it, as \\2c and a space', () => {
  /**
   * Round 10 found this returning nothing for `w-[min(52rem,calc(…))]` and
   * nearly shipped "the width class compiles to nothing" as the diagnosis. It
   * compiles fine; the LOOKUP was broken. Every compile assertion below would
   * be vacuous without this, so it is asserted before they run.
   */
  assert.equal(
    escapeClass('w-[min(52rem,calc(100vw-2rem))]'),
    'w-\\[min\\(52rem\\2c calc\\(100vw-2rem\\)\\)\\]',
  );
});

test('CONTROL: the comma escape is what finds the rule — the un-escaped form finds nothing', async () => {
  // Discrimination, not existence: the same CSS, looked up two ways, must come
  // out opposite. If both found the rule, the escape would be doing nothing and
  // this file's compile assertions would prove nothing about commas.
  const css = await compile([SRC]);
  const CLASS = 'w-[min(52rem,calc(100vw-2rem))]';

  assert.ok(declarationsFor(css, CLASS).length > 0, 'the corrected lookup still finds nothing');

  const naive = `.${CLASS.replace(/[:[\]()./%#]/g, (c) => `\\${c}`)}`; // the pre-fix escaping
  assert.equal(css.includes(naive), false,
    'the pre-fix (comma-unescaped) selector is present in the CSS, so the bug this '
    + 'guards was never real and the escape above is unnecessary');
});

// ── 1. every class the shell's sizing depends on emits a REAL rule ─────────

test('the shell’s width, height and scroll classes all compile from the real source file', async () => {
  /**
   * The failure this catches is the one the round nearly diagnosed and that
   * this repo has already been bitten by once (see the `grid-cols-[22%_…]` note
   * in test/fs/tailwindArbitraryValueRules): an arbitrary value that is a
   * perfect literal in the JSX, passes every shape check, reaches the element —
   * and compiles to NOTHING, so the property silently falls back. For `width`
   * that fallback is `auto`, and `auto` on a fixed-position box IS
   * shrink-to-fit — the exact defect that was reported, arriving by a different
   * road. Exact declarations, not "some rule exists".
   */
  const css = await compile([SRC]);
  const expected = {
    'w-[min(52rem,calc(100vw-2rem))]': 'width: min(52rem, calc(100vw - 2rem))',
    // Round 12 replaced the max-height/min-height PAIR with one fixed height.
    'h-[min(47rem,calc(100dvh-4rem))]': 'height: min(47rem, calc(100dvh - 4rem))',
    'overflow-y-auto':                 'overflow-y: auto',
    '[scrollbar-gutter:stable]':       'scrollbar-gutter: stable',
  };
  for (const [className, decl] of Object.entries(expected)) {
    assert.deepEqual(declarationsFor(css, className), [decl],
      `${className} does not compile to exactly "${decl}". A sizing class that emits no rule `
      + 'leaves the property at its initial value, and for width that is shrink-to-fit.');
  }
});

test('CONTROL: a class NOT in the source compiles to nothing, so the check above is discriminating', async () => {
  const css = await compile([SRC]);
  assert.deepEqual(declarationsFor(css, 'w-[min(99rem,calc(100vw-2rem))]'), []);
  assert.deepEqual(declarationsFor(css, '[scrollbar-gutter:both-edges]'), []);
});

// ── 2. the fix itself ──────────────────────────────────────────────────────

test('the scroll container reserves its scrollbar gutter unconditionally', () => {
  /**
   * THE ACTUAL FIX. `scrollbar-gutter: stable` reserves the gutter whether or
   * not a scrollbar occupies it, so the content column is the same width in
   * every filter state. Measured after: clientWidth 815px in BOTH states, at
   * every one of fifteen viewport sizes.
   *
   * Pinned as a pair — the gutter must sit on the SAME element that scrolls.
   * Reserving a gutter on a box that does not scroll does nothing, and the
   * defect would come back with both classes still present in the file.
   */
  const code = readSource(SRC).code;
  const shell = code.slice(code.indexOf('<Dialog.Content'), code.indexOf('</Dialog.Content>'));
  assert.ok(shell.length > 100, 'the Dialog.Content block was not located');
  assert.match(shell, /overflow-y-auto/, 'the shell no longer scrolls');
  assert.match(shell, /\[scrollbar-gutter:stable\]/,
    'the scrollbar gutter is no longer reserved. When the type list is long enough to '
    + 'overflow max-h, the scrollbar takes 15px from the content box and every card and '
    + 'the search field narrow with it — which is the round-10 defect, verbatim.');
  // They are in the SAME class string, so one cannot drift onto another element.
  const line = shell.split('\n').find((l) => l.includes('[scrollbar-gutter:stable]'));
  assert.match(line, /overflow-y-auto/,
    'the gutter and the overflow that needs it have been split onto different elements');
});

test('the width declaration is a static literal — it cannot vary with filter state', () => {
  /**
   * ── WHAT THIS SUBSTITUTES FOR, AND WHY ─────────────────────────────────
   * The brief asks for the shell's width class to be asserted IDENTICAL in the
   * RENDERED output across filter states. That render does not exist:
   * Dialog.Content sits inside a Radix Dialog.Portal, which emits nothing under
   * renderToStaticMarkup (rounds 5/6). Asserting equality between two empty
   * strings would pass while proving nothing at all.
   *
   * The claim is therefore made one step upstream, where it is actually
   * decidable: the className is a literal argument list to cn() with no
   * interpolation and no reference to either piece of filter state, so there is
   * no expression through which a filter COULD reach it. That is a stronger
   * statement than "the two renders matched", not a weaker one — it holds for
   * every filter value rather than the two a test happened to try.
   */
  const code = readSource(SRC).code;
  // Bound INSIDE the Dialog.Content block, not from the file start — the first
  // `cn(` in the file belongs to TypeButton, several hundred lines earlier.
  const shell = code.slice(code.indexOf('<Dialog.Content'), code.indexOf('</Dialog.Content>'));
  // Bounded on `)}` — the token that closes the cn() call and the JSX
  // expression together. NOT on `>`: the children below include
  // `onQueryChange={setQuery}`, so a bound that ran to the tag's own `>` would
  // sweep the state props into the slice and the "no state names" assertions
  // would fail against the child element rather than the className.
  const start = shell.indexOf('cn(');
  const className = shell.slice(start, shell.indexOf(')}', start));
  assert.ok(className.includes('w-[min(') && className.includes('overflow-y-auto'),
    'the className argument list was not located');
  assert.ok(className.includes("'fixed left-1/2 top-1/2 z-50 w-[min(52rem,calc(100vw-2rem))]'"),
    'the width literal is gone or has been reformulated');
  assert.equal(className.includes('${'), false,
    'the shell className now interpolates. Whatever it interpolates, the width is no '
    + 'longer a constant of the component.');
  for (const stateName of ['query', 'activeGroup', 'groups']) {
    assert.equal(new RegExp(`\\b${stateName}\\b`).test(className), false,
      `the shell className now reads ${stateName} — its size can vary with the filter`);
  }
});

// ── 3. the grid template — innocent, but load-bearing ──────────────────────

test('every group grid uses a FIXED column count, identical in every filter state', () => {
  /**
   * Not the cause (see the header), but the reason the cause was only 15px
   * instead of a full collapse. `grid-cols-N` compiles to
   * `repeat(N, minmax(0, 1fr))`, which reserves all N tracks even when fewer
   * items exist — measured: four 193.5px columns holding five cards. Swap in
   * `auto-fit`/`auto-fill` and the track count would follow the item count, so
   * a one-result filter really would collapse the row.
   *
   * Asserted as an EXACT string over every grid in every state, so a per-group
   * or per-state variation cannot hide behind one that still matches.
   */
  const EXPECTED = 'grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4';
  const seen = new Set();
  for (const { label, props } of STATES) {
    const grids = [...bodyDoc(props).querySelectorAll('div.grid')];
    for (const g of grids) {
      assert.equal(g.getAttribute('class'), EXPECTED, `a grid in "${label}" has a different template`);
      seen.add(g.getAttribute('class'));
    }
  }
  assert.deepEqual([...seen], [EXPECTED], 'more than one grid template is in play across states');
  assert.ok(seen.size === 1);
});

test('CONTROL: the grid assertion is not vacuous — grids really were found in most states', () => {
  // `for (const g of [])` passes silently. The 0-result state legitimately has
  // no grid, so the count is asserted per state rather than in aggregate.
  const counts = STATES.map(({ props }) => [...bodyDoc(props).querySelectorAll('div.grid')].length);
  assert.deepEqual(counts, [5, 1, 1, 0, 4],
    'the number of grids per filter state changed — re-check what the assertion above walked');
});

test('CONTROL: an auto-fit template would NOT satisfy the exact-string assertion', () => {
  // Discrimination for the assertion above, stated as literals: the fixed form
  // and the collapsing form put through the identical comparison, coming out
  // opposite. Verified separately by a script-file break (see the commit).
  const EXPECTED = 'grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4';
  const AUTO_FIT = 'grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2';
  assert.notEqual(AUTO_FIT, EXPECTED);
  assert.equal(AUTO_FIT === EXPECTED, false);
});

// ── 4. nothing the BODY renders varies its own width by filter state ───────

test('no element the body renders carries a width or overflow class that differs by state', () => {
  /**
   * The half of the shell/body split that IS renderable. The shell is a
   * constant (asserted above); this asserts the other side — that no wrapper
   * between it and the cards introduces a state-dependent width, which is where
   * a `w-fit` or a `min-w-0` regression would land and reproduce the defect
   * from below.
   *
   * Exact sets per state, compared to the first state's set.
   */
  const SIZING = /(?:^|:)(?:w-|max-w-|min-w-|overflow-|flex-|basis-|shrink|grow)/;
  const sizingClasses = (doc) => {
    const out = new Set();
    for (const el of doc.querySelectorAll('*')) {
      for (const c of (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
        if (SIZING.test(c)) out.add(c);
      }
    }
    return [...out].sort();
  };

  const baseline = sizingClasses(bodyDoc(STATES[0].props));
  assert.ok(baseline.length > 0, 'no sizing classes found at all — the probe matches nothing');

  for (const { label, props } of STATES.slice(1)) {
    const here = sizingClasses(bodyDoc(props));
    const extra = here.filter((c) => !baseline.includes(c));
    assert.deepEqual(extra, [],
      `"${label}" introduces sizing classes the full view does not have: ${extra.join(', ')}`);
  }
});

test('CONTROL: that probe DOES see sizing classes, and would catch an added one', () => {
  // Otherwise the deepEqual above is comparing two empty lists.
  const SIZING = /(?:^|:)(?:w-|max-w-|min-w-|overflow-|flex-|basis-|shrink|grow)/;
  assert.ok(SIZING.test('w-full'));
  assert.ok(SIZING.test('min-w-0'));
  assert.ok(SIZING.test('max-w-fit'));
  assert.ok(SIZING.test('shrink-0'));
  assert.equal(SIZING.test('text-9e-navy'), false);
  assert.equal(SIZING.test('rounded-9e-md'), false);
  // …and the body really does render at least one of them.
  const doc = bodyDoc({});
  const found = [...doc.querySelectorAll('*')]
    .flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
    .filter((c) => c && SIZING.test(c));
  assert.ok(found.includes('w-full'), 'the search input lost w-full, or the probe stopped seeing it');
});

// ── ROUND 12: HEIGHT IS A CONSTANT TOO ─────────────────────────────────────
//
// NOTE ON THIS FILE'S NAME. It says "width" because round 10 created it for the
// width defect. Round 12 locked HEIGHT the same way and the assertions belong
// beside the width ones — same element, same class string, same mechanism, and
// the compile test above already covers both axes in one map. Extended here
// rather than split into a near-identical second file; the name is the only
// thing that stayed narrow.
//
// WHAT WAS MEASURED (headless Chrome, dev server's own compiled stylesheet, the
// server restarted first so no stale Tailwind state could be trusted):
//
//   natural, uncapped, viewport 1400x1400
//     developer     ทั้งหมด   739px   27 types, Advanced as four buttons
//     NON-developer ทั้งหมด   746px   23 types, Advanced as the locked summary
//
//   after the fix, nine filter states x three viewports
//     1400x1000 and 1400x900 -> 752px in EVERY state, none scrolling
//     1400x700               -> 636px in EVERY state (the min() clamp)
//
// The non-developer view being SEVEN PIXELS TALLER on FOUR FEWER TYPES is why
// 47rem and not 46.5rem: fitting the developer view alone leaves every
// non-developer permanently scrolling by 2px they can never clear. That number
// is not re-derivable from anything in this repo's source, so it is written
// down here and at the class itself.

test('the height declaration is a static literal — it cannot vary with filter state', () => {
  /**
   * The exact parallel of the width test above, and it substitutes for the same
   * thing for the same reason: Dialog.Content is inside a Radix Dialog.Portal,
   * which emits nothing under renderToStaticMarkup, so "identical in the
   * rendered className across states" would be a comparison of two empty
   * strings. The claim is made where it is decidable — the className is a
   * literal argument list with no interpolation and no reference to filter
   * state, so there is no expression through which a filter COULD reach it.
   */
  const code = readSource(SRC).code;
  const shell = code.slice(code.indexOf('<Dialog.Content'), code.indexOf('</Dialog.Content>'));
  const start = shell.indexOf('cn(');
  const className = shell.slice(start, shell.indexOf(')}', start));
  assert.ok(className.includes('h-[min(') && className.includes('overflow-y-auto'),
    'the className argument list was not located');

  assert.ok(className.includes("'h-[min(47rem,calc(100dvh-4rem))] overflow-y-auto [scrollbar-gutter:stable]'"),
    'the fixed-height literal is gone or has been reformulated. Height is the round-12 '
    + 'invariant: one value for every filter state, clamped only by the viewport.');
  assert.equal(className.includes('${'), false,
    'the shell className now interpolates — the height is no longer a constant of the component');
  for (const stateName of ['query', 'activeGroup', 'groups']) {
    assert.equal(new RegExp(`\\b${stateName}\\b`).test(className), false,
      `the shell className now reads ${stateName} — its height can vary with the filter`);
  }
});

test('round 10’s min-height floor is GONE — a fixed height leaves nothing for it to do', () => {
  /**
   * `min-h-[18rem]` was a floor under a height that was still free to vary. A
   * fixed `h-` makes every state that one height, so a floor beneath it can
   * never bind — it would read as a live constraint while being dead. Asserted
   * as ABSENT rather than trusted to have been deleted.
   *
   * Read from `code`, not `raw`: the comment at the class explains WHY the
   * floor was removed, and on `raw` this assertion would fail on the
   * explanation of its own subject.
   *
   * SCOPED TO THIS FILE, deliberately. The same utility is alive and correct in
   * src/app/admin/career-paths/_components/CareerPathForm.jsx, so the compiled
   * stylesheet still contains the rule and a CSS-level "absent" check would be
   * asserting something false about an unrelated component.
   */
  const code = readSource(SRC).code;
  assert.equal(code.includes('min-h-'), false,
    'a min-height class is back in SectionPicker. With a fixed h- on the same element it '
    + 'is either dead or it is fighting the fixed height; neither is wanted.');
  assert.equal(code.includes('max-h-'), false,
    'a max-height class is back in SectionPicker. The min() in the fixed height IS the '
    + 'viewport clamp; a second one is a competing declaration of the same rule.');
});

test('CONTROL: that probe DOES catch a re-added floor, and is not just matching nothing', () => {
  // Discrimination, not existence: the current shape and the pre-round-12 shape
  // through the identical probe, coming out opposite. Verified end-to-end by a
  // script-file break as well (see the commit).
  const WITH_FLOOR = "'max-h-[calc(100dvh-4rem)] min-h-[18rem] overflow-y-auto [scrollbar-gutter:stable]'";
  assert.equal(WITH_FLOOR.includes('min-h-'), true);
  assert.equal(WITH_FLOOR.includes('max-h-'), true);
  const FIXED = "'h-[min(47rem,calc(100dvh-4rem))] overflow-y-auto [scrollbar-gutter:stable]'";
  assert.equal(FIXED.includes('min-h-'), false);
  assert.equal(FIXED.includes('max-h-'), false);
});

test('the element that is height-clamped is the element that scrolls', () => {
  /**
   * WHAT INVESTIGATION D FOUND, PINNED. `overflow-y-auto` occurs exactly ONCE in
   * the file and sits on Dialog.Content itself — there is no inner scroll
   * region, so the header, the search box, the pills and every group scroll
   * together.
   *
   * That structure is worth holding still now that height is FIXED rather than
   * merely capped. Before, a short viewport shrank the box toward its content;
   * now the box is 47rem by declaration and the min() clamps it on short
   * viewports, so at 700px the content is genuinely taller than the box. If the
   * height ever landed on one element and the overflow on another, the clamp
   * would CLIP the last groups with no way to reach them — measured to work
   * today: at 1400x700 the dialog clamps to 636px, scrollHeight 737, and
   * scrolling to the bottom brings the final group (ขั้นสูง) and its last type
   * (debug_json) fully into view.
   *
   * So the two are asserted as inseparable: one occurrence, same class string.
   */
  const code = readSource(SRC).code;
  const occurrences = code.split('overflow-y-auto').length - 1;
  assert.equal(occurrences, 1,
    'overflow-y-auto now appears more than once — there is a second scroll region, and '
    + 'which one owns the clamped height is no longer obvious');

  const shell = code.slice(code.indexOf('<Dialog.Content'), code.indexOf('</Dialog.Content>'));
  const line = shell.split('\n').find((l) => l.includes('overflow-y-auto'));
  assert.ok(line, 'the overflow class is no longer inside the Dialog.Content block');
  assert.match(line, /h-\[min\(47rem,calc\(100dvh-4rem\)\)\]/,
    'the fixed height and the overflow that makes it scrollable have been split onto '
    + 'different elements. On a short viewport the clamp then clips the last groups with '
    + 'no way to scroll to them.');
});

test('the body renders no min-height or max-height in ANY filter state', () => {
  /**
   * The renderable half. The shell's height is a constant (asserted above);
   * this is the other side — that nothing the body draws can push the box past
   * it or hold it open beyond it, in any state. A `min-h-` on a group wrapper
   * would reintroduce exactly the state-dependent height round 12 removed.
   *
   * This does NOT forbid `h-*` outright: the icon tiles are `h-7` and the lucide
   * glyphs `h-[18px]`, which size themselves and not the dialog. Only the two
   * properties that can fight a fixed height are excluded.
   */
  for (const { label, props } of STATES) {
    const doc = bodyDoc(props);
    const offenders = [...doc.querySelectorAll('*')]
      .flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
      .filter((c) => c && /(?:^|:)(?:min-h-|max-h-)/.test(c));
    assert.deepEqual(offenders, [], `"${label}" renders a height constraint: ${offenders.join(', ')}`);
  }
});

test('CONTROL: that probe DOES recognise the classes it is looking for', () => {
  // Otherwise every deepEqual above compares two empty lists and means nothing.
  const P = /(?:^|:)(?:min-h-|max-h-)/;
  assert.ok(P.test('min-h-[18rem]'));
  assert.ok(P.test('max-h-[calc(100dvh-4rem)]'));
  assert.ok(P.test('sm:min-h-0'));
  // …and does NOT fire on the height classes the body legitimately uses.
  assert.equal(P.test('h-7'), false);
  assert.equal(P.test('h-[18px]'), false);
  assert.equal(P.test('h-3.5'), false);
});
