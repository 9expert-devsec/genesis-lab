import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { UNKNOWN_MENU } from '@/models/AdminAuditLog';
import {
  buildAuditQuery,
  parseCursor,
  encodeCursor,
  AUDIT_SORT,
} from '@/lib/audit/auditQuery';

// The audit-log query builder. Pure — no database, no session, no Next.
//
// This is the half of the reading surface that must never be got wrong: the
// permission clamp and the cursor. Both fail SILENTLY when broken (a widened
// clamp shows rows nobody should see; a non-unique cursor drops rows at page
// boundaries and the page still looks fine), which is why they are here rather
// than left to the runner.
//
// WHAT THIS FILE CANNOT SEE: that Mongo executes the filter the way the index
// expects — that needs explain() against a real collection — or that the runner
// applies the builder's output at all.

const A = ALL_PAGE_KEYS[0];
const B = ALL_PAGE_KEYS[1];
const C = ALL_PAGE_KEYS[2];

const superadmin = { isSuperadmin: true, pages: [] };
const limited    = { isSuperadmin: false, pages: [A, B] };
const pageless   = { isSuperadmin: false, pages: [] };

// ── the clamp ──────────────────────────────────────────────────────

test('superadmin gets NO menu filter at all', () => {
  const { filter, clampedTo } = buildAuditQuery({ user: superadmin });
  assert.equal('menu' in filter, false, 'no clamp means no menu key, not an empty one');
  assert.equal(clampedTo, null);
});

test('a limited user is clamped to exactly their menus', () => {
  const { filter, clampedTo } = buildAuditQuery({ user: limited });
  assert.deepEqual(filter.menu, { $in: [A, B] });
  assert.deepEqual(clampedTo, [A, B]);
});

test('CONTROL: those two are different queries — the clamp is not decorative', () => {
  // If the clamp were dropped, both would produce the same filter and every
  // assertion in this file would pass while the page leaked every menu.
  const sup = buildAuditQuery({ user: superadmin }).filter;
  const lim = buildAuditQuery({ user: limited }).filter;
  assert.notDeepEqual(sup, lim);
});

test('a requested menu the user HOLDS narrows to that menu', () => {
  const { filter } = buildAuditQuery({ user: limited, filters: { menu: B } });
  assert.equal(filter.menu, B);
});

test('a requested menu the user does NOT hold yields the intersection, not the request', () => {
  // The whole point of the clamp. A filter arriving from the UI — or from a
  // hand-edited URL, or a forged POST — must never widen what the query can
  // reach. C is a real page key that this user simply does not hold.
  const { filter } = buildAuditQuery({ user: limited, filters: { menu: C } });
  assert.notEqual(filter.menu, C, 'the requested menu must not survive');
  assert.deepEqual(filter.menu, { $in: [] }, 'it becomes a filter that matches nothing');
});

test('UNKNOWN_MENU cannot be reached by a limited user, however it is asked for', () => {
  // Rows filed under UNKNOWN_MENU are superadmin-only. Asking for them directly
  // is the obvious attempt; it produces the same empty intersection.
  const { filter } = buildAuditQuery({ user: limited, filters: { menu: UNKNOWN_MENU } });
  assert.deepEqual(filter.menu, { $in: [] });

  // And a role that somehow stored it still cannot: menusForUser drops it.
  const sneaky = buildAuditQuery({ user: { isSuperadmin: false, pages: [A, UNKNOWN_MENU] } });
  assert.deepEqual(sneaky.filter.menu, { $in: [A] });
});

test('CONTROL: a superadmin CAN reach UNKNOWN_MENU — the restriction is real, not universal', () => {
  // Without this, a builder that blocked 'unknown' unconditionally would pass
  // the test above while hiding the mis-keyed rows from the only person who can
  // repair the offending caller.
  const { filter } = buildAuditQuery({ user: superadmin, filters: { menu: UNKNOWN_MENU } });
  assert.equal(filter.menu, UNKNOWN_MENU);
});

test('an empty clamp stays $in: [] and is FLAGGED — never "no filter"', () => {
  // [] and null mean opposite things. Collapsing them turns an admin who holds
  // no pages into a superadmin, and nothing would throw.
  const { filter, isEmptyClamp } = buildAuditQuery({ user: pageless });
  assert.deepEqual(filter.menu, { $in: [] }, 'matches nothing');
  assert.equal(isEmptyClamp, true, 'and the page is told, so it can say why');
});

test('CONTROL: isEmptyClamp is false for both a superadmin and a normal role', () => {
  // Pairs with the test above — a flag that was always true would make the page
  // permanently claim the user holds no menus.
  assert.equal(buildAuditQuery({ user: superadmin }).isEmptyClamp, false);
  assert.equal(buildAuditQuery({ user: limited }).isEmptyClamp, false);
});

test('no UI filter can introduce authority — actor and entity only narrow', () => {
  // A caller-supplied actor id is a filter, never a permission. It must not
  // remove the clamp, and it must land on the indexed field.
  const { filter } = buildAuditQuery({
    user: limited,
    filters: { actor: 'admin-1', entity: 'role', action: 'delete' },
  });
  assert.deepEqual(filter.menu, { $in: [A, B] }, 'the clamp survives every other filter');
  assert.equal(filter['actor.id'], 'admin-1');
  assert.equal(filter.entity, 'role');
  assert.equal(filter.action, 'delete');
});

test('CONTROL: unknown filter keys are ignored rather than spread into the query', () => {
  // The obvious injection: hand the builder a key it does not know and see
  // whether it lands in the filter. A spread-based implementation reddens here.
  const { filter } = buildAuditQuery({
    user: limited,
    filters: { menuRaw: 'anything', $where: 'true', 'actor.name': 'x', pages: [C] },
  });
  for (const key of ['menuRaw', '$where', 'actor.name', 'pages']) {
    assert.equal(key in filter, false, `${key} must not reach the query`);
  }
  assert.deepEqual(filter.menu, { $in: [A, B] });
});

// ── the cursor ─────────────────────────────────────────────────────

test('the cursor is on (createdAt, _id), not createdAt alone', () => {
  const at = new Date('2026-07-31T10:00:00.000Z');
  const cursor = `${at.toISOString()}|64f000000000000000000001`;
  const { filter } = buildAuditQuery({ user: superadmin, cursor });

  assert.ok(Array.isArray(filter.$or), 'a compound cursor is an $or, not a single $lt');
  assert.equal(filter.$or.length, 2);
  assert.deepEqual(filter.$or[0], { createdAt: { $lt: at } });
  assert.deepEqual(filter.$or[1], { createdAt: at, _id: { $lt: '64f000000000000000000001' } });
});

test('CONTROL: the tie-break branch is what makes it compound', () => {
  // A cursor of `{ createdAt: { $lt: c } }` alone SKIPS every row sharing the
  // boundary millisecond, and one human action can now write two rows that
  // after() schedules back to back. Assert the second branch exists and pins
  // the exact instant rather than an inequality.
  const at = new Date('2026-07-31T10:00:00.000Z');
  const { filter } = buildAuditQuery({
    user: superadmin, cursor: `${at.toISOString()}|64f000000000000000000001`,
  });
  const tie = filter.$or[1];
  assert.deepEqual(tie.createdAt, at, 'equality on the timestamp, not a range');
  assert.ok(tie._id?.$lt, 'and a strict bound on _id to order within it');
});

test('no query ever uses skip', () => {
  // This collection only grows; skip(n) walks n documents server-side on every
  // page and gets slower forever.
  for (const args of [
    { user: superadmin },
    { user: limited, filters: { menu: A } },
    { user: superadmin, cursor: '2026-07-31T10:00:00.000Z|64f000000000000000000001' },
  ]) {
    const { filter } = buildAuditQuery(args);
    assert.equal(JSON.stringify(filter).includes('skip'), false);
  }
});

test('a date range and a cursor coexist without the range eating the tie-break', () => {
  // Flattening both into `filter.createdAt` would overwrite one with the other.
  const at = new Date('2026-07-31T10:00:00.000Z');
  const { filter } = buildAuditQuery({
    user: superadmin,
    filters: { from: '2026-07-01', to: '2026-08-01' },
    cursor: `${at.toISOString()}|64f000000000000000000001`,
  });
  assert.ok(Array.isArray(filter.$and), 'they are combined, not merged');
  assert.ok(filter.$and[0].createdAt.$gte instanceof Date);
  assert.ok(Array.isArray(filter.$and[1].$or), 'the compound cursor survives intact');
});

test('CONTROL: a range with no cursor stays a plain createdAt filter', () => {
  // Without this, always emitting $and would pass the test above while making
  // every unpaginated query needlessly nested.
  const { filter } = buildAuditQuery({ user: superadmin, filters: { from: '2026-07-01' } });
  assert.ok(filter.createdAt?.$gte instanceof Date);
  assert.equal('$and' in filter, false);
});

test('a malformed cursor is ignored, not fatal', () => {
  for (const bad of ['', 'garbage', 'not-a-date|abc', '2026-07-31T10:00:00.000Z', null, undefined]) {
    assert.equal(parseCursor(bad), null, `${JSON.stringify(bad)} must not parse`);
    const { filter } = buildAuditQuery({ user: superadmin, cursor: bad });
    assert.equal('$or' in filter, false, 'and must produce no cursor clause');
  }
});

test('encodeCursor round-trips through parseCursor', () => {
  const row = { createdAt: new Date('2026-07-31T10:00:00.000Z'), _id: '64f000000000000000000001' };
  const parsed = parseCursor(encodeCursor(row));
  assert.equal(parsed.createdAt.getTime(), row.createdAt.getTime());
  assert.equal(parsed.id, row._id);
  assert.equal(encodeCursor({}), null, 'and an unusable row yields no cursor');
});

test('the sort matches the declared index direction', () => {
  // AdminAuditLog declares {createdAt:-1} and three {x, createdAt:-1} compounds.
  // An index serves a sort only in its own direction or its exact reverse.
  assert.deepEqual(AUDIT_SORT, { createdAt: -1, _id: -1 });
});
