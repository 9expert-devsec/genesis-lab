import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RENDERABLE_SECTION_TYPES } from '@/components/pageBuilder/SectionRenderer';
import {
  ALL_SECTION_TYPES,
  LAYOUT_TYPES, CONTENT_TYPES, CARD_TYPES, DYNAMIC_TYPES, ADVANCED_TYPES,
} from '@/lib/schemas/pageBuilder';
import { readSource } from '../sourceScan.mjs';

/**
 * ── WHY THIS FILE EXISTS: A BRANCH THAT LOOKS DEAD AND IS NOT ───────────────
 *
 * `SectionPicker.typeState()` can return `'soon'`, and `'soon'` renders a
 * DISABLED button. It returns it for exactly one reason: the type is not in
 * `RENDERABLE_SECTION_TYPES` (the renderer's REGISTRY keys), so there is no
 * component to draw it. That is the picker's fail-closed path — the one thing
 * standing between a schema-only type and an author clicking it into a page
 * that validates, saves, publishes, and draws NOTHING.
 *
 * After 2C.2b every declared type got a component, so `'soon'` stopped firing.
 * A dead branch invites deletion, and deleting THIS one is not a cleanup: it
 * converts "a type with no component is visibly disabled" into "a type with no
 * component is clickable", and the failure lands in `newSection()` or, worse,
 * on a published page.
 *
 * So the branch stays and this file MEASURES the claim that it is unreachable,
 * rather than the picker asserting it in a comment nobody re-checks. The
 * measurement is self-retiring: the day a declared type ships without a
 * component, the assertion below goes red and says so in those words. Red here
 * is not a regression in this file — it is the `'soon'` path coming back to
 * life, and the branch earning its keep.
 *
 * Named at `typeState` in SectionPicker.jsx, so the next reader who thinks the
 * branch is dead arrives here first.
 */

/**
 * The whole computation, as one pure function of two lists.
 *
 * It is a one-liner and it is still hoisted out, because the CONTROL below has
 * to run THE SAME code on a fake list. A control that re-implements the
 * subtraction next to the test proves the control works, not the test.
 */
function declaredButUndrawable(declared, renderable) {
  return declared.filter((type) => !renderable.includes(type));
}

// ── The measurement ─────────────────────────────────────────────────────────

test('every declared section type has a component — so the picker’s "soon" state is unreachable TODAY', () => {
  const orphans = declaredButUndrawable(ALL_SECTION_TYPES, RENDERABLE_SECTION_TYPES);
  assert.deepEqual(orphans, [],
    `A NON-RENDERABLE SECTION TYPE NOW EXISTS: ${orphans.join(', ')}. `
    + 'These types are declared in lib/schemas/sections/* but have no component in '
    + 'SectionRenderer’s REGISTRY. THE "soon" PATH IN SectionPicker.typeState IS LIVE '
    + 'AGAIN — it is what keeps each of these disabled in the picker instead of '
    + 'clickable into a page that publishes empty. Do not "fix" this by deleting the '
    + 'branch or by loosening this test; either ship the component or accept that the '
    + 'type is offered as "เร็ว ๆ นี้" and update the comment at typeState that names '
    + 'this test as the measurement.');
});

test('the measurement is not vacuous — both lists are real and non-empty', () => {
  // `[].filter(...)` is `[]`, so an empty (or renamed-away) ALL_SECTION_TYPES
  // would satisfy the assertion above while measuring nothing at all. This is
  // the "what would have to be true for this to pass while the thing it guards
  // is broken?" question, answered rather than assumed.
  assert.ok(ALL_SECTION_TYPES.length > 0, 'ALL_SECTION_TYPES is empty');
  assert.ok(RENDERABLE_SECTION_TYPES.length > 0, 'RENDERABLE_SECTION_TYPES is empty');
  assert.equal(ALL_SECTION_TYPES.length, 27);
  assert.equal(RENDERABLE_SECTION_TYPES.length, 27);
});

test('CONTROL: the same function reddens on a type list that HAS an undrawable type', () => {
  /**
   * The fake list: one schema-only type, everything else drawable. If this
   * returned `[]` the assertion above could never go red and the whole file
   * would be decoration.
   *
   * THE FIXTURE IS BUILT FROM `RENDERABLE_SECTION_TYPES`, NOT FROM
   * `ALL_SECTION_TYPES`, AND THAT IS THE SECOND VERSION OF THIS LINE. The first
   * spread the real declared list, and `_control-r0.mjs apply schema-only-type`
   * reddened it — correctly. A control must state its own expected answer, and
   * this one could not: the moment a real schema-only type exists the fixture
   * contains TWO undrawable types and the hardcoded `['pull_quote']` is wrong.
   * A control that goes red in the same breath as the test it validates has
   * stopped being independent evidence — it is a second copy of the same
   * assertion. Derived from the renderable list, the answer is `['pull_quote']`
   * by construction, whatever the schema does next.
   */
  const fakeDeclared = [...RENDERABLE_SECTION_TYPES, 'pull_quote'];
  assert.deepEqual(declaredButUndrawable(fakeDeclared, RENDERABLE_SECTION_TYPES), ['pull_quote']);

  // …and the reverse direction, so the control is not just "filter can return
  // something": a renderable type must NOT be reported as an orphan.
  assert.deepEqual(declaredButUndrawable(['heading'], RENDERABLE_SECTION_TYPES), []);
  assert.deepEqual(declaredButUndrawable(['heading', 'pull_quote'], RENDERABLE_SECTION_TYPES), ['pull_quote']);
});

// ── What the measurement is ABOUT: the picker displays exactly this set ──────

test('the picker displays the five category lists, which is what ALL_SECTION_TYPES concatenates', () => {
  /**
   * THE SEAM, AND WHY IT IS ASSERTED. `ALL_SECTION_TYPES` is used nowhere in
   * `src/` — it exists for readers like this one. The PICKER builds its GROUPS
   * from the five per-category constants directly. So measuring
   * `ALL_SECTION_TYPES` only says something about the picker while the two are
   * the same set. Both halves are pinned: the arithmetic here, the five
   * constants in the source below.
   */
  assert.deepEqual(
    [...ALL_SECTION_TYPES].sort(),
    [...LAYOUT_TYPES, ...CONTENT_TYPES, ...CARD_TYPES, ...DYNAMIC_TYPES, ...ADVANCED_TYPES].sort(),
  );

  const picker = readSource('src/components/pageBuilder/editor/SectionPicker.jsx').code;
  for (const list of ['LAYOUT_TYPES', 'CONTENT_TYPES', 'CARD_TYPES', 'DYNAMIC_TYPES', 'ADVANCED_TYPES']) {
    assert.ok(picker.includes(`types: ${list}`),
      `SectionPicker’s GROUPS no longer builds from ${list}. The picker now displays a `
      + 'set this file does not measure, so the "soon is unreachable" claim above has '
      + 'stopped being about the picker.');
  }
});

// ── The branch itself must survive ──────────────────────────────────────────

test('the fail-closed "soon" branch is still IN typeState — this file does not license deleting it', () => {
  // Read from `code`: the docstring at typeState QUOTES the word 'soon' several
  // times, and a raw match would be satisfied by the prose that survives the
  // branch's removal. Defect 2 in sourceScan.mjs's header, in this file's own
  // costume.
  const picker = readSource('src/components/pageBuilder/editor/SectionPicker.jsx').code;
  assert.match(picker, /RENDERABLE_SECTION_TYPES\.includes\(type\)/,
    'typeState no longer consults the renderer registry. Every declared type is now '
    + 'clickable, including any that has no component.');
  assert.match(picker, /return renderable \? 'add' : 'soon';/,
    'the renderable → add / not-renderable → soon branch is gone. It reads as dead code '
    + 'and is not: it is the only thing that stops a schema-only type being added to a '
    + 'page. See the measurement at the top of this file.');
});

test('the comment at typeState names THIS file, and CONTROL: that comment is invisible to the code view', () => {
  /**
   * The one assertion here whose subject IS a comment, so it reads `raw` — the
   * documented exception in test/run.mjs's header. The control is the second
   * half: the same sentinel must be ABSENT from `code`. If the scrubber ever
   * stopped stripping comments, the guard above about the branch surviving
   * would start passing on prose, and this pair is what would say so.
   */
  const picker = readSource('src/components/pageBuilder/editor/SectionPicker.jsx');
  const SENTINEL = 'test/render/sectionTypeCoverage.test.mjs';
  assert.ok(picker.raw.includes(SENTINEL),
    'typeState no longer names the test that measures its "soon" branch as unreachable. '
    + 'Without the pointer the branch reads as dead code to the next reader.');
  assert.ok(!picker.code.includes(SENTINEL),
    'PRECONDITION BROKEN: the sentinel survives into the code view, so comments are no '
    + 'longer being stripped. Every source guard in this file that reads `.code` is now '
    + 'matchable by prose.');
});
