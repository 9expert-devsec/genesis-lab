import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summariseRegistrationsByStatus,
  UNSET_STATUS_LABEL,
} from '@/lib/registrations/summariseByStatus';
import {
  PUBLIC_STATUSES,
  PUBLIC_STATUS_VALUES,
  NEUTRAL_STATUS_BADGE,
} from '@/lib/registrations/statuses';

/**
 * THE ARITHMETIC BEHIND A FINISHED ROUND'S DETAILS VIEW.
 *
 * /admin/schedules withholds แก้ไข and ลบ once a round is over and offers
 * ดูรายละเอียด instead; what that opens is a total and a per-status breakdown.
 * Everything the panel does with numbers happens here, so the panel is a
 * renderer with nothing to get wrong and this file is where the counting is
 * pinned.
 *
 * ── THE STORED VOCABULARY, AUDITED RATHER THAN ASSUMED ──────────────────────
 * All 41 `register_public` documents on 2026-09-02: pending 29, paid 9,
 * confirmed 2, cancelled 1. That is EXACTLY `PUBLIC_STATUS_VALUES`, same
 * spelling, nothing stored outside it — which is asserted below rather than
 * left as a comment, so the day a fifth value appears in the enum this file
 * says so instead of the panel silently filing it under "unrecognised".
 *
 * One trap rides along and is the reason the labels are imported, never typed:
 * `confirmed` is 'ส่งใบเสนอราคาแล้ว', NOT 'ยืนยันแล้ว'. It was relabelled
 * because what the admin does at that step is send the quotation. Anyone
 * re-deriving a label from the value name gets that one wrong.
 */

const byValue = (summary, value) =>
  [...summary.known, ...summary.unrecognised].find((r) => r.value === value);

test('the vocabulary this module counts against is the stored one', () => {
  /*
   * A guard on the fixtures below rather than on the module: every test here
   * feeds the four values the database actually holds, and they are only the
   * right fixtures for as long as that is the enum. If a fifth public status
   * ships, this reddens and the panel gets looked at before it starts filing
   * the new value under "unrecognised" in grey.
   */
  assert.deepEqual(PUBLIC_STATUS_VALUES, ['pending', 'confirmed', 'paid', 'cancelled']);
});

test('counts match the fixture, status by status', () => {
  /*
   * The shape of a real round: POWER-BI 10–11 ส.ค. 2026 carries 13 public
   * registrations — pending 6, confirmed 1, paid 6 — measured from the live
   * collection. Reproduced here as documents so the panel's headline number
   * and its rows are pinned to something that actually happened.
   */
  const rows = [
    ...Array(6).fill({ status: 'pending' }),
    ...Array(1).fill({ status: 'confirmed' }),
    ...Array(6).fill({ status: 'paid' }),
  ];
  const s = summariseRegistrationsByStatus(rows);

  assert.equal(s.total, 13);
  assert.equal(byValue(s, 'pending').count, 6);
  assert.equal(byValue(s, 'confirmed').count, 1);
  assert.equal(byValue(s, 'paid').count, 6);
  assert.equal(byValue(s, 'cancelled').count, 0);
  assert.deepEqual(s.unrecognised, []);
});

test('CONTROL: a different fixture produces different counts', () => {
  // A summariser that returned a constant, or ignored its input, would pass
  // every individual number above that happened to match. It cannot pass this.
  const s = summariseRegistrationsByStatus([
    { status: 'cancelled' },
    { status: 'cancelled' },
  ]);
  assert.equal(s.total, 2);
  assert.equal(byValue(s, 'cancelled').count, 2);
  assert.equal(byValue(s, 'pending').count, 0);
});

test('total always equals the sum of every bucket', () => {
  /*
   * THE INVARIANT. A breakdown that does not add up to its own headline is
   * worse than no breakdown: it is a number an admin will reconcile against a
   * sales figure and quietly get wrong. Checked over a mixed fixture that
   * includes a value outside the vocabulary, which is exactly the case where a
   * naive implementation drops rows.
   */
  const rows = [
    { status: 'pending' },
    { status: 'paid' },
    { status: 'paid' },
    { status: 'archived' },
    { status: '' },
    {},
  ];
  const s = summariseRegistrationsByStatus(rows);
  const summed = [...s.known, ...s.unrecognised].reduce((n, r) => n + r.count, 0);

  assert.equal(s.total, rows.length);
  assert.equal(summed, s.total, 'the buckets do not add up to the total');
});

test('every vocabulary status comes back even at zero', () => {
  /*
   * A round with nobody cancelled should SAY nobody cancelled. Leaving the row
   * out makes the reader infer a zero from an absence, and an absence is also
   * what a broken lookup produces.
   */
  const s = summariseRegistrationsByStatus([{ status: 'pending' }]);
  assert.deepEqual(s.known.map((r) => r.value), PUBLIC_STATUS_VALUES);
  assert.equal(s.known.length, 4);
});

test('labels and badges come from the shared vocabulary, not from here', () => {
  const s = summariseRegistrationsByStatus([]);
  for (const entry of PUBLIC_STATUSES) {
    const row = byValue(s, entry.value);
    assert.equal(row.label, entry.label, `${entry.value} label drifted`);
    assert.equal(row.badge, entry.badge, `${entry.value} badge drifted`);
  }
  // The relabelling trap, pinned explicitly: whoever "corrects" this to
  // ยืนยันแล้ว should have to delete a test that says why it is not.
  assert.equal(byValue(s, 'confirmed').label, 'ส่งใบเสนอราคาแล้ว');
});

test('an unrecognised stored value is reported, not dropped or absorbed', () => {
  /*
   * Same ruling as resolveScheduleBadge makes for an unknown schedule status:
   * show it verbatim, in grey. Folding it into `pending` would invent data;
   * dropping it would make the breakdown disagree with the total, which is
   * undebuggable from a screenshot.
   */
  const s = summariseRegistrationsByStatus([
    { status: 'pending' },
    { status: 'archived' },
    { status: 'archived' },
  ]);
  assert.equal(s.total, 3);
  assert.equal(byValue(s, 'pending').count, 1);
  assert.equal(s.unrecognised.length, 1);
  assert.equal(s.unrecognised[0].value, 'archived');
  assert.equal(s.unrecognised[0].label, 'archived', 'shown verbatim');
  assert.equal(s.unrecognised[0].badge, NEUTRAL_STATUS_BADGE);
  assert.equal(s.unrecognised[0].count, 2);
});

test('a missing or blank status is its own bucket, not an unknown word', () => {
  /*
   * "the document says `archived` and we do not know that word" and "the
   * document says nothing at all" are different faults with different fixes.
   * Collapsing them hides which one happened, and a blank chip reads as an
   * empty cell rather than as a status — hence a name rather than ''.
   */
  const s = summariseRegistrationsByStatus([{}, { status: '   ' }, { status: null }]);
  assert.equal(s.total, 3);
  assert.equal(s.unrecognised.length, 1);
  assert.equal(s.unrecognised[0].value, '');
  assert.equal(s.unrecognised[0].label, UNSET_STATUS_LABEL);
  assert.equal(s.unrecognised[0].count, 3, 'blank, whitespace and missing are one bucket');
});

test('surrounding whitespace does not split a status into two buckets', () => {
  const s = summariseRegistrationsByStatus([{ status: 'paid' }, { status: ' paid ' }]);
  assert.equal(byValue(s, 'paid').count, 2);
  assert.deepEqual(s.unrecognised, []);
});

test('unrecognised values are ordered biggest first, then alphabetically', () => {
  // A stable order, so reopening the panel does not shuffle the rows.
  const s = summariseRegistrationsByStatus([
    { status: 'zeta' },
    { status: 'alpha' },
    { status: 'alpha' },
    { status: 'beta' },
  ]);
  assert.deepEqual(s.unrecognised.map((r) => r.value), ['alpha', 'beta', 'zeta']);
});

test('no registrations is a total of zero, with the vocabulary intact', () => {
  const s = summariseRegistrationsByStatus([]);
  assert.equal(s.total, 0);
  assert.equal(s.known.length, 4);
  assert.deepEqual(s.unrecognised, []);
  assert.deepEqual(s.known.map((r) => r.count), [0, 0, 0, 0]);
});

test('a non-array degrades to an empty summary rather than throwing', () => {
  /*
   * This renders inside an admin panel behind a network call. An upstream shape
   * change must show "0 registrations", not blank the screen with an exception
   * the admin cannot read.
   */
  for (const input of [undefined, null, 'rows', 42, {}]) {
    const s = summariseRegistrationsByStatus(input);
    assert.equal(s.total, 0, `input ${JSON.stringify(input)}`);
    assert.equal(s.known.length, 4);
  }
});
