import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUND_FIELDS,
  attendanceModeFor,
  formatClassDates,
  isHybridRound,
  roundFieldsFor,
  storedRoundOption,
} from '@/lib/registrations/roundSelection';

/**
 * THE ROUND'S FOUR COUPLED FIELDS — the derivation both the public wizard and
 * the admin action share.
 *
 * The fs guard next door asserts the ACTION calls this. This asserts the rule
 * itself, which is the half that decides whether an attendee ends up on the
 * right day.
 */

const ROUND = (over = {}) => ({ _id: 'r1', dates: ['2026-09-01'], type: 'classroom', ...over });

// ── 1. The hybrid rule ──────────────────────────────────────────────────────

test('a NON-hybrid round sets classroom automatically', () => {
  // The customer is never asked, because there is nothing to choose.
  for (const type of ['classroom', 'online', undefined, null, '']) {
    assert.equal(attendanceModeFor({ type }, undefined), 'classroom', `type=${type}`);
  }
});

test('a non-hybrid round IGNORES a mode it was handed', () => {
  /**
   * A caller sending `attendanceMode: 'teams'` for a classroom round is either
   * confused or malicious; either way the round decides. Without this the
   * document could say "Online via Teams" for a round that is not online.
   */
  assert.equal(attendanceModeFor({ type: 'classroom' }, 'teams'), 'classroom');
  assert.equal(roundFieldsFor(ROUND({ type: 'online' }), 'teams').attendanceMode, 'classroom');
});

test('a HYBRID round REQUIRES a valid choice and is never defaulted', () => {
  assert.equal(attendanceModeFor({ type: 'hybrid' }, 'classroom'), 'classroom');
  assert.equal(attendanceModeFor({ type: 'hybrid' }, 'teams'), 'teams');
  // Anything else is a REFUSAL, not a prompt to substitute one — guessing
  // classroom for someone who meant Teams sends them to a building.
  for (const bad of [undefined, null, '', 'onsite', 'zoom', 'CLASSROOM', 0]) {
    assert.equal(attendanceModeFor({ type: 'hybrid' }, bad), null, `mode=${JSON.stringify(bad)}`);
  }
});

test('roundFieldsFor returns NULL for a hybrid round with no choice', () => {
  assert.equal(roundFieldsFor(ROUND({ type: 'hybrid' }), undefined), null);
  assert.equal(roundFieldsFor(ROUND({ type: 'hybrid' }), 'teams').attendanceMode, 'teams');
});

test('isHybridRound is a string compare, not a truthiness test', () => {
  assert.equal(isHybridRound({ type: 'hybrid' }), true);
  assert.equal(isHybridRound({ type: 'classroom' }), false);
  assert.equal(isHybridRound({}), false);
  assert.equal(isHybridRound(null), false, 'a null round threw or read as hybrid');
});

// ── 2. All four fields, together ────────────────────────────────────────────

test('roundFieldsFor produces EXACTLY the four coupled fields', () => {
  const fields = roundFieldsFor(ROUND({ _id: 'abc', dates: ['2026-09-01', '2026-09-02'] }));
  assert.deepEqual(Object.keys(fields).sort(), [...ROUND_FIELDS].sort(),
    'the derivation produces a different field set than ROUND_FIELDS names');
  assert.equal(fields.classId, 'abc');
  assert.equal(fields.scheduleType, 'classroom');
  assert.equal(fields.attendanceMode, 'classroom');
  assert.ok(fields.classDate.length > 0, 'the label is empty');
});

test('a round with no type reads as classroom, matching scheduleLabel', () => {
  // The detail screen's `scheduleLabel` treats a falsy type as Classroom.
  // Writing `undefined` here would make the stored value and the rendered
  // label disagree about the same round.
  assert.equal(roundFieldsFor(ROUND({ type: undefined })).scheduleType, 'classroom');
});

test('a round with no _id yields null — there is nothing to point at', () => {
  assert.equal(roundFieldsFor({ dates: ['2026-09-01'], type: 'classroom' }), null);
  assert.equal(roundFieldsFor(null), null);
  assert.equal(roundFieldsFor(undefined), null);
});

test('classId is STRINGIFIED — an ObjectId must not reach Mongoose as an object', () => {
  const fields = roundFieldsFor(ROUND({ _id: { toString: () => 'oid123' } }));
  assert.equal(fields.classId, 'oid123');
  assert.equal(typeof fields.classId, 'string');
});

// ── 3. The label ────────────────────────────────────────────────────────────

test('formatClassDates renders one day, a same-month range, and a cross-month range', () => {
  assert.equal(formatClassDates(['2026-09-01']), '1 ก.ย. 2569');
  assert.equal(formatClassDates(['2026-09-01', '2026-09-03']), '1-3 ก.ย. 2569');
  assert.equal(formatClassDates(['2026-09-30', '2026-10-01']), '30 ก.ย. - 1 ต.ค. 2569');
});

test('formatClassDates sorts, so an unordered array still reads correctly', () => {
  assert.equal(formatClassDates(['2026-09-03', '2026-09-01']), '1-3 ก.ย. 2569');
});

test('formatClassDates returns EMPTY for no dates, never a partial label', () => {
  for (const nothing of [[], null, undefined]) {
    assert.equal(formatClassDates(nothing), '');
  }
});

// ── 4. REQUIREMENT 5: the stored round that no longer exists ────────────────

test('a stored round still in the list produces NO extra option', () => {
  const opt = storedRoundOption({ classId: 'r1', classDate: '1 ก.ย. 2569' }, [ROUND()]);
  assert.equal(opt, null, 'a live round was duplicated as a missing one');
});

test('a stored round that is GONE renders as the selected option, marked', () => {
  /**
   * ══ THIS IS THE COMMON CASE, NOT AN EDGE CASE ══════════════════════════════
   *
   * The upstream schedule endpoint applies a `>= today` bound UNCONDITIONALLY —
   * measured and curl-verified in lib/api/schedules.js, and NOT lifted by the
   * `status` parameter. So EVERY registration for a round that has already run
   * has a classId the list cannot contain.
   *
   * Silently clearing it, or rendering the select with nothing chosen, would
   * make an admin opening an old record see a blank round and quite reasonably
   * pick a new one — moving an attendee off a course they already attended.
   */
  const opt = storedRoundOption({ classId: 'old', classDate: '1 ม.ค. 2568' }, [ROUND()]);
  assert.deepEqual(opt, { value: 'old', label: '1 ม.ค. 2568', missing: true });
});

test('a gone round with no stored label falls back to its id, never to blank', () => {
  // The round is gone, so there are no dates to re-derive from; `classDate` is
  // the only record of what it said. With neither, the id is at least
  // something an admin can quote — a blank option is indistinguishable from
  // "nothing selected", which is the state this exists to prevent.
  assert.equal(storedRoundOption({ classId: 'old', classDate: '' }, []).label, 'old');
  assert.equal(storedRoundOption({ classId: 'old', classDate: '   ' }, []).label, 'old');
  assert.equal(storedRoundOption({ classId: 'old' }, []).label, 'old');
});

test('a registration with no classId at all produces no option', () => {
  assert.equal(storedRoundOption({ classId: '' }, [ROUND()]), null);
  assert.equal(storedRoundOption({}, [ROUND()]), null);
  assert.equal(storedRoundOption(null, [ROUND()]), null);
});

test('the id comparison is by STRING — an ObjectId is not "missing"', () => {
  /**
   * Upstream `_id`s arrive as strings over JSON but a future caller could pass
   * a driver ObjectId. `'r1' === ObjectId('r1')` is false, so a strict compare
   * would mark every live round as no-longer-offered — the failure would look
   * like upstream had deleted the whole schedule.
   */
  const opt = storedRoundOption({ classId: 'r1' }, [{ _id: { toString: () => 'r1' } }]);
  assert.equal(opt, null, 'a live round read as missing because the ids were compared by identity');
});

test('an empty schedule list marks the stored round rather than throwing', () => {
  // Upstream down, or a course with no upcoming rounds at all. Both are real.
  assert.equal(storedRoundOption({ classId: 'x', classDate: 'd' }, []).missing, true);
  assert.equal(storedRoundOption({ classId: 'x', classDate: 'd' }, null).missing, true);
});
