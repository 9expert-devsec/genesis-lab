import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS, ADMIN_PAGES } from '@/lib/rbac/pages';
import { UNKNOWN_MENU, MENU_ENUM } from '@/models/AdminAuditLog';
import { menusForUser, canAccess } from '@/lib/rbac/access';

// The server-side clamp for the audit-log reading surface, plus the registry
// entry it depends on.
//
// WHAT THIS FILE CANNOT SEE: that the query actually applies the clamp — that
// belongs to the query-builder tests — or that a session carries the shape this
// assumes. What it CAN see is the one property the whole permission model rests
// on: that a non-superadmin's clamp can never contain UNKNOWN_MENU.

// Taken from the live registry rather than hardcoded, so these cannot drift
// into asserting strings this file made up.
const REAL_KEYS = ALL_PAGE_KEYS.slice(0, 3);
const STALE_KEY = `${ALL_PAGE_KEYS[0]}_removed_in_2024`;

// ── the registry entry ─────────────────────────────────────────────

test('audit_log is a registered page key, in the ระบบ group', () => {
  assert.ok(ALL_PAGE_KEYS.includes('audit_log'), 'audit_log must be in ALL_PAGE_KEYS');
  const group = ADMIN_PAGES.find((g) => g.pages.some((p) => p.key === 'audit_log'));
  assert.ok(group, 'audit_log must belong to a group');
  assert.equal(group.group, 'ระบบ');
});

test('audit_log carries a Thai label and its own href', () => {
  const page = ADMIN_PAGES.flatMap((g) => g.pages).find((p) => p.key === 'audit_log');
  assert.match(page.label, /[฀-๿]/, 'the sidebar and roles UI render this label to Thai-reading admins');
  assert.equal(page.href, '/admin/audit-log');
});

test('audit_log entered MENU_ENUM automatically — the log is itself auditable', () => {
  // Not a side effect. MENU_ENUM = [...ALL_PAGE_KEYS, UNKNOWN_MENU], so adding
  // the page key is what makes rows about the audit log itself storable.
  assert.ok(MENU_ENUM.includes('audit_log'));
});

test('CONTROL: a key that was never registered is absent from both', () => {
  // Without this, the three assertions above could pass against an `includes`
  // that returned true for anything.
  assert.equal(ALL_PAGE_KEYS.includes('audit_logz'), false);
  assert.equal(MENU_ENUM.includes('audit_logz'), false);
});

// ── the clamp ──────────────────────────────────────────────────────

test('superadmin gets NULL — no clamp at all', () => {
  // null is not "no menus". It means the caller must omit the menu filter
  // entirely; an empty array would mean the opposite.
  assert.equal(menusForUser({ isSuperadmin: true, pages: [] }), null);
  assert.equal(menusForUser({ isSuperadmin: true, pages: REAL_KEYS }), null);
});

test('the pages == null sentinel ALSO gets null', () => {
  // options.js authorize() stores `pages: null` as the allow-all sentinel,
  // independently of the isSuperadmin flag. Both paths must reach the same
  // answer or a superadmin sees an empty log.
  assert.equal(menusForUser({ pages: null }), null);
  assert.equal(menusForUser({ isSuperadmin: false, pages: null }), null);
});

test('CONTROL: null and [] are different answers, and the difference is the whole clamp', () => {
  // If these collapsed, either superadmins would see nothing or a page-less
  // admin would see everything. Both are catastrophic and neither would throw.
  const superadmin = menusForUser({ isSuperadmin: true });
  const pageless = menusForUser({ isSuperadmin: false, pages: [] });
  assert.equal(superadmin, null, 'superadmin: no clamp');
  assert.deepEqual(pageless, [], 'page-less admin: a clamp that matches nothing');
  assert.notEqual(superadmin, pageless);
});

test('a role with three pages gets exactly those three', () => {
  assert.deepEqual(menusForUser({ isSuperadmin: false, pages: REAL_KEYS }), REAL_KEYS);
});

test('a stale page key stored on a role is DROPPED', () => {
  // Roles outlive registry edits. A key that no longer exists is harmless in a
  // $in but makes the clamp lie about what it covers.
  const out = menusForUser({ isSuperadmin: false, pages: [...REAL_KEYS, STALE_KEY] });
  assert.deepEqual(out, REAL_KEYS);
  assert.equal(out.includes(STALE_KEY), false);
});

test('CONTROL: the drop is selective — the real keys beside it survive', () => {
  // Without this, a filter that dropped everything would satisfy the test above
  // while silently making every non-superadmin clamp empty.
  const out = menusForUser({ isSuperadmin: false, pages: [STALE_KEY, ...REAL_KEYS] });
  assert.equal(out.length, REAL_KEYS.length, 'only the stale one went');
  for (const key of REAL_KEYS) assert.ok(out.includes(key), `${key} survived`);
});

test('UNKNOWN_MENU can NEVER appear in a non-superadmin clamp', () => {
  // THE FAIL-CLOSED PROPERTY. Rows filed under UNKNOWN_MENU are visible to
  // superadmin only, and this is the mechanism: 'unknown' is not a page key, so
  // it cannot survive the narrowing — and it cannot be granted either, because
  // there is no registry entry to tick in the roles UI.
  const attempts = [
    { isSuperadmin: false, pages: [UNKNOWN_MENU] },
    { isSuperadmin: false, pages: [...REAL_KEYS, UNKNOWN_MENU] },
    { isSuperadmin: false, pages: [UNKNOWN_MENU, UNKNOWN_MENU] },
  ];
  for (const user of attempts) {
    const out = menusForUser(user);
    assert.equal(
      out.includes(UNKNOWN_MENU), false,
      `a role storing ${UNKNOWN_MENU} must not be able to read those rows`
    );
  }
});

test('CONTROL: UNKNOWN_MENU is excluded because it is not a page key, not by a special case', () => {
  // If someone "simplified" the narrowing to `user.pages ?? []` and added an
  // explicit `!== 'unknown'` check, this would still pass — so assert the
  // structural fact the exclusion actually rests on.
  assert.equal(
    ALL_PAGE_KEYS.includes(UNKNOWN_MENU), false,
    `${UNKNOWN_MENU} must not be a registry key, or the narrowing would let it through`
  );
  assert.ok(MENU_ENUM.includes(UNKNOWN_MENU), 'while remaining a storable menu value');
});

test('no user, or a non-array pages value, clamps to nothing', () => {
  for (const bad of [null, undefined, { pages: 'articles' }, { pages: 42 }, { pages: {} }]) {
    const out = menusForUser(bad);
    assert.ok(Array.isArray(out), `${JSON.stringify(bad)} must not return null (no clamp)`);
    assert.deepEqual(out, [], 'and must match nothing');
  }
});

test('a user object with NO pages field is allow-all — matching canAccess exactly', () => {
  // Deliberate, and worth stating because it looks like a fail-open.
  //
  // `pages == null` is loose equality, so `{}` (pages === undefined) takes the
  // sentinel branch. That is not this function's invention: canAccess has
  // always read `user.isSuperadmin || user.pages == null` and returns TRUE for
  // the same input. The two MUST agree.
  //
  // If menusForUser were stricter, a user who passes requirePage('audit_log')
  // would land on the page and get an empty table — indistinguishable from a
  // broken query. If it were looser, it would be a privilege leak. Agreement is
  // the property that matters; the shared looseness is canAccess's to change.
  assert.equal(menusForUser({}), null);
  assert.equal(canAccess({}, ALL_PAGE_KEYS[0]), true, 'canAccess agrees, and that is the point');
});

test('CONTROL: the two predicates agree across the whole sentinel matrix', () => {
  // The real invariant: for any user, "canAccess says yes to everything" and
  // "menusForUser says no clamp" must be the same answer. A drift between them
  // is the bug this pair exists to catch, in either direction.
  const cases = [
    { isSuperadmin: true, pages: [] },
    { pages: null },
    {},
    { isSuperadmin: false, pages: REAL_KEYS },
    { isSuperadmin: false, pages: [] },
  ];
  for (const user of cases) {
    const noClamp = menusForUser(user) === null;
    const allowsUnheld = canAccess(user, ALL_PAGE_KEYS.at(-1));
    const heldByList = Array.isArray(user.pages) && user.pages.includes(ALL_PAGE_KEYS.at(-1));
    assert.equal(
      noClamp, allowsUnheld && !heldByList,
      `disagreement for ${JSON.stringify(user)}: clamp=${noClamp} canAccess=${allowsUnheld}`
    );
  }
  // …and the clamp still reflects the list for an ordinary role.
  assert.deepEqual(menusForUser({ isSuperadmin: false, pages: REAL_KEYS }), REAL_KEYS);
});
