import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, declarationsFor } from '../twCompile.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 71 — THE FIVE GAP CLASSES MUST COMPILE TO THE FIVE STATED DISTANCES.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM test/render/containerGap ─────────────
 * Importing test/twCompile.mjs into a file that also renders React breaks the
 * render: the CJS require it uses to read tailwind.config.js pulls in a second
 * copy of React and every hook throws "Invalid hook call". Measured by round
 * 44's courseOutlineReveal, and the reason that guard is split the same way.
 *
 * ── WHAT A MARKUP ASSERTION CANNOT SEE ────────────────────────────────────
 * `test/render/containerGap` asserts the component emits `gap-16`. That is a
 * STRING. Whether the stylesheet contains a rule that turns it into 64px is a
 * different question, and the only thing that can answer it is compiling
 * Tailwind and looking — which is the defect test/fs/tailwindArbitraryValueRules
 * exists for, arriving here by a different route: this round claims specific
 * PIXEL distances to an author in a hint, so the distances have to be real.
 *
 * ── THE SCALE IS TAILWIND'S OWN, WHICH IS THE POINT ───────────────────────
 * Round 17: this repo mints no spacing scale of its own. These are the same
 * five steps `spacingTop`/`spacingBottom` already use as padding (pt-0/4/8/16/
 * 24), so an author who has learned what ปานกลาง means from ระยะห่างด้านบน gets
 * the same number from ระยะห่างระหว่างเนื้อหาข้างใน.
 */

/** value → class → the distance the control promises. */
const SCALE = [
  ['none', 'gap-0', '0px'],
  ['small', 'gap-4', '1rem'],
  ['medium', 'gap-8', '2rem'],
  ['large', 'gap-16', '4rem'],
  ['xl', 'gap-24', '6rem'],
];

/**
 * ── COMPILED AT MODULE SCOPE, NOT IN A TEST THAT THE OTHERS READ ─────────
 * The first shape of this file assigned `css` inside one test and read it from
 * three others. Run alone that passes; run inside test/run.mjs it went RED on
 * all three, because the suite drives the programmatic runner with
 * isolation:'none' — every file shares one process — and a sync test does not
 * wait for an async sibling to finish filling a module-level `let`.
 *
 * Top-level await removes the ordering question rather than answering it: the
 * module cannot finish evaluating until the compile resolves, so no test body
 * can run before `CSS` is a string. (The neighbouring guards compile INSIDE
 * each test, which is the other way to have no shared state; one compile is
 * preferred here because all five classes come from one source list.)
 */
const CSS = await compile([{ raw: SCALE.map(([, c]) => c).join(' '), extension: 'html' }]);

test('the compiler produced a stylesheet at all', () => {
  assert.ok(CSS.length > 0, 'the compiler produced nothing — every assertion below is vacuous');
});

test('each gap class compiles to a REAL rule at its stated distance', () => {
  for (const [value, cls, expected] of SCALE) {
    const decls = declarationsFor(CSS, cls);
    assert.ok(decls.length > 0,
      `${cls} (spacingBetween="${value}") compiles to NO rule — the control would set a class the `
      + 'stylesheet has never heard of, and the gap would silently stay at whatever it was');
    assert.ok(decls.some((d) => d === `gap: ${expected}`),
      `${cls} should declare "gap: ${expected}" — got ${JSON.stringify(decls)}`);
  }
});

test('CONTROL: the compiler DOES report an absent rule', () => {
  /**
   * Without this, "every class compiles" passes on a `declarationsFor` that
   * returns something for anything. A class nobody wrote must come back empty.
   */
  assert.deepEqual(declarationsFor(CSS, 'gap-77'), []);
  assert.deepEqual(declarationsFor(CSS, 'gap-[13px]'), []);
});

test('the five distances are DISTINCT, and medium is the incumbent 2rem', () => {
  const distances = SCALE.map(([, cls]) => declarationsFor(CSS, cls).find((d) => d.startsWith('gap:')));
  assert.equal(new Set(distances).size, SCALE.length,
    `two values compile to the same distance (${distances.join(' | ')}) — the control would have `
    + 'settings an author cannot tell apart');
  assert.equal(distances[2], 'gap: 2rem',
    'medium is no longer 32px, which is the distance container/full_width hardcoded and the one '
    + 'an ABSENT value must keep resolving to');
});

test('the padding scale it borrows from is untouched (§H)', () => {
  // spacingTop/spacingBottom keep their meaning AND their values. The two maps
  // are read out of source rather than re-derived, so a silent edit to either
  // reddens here rather than moving every page's vertical rhythm quietly.
  const { code } = readSource('src/lib/pageBuilder/presets.js');
  assert.match(code, /none: 'pt-0', small: 'pt-4', medium: 'pt-8', large: 'pt-16', xl: 'pt-24',/,
    'SPACING_TOP_CLASS moved — round 71 was not allowed to touch it');
  assert.match(code, /none: 'pb-0', small: 'pb-4', medium: 'pb-8', large: 'pb-16', xl: 'pb-24',/,
    'SPACING_BOTTOM_CLASS moved — round 71 was not allowed to touch it');
  assert.match(code, /none: 'gap-0', small: 'gap-4', medium: 'gap-8', large: 'gap-16', xl: 'gap-24',/,
    'SPACING_BETWEEN_CLASS moved');
});

test('the grids and two_column kept their hardcoded gutters (§B, §C)', () => {
  /**
   * §B excluded the grids (their gap is a GUTTER) and §C excluded `two_column`
   * (it has TWO gaps and one control could not say which). Those are decisions,
   * so they are pinned: a later round that changes its mind has to come through
   * here and say so, rather than the exclusion quietly eroding.
   */
  const grid = (t) => readSource(`src/components/pageBuilder/sections/${t}.jsx`).code;
  assert.match(grid('card_grid'), /'grid gap-6'/, 'card_grid gutter moved');
  assert.match(grid('highlight_grid'), /'grid gap-6'/, 'highlight_grid gutter moved');

  const two = grid('two_column');
  assert.match(two, /'grid grid-cols-1 gap-8'/, 'two_column BETWEEN-columns gap moved');
  assert.equal((two.match(/flex flex-col gap-6/g) ?? []).length, 2,
    'two_column no longer has exactly two INSIDE-column stacks at gap-6 — which was the whole '
    + 'reason one spacing control could not be offered on it');

  for (const t of ['card_grid', 'highlight_grid', 'two_column']) {
    assert.equal(/\bspacingBetweenClass\b/.test(grid(t)), false,
      `${t} started reading spacingBetween — §B/§C excluded it, so this is a widening that needs `
      + 'the argument made, not an import added');
  }
});
