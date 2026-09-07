import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { DASHBOARD_SCOPE_KEYS } from '@/lib/dashboard/scopeKeys';
import {
  BACKFILL_TRIGGER_KEY,
  SCOPES_TO_ADD,
  planDashboardScopeBackfill,
  sectionsVisible,
  sectionsVisibleBeforeE2,
} from '@/lib/dashboard/backfillPlan';

/**
 * The backfill: nobody's REGISTRATION view changes on deploy, and the one thing
 * that does change is recorded rather than discovered.
 *
 * ══ THE TEST IS ASYMMETRIC BECAUSE THE CHANGE IS ════════════════════════════
 *
 * `dashboard_registrations` is a pure preservation: a role that held `dashboard`
 * saw the registration cards before and holds the key that gates them after.
 * That is the "no change on deploy" property and it is asserted as an equality.
 *
 * `dashboard_system` is NOT. The ภาพรวมระบบ strip was gated on `isSuperadmin`,
 * so no page grant could produce it; after the backfill every non-superadmin
 * role holding `dashboard` gains it. Writing a symmetric "nothing changed" test
 * would have required asserting something false, so the widening gets its own
 * assertion instead — one that goes red if somebody quietly removes it, and red
 * if somebody quietly adds a third.
 */

const ROLES = [
  { key: 'superadmin',         isSuperadmin: true,  pages: [...ALL_PAGE_KEYS] },
  { key: 'admin',              isSuperadmin: false, pages: ['dashboard', 'registrations', 'courses'] },
  { key: 'registration_admin', isSuperadmin: false, pages: ['dashboard', 'registrations'] },
  { key: 'editor',             isSuperadmin: false, pages: ['dashboard', 'articles'] },
  // A role with no dashboard at all — the case the trigger exists for.
  { key: 'media_only',         isSuperadmin: false, pages: ['media'] },
];

const applyPlan = (roles) => {
  const { toUpdate } = planDashboardScopeBackfill(roles);
  return roles.map((r) => {
    const planned = toUpdate.find((p) => p.key === r.key);
    return planned ? { ...r, pages: planned.after } : r;
  });
};

// ── the fixture is asserted before anything is concluded from it ────────────
test('backfill: the fixture is a real spread of roles', () => {
  assert.ok(ROLES.some((r) => r.isSuperadmin), 'no superadmin in the fixture');
  assert.ok(ROLES.filter((r) => r.pages.includes('dashboard')).length >= 3);
  assert.ok(ROLES.some((r) => !r.pages.includes('dashboard')), 'no negative case');
  for (const key of SCOPES_TO_ADD) {
    assert.equal(
      ROLES.some((r) => !r.isSuperadmin && r.pages.includes(key)), false,
      'a non-superadmin fixture role already holds a scope — the before/after '
      + 'comparison would be measuring nothing',
    );
  }
});

// ── 1. the keys are the registry's, and both of them ────────────────────────
test('backfill: adds exactly the two scope keys, and they are registered', () => {
  assert.deepEqual(SCOPES_TO_ADD, ['dashboard_registrations', 'dashboard_system']);
  for (const key of SCOPES_TO_ADD) {
    assert.ok(ALL_PAGE_KEYS.includes(key), `${key} is not a registered page key`);
  }
  assert.equal(BACKFILL_TRIGGER_KEY, 'dashboard');
  assert.ok(ALL_PAGE_KEYS.includes(BACKFILL_TRIGGER_KEY));
});

// ── 2. THE NO-CHANGE-ON-DEPLOY TEST (registration half) ─────────────────────
test('backfill: every role sees exactly the registration sections it saw before', () => {
  const after = applyPlan(ROLES);
  for (const [i, role] of ROLES.entries()) {
    assert.equal(
      sectionsVisible(after[i]).registrations,
      sectionsVisibleBeforeE2(role).registrations,
      `${role.key}'s access to the registration sections changed. The backfill's `
      + 'whole job is that it does not.',
    );
  }
});

test('backfill: every role that could open the dashboard gains BOTH scopes', () => {
  /**
   * ── COMPARED AGAINST DASHBOARD_SCOPE_KEYS, NOT AGAINST SCOPES_TO_ADD ──────
   *
   * MEASURED, running control (d): the first version of this assertion read
   * `assert.deepEqual(planned.add, SCOPES_TO_ADD)`, and dropping
   * `DASHBOARD_SCOPE_KEYS.system` from SCOPES_TO_ADD left it GREEN — because
   * both sides of the comparison shrank together. It was asserting that the plan
   * agrees with its own constant, which it does by construction, rather than
   * that the constant is the right one.
   *
   * The independent source is `DASHBOARD_SCOPE_KEYS`, which is what the RUNTIME
   * predicate gates on. Comparing against that is the actual claim: a role that
   * could open the dashboard ends up holding every key the dashboard checks.
   */
  const BOTH_RUNTIME_KEYS = [
    DASHBOARD_SCOPE_KEYS.registrations,
    DASHBOARD_SCOPE_KEYS.system,
  ].sort();

  const { toUpdate } = planDashboardScopeBackfill(ROLES);
  const holders = ROLES.filter((r) => r.pages.includes(BACKFILL_TRIGGER_KEY) && !r.isSuperadmin);
  assert.ok(holders.length >= 3, 'the fixture lost its dashboard-holding roles');
  for (const role of holders) {
    const planned = toUpdate.find((p) => p.key === role.key);
    assert.ok(planned, `${role.key} holds 'dashboard' but was not planned for update`);
    assert.deepEqual(
      [...planned.add].sort(), BOTH_RUNTIME_KEYS,
      `${role.key} would get ${planned.add.length} of the 2 keys the dashboard `
      + 'actually gates on. A role that gets one lands on a dashboard missing '
      + 'half of what it had.',
    );
  }
});

test('backfill: a role WITHOUT `dashboard` is not touched', () => {
  const { toUpdate, skipped } = planDashboardScopeBackfill(ROLES);
  assert.equal(toUpdate.some((p) => p.key === 'media_only'), false);
  assert.match(
    skipped.find((s) => s.key === 'media_only').reason,
    /does not hold 'dashboard'/,
  );
  // And granting one anyway would be invisible today and silently become access
  // the moment somebody ticked `dashboard`.
  const after = applyPlan(ROLES).find((r) => r.key === 'media_only');
  for (const key of SCOPES_TO_ADD) assert.equal(after.pages.includes(key), false);
});

// ── 3. THE WIDENING, NAMED ──────────────────────────────────────────────────
test('backfill: the ภาพรวมระบบ strip WIDENS — recorded, not hidden', () => {
  const after = applyPlan(ROLES);
  const gained = ROLES
    .map((role, i) => ({ role, after: after[i] }))
    .filter(({ role, after: a }) =>
      !sectionsVisibleBeforeE2(role).system && sectionsVisible(a).system)
    .map(({ role }) => role.key);

  assert.deepEqual(
    gained.sort(), ['admin', 'editor', 'registration_admin'],
    'the set of roles gaining the system strip changed. That set IS the access '
    + 'change this round makes — if it shrank, the backfill stopped doing what '
    + 'E2.1 asked; if it grew, something else granted `dashboard`.',
  );
});

test('backfill: superadmin sees both halves before and after, with or without the keys', () => {
  const su = { key: 'superadmin', isSuperadmin: true, pages: [] };
  assert.deepEqual(sectionsVisibleBeforeE2(su), { registrations: true, system: true });
  assert.deepEqual(sectionsVisible(su), { registrations: true, system: true });
});

// ── 4. idempotence ──────────────────────────────────────────────────────────
test('backfill: a second run plans nothing — $addToSet is not doing the work alone', () => {
  const once = applyPlan(ROLES);
  const { toUpdate, skipped } = planDashboardScopeBackfill(once);
  assert.deepEqual(toUpdate, [], 'the second run would write again');
  assert.equal(skipped.length, ROLES.length);
  assert.ok(skipped.some((s) => s.reason === 'already holds both scopes'));

  const twice = applyPlan(once);
  assert.deepEqual(twice, once, 'applying twice is not the same as applying once');
});

test('backfill: a partially-migrated role gets only the key it lacks', () => {
  // The state a run interrupted halfway would leave. `add` must be the
  // difference, not the whole set, or the update would be a no-op write.
  const half = [{ key: 'editor', pages: ['dashboard', 'dashboard_registrations'] }];
  const { toUpdate } = planDashboardScopeBackfill(half);
  assert.deepEqual(toUpdate[0].add, ['dashboard_system']);
});

test('backfill: malformed input is survived, not thrown on', () => {
  assert.deepEqual(planDashboardScopeBackfill([]), { toUpdate: [], skipped: [] });
  assert.deepEqual(planDashboardScopeBackfill(), { toUpdate: [], skipped: [] });
  assert.deepEqual(planDashboardScopeBackfill(null), { toUpdate: [], skipped: [] });
  // A role document with no pages array at all — old data, or a partial
  // projection. It must be skipped, never crash a migration mid-run.
  const { toUpdate, skipped } = planDashboardScopeBackfill([{ key: 'weird' }, { pages: null }]);
  assert.deepEqual(toUpdate, []);
  assert.equal(skipped.length, 2);
  assert.equal(skipped[1].key, '(unkeyed)');
});

// ── 5. the keys are shared, not copied ──────────────────────────────────────
test('backfill: the plan uses the SAME key strings the runtime predicate does', () => {
  // scopeKeys.js exists so the script and the app cannot drift. If the backfill
  // ever restated them, this is where it would show.
  assert.equal(SCOPES_TO_ADD[0], DASHBOARD_SCOPE_KEYS.registrations);
  assert.equal(SCOPES_TO_ADD[1], DASHBOARD_SCOPE_KEYS.system);
});

// ── CONTROL (d) ─────────────────────────────────────────────────────────────

test('CONTROL: a backfill granting only ONE scope is caught', () => {
  /**
   * Control (d) from the round brief, reconstructed rather than applied to the
   * real module — breaking SCOPES_TO_ADD would redden the whole file and make
   * the red line unreadable. Same reasoning as the synthetic fixtures in
   * test/fs/rbacNavParity.
   *
   * Both directions, because they fail differently:
   *   · registrations only → the widening record goes red (nobody gains the strip)
   *   · system only        → the NO-CHANGE test goes red (roles LOSE the cards)
   */
  const planWith = (keys) => (roles) => roles.map((r) => (
    r.pages.includes('dashboard')
      ? { ...r, pages: [...r.pages, ...keys.filter((k) => !r.pages.includes(k))] }
      : r
  ));

  // registrations only — no role gains the strip.
  const regOnly = planWith([DASHBOARD_SCOPE_KEYS.registrations])(ROLES);
  const gainedReg = ROLES.filter((role, i) =>
    !sectionsVisibleBeforeE2(role).system && sectionsVisible(regOnly[i]).system);
  assert.deepEqual(gainedReg, [], 'sanity: this half grants no strip');
  assert.notDeepEqual(
    gainedReg.map((r) => r.key).sort(), ['admin', 'editor', 'registration_admin'],
    'the widening assertion would still pass — it is not measuring the plan',
  );

  // system only — three roles LOSE the registration cards they had.
  const sysOnly = planWith([DASHBOARD_SCOPE_KEYS.system])(ROLES);
  const lost = ROLES.filter((role, i) =>
    sectionsVisibleBeforeE2(role).registrations && !sectionsVisible(sysOnly[i]).registrations);
  assert.deepEqual(
    lost.map((r) => r.key).sort(), ['admin', 'editor', 'registration_admin'],
    'the no-change test must be able to see a role losing its registration view',
  );
});

test('CONTROL: sectionsVisibleBeforeE2 really models the OLD superadmin-only gate', () => {
  // Every "the widening is exactly these roles" claim rests on this baseline
  // being the old behaviour rather than the new one restated.
  assert.equal(
    sectionsVisibleBeforeE2({ pages: ['dashboard', 'dashboard_system'] }).system, false,
    'the baseline must ignore the new key — before E2 it did not exist',
  );
  assert.equal(
    sectionsVisibleBeforeE2({ pages: [], isSuperadmin: true }).system, true,
    'and it must grant the strip to a superadmin holding no pages at all',
  );
  assert.equal(sectionsVisibleBeforeE2({ pages: ['dashboard'] }).registrations, true);
  assert.equal(sectionsVisibleBeforeE2({ pages: ['articles'] }).registrations, false);
});
