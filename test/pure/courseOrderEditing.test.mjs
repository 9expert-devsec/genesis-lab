import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canReorderCourseGroups,
  orderedCodesForGroup,
  REORDER_BLOCKED,
} from '@/lib/courses/courseOrderEditing';

/**
 * The two safety properties of the write path, driven directly.
 *
 * A save replaces `courseOrder` with what it is handed, so "what may be handed
 * over, and when" IS the safety. These assertions are about that decision, not
 * about the markup — test/render/coursesAdminReorder checks that the screen
 * obeys it.
 */

// ── A null order cannot produce a write ─────────────────────────────────────

test('a NULL stored order blocks reordering entirely', () => {
  const r = canReorderCourseGroups({ programCourseOrder: null, q: '', type: '' });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, REORDER_BLOCKED.NO_ORDER);
});

test('undefined is treated as null, not as "no filters therefore fine"', () => {
  assert.equal(canReorderCourseGroups({}).allowed, false);
  assert.equal(canReorderCourseGroups().allowed, false);
  assert.equal(canReorderCourseGroups(undefined).reason, REORDER_BLOCKED.NO_ORDER);
});

test('the null reason WINS over the filter reason', () => {
  // An admin cannot fix an unseeded order by clearing a search box, so telling
  // them to would send them round a loop.
  const r = canReorderCourseGroups({ programCourseOrder: null, q: 'excel', type: 'public' });
  assert.equal(r.reason, REORDER_BLOCKED.NO_ORDER);
});

// ── A narrowed view cannot produce a write ──────────────────────────────────

test('a search filter blocks reordering', () => {
  const r = canReorderCourseGroups({ programCourseOrder: {}, q: 'excel', type: '' });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, REORDER_BLOCKED.FILTERED);
});

test('a type filter blocks reordering', () => {
  const r = canReorderCourseGroups({ programCourseOrder: {}, q: '', type: 'inhouse' });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, REORDER_BLOCKED.FILTERED);
});

test('whitespace-only filters do NOT block — they narrow nothing', () => {
  assert.equal(canReorderCourseGroups({ programCourseOrder: {}, q: '   ', type: '' }).allowed, true);
});

/**
 * THE PROGRAM FILTER IS DELIBERATELY NOT A BLOCKER.
 *
 * It selects WHOLE groups, so a group that survives it still holds every course
 * it holds unfiltered — which is exactly the condition the rule is protecting.
 * Blocking on it would make the filter useless for the one job an admin
 * arranging a large catalogue actually wants it for.
 */
test('the program filter does NOT block reordering', () => {
  const r = canReorderCourseGroups({ programCourseOrder: {}, q: '', type: '', program: 'oid-X' });
  assert.equal(r.allowed, true);
  assert.equal(r.reason, null);
});

test('an unfiltered view with a stored order is allowed', () => {
  const r = canReorderCourseGroups({ programCourseOrder: { CLAUDE: ['A'] }, q: '', type: '' });
  assert.deepEqual(r, { allowed: true, reason: null });
});

test('CONTROL: the decision varies with its input, it is not a constant', () => {
  const allowed = canReorderCourseGroups({ programCourseOrder: {}, q: '', type: '' }).allowed;
  const blocked = canReorderCourseGroups({ programCourseOrder: null, q: '', type: '' }).allowed;
  assert.notEqual(allowed, blocked);
});

// ── What a save sends ───────────────────────────────────────────────────────

const row = (code) => ({ course: { course_id: code } });

test('the payload is EVERY row of the group, in displayed order', () => {
  assert.deepEqual(
    orderedCodesForGroup([row('CLAUDE-AI'), row('VIBE-CODE-L2'), row('VIBE-CODE-L1')]),
    ['CLAUDE-AI', 'VIBE-CODE-L2', 'VIBE-CODE-L1']
  );
});

test('codes are normalised — upper-cased and trimmed', () => {
  // Four live courses are not fully uppercase and course_id has no canonical
  // casing upstream, so a rank lookup that missed on case would silently make a
  // course unlisted.
  assert.deepEqual(
    orderedCodesForGroup([row('  power-apps '), row('SQL-PG-Query')]),
    ['POWER-APPS', 'SQL-PG-QUERY']
  );
});

test('a repeated code keeps its FIRST position, matching buildRankMap', () => {
  assert.deepEqual(
    orderedCodesForGroup([row('A'), row('B'), row('a')]),
    ['A', 'B']
  );
});

test('rows with no code are dropped rather than written as empty strings', () => {
  assert.deepEqual(
    orderedCodesForGroup([row('A'), { course: {} }, row(''), row(null), row('B')]),
    ['A', 'B']
  );
});

test('a bare {course_id} row is accepted too, so the shape is not load-bearing', () => {
  assert.deepEqual(orderedCodesForGroup([{ course_id: 'A' }, row('B')]), ['A', 'B']);
});

test('an empty or absent group yields an empty array — which the action refuses', () => {
  assert.deepEqual(orderedCodesForGroup([]), []);
  assert.deepEqual(orderedCodesForGroup(null), []);
  assert.deepEqual(orderedCodesForGroup(undefined), []);
});

/**
 * THE FULL-MEMBERSHIP CONSEQUENCES, ASSERTED RATHER THAN ASSUMED.
 *
 * Both were confirmed as correct-by-construction before building, and both are
 * things a future change could quietly reverse.
 */
test('previously-unlisted rows ARE included — a save adopts them', () => {
  const rows = [
    { course: { course_id: 'BRAND-NEW' }, position: null, unlisted: true },
    { course: { course_id: 'CLAUDE-AI' }, position: 1, unlisted: false },
  ];
  assert.deepEqual(orderedCodesForGroup(rows), ['BRAND-NEW', 'CLAUDE-AI']);
});

test('a dead code in the stored list is pruned by construction', () => {
  // The payload is built from LIVE rows, so a stored code matching no live
  // course cannot survive. Nothing else in the codebase prunes them.
  const stored = ['CLAUDE-AI', 'DELETED-LAST-YEAR', 'VIBE-CODE-L1'];
  const live = orderedCodesForGroup([row('CLAUDE-AI'), row('VIBE-CODE-L1')]);
  assert.ok(stored.includes('DELETED-LAST-YEAR'));
  assert.ok(!live.includes('DELETED-LAST-YEAR'));
  assert.deepEqual(live, ['CLAUDE-AI', 'VIBE-CODE-L1']);
});

test('CONTROL: the payload follows the array, so a reorder really changes it', () => {
  const a = orderedCodesForGroup([row('A'), row('B')]);
  const b = orderedCodesForGroup([row('B'), row('A')]);
  assert.notDeepEqual(a, b);
  assert.deepEqual(a.slice().sort(), b.slice().sort(), 'membership must be identical, only order differs');
});
