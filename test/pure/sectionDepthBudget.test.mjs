import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SECTION_DEPTH } from '@/lib/pageBuilder/containerSlots';

/**
 * ROUND 56 — the nesting budget the promotion-page survey depends on.
 *
 * SELF-RETIRING. docs/promotion-page-coverage.md §E concludes that both target
 * promotion pages fit inside the section tree with no structural work, and that
 * conclusion rests on ONE number: page B's deepest path is
 *
 *   two_column -> right slot -> container -> card_grid -> stat_card
 *
 * which is depth 3 counting a top-level section as 0. Page A reaches 3 as well
 * once the bundle row is wrapped in a container.
 *
 * ── WHY THIS IS WORTH A TEST WHEN NOTHING IS BUILT YET ────────────────────
 * The value is not pinned anywhere. The only reference to MAX_SECTION_DEPTH in
 * test/ is test/render/structurePanelBands, which asserts the SHAPE of the
 * refusal condition in source — `if (childDepth > MAX_SECTION_DEPTH)` — and the
 * wording of the message. Neither reads the number.
 *
 * So lowering the cap to 2 would leave the whole suite green while silently
 * invalidating the survey's central layout finding, and nothing would connect
 * the change to the document it broke. That is the gap this closes, and it is
 * the only one round 56 measured that warranted an assertion: guarding fields
 * that do not exist yet would be speculative.
 *
 * ── WHEN TO DELETE IT ─────────────────────────────────────────────────────
 * Once the pages are built, the stored pages constrain the depth themselves and
 * this becomes redundant. Delete it then, with the round that builds them.
 *
 * It asserts a FLOOR, not the exact value: raising the cap is not a regression
 * against anything in the survey, and pinning 4 exactly would make a deliberate
 * increase fail for no reason.
 */

/** Page B's deepest path, and page A's once its bundle row is wrapped. */
const DEPTH_THE_SURVEY_NEEDS = 3;

test('the nesting cap still allows the depth the promotion pages need', () => {
  assert.equal(typeof MAX_SECTION_DEPTH, 'number', 'the cap stopped being a number');
  assert.ok(
    MAX_SECTION_DEPTH >= DEPTH_THE_SURVEY_NEEDS,
    `MAX_SECTION_DEPTH is ${MAX_SECTION_DEPTH}, below the ${DEPTH_THE_SURVEY_NEEDS} that `
    + 'docs/promotion-page-coverage.md §E measured both target pages to require. Either the '
    + 'survey needs redoing or this lowering was not intended.'
  );
});

test('CONTROL: the assertion can fail — it reads the real constant', () => {
  /**
   * Without this, the test above passes for a constant that has become
   * undefined, NaN, or an import that silently resolved to nothing — all of
   * which would make `>=` meaningless rather than false.
   */
  assert.ok(Number.isInteger(MAX_SECTION_DEPTH), 'the cap is not an integer');
  assert.ok(MAX_SECTION_DEPTH > 0 && MAX_SECTION_DEPTH < 100,
    `the cap read back as ${MAX_SECTION_DEPTH}, which is not a plausible nesting budget`);
  // And the comparison genuinely discriminates at this value.
  assert.equal(MAX_SECTION_DEPTH >= DEPTH_THE_SURVEY_NEEDS + 1000, false,
    'the floor comparison is not evaluating the constant');
});
