import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVALIDATED_TYPES,
  classifyRevalidated,
  isRevalidationEntry,
  revalidationCallSummary,
  unknownTypesIn,
} from '@/lib/cache-console/revalidatedEntries';

/**
 * `WebhookLog.revalidated` is a TAGGED UNION and the console must discriminate
 * on `type`, never on `ok`.
 *
 * ── THE DEFECT THIS PREVENTS ────────────────────────────────────────────────
 * Five type values are produced at four sites in webhooks/handlers.js. THREE of
 * them carry `ok: false` and none of those three is a failed revalidation:
 * `alias-lookup` is a database miss (:138); `visibility` records that the
 * incoming row fails upstream's own /schedules read filter (:198); and
 * `visibility-uncertain` records that we could not decide (:201).
 * WebhookLog.js:31-34 says both visibility kinds leave the delivery's own
 * `status` at 'ok' and the route returning 200.
 *
 * So a panel grouping by `ok` reports a healthy webhook as three failed cache
 * invalidations — wrong about what happened, and wrong in the direction that
 * generates work for someone. The fixture below is deliberately the WORST
 * CASE: one delivery carrying all five types at once, three of them ok:false.
 */

const DELIVERY = [
  { type: 'tag', target: 'public-courses', ok: true },
  { type: 'tag', target: 'course:MSE-AI', ok: true },
  { type: 'path', target: '/mse-ai-training-course', ok: true },
  { type: 'path', target: '/search', ok: false, error: 'boom' },
  { type: 'alias-lookup', target: 'course_id:MSE-AI', ok: false, error: 'mongo down' },
  { type: 'visibility', target: 'signup_url', ok: false, error: 'empty', value: '' },
  { type: 'visibility-uncertain', target: 'status', ok: false, error: 'case-folded', value: 'Open' },
];

test('every type lands in its own bucket, and nothing is dropped', () => {
  const g = classifyRevalidated(DELIVERY);
  assert.equal(g.revalidations.length, 4);
  assert.equal(g.aliasLookups.length, 1);
  assert.equal(g.visibility.length, 1);
  assert.equal(g.visibilityUncertain.length, 1);
  assert.equal(g.unknown.length, 0);
  assert.equal(g.total, DELIVERY.length, 'every entry is accounted for');
});

test('most ok:false entries are not revalidation failures at all', () => {
  /**
   * The whole point, and the fixture is built to make it sharp: FOUR entries
   * carry `ok: false`, and only ONE of them is a revalidation that threw. The
   * other three are a database miss and two findings about the incoming row.
   * Grouping by `ok` would report all four as failed cache invalidations.
   *
   * The genuine failure is in the fixture on purpose — without it, "ok:false
   * means not-a-revalidation" would be trivially true here and the test would
   * say nothing about a real one being classified correctly.
   */
  const notOk = DELIVERY.filter((e) => e.ok === false);
  assert.equal(notOk.length, 4, 'the fixture really does carry four');

  const g = classifyRevalidated(DELIVERY);
  assert.equal(
    g.revalidations.filter((e) => e.ok === false).length,
    1,
    'exactly ONE of the four is a revalidation that threw'
  );
  assert.equal(
    g.aliasLookups.length + g.visibility.length + g.visibilityUncertain.length,
    3,
    'and the other three are not revalidations in any sense'
  );
});

test('CONTROL: an ok-based split gives a different, wrong answer', () => {
  // Proves the assertion above is about the discriminator and not arithmetic
  // that would hold either way.
  const byOk = DELIVERY.filter((e) => e.ok === false).length;
  const byType = classifyRevalidated(DELIVERY).revalidations.filter((e) => e.ok === false).length;
  assert.notEqual(byOk, byType);
});

test('the two visibility kinds stay APART from each other', () => {
  // WebhookLog.js:31-33: definite and possible must not be read as the same
  // claim. A fact about upstream's filter and an open question about it are
  // different things to put in front of an admin.
  const g = classifyRevalidated(DELIVERY);
  assert.equal(g.visibility[0].target, 'signup_url');
  assert.equal(g.visibilityUncertain[0].target, 'status');
  assert.ok(!g.visibility.some((e) => e.type === REVALIDATED_TYPES.VISIBILITY_UNCERTAIN));
  assert.ok(!g.visibilityUncertain.some((e) => e.type === REVALIDATED_TYPES.VISIBILITY));
});

test('CONTROL: a prefix match would fold uncertain into definite', () => {
  // 'visibility-uncertain'.startsWith('visibility') is true, so a startsWith
  // or includes() discriminator merges them silently. This pins that the
  // implementation is an exact match.
  assert.ok('visibility-uncertain'.startsWith('visibility'), 'the trap is real');
  const g = classifyRevalidated([
    { type: 'visibility-uncertain', target: 'status', ok: false },
  ]);
  assert.equal(g.visibility.length, 0, 'not folded into the definite bucket');
  assert.equal(g.visibilityUncertain.length, 1);
});

test('isRevalidationEntry is true only for tag and path', () => {
  assert.equal(isRevalidationEntry({ type: 'tag' }), true);
  assert.equal(isRevalidationEntry({ type: 'path' }), true);
  assert.equal(isRevalidationEntry({ type: 'alias-lookup' }), false);
  assert.equal(isRevalidationEntry({ type: 'visibility' }), false);
  assert.equal(isRevalidationEntry({ type: 'visibility-uncertain' }), false);
  assert.equal(isRevalidationEntry(null), false);
});

test('an unknown type SURVIVES as itself rather than being swallowed', () => {
  // A sixth member added to handlers.js without touching the console must be
  // visible, not folded into an existing bucket and not dropped.
  const g = classifyRevalidated([...DELIVERY, { type: 'quota-exceeded', target: 'x' }]);
  assert.equal(g.unknown.length, 1);
  assert.equal(g.unknown[0].type, 'quota-exceeded');
  assert.deepEqual(unknownTypesIn([...DELIVERY, { type: 'quota-exceeded' }]), ['quota-exceeded']);
});

test('CONTROL: the five known types produce NO unknowns', () => {
  // Otherwise "unknown surfaces" would pass against an implementation that
  // called everything unknown.
  assert.deepEqual(unknownTypesIn(DELIVERY), []);
});

test('null and non-arrays yield empty buckets rather than throwing', () => {
  // `revalidated` defaults to null (WebhookLog.js:35) and is Mixed, so the
  // console will meet both. A trail that crashes the page displaying it is
  // worse than one that shows nothing.
  for (const input of [null, undefined, 'nope', 42, {}]) {
    const g = classifyRevalidated(input);
    assert.equal(g.total, 0);
    assert.deepEqual(g.revalidations, []);
    assert.deepEqual(unknownTypesIn(input), []);
  }
});

test('a malformed ENTRY inside a good array is kept, not skipped', () => {
  const g = classifyRevalidated([null, 'x', { type: 'tag', target: 't', ok: true }]);
  assert.equal(g.revalidations.length, 1);
  assert.equal(g.unknown.length, 2, 'the two junk entries are visible, not silently gone');
  assert.equal(g.total, 3);
});

test('the call summary counts ATTEMPTS and throws — never successes', () => {
  /**
   * The name is the guarantee. safeRevalidate/safeRevalidateTag
   * (handlers.js:56-75) set ok:true when the call DID NOT THROW; both Next
   * APIs return void, so "a cache entry was cleared" is not observable and
   * must not be counted. `attempted` and `threw` are the only two honest
   * numbers available.
   */
  const s = revalidationCallSummary(DELIVERY);
  assert.deepEqual(s, { attempted: 4, threw: 1 });
  assert.ok(!('succeeded' in s), 'there is no success count, deliberately');
});

test('the call summary ignores the non-revalidation types entirely', () => {
  const s = revalidationCallSummary([
    { type: 'alias-lookup', ok: false },
    { type: 'visibility', ok: false },
    { type: 'visibility-uncertain', ok: false },
  ]);
  assert.deepEqual(s, { attempted: 0, threw: 0 });
});

test('the type constants match the strings handlers.js actually emits', () => {
  // Pinned as literals: a typo here is a bucket that silently never fills,
  // which looks exactly like "this never happens".
  assert.deepEqual(Object.values(REVALIDATED_TYPES).sort(), [
    'alias-lookup',
    'path',
    'tag',
    'visibility',
    'visibility-uncertain',
  ]);
});
