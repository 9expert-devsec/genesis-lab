import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_STATUSES,
  PUBLIC_STATUS_VALUES,
  PUBLIC_STATUS_TRANSITIONS,
  INHOUSE_STATUSES,
  INHOUSE_STATUS_VALUES,
  INHOUSE_STATUS_TRANSITIONS,
  INHOUSE_LEGACY_STATUS_MAP,
  LEGACY_STATUS_LABELS,
  ALL_FILTER,
  allowedFromStates,
  allowedTransitions,
  isTransitionAllowed,
  buildStatusLabels,
  buildStatCards,
  buildStatusChips,
  statusesForSource,
  statusValuesForSource,
  transitionsForSource,
  statusLabel,
  storedValuesForFilter,
  normaliseStatusParam,
} from '@/lib/registrations/statuses';

/**
 * THE PUBLIC STATUS MACHINE — one array, one table, every consumer derived.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ─────────────────────────────
 * "There are four cards" and "`paid` has a label" are SYMPTOMS. Both would be
 * satisfied by pasting a fourth entry into a hard-coded array, and would go on
 * passing while the fifth status drifted apart exactly as the public lists
 * already had — options in one place, labels in a second, cards in a third, a
 * bare Set on the server in a fourth.
 *
 * So the consumers below are driven with a FABRICATED status list and a
 * FABRICATED transition table containing states that do not exist in the
 * product. Nothing hard-coded can satisfy them: a builder that ignores its
 * argument returns the four real entries and fails, and one that special-cases
 * any real status returns the wrong set. Same technique as
 * pure/inhouseStatusSingleSource.
 *
 * The REAL table is asserted separately, and only for the invariants that are
 * genuinely about it — the two rules that look like omissions and are not.
 */

// ── Fabricated fixtures. Values are deliberately implausible as product
// statuses, so a consumer that special-cases anything real cannot produce them.
const SIX = [
  ...PUBLIC_STATUSES,
  { value: 'zz-refunded', label: 'คืนเงินแล้ว',  accent: 'border-l-fuchsia-400' },
  { value: 'zz-disputed', label: 'มีข้อโต้แย้ง', accent: 'border-l-rose-400' },
];

const FAKE_TABLE = {
  'zz-alpha': ['zz-beta', 'zz-gamma'],
  'zz-beta':  ['zz-gamma'],
  'zz-gamma': [],
};

// ── 1. THE TWO RULES THAT LOOK LIKE OMISSIONS ───────────────────────────────

/**
 * `paid` IS NOT AN ADMIN TARGET, FROM ANY STATE.
 *
 * It is written only by the Omise charge route and the Omise webhook — by a
 * real charge settling. An admin edge into `paid` would let the screen assert
 * that money arrived when nothing observed it, and the receipt and refund paths
 * both read that field as though it did.
 *
 * Asserted over EVERY from-state rather than over `confirmed` alone: the defect
 * this prevents is someone re-adding the edge anywhere, not specifically there.
 */
test('`paid` is not a target of any admin transition, from any state', () => {
  for (const from of Object.keys(PUBLIC_STATUS_TRANSITIONS)) {
    assert.ok(
      !allowedTransitions(from).includes('paid'),
      `${from} → paid is an admin edge into a state only Omise may write`
    );
  }
  assert.deepEqual(allowedFromStates('paid'), [], 'nothing may reach paid');
});

/**
 * `cancelled` IS TERMINAL.
 *
 * No outgoing edges at all. The escape hatch for a wrongly-cancelled record is
 * delete-and-re-register, which leaves an honest trail; un-cancelling leaves a
 * record whose history says two contradictory things.
 */
test('`cancelled` has no outgoing transitions', () => {
  assert.deepEqual(allowedTransitions('cancelled'), []);
  for (const to of PUBLIC_STATUS_VALUES) {
    assert.equal(
      isTransitionAllowed('cancelled', to),
      false,
      `cancelled → ${to} would make cancellation reversible`
    );
  }
});

test('the real table is exactly the four agreed rows', () => {
  assert.deepEqual(PUBLIC_STATUS_TRANSITIONS, {
    pending:   ['confirmed', 'cancelled'],
    confirmed: ['cancelled'],
    paid:      ['cancelled'],
    cancelled: [],
  });
});

test('every target named anywhere in the table is a declared status', () => {
  const declared = new Set(PUBLIC_STATUS_VALUES);
  for (const [from, targets] of Object.entries(PUBLIC_STATUS_TRANSITIONS)) {
    assert.ok(declared.has(from), `from-state ${from} is not a declared status`);
    for (const to of targets) {
      assert.ok(declared.has(to), `${from} → ${to}: ${to} is not a declared status`);
    }
  }
});

test('every declared status has a row in the table', () => {
  // The other direction. A status with no row is not "no transitions" — it is a
  // record whose detail screen silently offers nothing and whose write gate
  // reads `undefined`, which is a different bug wearing the same face.
  for (const value of PUBLIC_STATUS_VALUES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(PUBLIC_STATUS_TRANSITIONS, value),
      `${value} has no row in the transition table`
    );
  }
});

// ── 2. THE CONSUMERS, DRIVEN BY FABRICATED INPUT ────────────────────────────

test('allowedTransitions reads the table it is GIVEN, not the real one', () => {
  assert.deepEqual(allowedTransitions('zz-alpha', FAKE_TABLE), ['zz-beta', 'zz-gamma']);
  assert.deepEqual(allowedTransitions('zz-gamma', FAKE_TABLE), []);
  // A state the fabricated table does not name — including every REAL one.
  assert.deepEqual(allowedTransitions('pending', FAKE_TABLE), []);
});

test('allowedFromStates reads the table backwards, from the given table', () => {
  assert.deepEqual(allowedFromStates('zz-gamma', FAKE_TABLE), ['zz-alpha', 'zz-beta']);
  assert.deepEqual(allowedFromStates('zz-beta', FAKE_TABLE), ['zz-alpha']);
  // Nothing reaches the entry state — the same answer the real table gives for
  // `pending`, and the reason `$in: []` is the correct filter and not a bug.
  assert.deepEqual(allowedFromStates('zz-alpha', FAKE_TABLE), []);
});

test('allowedFromStates and allowedTransitions describe the SAME edges', () => {
  // The write gate uses one direction and the buttons use the other. If they
  // ever disagree, the screen offers a move the server refuses — which is the
  // whole defect this module exists to make unrepresentable.
  for (const table of [PUBLIC_STATUS_TRANSITIONS, FAKE_TABLE]) {
    for (const from of Object.keys(table)) {
      for (const to of allowedTransitions(from, table)) {
        assert.ok(
          allowedFromStates(to, table).includes(from),
          `${from} → ${to} is offered forwards but not permitted backwards`
        );
      }
    }
    for (const to of Object.keys(table)) {
      for (const from of allowedFromStates(to, table)) {
        assert.ok(
          allowedTransitions(from, table).includes(to),
          `${from} → ${to} is permitted backwards but not offered forwards`
        );
      }
    }
  }
});

test('isTransitionAllowed answers from the given table', () => {
  assert.equal(isTransitionAllowed('zz-alpha', 'zz-beta', FAKE_TABLE), true);
  assert.equal(isTransitionAllowed('zz-beta', 'zz-alpha', FAKE_TABLE), false);
  assert.equal(isTransitionAllowed('pending', 'confirmed', FAKE_TABLE), false);
});

test('a 6-member list produces 6 chips + the all chip', () => {
  const chips = buildStatusChips(SIX);
  assert.equal(chips.length, SIX.length + 1, 'one chip per status, plus ทั้งหมด');
  assert.deepEqual(chips.map((c) => c.value), [ALL_FILTER.value, ...SIX.map((s) => s.value)]);
});

test('a 6-member list produces 6 cards + the total card', () => {
  const cards = buildStatCards(SIX);
  assert.equal(cards.length, SIX.length + 1, 'one card per status, plus ทั้งหมด');
  assert.deepEqual(cards.map((c) => c.filterVal), [ALL_FILTER.value, ...SIX.map((s) => s.value)]);
});

test('buildStatusLabels maps the list it is GIVEN', () => {
  const labels = buildStatusLabels(SIX);
  assert.equal(labels['zz-refunded'], 'คืนเงินแล้ว');
  assert.equal(labels['zz-disputed'], 'มีข้อโต้แย้ง');
  assert.equal(Object.keys(labels).length, SIX.length);
});

test('the two invented statuses appear in cards, chips AND labels', () => {
  const chipValues  = new Set(buildStatusChips(SIX).map((c) => c.value));
  const cardFilters = new Set(buildStatCards(SIX).map((c) => c.filterVal));
  const labels      = buildStatusLabels(SIX);
  for (const value of ['zz-refunded', 'zz-disputed']) {
    assert.ok(chipValues.has(value),  `chip missing for ${value}`);
    assert.ok(cardFilters.has(value), `card missing for ${value}`);
    assert.ok(labels[value],          `label missing for ${value}`);
  }
});

test('cards, chips and labels offer exactly the same status set, for any list', () => {
  for (const list of [PUBLIC_STATUSES, SIX, PUBLIC_STATUSES.slice(0, 2)]) {
    const fromChips = buildStatusChips(list).map((c) => c.value).filter((v) => v !== ALL_FILTER.value);
    const fromCards = buildStatCards(list).map((c) => c.filterVal).filter((v) => v !== ALL_FILTER.value);
    assert.deepEqual(fromCards, fromChips, `card/chip divergence on a ${list.length}-member list`);
    assert.deepEqual(Object.keys(buildStatusLabels(list)), fromChips, `label divergence on a ${list.length}-member list`);
  }
});

test('the same status carries the same LABEL everywhere', () => {
  const chipLabel = new Map(buildStatusChips(SIX).map((c) => [c.value, c.label]));
  const labels = buildStatusLabels(SIX);
  for (const card of buildStatCards(SIX)) {
    if (card.filterVal === ALL_FILTER.value) continue;
    assert.equal(card.label, chipLabel.get(card.filterVal), `card/chip label drift on ${card.filterVal}`);
    assert.equal(card.label, labels[card.filterVal],        `card/label drift on ${card.filterVal}`);
  }
});

/**
 * CONTROL: the fabricated-input assertions CAN fail.
 *
 * Feeding the REAL four-member list to the same comparison must NOT satisfy the
 * six-member expectation. Without this, a builder that silently ignored its
 * argument would still look green above if the real list ever grew to six on
 * its own.
 */
test('CONTROL: a builder that ignored its argument would fail the 6-member expectation', () => {
  assert.notEqual(
    buildStatCards(PUBLIC_STATUSES).length,
    SIX.length + 1,
    'the control is inert — the real list already has 6 members, so rewrite SIX'
  );
});

/**
 * CONTROL: the fabricated TABLE is genuinely disjoint from the real one.
 *
 * If a real status name leaked into FAKE_TABLE, the table assertions above
 * could be satisfied by a function that consulted PUBLIC_STATUS_TRANSITIONS and
 * ignored its argument entirely.
 */
test('CONTROL: no fabricated state is a real status', () => {
  const real = new Set(PUBLIC_STATUS_VALUES);
  const fabricated = new Set([
    ...Object.keys(FAKE_TABLE),
    ...Object.values(FAKE_TABLE).flat(),
    ...SIX.slice(PUBLIC_STATUSES.length).map((s) => s.value),
  ]);
  for (const value of fabricated) {
    assert.ok(!real.has(value), `${value} is a real status — the fixtures are not disjoint`);
  }
});

// ── 3. Invariants of the REAL list ──────────────────────────────────────────

test('the stored values are the four the database holds, in pipeline order', () => {
  assert.deepEqual(PUBLIC_STATUS_VALUES, ['pending', 'confirmed', 'paid', 'cancelled']);
});

test('`confirmed` reads as the quotation step, not as a payment', () => {
  // The relabel. The STORED value is unchanged and must stay `confirmed` — this
  // asserts both halves, because a "fix" that renamed the value would be a
  // silent data migration.
  const labels = buildStatusLabels();
  assert.equal(labels.confirmed, 'ส่งใบเสนอราคาแล้ว');
  assert.ok(PUBLIC_STATUS_VALUES.includes('confirmed'), 'the stored value is unchanged');
});

test('the total card is keyed `total`, distinct from every status key', () => {
  const cards = buildStatCards();
  assert.equal(cards[0].key, 'total');
  assert.equal(cards[0].filterVal, ALL_FILTER.value);
  assert.ok(!cards.slice(1).map((c) => c.key).includes('total'));
});

test('every card key is a stored status value, and equals its filterVal', () => {
  const stored = new Set(PUBLIC_STATUS_VALUES);
  for (const card of buildStatCards().slice(1)) {
    assert.ok(stored.has(card.key), `card key ${card.key} is not a stored status value`);
    assert.equal(card.key, card.filterVal, 'key and filterVal must be the same string');
  }
});

test('the real list has unique values and no empty labels', () => {
  assert.equal(new Set(PUBLIC_STATUS_VALUES).size, PUBLIC_STATUS_VALUES.length);
  for (const s of PUBLIC_STATUSES) {
    assert.ok(s.label.trim().length > 0,  `${s.value} has no label`);
    assert.ok(s.accent.trim().length > 0, `${s.value} has no accent class`);
  }
});

test('accent classes are whole class names, not interpolated fragments', () => {
  // Tailwind scans source text for complete class names, so a fragment built at
  // runtime (`border-l-${c}-400`) is purged and the card renders with no colour.
  for (const s of PUBLIC_STATUSES) {
    assert.ok(!s.accent.includes('${'), `${s.value} interpolates its accent class`);
    assert.match(s.accent, /^border-l-/, `${s.value} accent is not a left-border class`);
  }
});
