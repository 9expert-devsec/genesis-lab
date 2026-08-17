import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INHOUSE_STATUSES,
  INHOUSE_STATUS_VALUES,
  ALL_FILTER,
  buildStatCards,
  buildStatusChips,
} from '@/lib/registrations/inhouseStatuses';

/**
 * ONE ARRAY DRIVES BOTH IN-HOUSE STATUS LISTS.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ─────────────────────────────
 * "There are six cards" and "`quoted` has a card" are the SYMPTOM, not the rule.
 * Both would be satisfied by pasting a sixth entry into a hard-coded array and
 * would go on passing while the seventh status drifted apart exactly as the
 * sixth did — cards written in one place, chips in another, counts in a third.
 *
 * So the assertions below drive both builders with a FABRICATED SEVEN-MEMBER
 * list containing two statuses that do not exist in the product. Nothing
 * hard-coded can satisfy them: a builder that ignores its argument returns five
 * entries and fails, and a builder that names any real status returns the wrong
 * set. That is the property the screen actually needs — add a status to the
 * array, and every list follows without being edited.
 *
 * The real list is asserted separately, and only for the invariants that are
 * genuinely about IT (order, uniqueness, the values the database stores).
 */

// Two invented statuses appended to the real five. The values are deliberately
// not plausible product statuses, so a builder that special-cases anything real
// cannot accidentally produce them.
const SEVEN = [
  ...INHOUSE_STATUSES,
  { value: 'zz-parked',    label: 'พักงานไว้',      accent: 'border-l-fuchsia-400' },
  { value: 'zz-escalated', label: 'ส่งต่อผู้บริหาร', accent: 'border-l-rose-400' },
];

// ── 1. A seventh status reaches BOTH lists, from the array alone ────────────

test('a 7-member list produces 7 chips + the all chip', () => {
  const chips = buildStatusChips(SEVEN);
  assert.equal(chips.length, SEVEN.length + 1, 'one chip per status, plus ทั้งหมด');
  assert.deepEqual(
    chips.map((c) => c.value),
    [ALL_FILTER.value, ...SEVEN.map((s) => s.value)]
  );
});

test('a 7-member list produces 7 cards + the total card', () => {
  const cards = buildStatCards(SEVEN);
  assert.equal(cards.length, SEVEN.length + 1, 'one card per status, plus ทั้งหมด');
  assert.deepEqual(
    cards.map((c) => c.filterVal),
    [ALL_FILTER.value, ...SEVEN.map((s) => s.value)]
  );
});

test('the two invented statuses appear in BOTH lists, not just one', () => {
  const chipValues = new Set(buildStatusChips(SEVEN).map((c) => c.value));
  const cardFilters = new Set(buildStatCards(SEVEN).map((c) => c.filterVal));
  for (const value of ['zz-parked', 'zz-escalated']) {
    assert.ok(chipValues.has(value), `chip missing for ${value}`);
    assert.ok(cardFilters.has(value), `card missing for ${value}`);
  }
});

/**
 * THE DRIFT ASSERTION ITSELF — the two lists offer the same statuses.
 *
 * This is the one that would have caught the shipped defect: the chips offered
 * `quoted` and the cards did not, so these two sets differed by one member.
 */
test('cards and chips offer exactly the same status set, for any list', () => {
  for (const list of [INHOUSE_STATUSES, SEVEN, INHOUSE_STATUSES.slice(0, 2)]) {
    const fromChips = buildStatusChips(list).map((c) => c.value).filter((v) => v !== ALL_FILTER.value);
    const fromCards = buildStatCards(list).map((c) => c.filterVal).filter((v) => v !== ALL_FILTER.value);
    assert.deepEqual(fromCards, fromChips, `divergence on a ${list.length}-member list`);
  }
});

test('the same status carries the same LABEL in both lists', () => {
  const chipLabel = new Map(buildStatusChips(SEVEN).map((c) => [c.value, c.label]));
  for (const card of buildStatCards(SEVEN)) {
    if (card.filterVal === ALL_FILTER.value) continue;
    assert.equal(card.label, chipLabel.get(card.filterVal), `label drift on ${card.filterVal}`);
  }
});

/**
 * CONTROL: the assertions above CAN fail.
 *
 * A hand-written five-entry list — the shape this module replaced — is fed to
 * the same comparison, and it must NOT satisfy the seven-member expectation.
 * Without this, a builder that silently ignored its argument would still look
 * green above if the real list ever grew to seven on its own.
 */
test('CONTROL: a list that ignores its argument fails the 7-member expectation', () => {
  const frozenFive = () => buildStatCards(INHOUSE_STATUSES);
  assert.notEqual(
    frozenFive().length,
    SEVEN.length + 1,
    'the control is inert — the real list already has 7 members, so rewrite SEVEN'
  );
});

// ── 2. Invariants of the REAL list ──────────────────────────────────────────

test('the total card is keyed `total`, distinct from every status key', () => {
  const cards = buildStatCards();
  assert.equal(cards[0].key, 'total');
  assert.equal(cards[0].filterVal, ALL_FILTER.value);
  const statusKeys = cards.slice(1).map((c) => c.key);
  assert.ok(!statusKeys.includes('total'), '`total` must not collide with a status key');
});

/**
 * The card `key` IS the stored status value.
 *
 * `getRegistrationStatusCounts` returns its per-status counts under the stored
 * value, and the card reads `statCounts[key]`. These used to be different
 * spellings — the action returned `closedWon` while the filter value was
 * `closed-won` — and a card carrying the wrong one renders 0 for a status that
 * has records. There is now one spelling; this pins it.
 */
test('every card key is a stored status value', () => {
  const stored = new Set(INHOUSE_STATUS_VALUES);
  for (const card of buildStatCards().slice(1)) {
    assert.ok(stored.has(card.key), `card key ${card.key} is not a stored status value`);
    assert.equal(card.key, card.filterVal, 'key and filterVal must be the same string');
  }
});

test('the real list has unique values and no empty labels', () => {
  assert.equal(new Set(INHOUSE_STATUS_VALUES).size, INHOUSE_STATUS_VALUES.length);
  for (const s of INHOUSE_STATUSES) {
    assert.ok(s.label.trim().length > 0, `${s.value} has no label`);
    assert.ok(s.accent.trim().length > 0, `${s.value} has no accent class`);
  }
});

/**
 * The accent is a WHOLE Tailwind class.
 *
 * Tailwind scans source text for complete class names, so a fragment assembled
 * at runtime (`border-l-${c}-400`) is purged from the stylesheet and the card
 * renders with no colour. A `${` anywhere in these strings means that happened.
 */
test('accent classes are whole class names, not interpolated fragments', () => {
  for (const s of INHOUSE_STATUSES) {
    assert.ok(!s.accent.includes('${'), `${s.value} interpolates its accent class`);
    assert.match(s.accent, /^border-l-/, `${s.value} accent is not a left-border class`);
  }
});

test('`quoted` is in the stored values — the record that had no card', () => {
  assert.ok(INHOUSE_STATUS_VALUES.includes('quoted'));
});
