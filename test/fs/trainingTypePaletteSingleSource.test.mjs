import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * NO PUBLIC SURFACE DECLARES A TRAINING-TYPE PALETTE OF ITS OWN.
 *
 * ── WHY A SOURCE GUARD AND NOT A RENDER ASSERTION ───────────────────────────
 * A render test can only see the surface it renders. Four copies of this map
 * existed simultaneously and every one of them rendered correctly BY ITS OWN
 * LIGHTS — /schedule drew `#00CCFF`, the course card drew `#005eff`, and both
 * were exactly what their component asked for. Nothing was broken from inside
 * any single file, which is precisely why it survived: the defect is the
 * RELATIONSHIP between files, and only a sweep across files can see it.
 *
 * ── WHAT COUNTS AS A VIOLATION ──────────────────────────────────────────────
 * A hex from the palette appearing in a schedule/course surface that does not
 * import the shared module. That is narrower than "no hex anywhere":
 * `#22C55E` is also a generic success green used by a dozen admin toggles, and
 * banning it site-wide would fire on code that has nothing to do with delivery
 * types. So the sweep is scoped to the surfaces that draw a ROUND.
 *
 * Comments are stripped by test/sourceScan.mjs, so the docstrings in those very
 * files explaining which colours they used to use do not trip this.
 */

/** The surfaces that draw a round's delivery type. */
const TYPE_SURFACES = [
  'src/app/(public)/schedule/_components/ScheduleClient.jsx',
  'src/app/(public)/search/_components/SearchClient.jsx',
  'src/app/(public)/[...slug]/_components/ScheduleSection.jsx',
  'src/components/ScheduleCard.jsx',
  'src/components/registration/ScheduleCarousel.jsx',
];

const SHARED = '@/lib/schedule/trainingTypeColor';

/** The palette's hexes, plus the two wrong ones this consolidation retired. */
const PALETTE_HEX = /#00CCFF|#8B5CF6|#005eff|#a854f7/i;

test('every type surface IMPORTS the shared palette', () => {
  for (const rel of TYPE_SURFACES) {
    const src = readSource(rel);
    // `includes` on the literal specifier, not a built RegExp: the path is full
    // of `/` and `.`, and escaping it into a pattern is a step that can go wrong
    // silently and report every file as non-importing.
    assert.ok(
      src.withImports.includes(`from '${SHARED}'`)
        || src.withImports.includes(`from "${SHARED}"`),
      `${rel} does not import the shared palette`,
    );
  }
});

test('and none of them declares a palette of its own', () => {
  /**
   * The two wrong hexes are in the pattern deliberately. `#005eff` and
   * `#a854f7` are not merely "a colour someone might pick" — they are the exact
   * values the course card diverged to, so their reappearance in any of these
   * files is the specific regression this guard exists for.
   */
  for (const rel of TYPE_SURFACES) {
    const src = readSource(rel);
    const hit = src.code.match(PALETTE_HEX);
    assert.equal(
      hit,
      null,
      `${rel} spells a training-type colour literally (${hit?.[0]}) — import it instead`,
    );
  }
});

test('no type surface keeps a light-only Tailwind class map for the type either', () => {
  /**
   * ScheduleCarousel's copy was not a hex map, it was
   * `bg-sky-100 text-sky-700` / `bg-violet-100 …` / `bg-emerald-100 …`. Banning
   * only hexes would have left that one standing — and it was the worst of the
   * four, because it had no `dark:` variant at all.
   */
  for (const rel of TYPE_SURFACES) {
    const src = readSource(rel);
    for (const cls of ['bg-sky-100', 'bg-violet-100', 'bg-emerald-100']) {
      assert.equal(
        src.code.includes(cls),
        false,
        `${rel} still carries the light-only type pill class "${cls}"`,
      );
    }
  }
});

test('the shared module is the ONLY place the PAIR is declared', () => {
  /**
   * The positive half, and the one that survives a file being renamed out of the
   * list above: sweep ALL of src/ rather than a named list.
   *
   * ── WHY THE TEST IS "BOTH HEXES", NOT "EITHER HEX" ──────────────────────────
   * The first draft of this asserted that no file outside the module contains
   * `#00CCFF` OR `#8B5CF6`, and it failed on two files that are entirely
   * innocent: admin/articles/ArticleForm and admin/pages/CustomPageForm each
   * carry a generic colour-picker swatch list
   * (`['#0D1B2A', '#005CFF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', …]`)
   * that has nothing to do with a delivery type — the violet just happens to be
   * a nice violet.
   *
   * A PALETTE is the PAIR. One hex is a colour someone picked; classroom AND
   * hybrid in the same file is a training-type map being redeclared. Testing for
   * the pair is what makes this sweep able to cover all of src/ without firing
   * on unrelated code — and covering all of src/ is the whole point, because a
   * named list cannot see a copy in a file nobody thought to list.
   */
  const declarers = walkSources('src')
    .filter((f) => /#00CCFF/i.test(f.code) && /#8B5CF6|#a854f7/i.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(
    declarers,
    ['src/lib/schedule/trainingTypeColor.js'],
    `the palette PAIR is declared in more than one file: ${declarers.join(', ')}`,
  );
});

test('CONTROL: the pair probe fires on a pair and not on a lone swatch', () => {
  /**
   * Both halves, because a pair test that never fires is as useless as one that
   * always does — and the innocent files above are the reason the narrowing
   * exists, so they are named here as evidence rather than left implicit.
   */
  const pair = "const TYPE_COLOR = { classroom: '#00CCFF', hybrid: '#8B5CF6' };";
  const isPair = (s) => /#00CCFF/i.test(s) && /#8B5CF6|#a854f7/i.test(s);
  assert.equal(isPair(pair), true, 'a redeclared palette must trip it');

  const swatchList = "const colors = ['#0D1B2A', '#005CFF', '#22C55E', '#8B5CF6', '#94A3B8'];";
  assert.equal(isPair(swatchList), false, 'a generic colour picker must NOT trip it');

  // …and those pickers really are in the tree, so the narrowing is load-bearing
  // rather than defensive. If they are ever recoloured, this goes red and the
  // narrowing can be revisited.
  const lone = walkSources('src')
    .filter((f) => /#8B5CF6/i.test(f.code) && !/#00CCFF/i.test(f.code))
    .map((f) => f.rel);
  assert.ok(
    lone.length > 0,
    'no file carries the violet alone any more — the pair narrowing may be unnecessary',
  );
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the hex probe DOES fire on a reintroduced map', () => {
  /**
   * Every assertion above is an absence. An absence probe that can never match
   * passes forever, so it is run against the exact shape it bans — the map as it
   * was written in ScheduleClient before this change.
   */
  const reintroduced = [
    'const TYPE_COLOR = {',
    "  classroom: '#00CCFF',",
    "  hybrid: '#8B5CF6',",
    "  online: '#22C55E',",
    '};',
  ].join('\n');
  assert.match(reintroduced, PALETTE_HEX, 'the probe must see a reintroduced palette');

  // And the course card's diverged spelling, which is a different pair.
  const diverged = "const TYPE_BORDER = { classroom: '#005eff', hybrid: '#a854f7' };";
  assert.match(diverged, PALETTE_HEX, 'and the diverged one');

  // …but NOT on a file that merely imports and uses it.
  const clean = "import { trainingTypeColor } from '@/lib/schedule/trainingTypeColor';\n"
    + 'const color = trainingTypeColor(schedule.type);';
  assert.equal(PALETTE_HEX.test(clean), false, 'a consumer must not trip the guard');
});

test('CONTROL: the class probe DOES fire on the carousel pill it replaced', () => {
  const oldPill = "const TYPE_BADGE_CLASS = { classroom: 'bg-sky-100 text-sky-700' };";
  assert.ok(oldPill.includes('bg-sky-100'), 'the probe sees the light-only pill');
  const newPill = 'style={{ backgroundColor: trainingTypeTint(type, 0.12) }}';
  assert.equal(newPill.includes('bg-sky-100'), false);
});

test('CONTROL: the sweep is reading real code, not empty strings', () => {
  /**
   * A wrong path or a failed scrub returns '' and EVERY "does not contain"
   * assertion above passes together — the worst possible combination.
   */
  for (const rel of TYPE_SURFACES) {
    const src = readSource(rel);
    assert.ok(src.code.length > 500, `${rel} was not actually read`);
  }
  // And the shared module really does hold the palette the others gave up.
  assert.match(readSource('src/lib/schedule/trainingTypeColor.js').code, /#00CCFF/);
});

test('CONTROL: `#22C55E` is deliberately NOT banned site-wide', () => {
  /**
   * The scoping decision, asserted so it is a choice rather than an oversight.
   * Green is also a generic success colour on a dozen admin toggles; a
   * site-wide ban would fire on code with no delivery type in it. Proving those
   * other users exist is what makes the narrow scope defensible.
   */
  const elsewhere = walkSources('src')
    .filter((f) => !TYPE_SURFACES.includes(f.rel))
    .filter((f) => f.rel !== 'src/lib/schedule/trainingTypeColor.js')
    .filter((f) => /#22C55E/i.test(f.code))
    .map((f) => f.rel);
  assert.ok(
    elsewhere.length > 0,
    'no other file uses #22C55E — the narrow scope may no longer be needed',
  );
});
