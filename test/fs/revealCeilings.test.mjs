import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';
import { compile, declarationsFor } from '../twCompile.mjs';

/**
 * NO COLLAPSIBLE PANEL MAY REVEAL ITSELF THROUGH A max-height CEILING.
 *
 * ── THE DEFECT, THREE TIMES OVER ────────────────────────────────────────────
 * A reveal built as `overflow-hidden` + `max-h-0` -> `max-h-<N>` clips whatever
 * exceeds N, MID-LINE, with no scrollbar and no affordance. It reads as the end
 * of the content. 11e460d fixed the first instance (CourseOutline, 800px,
 * confirmed clipping in a browser on POWER-BI-XDM) and its inventory found two
 * more, both live and both rendering admin-authored HTML with no length limit:
 *
 *   · FaqAccordionSection.jsx — max-h-96 (384px). FIVE page types render it:
 *     masterclass, program, skill, public course and career path. MEASURED over
 *     all 36 active LocalFaq documents: none exceeds 384px on a desktop text
 *     column, but on a phone (~296px column) TWO land near 550px — already
 *     losing content on the viewport most of the traffic uses, and invisible on
 *     the desktop where it gets reviewed.
 *   · MasterclassDetailClient.jsx — max-h-[800px] on a module's topics_html /
 *     content_html. MEASURED over all 13 live modules: one ("Claude AI as Your
 *     Data Analyst Assistant", 22 block elements) estimates ~852px at EVERY
 *     viewport width.
 *
 * ══ WHAT THIS TIER CANNOT SEE ══════════════════════════════════════════════
 * No layout, no heights, no resolved `fr` tracks, no transitions. NO TEST HERE
 * CAN ASSERT THAT CONTENT IS UNCLIPPED — that is a browser's job, and the
 * click-test list is in the round report. What is checkable is that the
 * mechanism which caused the clipping is gone and cannot come back quietly.
 *
 * ── EVERY READ IS COMMENT-STRIPPED, AND THAT IS LOAD-BEARING ───────────────
 * All three components now DOCUMENT the defect and spell `max-h-96` /
 * `max-h-[800px]` / `max-h-0` out in prose. A raw-text scan would find them and
 * redden against correct files — sourceScan defect 1/2, arriving from the
 * direction where writing the fix creates the trap. Every assertion reads
 * `.code`, and a control below proves the stripper is doing it.
 */

/** The reveal paths this round and 11e460d converted to a grid track. */
const FIXED = [
  {
    what: 'the course outline accordion',
    rel: 'src/app/(public)/[...slug]/_components/CourseOutline.jsx',
    openVar: 'open',
  },
  {
    what: 'the shared FAQ accordion',
    rel: 'src/components/faq/FaqAccordionSection.jsx',
    openVar: 'open',
  },
  {
    what: 'the masterclass module accordion',
    rel: 'src/app/(public)/masterclass/[slug]/_components/MasterclassDetailClient.jsx',
    openVar: 'isOpen',
  },
];

/**
 * Any max-height utility, arbitrary or scale.
 *
 * TWO FORMS, AND THE SPLIT IS NOT COSMETIC. A `g`-flagged regex is STATEFUL:
 * `.test()` and `assert.match()` advance its `lastIndex` and the next call
 * resumes from there, so reusing one instance across a loop silently returns
 * false for inputs that DO match. That is a false green in a "does not contain"
 * guard, which is the exact failure mode this file exists to prevent — and it
 * bit this file on its first run. `matchAll` needs the flag; everything else
 * uses the flagless twin.
 */
const CEILING = /max-h-\[[^\]]+\]|max-h-(?:\d+|full|screen|min|max|fit)/g;
const CEILING_1 = /max-h-\[[^\]]+\]|max-h-(?:\d+|full|screen|min|max|fit)/;

for (const { what, rel, openVar } of FIXED) {
  test(`${what}: the reveal carries NO max-height ceiling`, () => {
    const found = [...readSource(rel).code.matchAll(CEILING)].map((m) => m[0]);
    assert.deepEqual(
      found, [],
      `a max-height ceiling is back in ${rel}: ${found.join(', ')}. A ceiling is `
      + 'a guess about content height and the content is unbounded — that is the '
      + 'defect. Animate a grid track instead.',
    );
  });

  test(`${what}: it animates a grid track, not max-height`, () => {
    const { code } = readSource(rel);
    assert.ok(!code.includes('transition-[max-height]'), `${rel} animates max-height again`);
    assert.ok(
      code.includes('transition-[grid-template-rows]'),
      `${rel} lost the grid-track transition`,
    );
    assert.ok(
      code.includes(`${openVar} ? "grid-rows-[1fr]" : "grid-rows-[0fr]"`)
      || code.includes(`${openVar} ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'`),
      `${rel}'s open/closed branches are not the 1fr/0fr pair the reveal needs`,
    );
  });

  test(`${what}: the grid item carries min-h-0 AND overflow-hidden`, () => {
    // BOTH, and neither alone. `min-h-0` is what lets the 0fr track reach zero
    // (a grid item's min-height is `auto` and refuses to shrink under
    // min-content); `overflow-hidden` is what clips during the transition.
    assert.ok(
      readSource(rel).code.includes('min-h-0 overflow-hidden'),
      `${rel} lost min-h-0 and/or overflow-hidden on the grid item — without `
      + 'min-h-0 the panel cannot close at all',
    );
  });

  test(`${what}: the motion tokens drive it, and 300ms beats the built-in 150ms`, async () => {
    /**
     * `transition-[grid-template-rows]` ships its own `transition-duration:
     * 150ms`. `duration-9e-reveal` only wins because Tailwind emits the duration
     * utility LATER in the same layer — a cascade fact, not a guarantee. If it
     * ever inverted, every one of these reveals would silently run at half speed
     * with every class still present and correct.
     *
     * The selector is located with indexOf and a String.fromCharCode backslash
     * rather than a regex literal: `.transition-\[grid-template-rows\]` needs
     * three levels of escaping to express as a regex and is easy to get wrong in
     * the silent direction (a bad pattern returns -1, which reads as "absent").
     */
    const BS = String.fromCharCode(92);
    const SEL = `.transition-${BS}[grid-template-rows${BS}]`;
    const css = await compile([{ raw: readSource(rel).code, extension: 'js' }]);

    const propertyAt = css.indexOf(SEL);
    const durationAt = css.indexOf('.duration-9e-reveal');
    assert.notEqual(propertyAt, -1, `${rel}: transition-[grid-template-rows] compiled to nothing`);
    assert.notEqual(durationAt, -1, `${rel}: duration-9e-reveal compiled to nothing`);
    assert.ok(
      durationAt > propertyAt,
      `${rel}: duration-9e-reveal is emitted BEFORE the transition-property `
      + "utility, so the utility's built-in 150ms now wins and the reveal runs "
      + 'at half its designed speed',
    );
    assert.ok(declarationsFor(css, 'duration-9e-reveal').includes('transition-duration: 300ms'));
  });

  test(`${what}: the reveal classes compile to real CSS rules`, async () => {
    // A class that compiles to nothing paints nothing. `grid-rows-[0fr]`
    // painting nothing means every panel sits permanently open.
    const css = await compile([{ raw: readSource(rel).code, extension: 'js' }]);
    for (const [cls, decl] of Object.entries({
      'grid-rows-[0fr]': 'grid-template-rows: 0fr',
      'grid-rows-[1fr]': 'grid-template-rows: 1fr',
      'min-h-0': 'min-height: 0px',
      'overflow-hidden': 'overflow: hidden',
    })) {
      assert.ok(
        declarationsFor(css, cls).includes(decl),
        `${rel}: "${cls}" did not compile to "${decl}" — it paints nothing`,
      );
    }
  });
}

// ── controls ───────────────────────────────────────────────────────────────

test('CONTROL: the ceiling matcher fires on the classes that were actually there', () => {
  // Without this, every "no ceiling" assertion above could be passing because
  // the regex matches nothing anywhere — the classic blind negative.
  const wasThere = [
    `open ? 'max-h-[800px]' : 'max-h-0'`,   // CourseOutline
    `open ? "max-h-96" : "max-h-0"`,        // FaqAccordionSection
    `isOpen ? "max-h-[800px]" : "max-h-0"`, // MasterclassDetailClient
  ].join(' ');
  assert.deepEqual(
    [...wasThere.matchAll(CEILING)].map((m) => m[0]),
    ['max-h-[800px]', 'max-h-0', 'max-h-96', 'max-h-0', 'max-h-[800px]', 'max-h-0'],
  );
});

test('CONTROL: the guards read CODE, so the header prose does not satisfy them', () => {
  // The inverse trap, and the one writing these fixes creates: each header now
  // quotes the retired ceiling while explaining it. `raw` must contain it and
  // `code` must not, in every one of the three files.
  for (const { rel } of FIXED) {
    const { raw, code } = readSource(rel);
    assert.match(raw, CEILING_1, `${rel}'s header no longer names the retired ceiling class`);
    assert.doesNotMatch(code, CEILING_1, `${rel}: the comment stripper let the header through`);
  }
});

// ── the sweep: nothing else may grow this shape ────────────────────────────

/**
 * REVEAL CEILINGS ELSEWHERE IN src/, WITH THE TWO KNOWN-BOUNDED EXCEPTIONS.
 *
 * This is the assertion that catches instance FOUR — the one nobody has written
 * yet. The three above are a named list and can only ever guard what is already
 * known; a sweep is what notices a new copy of the pattern.
 *
 * ── WHY AN ALLOWLIST HERE IS NOT THE PER-NAME-EXCEPTION MISTAKE ────────────
 * Each entry is bounded BY CONSTRUCTION, not by a guess about content, and the
 * bound is checkable in the file itself:
 *
 *   · CourseCard — `max-h-96` over a list hard-capped at MAX_CARD_ROUNDS (2)
 *     rounds in code. Two rows cannot approach 384px. The ceiling is redundant
 *     rather than load-bearing.
 *   · PortfolioSectionNav — `max-h-[20px]` on a single-line hover LABEL. Not a
 *     content reveal; the 20px is the label's own line height.
 *
 * If either ever stops being bounded the entry has to be re-argued, which is the
 * point of naming the reason rather than just the file.
 */
const BOUNDED = new Map([
  ['src/app/(public)/training-course/_components/CourseCard.jsx',
   'schedules are hard-capped at MAX_CARD_ROUNDS (2) rows in code'],
  ['src/components/portfolio/PortfolioSectionNav.jsx',
   'a single-line hover label, not a content reveal'],
]);

test('SWEEP: no OTHER component pairs a max-height ceiling with a reveal transition', () => {
  const offenders = [];
  for (const src of walkSources('src')) {
    if (BOUNDED.has(src.rel)) continue;
    const { code, rel } = src;
    // The shape is the PAIRING: a max-height utility plus a transition that can
    // animate it. Either alone is ordinary (a scroll container caps its height;
    // a button transitions colour) and is not what clips content.
    const hasCeiling = CEILING_1.test(code);
    if (!hasCeiling) continue;
    const animatesHeight = code.includes('transition-[max-height]')
      || (code.includes('transition-all') && /max-h-0/.test(code));
    if (animatesHeight) offenders.push(rel);
  }
  assert.deepEqual(
    offenders, [],
    'a new max-height reveal ceiling appeared — it will clip content mid-line '
    + 'with no scrollbar and no affordance:\n  ' + offenders.join('\n  ')
    + '\nUse the grid-track reveal (grid-rows-[0fr] -> [1fr] with a '
    + '`min-h-0 overflow-hidden` child); see CourseOutline.jsx.',
  );
});

test('CONTROL: the sweep can see the shape it is looking for', () => {
  /**
   * A "does NOT contain" sweep over a whole tree is the easiest place in this
   * suite to be silently blind — a walker that reads nothing, or a matcher that
   * fires on nothing, both pass. Two halves:
   *   1. the walker really reads src/ (it finds the three fixed files);
   *   2. the pairing rule fires on the exact strings that used to be there.
   */
  const seen = new Set(walkSources('src').map((s) => s.rel));
  for (const { rel } of FIXED) assert.ok(seen.has(rel), `the walker missed ${rel}`);
  assert.ok(seen.size > 200, `the walker only found ${seen.size} sources`);

  const oldFaq = 'className={`overflow-hidden transition-all duration-300 ${open ? "max-h-96" : "max-h-0"}`}';
  const oldOutline = "'overflow-hidden transition-[max-height] duration-9e-reveal ease-9e', open ? 'max-h-[800px]' : 'max-h-0'";
  for (const sample of [oldFaq, oldOutline]) {
    const hasCeiling = CEILING_1.test(sample);
    const animates = sample.includes('transition-[max-height]')
      || (sample.includes('transition-all') && /max-h-0/.test(sample));
    assert.ok(hasCeiling && animates, `the sweep rule would NOT have caught: ${sample}`);
  }
});

test('CONTROL: the two allowlisted files really do still carry a ceiling', () => {
  // If one of them is refactored away, the entry becomes a lie that quietly
  // exempts a file which no longer needs exempting — and would exempt whatever
  // is written there next.
  for (const [rel, why] of BOUNDED) {
    const { code } = readSource(rel);
    const found = [...code.matchAll(CEILING)].map((m) => m[0]);
    assert.ok(
      found.length > 0,
      `${rel} no longer has a max-height ceiling (${why}) — remove it from the `
      + 'allowlist so the sweep covers it again',
    );
  }
});

test('CONTROL: CourseCard\'s ceiling is bounded by a real cap, not by a guess', () => {
  // The allowlist entry claims a reason. This checks the reason still holds
  // rather than trusting the comment that states it.
  const { code } = readSource('src/app/(public)/training-course/_components/CourseCard.jsx');
  assert.match(code, /MAX_CARD_ROUNDS\s*=\s*2/, 'the 2-round cap is gone');
  assert.match(code, /slice\(0,\s*MAX_CARD_ROUNDS\)/, 'the cap is no longer applied to the list');
});
