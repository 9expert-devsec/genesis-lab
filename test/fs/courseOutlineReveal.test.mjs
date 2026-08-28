import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { compile, declarationsFor } from '../twCompile.mjs';

/**
 * The outline accordion's reveal must have NO HEIGHT CEILING.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * The panel animated `overflow-hidden` + `max-h-0` -> `max-h-[800px]`. 800px was
 * a guess and courses exceed it: POWER-BI-XDM's "เข้าใจ Power BI Semantic Model"
 * (27 bullets) was clipped MID-LINE in a browser with the rest unreachable — no
 * scrollbar, no affordance, nothing to say content was missing. Its
 * "Dimensional Model และ Relationship" row is worse at 41 bullets / 2,268 chars.
 *
 * ══ WHAT THIS TIER CANNOT SEE, STATED RATHER THAN IMPLIED ═══════════════════
 *
 * JSDOM PERFORMS NO LAYOUT. It computes no heights, resolves no `fr` tracks,
 * runs no transitions. **No test in this suite can assert that content is
 * unclipped** — not this one, not a render assertion, not a compiled-CSS
 * assertion. Anything claiming to would be measuring class strings and calling
 * it geometry, which is precisely how an 800px ceiling survived review in the
 * first place: the markup always looked right.
 *
 * So this file guards the three things that ARE checkable, and the click-test
 * in the round report covers the one that is not:
 *
 *   1. the reveal path carries no fixed max-height ceiling (source);
 *   2. the classes it does carry compile to real CSS rules (real compiler);
 *   3. the collapse mechanism is present in the rendered markup — asserted
 *      in the render tier, test/render/courseOutlineReveal.test.mjs. It is a
 *      SEPARATE FILE because importing test/twCompile.mjs into a file that
 *      also renders React breaks the render: the CJS require it uses to read
 *      tailwind.config.js pulls in a second copy of React and every hook
 *      throws "Invalid hook call". Measured, not guessed.
 *
 * (1) is the one with teeth. A ceiling cannot be reintroduced without reddening
 * it, and that is the whole property: not "this height is big enough" — which is
 * the thinking that produced the bug — but "there is no height".
 *
 * ── SOURCE IS READ COMMENT-STRIPPED, AND THAT IS LOAD-BEARING HERE ─────────
 * CourseOutline.jsx's header now DOCUMENTS the defect and spells `max-h-[800px]`
 * and `max-h-0` out in prose. A raw-text scan would find them and this guard
 * would fail against a perfectly correct file — defect 1/2 in sourceScan.mjs's
 * header, arriving from the direction where the fix creates the trap. Every
 * assertion below reads `.code`.
 */

const REL = 'src/app/(public)/[...slug]/_components/CourseOutline.jsx';

// ── 1. NO CEILING ──────────────────────────────────────────────────────────

test('the reveal path carries NO fixed max-height ceiling', () => {
  const { code } = readSource(REL);
  const ceilings = [...code.matchAll(/max-h-\[[^\]]+\]|max-h-(?:\d+|full|screen|min|max|fit)/g)]
    .map((m) => m[0]);
  assert.deepEqual(
    ceilings, [],
    'a max-height ceiling is back on the outline reveal: ' + ceilings.join(', ')
    + '. A ceiling is a guess about content height, and content exceeds it — '
    + 'that is the defect this guard exists for. Animate a grid track instead.',
  );
});

test('it does not animate max-height at all', () => {
  const { code } = readSource(REL);
  assert.ok(
    !code.includes('transition-[max-height]'),
    'the reveal is animating max-height again — it interpolates toward the '
    + 'DECLARED ceiling rather than real content height, so it both clips tall '
    + 'panels and wastes most of the duration on short ones',
  );
});

test('CONTROL: the ceiling matcher genuinely fires on the class that was there', () => {
  /**
   * Without this, both guards above could be passing because the regex matches
   * nothing anywhere — the classic shape of a blind "does NOT contain" check.
   * Fired at the exact string the file used to carry.
   */
  const wasThere = "'overflow-hidden transition-[max-height] duration-9e-reveal ease-9e', open ? 'max-h-[800px]' : 'max-h-0'";
  const found = [...wasThere.matchAll(/max-h-\[[^\]]+\]|max-h-(?:\d+|full|screen|min|max|fit)/g)].map((m) => m[0]);
  assert.deepEqual(found, ['max-h-[800px]', 'max-h-0']);
  assert.ok(wasThere.includes('transition-[max-height]'));
});

test('CONTROL: the guard reads CODE, so the header prose does not satisfy it', () => {
  /**
   * The inverse trap, and the one this specific fix creates. The module header
   * quotes the retired classes while explaining them. `raw` therefore contains
   * them and `code` must not — if that ever inverts, the guards above are
   * reading prose instead of code.
   */
  const { raw, code } = readSource(REL);
  assert.ok(raw.includes('max-h-[800px]'), 'the header no longer documents the retired ceiling');
  assert.ok(!code.includes('max-h-[800px]'), 'the comment stripper let the header through');
});

// ── 2. THE CLASSES COMPILE ─────────────────────────────────────────────────

test('the reveal classes compile to real CSS rules', async () => {
  /**
   * Compiled from THIS FILE's comment-stripped source through the repo's real
   * Tailwind config — the instrument tailwindArbitraryValueRules exists for. A
   * markup assertion cannot tell a class that paints from one that compiles to
   * nothing, and `grid-rows-[0fr]` painting nothing means every panel sits
   * permanently open.
   */
  const css = await compile([{ raw: readSource(REL).code, extension: 'js' }]);
  const expected = {
    'grid-rows-[0fr]': 'grid-template-rows: 0fr',
    'grid-rows-[1fr]': 'grid-template-rows: 1fr',
    'min-h-0': 'min-height: 0px',
    'overflow-hidden': 'overflow: hidden',
  };
  for (const [cls, decl] of Object.entries(expected)) {
    assert.ok(
      declarationsFor(css, cls).includes(decl),
      `"${cls}" did not compile to "${decl}" — it paints nothing`,
    );
  }
  assert.ok(
    declarationsFor(css, 'transition-[grid-template-rows]')
      .includes('transition-property: grid-template-rows'),
    'the transition-property class compiles to nothing, so nothing animates',
  );
});

test('the motion TOKENS still drive the reveal, and 300ms beats the built-in 150ms', async () => {
  /**
   * `transition-[grid-template-rows]` ships its own `transition-duration: 150ms`.
   * `duration-9e-reveal` only wins because Tailwind emits the duration utility
   * LATER in the same layer — a cascade fact, not a guarantee, so it is checked
   * rather than assumed. If it ever inverted, the reveal would silently run at
   * half its designed speed with every class still present and correct.
   */
  const css = await compile([{ raw: readSource(REL).code, extension: 'js' }]);
  assert.ok(declarationsFor(css, 'duration-9e-reveal').includes('transition-duration: 300ms'));
  assert.ok(declarationsFor(css, 'ease-9e').some((d) => d.startsWith('transition-timing-function')));

  const propertyRule = css.search(/\.transition-\\\[grid-template-rows\\\]/);
  const durationRule = css.indexOf('.duration-9e-reveal');
  assert.ok(propertyRule !== -1 && durationRule !== -1, 'one of the two rules was not emitted');
  assert.ok(
    durationRule > propertyRule,
    'duration-9e-reveal is emitted BEFORE transition-[grid-template-rows], so the '
    + "utility's built-in 150ms now wins and the reveal runs at half speed",
  );
});

test('the duration is read from the token, never retyped as a number', () => {
  const { code } = readSource(REL);
  assert.ok(code.includes('duration-9e-reveal'), 'the motion token was replaced');
  assert.ok(code.includes('ease-9e'), 'the easing token was replaced');
  assert.ok(!/duration-\[\d+ms\]|duration-\d{3}/.test(code), 'a literal duration was typed in');
});
