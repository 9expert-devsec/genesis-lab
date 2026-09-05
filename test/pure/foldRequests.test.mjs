import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_KEY_EXPR,
  requestKeyOf,
  isMarkerLeg,
  orderLegsForDisplay,
  foldLegsIntoRows,
} from '@/lib/registrations/foldRequests';

/**
 * THE FOLD. One row per request, and the properties that make it safe.
 *
 * The pagination property itself lives in the PIPELINE ORDER inside
 * `listRegistrations` and is guarded in test/fs/registrationsFoldWiring — this
 * tier owns the key and the assembly, which are pure.
 */

const REQ = '6a9c3120e78b0d93b6a036d0';

/** Three legs of one request, marker last in the array — as the write orders them. */
const LEG_B = {
  _id: '6a9c3120e78b0d93b6a036e7', courseName: 'Vibe Code L2', courseCode: 'VIBE-CODE-L2',
  classDate: '24-25 ก.ย. 2569', scheduleType: 'classroom', attendanceMode: 'classroom',
  status: 'pending', createdAt: '2026-09-05T15:11:29.900Z',
  coordinator: { firstName: 'test', lastName: 'test' }, attendeesCount: 1,
  bundle: { requestId: REQ, name: 'Claude AI', pageId: 'p1', sectionId: 's1' },
};
const LEG_C = {
  _id: '6a9c3120e78b0d93b6a036f9', courseName: 'Vibe Code L1', courseCode: 'VIBE-CODE-L1',
  classDate: '19-20 ต.ค. 2569', scheduleType: 'online', attendanceMode: 'classroom',
  status: 'pending', createdAt: '2026-09-05T15:11:29.950Z',
  coordinator: { firstName: 'test', lastName: 'test' }, attendeesCount: 1,
  bundle: { requestId: REQ, name: 'Claude AI', pageId: 'p1', sectionId: 's1' },
};
const MARKER = {
  _id: REQ, courseName: 'Claude AI', courseCode: 'CLAUDE-AI',
  classDate: '16-17 ก.ย. 2569', scheduleType: 'hybrid', attendanceMode: 'teams',
  status: 'pending', createdAt: '2026-09-05T15:11:29.857Z',
  coordinator: { firstName: 'test', lastName: 'test' }, attendeesCount: 1,
  bundle: { requestId: REQ, name: 'Claude AI', pageId: 'p1', sectionId: 's1' },
};

/** An ordinary, untagged registration. */
const PLAIN = {
  _id: '6a7db1ce826b6e426aaed810', courseName: 'Power BI DAX', courseCode: 'POWER-BI-DAX',
  classDate: '26-27 พ.ย. 2569', scheduleType: 'classroom', attendanceMode: 'classroom',
  status: 'pending', createdAt: '2026-08-13T12:00:14.324Z',
  coordinator: { firstName: 'นัตทดสอบ', lastName: 'ครั้งที่ 1' }, attendeesCount: 2,
};

// ── The key ─────────────────────────────────────────────────────────────────

test('a tagged leg keys on its requestId; an ordinary row keys on its own _id', () => {
  assert.equal(requestKeyOf(MARKER), REQ);
  assert.equal(requestKeyOf(LEG_B), REQ);
  assert.equal(requestKeyOf(PLAIN), '6a7db1ce826b6e426aaed810');
});

test('the JS key and the Mongo expression describe the same rule', () => {
  // They cannot be executed against each other here (no MongoDB in the suite),
  // so this pins that the expression is the $ifNull pair the JS mirrors: the
  // tag first, the stringified _id as the fallback.
  assert.deepEqual(REQUEST_KEY_EXPR, { $ifNull: ['$bundle.requestId', { $toString: '$_id' }] });
});

test('a half-empty tag falls back to the _id rather than keying on blank', () => {
  // A leg nothing could group is worse than a leg grouped alone.
  assert.equal(requestKeyOf({ _id: 'abc', bundle: { requestId: '' } }), 'abc');
  assert.equal(requestKeyOf({ _id: 'abc', bundle: {} }), 'abc');
  assert.equal(requestKeyOf({ _id: 'abc' }), 'abc');
});

test('the marker is the leg whose _id IS the requestId', () => {
  assert.equal(isMarkerLeg(MARKER), true);
  assert.equal(isMarkerLeg(LEG_B), false);
  assert.equal(isMarkerLeg(PLAIN), false, 'an untagged row is never a marker');
});

// ── The assembly ────────────────────────────────────────────────────────────

test('three legs fold to ONE row carrying all three', () => {
  const rows = foldLegsIntoRows([REQ], [LEG_B, LEG_C, MARKER]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legCount, 3);
  assert.equal(rows[0].legs.length, 3);
});

test('the MARKER leads the row, and its _id is the row identity', () => {
  // The row's _id is the link target and the reference number the customer was
  // emailed. Fed in marker-last, exactly as the write orders them.
  const [row] = foldLegsIntoRows([REQ], [LEG_B, LEG_C, MARKER]);
  assert.equal(String(row._id), REQ);
  assert.equal(String(row.legs[0]._id), REQ);
  assert.equal(row.courseName, 'Claude AI', 'the scalar fields come from the marker');
});

test('an ordinary registration folds to a one-leg row, unchanged in shape', () => {
  const [row] = foldLegsIntoRows([String(PLAIN._id)], [PLAIN]);
  assert.equal(row.legCount, 1);
  assert.equal(row.courseName, PLAIN.courseName);
  assert.equal(row.classDate, PLAIN.classDate);
  assert.equal(row.scheduleType, PLAIN.scheduleType);
  assert.equal(row.attendanceMode, PLAIN.attendanceMode);
  assert.equal(row.status, PLAIN.status);
  assert.equal(row.attendeesCount, PLAIN.attendeesCount);
  assert.deepEqual(row.coordinator, PLAIN.coordinator);
  assert.equal(row.bundle, undefined, 'an untagged row carries no bundle tag');
});

test('THE PAGE ORDER IS THE QUERY’S, preserved exactly', () => {
  // Re-sorting here would be a second opinion about the order — the one that
  // disagrees with pageCount.
  const keys = [String(PLAIN._id), REQ];
  const rows = foldLegsIntoRows(keys, [MARKER, PLAIN, LEG_B, LEG_C]);
  assert.deepEqual(rows.map((r) => String(r._id)), keys);
});

test('a key with no legs is dropped, not rendered empty', () => {
  const rows = foldLegsIntoRows(['a-key-nothing-matched', REQ], [MARKER, LEG_B, LEG_C]);
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0]._id), REQ);
});

test('legs that were not asked for do not leak into a row', () => {
  const rows = foldLegsIntoRows([REQ], [MARKER, LEG_B, LEG_C, PLAIN]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legCount, 3);
  assert.ok(!rows[0].legs.some((l) => String(l._id) === String(PLAIN._id)));
});

test('CONTROL: the assembler really does distinguish the two requests', () => {
  // Without this, "legs do not leak" is satisfied by an assembler that returns
  // nothing at all.
  const rows = foldLegsIntoRows([REQ, String(PLAIN._id)], [MARKER, LEG_B, LEG_C, PLAIN]);
  assert.deepEqual(rows.map((r) => r.legCount), [3, 1]);
});

// ── The status of a folded row, and its divergence marker ───────────────────

test('legs that agree give an unmixed row', () => {
  const [row] = foldLegsIntoRows([REQ], [MARKER, LEG_B, LEG_C]);
  assert.equal(row.status, 'pending');
  assert.equal(row.mixedStatus, false);
  assert.deepEqual(row.statuses, ['pending']);
});

test('legs that disagree give ONE status and a mixed flag that says so', () => {
  const cancelled = { ...LEG_B, status: 'cancelled' };
  const [row] = foldLegsIntoRows([REQ], [MARKER, cancelled, LEG_C]);
  assert.equal(row.status, 'pending', 'one cancelled leg does not cancel the request');
  assert.equal(row.mixedStatus, true);
  assert.deepEqual(row.statuses, ['pending', 'cancelled']);
});

test('CONTROL: the mixed flag is not simply always true', () => {
  const [row] = foldLegsIntoRows([REQ], [MARKER, LEG_B, LEG_C]);
  assert.equal(row.mixedStatus, false);
});

test('the row takes the EARLIEST createdAt of its legs', () => {
  // The legs are written inside one transaction, milliseconds apart. The row
  // reports when the customer submitted, which is the first of them.
  const [row] = foldLegsIntoRows([REQ], [LEG_C, LEG_B, MARKER]);
  assert.equal(row.createdAt, MARKER.createdAt);
});

// ── Degrading ───────────────────────────────────────────────────────────────

test('unusable input returns no rows rather than throwing', () => {
  for (const [k, l] of [[undefined, undefined], [null, null], [[], []], ['nope', 'nope']]) {
    assert.deepEqual(foldLegsIntoRows(k, l), []);
  }
});

test('CONTROL: the degrade cases are not masking a working call', () => {
  assert.equal(foldLegsIntoRows([REQ], [MARKER]).length, 1);
});

// ── The shared display order ────────────────────────────────────────────────

test('orderLegsForDisplay puts the MARKER first, whatever order it arrives in', () => {
  for (const input of [[LEG_B, LEG_C, MARKER], [MARKER, LEG_B, LEG_C], [LEG_C, MARKER, LEG_B]]) {
    const out = orderLegsForDisplay(input);
    assert.equal(String(out[0]._id), REQ, 'the marker is not first');
    assert.equal(out.length, 3);
  }
});

test('it is STABLE for the non-marker legs, so two screens agree', () => {
  // The list row and the detail screen call this same function; a comparator
  // that shuffled would put one request in two orders on two screens.
  const a = orderLegsForDisplay([LEG_B, LEG_C, MARKER]).map((l) => String(l._id));
  const b = orderLegsForDisplay([LEG_C, LEG_B, MARKER]).map((l) => String(l._id));
  assert.deepEqual(a, b);
});

test('it does not mutate its input', () => {
  // Callers hand it a query result they may also be reading elsewhere.
  const input = [LEG_B, LEG_C, MARKER];
  const before = input.map((l) => String(l._id));
  orderLegsForDisplay(input);
  assert.deepEqual(input.map((l) => String(l._id)), before);
});

test('the folded row uses this same order', () => {
  const [row] = foldLegsIntoRows([REQ], [LEG_C, LEG_B, MARKER]);
  assert.deepEqual(
    row.legs.map((l) => String(l._id)),
    orderLegsForDisplay([LEG_C, LEG_B, MARKER]).map((l) => String(l._id)),
  );
});

test('CONTROL: unusable input returns an empty array, and a real one does not', () => {
  for (const bad of [undefined, null, 'nope', 7]) assert.deepEqual(orderLegsForDisplay(bad), []);
  assert.equal(orderLegsForDisplay([MARKER]).length, 1);
});
