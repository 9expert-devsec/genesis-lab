import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INHOUSE_ONLY_LABEL,
  coursePriceLabel,
} from '@/lib/coursePriceLabel';

/**
 * THE CURRENCY SUFFIX BELONGS TO NUMBERS.
 *
 * Four of the seven surfaces that used to word this label built it as
 * `!price ? 'Call .-' : '<n> .-'`, so the unit was glued onto the label as well
 * as onto the price. Swapping the word in place yields "Inhouse Only .-" — a
 * baht marker on a phrase that is not an amount — and it would have shipped on
 * the catalog card, the career-path card, the article card and /search at once.
 *
 * ── WHY (b) IS NOT DECORATION ───────────────────────────────────────────────
 * The obvious repair for (a) is to stop appending the suffix, and a formatter
 * that stopped appending it FOR EVERYONE satisfies (a) perfectly while
 * silently stripping `.-` from every priced course on the site. (b) is the
 * control that separates "the suffix moved inside the numeric branch" from
 * "the suffix is gone", which is the failure the fix itself could cause.
 */

test('a course with no price formats as Inhouse Only and carries NO suffix', () => {
  const label = coursePriceLabel(0, { suffix: '.-' });

  assert.equal(label, INHOUSE_ONLY_LABEL, 'the label is the shared constant');
  assert.ok(
    !label.includes('.-'),
    `the currency unit must not reach the label — got "${label}"`,
  );

  // The three spellings the old call sites each treated as "no price": absent,
  // zero and non-numeric. They disagreed before this module existed, so all
  // three are pinned to the same answer rather than just the one the screenshot
  // happened to show.
  for (const priceless of [null, undefined, '', 0, '0', 'n/a']) {
    assert.equal(
      coursePriceLabel(priceless, { suffix: '.-' }),
      INHOUSE_ONLY_LABEL,
      `${JSON.stringify(priceless)} means no public price`,
    );
  }
});

test('CONTROL: a numeric price still formats as the number WITH its suffix', () => {
  // Without this, the assertion above passes on a formatter that dropped the
  // suffix for everyone — which would quietly strip `.-` from every priced
  // course on four surfaces.
  assert.equal(coursePriceLabel(8500, { suffix: '.-' }), '8,500 .-');
  assert.equal(coursePriceLabel('14900', { suffix: '.-' }), '14,900 .-');

  // /schedule's mobile card uses a different unit through the same door, so the
  // suffix is genuinely a parameter and not a hardcoded '.-' that happens to
  // satisfy the two lines above.
  assert.equal(coursePriceLabel(8500, { suffix: '฿' }), '8,500 ฿');

  // And the surfaces that want a bare number (the two table columns) still get
  // one — no suffix appears when none was asked for.
  assert.equal(coursePriceLabel(8500), '8,500');
});
