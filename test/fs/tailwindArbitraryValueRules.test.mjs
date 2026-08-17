import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { readSource } from '../sourceScan.mjs';
import tailwindcss from 'tailwindcss';

/**
 * CLASSES WHOSE PAINT DEPENDS ON A RUNTIME VARIABLE MUST COMPILE TO A REAL RULE.
 *
 * (It began as ARBITRARY-VALUE CLASSES MUST ACTUALLY COMPILE TO A RULE, and that
 * is still the first case below. The scope widened when the same surface grew a
 * hover RING: a stock utility with no arbitrary value in it, whose colour
 * nevertheless arrives through a variable set inline at runtime. Same question —
 * does the stylesheet really paint what the markup implies — reached by a
 * different route, so the guard covers both rather than spawning a second file.)
 *
 * ── THE BUG THIS EXISTS FOR, AND WHY 3325 GREEN TESTS MISSED IT ─────────────
 * The /schedule round hover shipped DEAD. Its class was assembled with a
 * template literal — the constant holding the CSS variable name was interpolated
 * into the class instead of the class being written out in full — so the RENDERED
 * markup was perfect (`class="… hover:bg-[var(--round-hover-bg)]"`) and every
 * existing test passed, because every existing test asserted the class STRING was
 * in the markup.
 *
 * What was missing was the CSS RULE. Tailwind scans source TEXT and never
 * evaluates it, so it emitted a selector for the uninterpolated candidate and
 * never emitted one for the class the component actually renders. `round-hover-bg`
 * appeared ZERO times in the 284KB stylesheet: the element had no
 * background-color declaration at all, and hovering did nothing.
 *
 * A markup assertion can never catch that. The only thing that can is COMPILING
 * TAILWIND and looking at the output, which is what this file does.
 *
 * ── IT COMPILES THE REAL SOURCE FILES, NOT A FIXTURE OF CLASS STRINGS ───────
 * That distinction is the whole point. Handing Tailwind a fixture containing
 * `hover:bg-[var(--round-hover-bg)]` would prove the class SHAPE is valid — which
 * it always was — and would have passed on the broken build. Pointing `content`
 * at the actual component asks the question that was wrong: does Tailwind, reading
 * this file as it is written, emit a rule for the class this file renders?
 *
 * No `next build` and no dev server: tailwindcss and postcss are already
 * devDependencies and are driven directly.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * Every class the schedule surfaces rely on whose PAINTED RESULT depends on a CSS
 * variable set at runtime, with the file that must produce it.
 *
 * Deliberately a short, named list rather than a sweep. The shape it is about is
 * the one that can look correct in markup while painting nothing, and there are
 * two ways in:
 *
 *   · the variable is IN THE CLASS (`bg-[var(--…)]`) — the class can fail to
 *     compile at all, which is the original defect above;
 *   · the variable is NOT in the class, and the class reads it through one of
 *     Tailwind's own internals (`ring-2` -> `--tw-ring-color`). Here the class
 *     always compiles, and the thing that can break is the COUPLING: rename the
 *     internal upstream and the inline style stops reaching the utility.
 *
 * `referencesVar` is what covers the second case. It asserts the compiled
 * declarations actually mention the variable the component sets inline, so the
 * pairing is checked rather than assumed on both sides.
 */
const CASES = [
  {
    what: 'the /schedule round hover',
    file: 'src/app/(public)/schedule/_components/ScheduleClient.jsx',
    className: 'hover:bg-[var(--round-hover-bg)]',
    property: 'background-color',
  },
  {
    /**
     * The hover ring's WIDTH — the half that actually paints.
     *
     * A ring in Tailwind is assembled by the width utility composing a
     * box-shadow out of `--tw-ring-color`; the colour utility only feeds that
     * variable. So this is the case that proves a ring is DRAWN, and the
     * `referencesVar` below is what proves the two halves are still wired to
     * each other rather than each being independently fine.
     *
     * `hover:ring-2` carries no arbitrary value, so it cannot fail the way the
     * hover background did. It can still be deleted, and it is a stock utility
     * other components use — which is exactly why the CASE compiles ONE file's
     * code rather than reading the whole stylesheet.
     */
    what: 'the /schedule round hover ring (width)',
    file: 'src/app/(public)/schedule/_components/ScheduleClient.jsx',
    className: 'hover:ring-2',
    property: 'box-shadow',
    referencesVar: '--tw-ring-color',
  },
  {
    /**
     * The hover ring's COLOUR — the half that reads the inline value.
     *
     * This one IS an arbitrary-value class and is the original shape: a
     * template literal here compiles to nothing and the ring silently falls
     * back to `--tw-ring-color`'s preflight default, a blue that would look
     * deliberate.
     *
     * The `color:` hint is not decoration. `ring-[…]` is contested by a WIDTH
     * utility and a COLOUR utility — unlike `bg-[…]`, which is why the hover
     * background legitimately goes without one — so an unhinted `var()` has to
     * be guessed at by the config. The property asserted here is
     * `--tw-ring-color` rather than a paint property precisely because this
     * class is not supposed to paint.
     */
    what: 'the /schedule round hover ring (colour)',
    file: 'src/app/(public)/schedule/_components/ScheduleClient.jsx',
    className: 'hover:ring-[color:var(--round-ring)]',
    property: '--tw-ring-color',
    referencesVar: '--round-ring',
  },
  {
    /**
     * ── THE COURSE-CARD SKILL CAPSULE, NOW A LINK ────────────────────────────
     *
     * No arbitrary value and no runtime variable, so neither shape above. It is
     * here for the THIRD way a class paints nothing: `9e-action` is a CUSTOM
     * token, not a stock Tailwind colour. `hover:text-9e-action` is a perfectly
     * ordinary-looking string that compiles to precisely nothing if the token is
     * renamed, moved out of `theme.extend.colors`, or if this file ever falls
     * outside the `content` globs. The markup would still read
     * `class="… hover:text-9e-action"` and the capsule would simply not
     * highlight — the same silent, look-correct failure, reached by a third
     * route.
     *
     * It matters more than an ordinary hover because the hover IS the
     * affordance: these capsules sit inside a card whose thumbnail and title are
     * already links, so a capsule that never changes on hover reads as inert
     * text and the link goes undiscovered.
     *
     * Only the light-mode pair is cased. The `dark:` variants compile through
     * exactly the same token lookup, so they add a second failure of the same
     * kind rather than a new one — and the guard is a named list, not a sweep.
     */
    what: 'the course-card skill capsule hover (text)',
    file: 'src/app/(public)/training-course/_components/CourseCard.jsx',
    className: 'hover:text-9e-action',
    property: 'color',
  },
  {
    what: 'the course-card skill capsule hover (border)',
    file: 'src/app/(public)/training-course/_components/CourseCard.jsx',
    className: 'hover:border-9e-action',
    property: 'border-color',
  },
];

/** Compile Tailwind's utilities over `content` and return the CSS. */
async function compile(content) {
  const config = {
    presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
    content,
  };
  const result = await postcss([tailwindcss(config)]).process(
    '@tailwind utilities;',
    { from: undefined },
  );
  return result.css;
}

/** CJS require from an ESM test — tailwind.config.js is `module.exports`. */
function require_(p) {
  // eslint-disable-next-line no-undef
  return globalThis.__twRequire(p);
}

// node:test runs ESM; tailwind.config.js is CJS. One createRequire, reused.
const { createRequire } = await import('node:module');
globalThis.__twRequire = createRequire(import.meta.url);

/**
 * All declarations for `className` in `css`, as `prop: value` strings.
 *
 * ── A STRING SCAN, NOT A BUILT REGEXP ───────────────────────────────────────
 * Tailwind writes the selector in ESCAPED form — `.hover\:bg-\[var\(--x\)\]:hover`
 * — so the class has to be escaped the same way to be found. The first version of
 * this built a RegExp from that escaped string and had to escape it a second time
 * for the regex grammar; the two escapings collided and produced
 * "Range out of order in character class", i.e. the matcher never ran at all.
 *
 * Since the only thing needed is an exact selector, `indexOf` is both simpler and
 * strictly more precise. The escape table is Tailwind's own for the characters
 * these classes actually contain.
 */
function escapeClass(className) {
  return className.replace(/[:[\]()./%#]/g, (c) => `\\${c}`);
}

function declarationsFor(css, className) {
  const selector = `.${escapeClass(className)}`;
  const out = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(selector, from);
    if (at === -1) break;
    from = at + selector.length;

    // What follows must end this selector — `{`, a pseudo, a comma or
    // whitespace. Anything else means we matched a PREFIX of a longer class
    // (`bg-[var(--x)]` inside `hover:bg-[var(--x)]` is the real case here).
    const rest = css.slice(from);
    const tail = /^((?::[a-z-]+)*)\s*[{,]/.exec(rest);
    if (!tail) continue;

    const open = css.indexOf('{', from);
    const close = css.indexOf('}', open);
    if (open === -1 || close === -1) continue;
    // Never read across a rule boundary.
    if (css.slice(from, open).includes('}')) continue;

    for (const decl of css.slice(open + 1, close).split(';')) {
      const t = decl.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

for (const { what, file, className, property, referencesVar } of CASES) {
  test(`${what}: "${className}" compiles to a ${property} rule`, async () => {
    /**
     * ── COMPILED FROM COMMENT-STRIPPED SOURCE, AND THAT IS LOAD-BEARING ───────
     * The first version of this test pointed Tailwind at the file on disk and
     * PASSED against the reintroduced bug. The reason is worth stating plainly,
     * because it defeats the whole guard:
     *
     * TAILWIND SCANS COMMENTS. This component's docstring explains the defect
     * and, in doing so, spells the class out. So the rule was emitted from the
     * PROSE — the code could be broken, the class never rendered by any code
     * path, and Tailwind would still produce a perfectly good rule because a
     * comment mentioned it.
     *
     * That is the standing repo rule (strip comments before scanning source)
     * arriving from an unexpected direction: here the comment does not merely
     * satisfy a matcher, it MASKS a real defect in the build output.
     *
     * So the guard compiles `src.code` — imports and comments removed — which
     * asks the question that matters: does the CODE produce this class?
     *
     * Note the asymmetry this creates, deliberately in the safe direction. The
     * real build DOES scan comments, so a production stylesheet might still
     * carry the rule when the code is broken. This test will fail anyway. Better
     * a guard that fires on a latent break than one that stays quiet because a
     * comment happened to rescue it.
     */
    const { code } = readSource(file);
    const css = await compile([{ raw: code, extension: 'js' }]);
    const decls = declarationsFor(css, className);

    assert.ok(
      decls.length > 0,
      `Tailwind emitted NO rule for "${className}" while scanning ${file}. `
      + 'The class is probably assembled from a template literal or a '
      + 'concatenation — Tailwind matches raw text, so the complete class must '
      + 'appear literally in the CODE (comments are stripped here on purpose).',
    );
    assert.ok(
      decls.some((d) => d.startsWith(`${property}:`)),
      `"${className}" compiled, but sets [${decls.join(', ')}] instead of ${property}. `
      + 'A bare var() Tailwind cannot type becomes background-IMAGE, which is '
      + 'invalid for a colour and therefore inert.',
    );

    if (referencesVar) {
      /**
       * The COUPLING, for a class that reads a variable it does not name.
       *
       * The component sets `referencesVar` inline; this asserts the rule
       * Tailwind emitted actually consumes it. Checked across ALL the rule's
       * declarations rather than the `property` one alone, because the ring is
       * assembled in two steps — the shadow is composed into an intermediate
       * custom property first, and it is that intermediate which names the
       * colour variable.
       *
       * This is the assertion a Tailwind upgrade breaks. It is here rather than
       * in a render test because no amount of reading the MARKUP can tell you
       * whether the stylesheet still consumes what the markup provides.
       */
      assert.ok(
        decls.some((d) => d.includes(`var(${referencesVar})`)),
        `"${className}" compiled, but no declaration reads var(${referencesVar}). `
        + `Got [${decls.join(', ')}]. The component sets ${referencesVar} inline, so if `
        + 'Tailwind has renamed its internal the inline value no longer reaches the '
        + 'utility and the ring silently falls back to the preflight default.',
      );
    }
  });
}

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the compiler DOES return nothing for a template-literal class', async () => {
  /**
   * The exact defect, reproduced. Tailwind is handed source text in which the
   * class is interpolated rather than written out; the class the component would
   * render must NOT appear in the output.
   *
   * This is what makes the assertions above meaningful: without it, "a rule
   * exists" could be true of any input at all.
   */
  const broken = 'const HOVER = `hover:bg-[var(${SOME_CONSTANT})]`;';
  const css = await compile([{ raw: broken, extension: 'js' }]);
  assert.equal(
    declarationsFor(css, 'hover:bg-[var(--round-hover-bg)]').length,
    0,
    'the interpolated form must not produce the rendered class — that is the bug',
  );

  // …and the literal form, through the same compiler, DOES.
  const fixed = 'const HOVER = "hover:bg-[var(--round-hover-bg)]";';
  const decls = declarationsFor(await compile([{ raw: fixed, extension: 'js' }]), 'hover:bg-[var(--round-hover-bg)]');
  assert.ok(decls.length > 0, 'the literal form must compile — otherwise this test proves nothing');
  assert.ok(decls.some((d) => d.startsWith('background-color:')));
});

test('CONTROL: it tests the DECLARATION, not the value — an unknown variable still compiles', async () => {
  /**
   * Required by the brief, and it is a real distinction. Tailwind does not know
   * or care whether `--never-defined-anywhere` exists; it emits
   * `background-color: var(--never-defined-anywhere)` regardless.
   *
   * So this guard cannot tell a live variable from a dead one — and must not
   * pretend to. What it guarantees is that the RULE EXISTS and sets the right
   * PROPERTY. Whether the variable is actually set on the element is a different
   * claim, pinned by the render tests that read the inline style attribute.
   */
  const raw = 'const x = "hover:bg-[var(--never-defined-anywhere)]";';
  const decls = declarationsFor(await compile([{ raw, extension: 'js' }]), 'hover:bg-[var(--never-defined-anywhere)]');
  assert.ok(decls.length > 0, 'a nonexistent variable must still produce a rule');
  assert.ok(
    decls.some((d) => d === 'background-color: var(--never-defined-anywhere)'),
    `expected the declaration verbatim, got [${decls.join(', ')}]`,
  );
});

test('CONTROL: the selector matcher is exact, not a substring', async () => {
  /**
   * `declarationsFor` escapes the class the way Tailwind does. If it matched
   * loosely it could find a longer selector that merely CONTAINS this class and
   * report someone else's declarations as proof.
   */
  const raw = 'const x = ["bg-[var(--round-hover-bg)]", "hover:bg-[var(--round-hover-bg)]"];';
  const css = await compile([{ raw, extension: 'js' }]);

  const hover = declarationsFor(css, 'hover:bg-[var(--round-hover-bg)]');
  const plain = declarationsFor(css, 'bg-[var(--round-hover-bg)]');
  assert.ok(hover.length > 0 && plain.length > 0, 'both variants must compile');

  // The plain class is a SUBSTRING of the hover one. A loose matcher would
  // return the hover rule when asked for the plain one and vice versa; an exact
  // one returns each rule once.
  assert.equal(plain.length, 1, `the plain class matched ${plain.length} rules — the matcher is loose`);
  assert.equal(hover.length, 1, `the hover class matched ${hover.length} rules — the matcher is loose`);
});

/**
 * ── THE RING CONTROLS ───────────────────────────────────────────────────────
 * These spell out class forms the COMPONENT must never name, including in a
 * comment (Tailwind scans comments, so a rejected class in a docstring becomes
 * a live rule for a variable nothing sets). It is safe here and only here:
 * tailwind.config's content globs cover `./src/**` and nothing under `test/`,
 * so this file is never scanned by the real build — and the compiles below are
 * handed their source as a `raw` string regardless.
 */

test('CONTROL: the ring COLOUR class paints nothing on its own — the WIDTH class does', async () => {
  /**
   * Why the ring needs both classes, stated as a fact about the compiler rather
   * than as a convention.
   *
   * A ring-colour utility emits ONLY `--tw-ring-color`. It is a perfectly valid
   * declaration and it draws nothing, because in Tailwind the WIDTH utility is
   * what composes the box-shadow from that variable. Ship the colour alone and
   * you get markup that looks right, a rule that exists, and no ring — a
   * failure with no symptom to grep for.
   *
   * So the two CASES above assert different properties on purpose, and this is
   * what proves the distinction is real rather than a naming choice.
   */
  const colour = declarationsFor(
    await compile([{ raw: 'const X = "hover:ring-[color:var(--round-ring)]";', extension: 'js' }]),
    'hover:ring-[color:var(--round-ring)]',
  );
  assert.ok(colour.length > 0, 'the colour class must compile to something');
  assert.ok(
    colour.some((d) => d.startsWith('--tw-ring-color:')),
    `expected it to set the ring colour, got [${colour.join(', ')}]`,
  );
  assert.equal(
    colour.some((d) => d.startsWith('box-shadow:')),
    false,
    'a colour-only ring utility must NOT paint — if this ever emits a box-shadow '
    + 'the width/colour split above has stopped being meaningful',
  );

  const width = declarationsFor(
    await compile([{ raw: 'const X = "hover:ring-2";', extension: 'js' }]),
    'hover:ring-2',
  );
  assert.ok(width.some((d) => d.startsWith('box-shadow:')), 'the width class must paint');
  assert.equal(
    width.some((d) => d.startsWith('--tw-ring-color:')),
    false,
    'and must NOT set the colour — that is the other class’s job, which is why '
    + 'deleting it would leave the ring on the preflight default blue',
  );
});

test('CONTROL: the UNHINTED ring-[var(--…)] form is ambiguous, and the hint settles it', async () => {
  /**
   * The reason the shipped class carries `color:` while the hover BACKGROUND
   * legitimately does not.
   *
   * `bg-[…]` has one claimant, so a bare `var()` there is unambiguous. `ring-[…]`
   * has two — a width utility and a colour utility — so the config has to guess.
   *
   * The honest finding, recorded because it is easy to assume the opposite in
   * either direction: in Tailwind 3.4.19 the unhinted form ALSO resolves to a
   * colour, so today the hint changes no output. It is kept because it removes a
   * guess that is the config's to change, and nothing would announce the change:
   * a value re-read as a WIDTH would produce `calc(<a hex> + 0px)`, which is
   * invalid, and the ring would vanish with the markup still looking correct.
   *
   * If this control ever fails, the hint has started mattering — which is the
   * moment to be glad it is there rather than to relax it.
   */
  const unhinted = declarationsFor(
    await compile([{ raw: 'const X = "hover:ring-[var(--round-ring)]";', extension: 'js' }]),
    'hover:ring-[var(--round-ring)]',
  );
  assert.ok(unhinted.length > 0, 'the unhinted form still compiles to a rule');
  assert.deepEqual(
    unhinted,
    ['--tw-ring-color: var(--round-ring)'],
    'the unhinted form resolved to something other than a plain ring colour — the '
    + 'ambiguity the `color:` hint removes has become load-bearing; do not drop the hint',
  );
  // Neither form paints, which is the point of the control above.
  assert.equal(unhinted.some((d) => d.startsWith('box-shadow:')), false);
});

test('CONTROL: a DRIFTING variable name reddens — in both couplings', async () => {
  /**
   * The failure `referencesVar` exists for. There are two couplings, and they
   * break for different reasons:
   *
   *   · CLASS -> OUR VARIABLE. `hover:ring-[color:var(--round-ring)]` and the
   *     inline style key must agree. Nothing mechanical holds them together —
   *     the class is a literal by necessity, so the name is written twice.
   *   · WIDTH CLASS -> TAILWIND'S VARIABLE. The emitted shadow must still read
   *     `--tw-ring-color`, which the colour class feeds. This is the one a
   *     Tailwind upgrade breaks, and it breaks SILENTLY: preflight defines that
   *     variable on every element, so the ring would not disappear, it would
   *     just stop being the round's colour.
   *
   * The render tests cover the component's side of the first coupling; this
   * covers the compiled side of both.
   */
  const width = declarationsFor(
    await compile([{ raw: 'const X = "hover:ring-2";', extension: 'js' }]),
    'hover:ring-2',
  );
  const colour = declarationsFor(
    await compile([{ raw: 'const X = "hover:ring-[color:var(--round-ring)]";', extension: 'js' }]),
    'hover:ring-[color:var(--round-ring)]',
  );

  assert.ok(
    width.some((d) => d.includes('var(--tw-ring-color)')),
    `the width rule no longer reads var(--tw-ring-color): [${width.join(', ')}]`,
  );
  assert.ok(
    colour.some((d) => d.includes('var(--round-ring)')),
    `the colour rule no longer reads var(--round-ring): [${colour.join(', ')}]`,
  );

  // Drifted spellings must NOT match, or `includes` is loose enough to accept
  // anything and both assertions above are decorative.
  for (const wrong of ['--tw-ring-colour', '--round-rings', '--round_ring', '--tw-ringcolor']) {
    assert.equal(
      [...width, ...colour].some((d) => d.includes(`var(${wrong})`)),
      false,
      `the probe matched a variable no rule reads: ${wrong}`,
    );
  }
});

test('CONTROL: the ring cases would redden if the component stopped rendering them', async () => {
  /**
   * `hover:ring-2` carries no brackets, so it cannot fail the way the hover
   * background did. It can still be DELETED — and because it is a stock utility
   * other components use, a guard pointed at the whole stylesheet would keep
   * passing after this file dropped it.
   *
   * That is why the CASES compile ONE file's code in isolation. This is the
   * proof: the same classes, against a source that no longer mentions them.
   */
  const without = 'const CELL = "group cursor-pointer rounded-9e-md border px-1 py-1.5";';
  const css = await compile([{ raw: without, extension: 'js' }]);
  assert.equal(declarationsFor(css, 'hover:ring-2').length, 0, 'no width rule');
  assert.equal(
    declarationsFor(css, 'hover:ring-[color:var(--round-ring)]').length, 0, 'no colour rule',
  );
  assert.ok(css.includes('.rounded-9e-md'), 'but the classes that ARE there compiled');
});

test('CONTROL: a class NOT present in the scanned source produces nothing', async () => {
  // Otherwise "a rule exists" might be Tailwind emitting the world rather than
  // reading the content it was given.
  const raw = 'const x = "text-sm";';
  const css = await compile([{ raw, extension: 'js' }]);
  assert.equal(declarationsFor(css, 'hover:bg-[var(--round-hover-bg)]').length, 0);
  assert.ok(css.includes('.text-sm'), 'but the class that IS there compiled');
});

test('the config under test is the real one, with its content globs intact', () => {
  /**
   * The compile above REPLACES `content` so it can scan one file at a time. That
   * makes it blind to a glob mistake, which is the OTHER way a class goes
   * missing — so the real globs are asserted separately rather than left
   * unguarded. (test/pure/tailwindContentCoverage owns the deeper version of
   * this claim; here it is just enough to know the preset is real.)
   */
  const config = require_(path.join(ROOT, 'tailwind.config.js'));
  assert.ok(Array.isArray(config.content), 'the real config must declare content');
  for (const glob of ['./src/app/**/*.{js,jsx}', './src/components/**/*.{js,jsx}']) {
    assert.ok(config.content.includes(glob), `the real config lost ${glob}`);
  }
  // And every CASE file sits under one of those roots, or scanning it here
  // would prove nothing about the real build.
  for (const { file } of CASES) {
    assert.ok(
      file.startsWith('src/app/') || file.startsWith('src/components/') || file.startsWith('src/lib/'),
      `${file} is outside the scanned roots`,
    );
  }
});
