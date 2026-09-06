import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatBaht, formatPrice } from '@/lib/utils';

/**
 * `formatBaht` — the same number as `formatPrice`, WITHOUT the ฿.
 *
 * It exists because three surfaces write บาท themselves and were printing the
 * unit twice: `฿55,700 บาท`. The value of a shared function here is not the
 * arithmetic — it is that the two cannot disagree about grouping or about the
 * empty case, which is what three inline `toLocaleString` calls would have
 * guaranteed within a round or two.
 *
 * Every test below is paired with `formatPrice` rather than asserted against a
 * literal alone, because the CLAIM is a relationship between the two.
 */

test('it is formatPrice without the symbol, digit for digit', () => {
  for (const n of [0, 1, 999, 1000, 32640, 40800, 55700, 1234567]) {
    const bare = formatBaht(n);
    const withSymbol = formatPrice(n);
    assert.equal(bare.includes('฿'), false, `formatBaht(${n}) printed a ฿`);
    assert.equal(
      withSymbol.replace('฿', ''),
      bare,
      `formatBaht(${n}) and formatPrice(${n}) disagree beyond the symbol`,
    );
  }
});

test('CONTROL: formatPrice really does carry the symbol', () => {
  // Without this, "strip the ฿ and they match" would pass on two functions that
  // both emit a bare number — which is the state this whole test would then be
  // failing to detect.
  assert.equal(formatPrice(55700).includes('฿'), true, 'formatPrice lost its symbol');
  assert.notEqual(formatPrice(55700), formatBaht(55700));
});

test('it groups thousands, and prints no decimals', () => {
  assert.equal(formatBaht(55700), '55,700');
  assert.equal(formatBaht(38990), '38,990');
  assert.equal(formatBaht(1000), '1,000');
  assert.equal(formatBaht(999), '999');
  // Whole baht only. A bundle price is an integer; a stray fraction must not
  // reach the screen as `38,990.5`.
  assert.equal(formatBaht(38990.4), '38,990');
  assert.equal(formatBaht(38990.6), '38,991');
});

test('CONTROL: the grouping assertion can fail', () => {
  // A four-digit number is the smallest that groups, so if grouping were off
  // this pair would be equal.
  assert.notEqual(formatBaht(1000), '1000');
  assert.equal(formatBaht(999), '999');
});

test('null and NaN answer "-", exactly as formatPrice does', () => {
  /**
   * The two must not disagree about the empty case: a surface switching from
   * one to the other would otherwise change what an unset price looks like as
   * a side effect of a formatting decision.
   */
  for (const empty of [null, undefined, NaN, 'not a number']) {
    assert.equal(formatBaht(empty), '-', `formatBaht(${String(empty)})`);
    assert.equal(formatPrice(empty), '-', `formatPrice(${String(empty)})`);
  }
});

test('ZERO is a price, not an empty value', () => {
  // The distinction the bundle schema keeps: `null` is "not set", `0` is free.
  // A formatter that answered '-' for 0 would collapse them at the last step.
  assert.equal(formatBaht(0), '0');
  assert.notEqual(formatBaht(0), '-');
});

test('CONTROL: the zero case is distinguishable from the empty one', () => {
  // Without this, `formatBaht(0) === '0'` would still pass if null ALSO
  // returned '0' — and the two would be indistinguishable on screen.
  assert.notEqual(formatBaht(0), formatBaht(null));
});
