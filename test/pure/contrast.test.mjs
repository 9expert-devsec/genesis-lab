import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, AA_NORMAL, AA_LARGE } from '@/lib/color/contrast';

/**
 * WCAG contrast, as a function.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM THE TOKEN TABLE ────────────────────
 * test/fs/adminRailContrast asserts that the rail's token pairs clear 4.5:1.
 * Every one of those assertions is only as trustworthy as the arithmetic
 * underneath it, and a `contrastRatio` that returned 21 for everything would
 * make the whole table pass while measuring nothing. So the maths is pinned
 * here against values that can be checked by hand — black on white is exactly
 * 21, a colour against itself is exactly 1 — before anything is concluded from
 * it about the palette.
 */

test('black on white is exactly 21:1, the maximum', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
});

test('a colour against itself is exactly 1:1, the minimum', () => {
  for (const hex of ['#000000', '#FFFFFF', '#0D1B2A', '#005CFF']) {
    assert.equal(contrastRatio(hex, hex).toFixed(2), '1.00');
  }
});

test('the ratio is symmetric — argument order does not change it', () => {
  // The formula divides lighter by darker, so an implementation that used the
  // arguments positionally would return the reciprocal one way round and every
  // `>= 4.5` assertion would pass or fail depending on how it was called.
  assert.equal(
    contrastRatio('#0D1B2A', '#F8FAFD').toFixed(4),
    contrastRatio('#F8FAFD', '#0D1B2A').toFixed(4),
  );
});

test('known WCAG reference pairs land where they should', () => {
  // Hand-checkable anchors from this repo's own palette notes: globals.css
  // states --9e-action is ~5.3:1 on white and --9e-brand ~3.4:1.
  assert.ok(Math.abs(contrastRatio('#005CFF', '#FFFFFF') - 5.3) < 0.15,
    `--9e-action on white measured ${contrastRatio('#005CFF', '#FFFFFF').toFixed(2)}, the palette note says ~5.3`);
  assert.ok(Math.abs(contrastRatio('#2486FF', '#FFFFFF') - 3.4) < 0.15,
    `--9e-brand on white measured ${contrastRatio('#2486FF', '#FFFFFF').toFixed(2)}, the palette note says ~3.4`);
});

test('shorthand and case-insensitive hex parse the same as the long form', () => {
  assert.equal(contrastRatio('#fff', '#000'), contrastRatio('#FFFFFF', '#000000'));
  assert.equal(contrastRatio('#0d1b2a', '#fff'), contrastRatio('#0D1B2A', '#FFFFFF'));
  assert.equal(contrastRatio('0D1B2A', '#FFFFFF'), contrastRatio('#0D1B2A', '#FFFFFF'));
});

test('an unparseable colour returns NaN, which FAILS a >= assertion', () => {
  // The behaviour a guard depends on. If a token name is mistyped and the
  // lookup yields undefined, `NaN >= 4.5` is false, so the guard goes red. A
  // throw would also work; returning 1 or 21 would not.
  for (const bad of [undefined, null, '', 'var(--admin-rail-surface)', '#12', 'rebeccapurple', 42]) {
    const r = contrastRatio(bad, '#FFFFFF');
    assert.ok(Number.isNaN(r), `${JSON.stringify(bad)} produced ${r}, not NaN`);
    assert.equal(r >= AA_NORMAL, false, 'NaN must not satisfy a threshold check');
  }
});

test('the thresholds are the WCAG AA numbers, not house guesses', () => {
  assert.equal(AA_NORMAL, 4.5);
  assert.equal(AA_LARGE, 3);
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the function DISCRIMINATES — it does not just return a big number', () => {
  // The failure this file is really guarding against. A `contrastRatio` that
  // returned a constant >= 4.5 would make every assertion in the token table
  // pass, and the table is the point of the round.
  const pass = contrastRatio('#0D1B2A', '#9EA6B2'); // the rail's inactive label
  const fail = contrastRatio('#0D1B2A', '#64748B'); // the mockup's group grey
  assert.ok(pass >= AA_NORMAL, `expected a pass, got ${pass.toFixed(2)}`);
  assert.ok(fail < AA_NORMAL, `expected a fail, got ${fail.toFixed(2)}`);
  assert.ok(pass > fail);
});
