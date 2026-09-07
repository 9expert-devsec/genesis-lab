import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HEADCOUNT,
  normalizeHeadcount,
  hasHeadcount,
  headcountLabel,
} from '@/lib/recruitHeadcount';

/**
 * The one normaliser for a job posting's optional headcount.
 *
 * ══ WHY THIS IS A PURE TIER AND NOT A RENDER ONE ════════════════════════════
 * Four surfaces show this value — the public card, the detail dialog, the admin
 * list row — and one saves it. Every one of them asks the same question, and
 * the whole point of the design is that they ask it in ONE place. If the rule
 * were tested only through a render, then the write path's copy of it would be
 * untested, and the day the two disagreed the render tests would still be
 * green. So the rule is pinned here, once, and the render tests assert that
 * each surface actually routes through it.
 *
 * ── THE CASES ARE THE ONES THAT ACTUALLY ARRIVE ─────────────────────────────
 * Not a fuzz sweep. `''` is an input the admin tabbed through; `'   '` is the
 * same input with a stray space; `'3'` is what an <input type="number"> yields
 * even though it looks numeric; `3` is what comes back out of Mongo; a missing
 * field on a posting written before this existed reads as `undefined`. `0` is
 * the one that matters most, because `Number('')` is 0 and every naive version
 * of this stores it.
 */

// ── everything that means "no headcount" ────────────────────────────────────
//
// ONE OUTCOME FOR ALL OF THEM, deliberately: null. The brief allowed "null or
// rejected, per your rule" for the over-cap case; the rule chosen is that this
// function has exactly two possible answers, so there is no second failure mode
// for a call site to forget to handle.
const NOTHING = [
  ['an empty input', ''],
  ['an input the user tabbed through', '   '],
  ['null', null],
  ['a field that does not exist on a legacy posting', undefined],
  ['the string zero', '0'],
  ['the number zero', 0],
  ['a negative string', '-2'],
  ['a negative number', -2],
  ['text', 'abc'],
  ['a fraction as a string', '3.7'],
  ['a fraction as a number', 3.7],
  ['one over the cap', MAX_HEADCOUNT + 1],
  ['far over the cap', 100000],
];

for (const [label, input] of NOTHING) {
  test(`normalizeHeadcount: ${label} → null`, () => {
    assert.equal(normalizeHeadcount(input), null,
      `${JSON.stringify(input)} produced ${JSON.stringify(normalizeHeadcount(input))}`);
  });
}

// ── everything that is a headcount ──────────────────────────────────────────
const NUMBERS = [
  ['a numeric string', '3', 3],
  ['a number', 3, 3],
  ['a padded numeric string', ' 4 ', 4],
  ['one', 1, 1],
  ['one as a string', '1', 1],
  ['exactly the cap', MAX_HEADCOUNT, MAX_HEADCOUNT],
  ['the cap as a string', String(MAX_HEADCOUNT), MAX_HEADCOUNT],
];

for (const [label, input, expected] of NUMBERS) {
  test(`normalizeHeadcount: ${label} → ${expected}`, () => {
    assert.equal(normalizeHeadcount(input), expected);
  });
}

// ── the rules, stated as rules ──────────────────────────────────────────────
test('ZERO IS NOT A SMALL HEADCOUNT — it is unset, and so is the empty string', () => {
  // The single most likely way this feature breaks: `Number('')` is 0, so an
  // empty input coerces to a real value that a `> 0` check downstream might
  // still let through as "0 positions wanted". Both must reach the same answer
  // as `null`, or the three render sites need three copies of the check.
  assert.equal(normalizeHeadcount(''), normalizeHeadcount(null));
  assert.equal(normalizeHeadcount(0), normalizeHeadcount(null));
  assert.equal(Number(''), 0, 'the coercion this guards against still behaves this way');
});

test('A FRACTION IS REJECTED, NOT ROUNDED — in either direction', () => {
  // Stated as its own test because "reject" and "round" both produce a
  // plausible-looking result, and only one of them shows the admin a number
  // they did not type. 3.7 must not become 4, and 3.2 must not become 3.
  assert.equal(normalizeHeadcount(3.7), null);
  assert.equal(normalizeHeadcount(3.2), null);
  assert.equal(normalizeHeadcount('3.0'), 3, 'a fraction that IS an integer is still fine');
});

test('the cap is inclusive, and one past it is null rather than clamped', () => {
  // Clamping would store a number the admin did not ask for and show it back as
  // if they had. The cap is a bound on what this field may MEAN, not a slider.
  assert.equal(normalizeHeadcount(MAX_HEADCOUNT), MAX_HEADCOUNT);
  assert.equal(normalizeHeadcount(MAX_HEADCOUNT + 1), null);
  assert.notEqual(normalizeHeadcount(MAX_HEADCOUNT + 1), MAX_HEADCOUNT, 'the value was clamped');
});

test('non-numeric shapes do not coerce their way through', () => {
  // `Number([])` is 0 and `Number([5])` is 5 — an array would otherwise become
  // a headcount. `{}` is NaN, `true` is 1, and a boolean sneaking through as
  // "1 position" is exactly the kind of thing a hand-made payload does.
  for (const value of [[], [5], {}, true, false, () => 5]) {
    assert.equal(normalizeHeadcount(value), null, `${JSON.stringify(value)} got through`);
  }
  assert.equal(Number([5]), 5, 'the coercion this guards against still behaves this way');
});

test('it is total: two outcomes, never a throw, for anything at all', () => {
  // A render site cannot usefully catch an exception, and a write path that
  // throws on a typo turns it into a 500. Asserted over the awkward inputs
  // rather than assumed from reading the body.
  for (const value of [Symbol('x'), NaN, Infinity, -Infinity, 9007199254740993n]) {
    let out;
    assert.doesNotThrow(() => { out = normalizeHeadcount(value); }, `threw on ${String(value)}`);
    assert.equal(out, null);
  }
});

// ── the two thin wrappers, which exist to stop a specific call-site bug ─────
test('hasHeadcount answers the boolean the call sites actually need', () => {
  assert.equal(hasHeadcount(3), true);
  assert.equal(hasHeadcount('3'), true);
  assert.equal(hasHeadcount(0), false);
  assert.equal(hasHeadcount(''), false);
  assert.equal(hasHeadcount(undefined), false);
});

test('WHY hasHeadcount exists: `value && …` renders a literal 0', () => {
  // Not a style preference. `0 && <span/>` evaluates to `0`, and React prints
  // it — so the shorthand at a call site puts a bare "0" in the markup for
  // exactly the value that is supposed to render nothing. This test is the
  // record of why the components do not use the shorthand.
  assert.equal(0 && 'rendered', 0, 'the JS behaviour this guards against changed');
  assert.equal(hasHeadcount(0), false);
});

test('headcountLabel carries the wording, so three surfaces cannot drift', () => {
  assert.equal(headcountLabel(3), 'จำนวน 3 ตำแหน่ง');
  assert.equal(headcountLabel('12'), 'จำนวน 12 ตำแหน่ง');
  assert.equal(headcountLabel(MAX_HEADCOUNT), `จำนวน ${MAX_HEADCOUNT} ตำแหน่ง`);
});

test('headcountLabel returns null, NOT an empty string, when there is nothing', () => {
  // '' is falsy but is still a string, so a call site that renders it without
  // checking produces the icon and the gap with no text — the exact "the value
  // hides but its separator does not" defect this feature has to avoid.
  for (const value of ['', '  ', null, undefined, 0, -1, 3.7, MAX_HEADCOUNT + 1]) {
    assert.equal(headcountLabel(value), null, `${JSON.stringify(value)} produced a label`);
  }
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the table above is not vacuously passing — these differ', () => {
  // Every case in NOTHING asserts `=== null`. If normalizeHeadcount returned
  // null for everything, all of them would pass and the feature would render
  // nothing, ever. This is the other half.
  assert.notEqual(normalizeHeadcount('3'), null);
  assert.notEqual(headcountLabel(3), null);
  assert.equal(NOTHING.length >= 13, true, 'the NOTHING table shrank');
  assert.equal(NUMBERS.length >= 7, true, 'the NUMBERS table shrank');
});

test('CONTROL: the cap is a real number, and the tables are built from it', () => {
  // The cap cases are written as MAX_HEADCOUNT ± 1 rather than as literals, so
  // they follow the constant if it moves. That only works if the constant is
  // what the module actually enforces.
  assert.equal(typeof MAX_HEADCOUNT, 'number');
  assert.ok(Number.isInteger(MAX_HEADCOUNT) && MAX_HEADCOUNT > 0);
  assert.equal(normalizeHeadcount(MAX_HEADCOUNT), MAX_HEADCOUNT, 'the cap itself is rejected');
});
