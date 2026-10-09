import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBundleLegs } from '@/lib/registration/bundleLegs';
import { pickedItemRound } from '@/lib/pageBuilder/chosenRounds';
import { bundleRegistrationSchema } from '@/lib/schemas/register-bundle';

/**
 * The rows and the mail are written from the PICKED round.
 *
 * ── WHY THE LEGS ARE THE SUBJECT AND NOT THE ROUTE HANDLER ───────────────
 * The route's own job — deriving the picks, validating them, returning 409 —
 * is asserted in test/fs/bundleWritePath (what it refuses before opening a
 * transaction) and test/pure/bundleRoundChoice (the rules themselves). What
 * is NOT covered by either is the step after a valid set of picks: that the
 * round written into each row is the one the applicant chose, and not the
 * first one the author happened to list. That is `buildBundleLegs`, and it is
 * where a silent wrong answer would land.
 */

const TODAY = '2026-09-05';

const R1 = { _id: 'r1', dates: ['2026-10-20', '2026-10-21'], type: 'classroom', status: 'open' };
const R2 = { _id: 'r2', dates: ['2026-11-03'], type: 'online', status: 'open' };
const R3 = { _id: 'r3', dates: ['2026-12-08'], type: 'online', status: 'open' };

/** One course offering THREE rounds — the shape that could not register before. */
const MULTI_ITEMS = [{ id: 'i1', courseId: 'MSE-L1', rounds: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] }];
const MULTI_RESOLVED = [{
  id: 'i1', courseId: 'MSE-L1',
  course: { course_id: 'MSE-L1', course_name: 'Excel Level 1' },
  rounds: [R1, R2, R3],
}];

const LEGACY_ITEMS = [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r1' }];
const LEGACY_RESOLVED = [{
  id: 'i1', courseId: 'MSE-L1',
  course: { course_id: 'MSE-L1', course_name: 'Excel Level 1' },
  rounds: [R1],
}];

const DATA = {
  coordinator: {
    firstName: 'สมหญิง', lastName: 'ดีใจ',
    email: 'somying@example.com', phone: '081-234-5678', isAttending: true,
  },
  attendeesCount: 1,
  attendeesListProvided: false,
  attendees: [],
  requestInvoice: false,
  invoice: null,
  notes: '',
  consent: { dataChecked: true, noRefund: true, changePolicy: true, termsAccepted: true },
};

const BUNDLE = {
  pageId: '6500000000000000000000aa',
  sectionId: 'sec-1',
  requestId: 'cccccccccccccccccccc0005',
  name: 'Data Analyst Starter',
};

const build = (over = {}) =>
  buildBundleLegs({
    items: MULTI_ITEMS, resolved: MULTI_RESOLVED, todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE, ipAddress: '1.2.3.4', ...over,
  });

// ── the picked round is the one written ──────────────────────────────────

test('the row carries the PICKED round, not the first offered one', () => {
  // The silent wrong answer this round exists to prevent: picking the third
  // round and being booked onto the first.
  const res = build({ picks: { i1: 'r3' } });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.legs.length, 1);
  assert.equal(String(res.legs[0].classId ?? res.legs[0].scheduleId ?? ''), 'r3');
});

test('every offered round can actually be the one written', () => {
  // Not just "a pick is honoured" — each of the three, so an off-by-one in the
  // lookup cannot pass by landing on the right answer once.
  for (const roundId of ['r1', 'r2', 'r3']) {
    const res = build({ picks: { i1: roundId } });
    assert.equal(res.ok, true, `${roundId}: ${JSON.stringify(res)}`);
    assert.equal(String(res.legs[0].classId ?? res.legs[0].scheduleId ?? ''), roundId);
  }
});

test('a MULTI-round item with NO pick refuses — it never defaults to round one', () => {
  const res = build({ picks: {} });
  assert.equal(res.ok, false, 'a missing pick was defaulted instead of refused');
  assert.equal(res.index, 0);
});

test('a pick naming a round this item does not offer refuses', () => {
  const res = build({ picks: { i1: 'r-not-offered' } });
  assert.equal(res.ok, false);
});

// ── the legacy path is untouched ─────────────────────────────────────────

test('a LEGACY single-round item registers with NO picks at all', () => {
  // The 91 stored items. A tab opened before the picking flow existed sends no
  // `picks`, and for one offered round there is nothing to choose — so this
  // must behave exactly as it did.
  const res = buildBundleLegs({
    items: LEGACY_ITEMS, resolved: LEGACY_RESOLVED, todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE, picks: null,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(String(res.legs[0].classId ?? res.legs[0].scheduleId ?? ''), 'r1');
});

test('a single-round item with an EXPLICIT pick registers the same way', () => {
  const res = buildBundleLegs({
    items: LEGACY_ITEMS, resolved: LEGACY_RESOLVED, todayKey: TODAY,
    data: DATA, attendees: [], bundle: BUNDLE, picks: { i1: 'r1' },
  });
  assert.equal(res.ok, true);
  assert.equal(String(res.legs[0].classId ?? res.legs[0].scheduleId ?? ''), 'r1');
});

// ── pickedItemRound, the shared resolver ─────────────────────────────────

test('pickedItemRound honours a pick and refuses an unoffered one', () => {
  const rows = [R1, R2, R3];
  assert.equal(pickedItemRound(rows, MULTI_ITEMS[0], { i1: 'r2' }, TODAY)?.id, 'r2');
  assert.equal(pickedItemRound(rows, MULTI_ITEMS[0], { i1: 'nope' }, TODAY), null);
});

test('pickedItemRound derives ONLY when there is exactly one offered round', () => {
  assert.equal(
    pickedItemRound([R1], LEGACY_ITEMS[0], null, TODAY)?.id, 'r1',
    'one offered round with no pick is unambiguous',
  );
  assert.equal(
    pickedItemRound([R1, R2, R3], MULTI_ITEMS[0], null, TODAY), null,
    'three offered rounds with no pick must NOT resolve to the first',
  );
  assert.equal(
    pickedItemRound([], { id: 'i1', rounds: [] }, null, TODAY), null,
    'nothing offered resolves to nothing',
  );
});

test('pickedItemRound accepts a Map as well as a plain object', () => {
  assert.equal(
    pickedItemRound([R1, R2, R3], MULTI_ITEMS[0], new Map([['i1', 'r2']]), TODAY)?.id,
    'r2',
  );
});

// ── the payload boundary ─────────────────────────────────────────────────

test('the schema accepts picks, and accepts their ABSENCE', () => {
  const base = {
    pageId: '6500000000000000000000aa', sectionId: 'sec-1',
    coordinator: DATA.coordinator, attendeesCount: 1, attendeesListProvided: false,
    attendees: [], requestInvoice: false, invoice: null, notes: '', consent: DATA.consent,
  };
  assert.equal(bundleRegistrationSchema.safeParse(base).success, true, 'absent picks must parse');
  assert.equal(
    bundleRegistrationSchema.safeParse({ ...base, picks: [{ itemId: 'i1', roundId: 'r3' }] }).success,
    true,
  );
});

test('the schema refuses a malformed pick entry', () => {
  const base = {
    pageId: '6500000000000000000000aa', sectionId: 'sec-1',
    coordinator: DATA.coordinator, attendeesCount: 1, attendeesListProvided: false,
    attendees: [], requestInvoice: false, invoice: null, notes: '', consent: DATA.consent,
  };
  for (const picks of [
    [{ itemId: '', roundId: 'r1' }],
    [{ itemId: 'i1', roundId: '' }],
    [{ itemId: 'i1' }],
    [{ roundId: 'r1' }],
    ['i1:r1'],
    [{ itemId: 1, roundId: 2 }],
  ]) {
    assert.equal(
      bundleRegistrationSchema.safeParse({ ...base, picks }).success, false,
      `picks ${JSON.stringify(picks)} should be refused`,
    );
  }
});
