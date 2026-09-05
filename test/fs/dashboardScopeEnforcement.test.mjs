import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_PAGES, PAGE_KEYS_BY_GROUP } from '@/lib/rbac/pages';
import { DASHBOARD_SCOPE_KEYS } from '@/lib/dashboard/scopes';
import { readSource } from '../sourceScan.mjs';

/**
 * WHERE the dashboard scopes are decided — the seam a rendering test cannot see.
 *
 * ══ THE DEFECT THIS EXISTS FOR ══════════════════════════════════════════════
 *
 * test/pure/dashboardScopes proves that `buildDashboardMetrics` runs the right
 * reads FOR THE SCOPES IT IS GIVEN. test/render/dashboardSections proves the
 * component draws the right sections FOR THE PAYLOAD IT IS GIVEN. Both would
 * stay green if the scopes came from a query parameter.
 *
 * That is not hypothetical arithmetic. `getDashboardMetrics` lives in a
 * `'use server'` module, which makes it a callable endpoint: every parameter it
 * declares is a value some browser can post. A second parameter next to `range`
 * — `getDashboardMetrics(range, scopes)` — would look exactly like the code
 * that is there now, pass every other test in the suite, and let anyone who can
 * open the dashboard read every registration figure by asking for them.
 *
 * So this file asserts the SOURCE: the scopes are derived from the session that
 * the guard just returned, in both server files, and from nothing else.
 *
 * ── READ AS TEXT, EXTRACTION ASSERTED FIRST ─────────────────────────────────
 * `.code` (imports stripped) for "this file does X", `.withImports` for "this
 * file imports Y" — choosing wrong is a silent pass in both directions, so each
 * assertion says which it uses. And every file is checked to have scanned to
 * something before a single conclusion is drawn from it.
 */

const ACTION_REL  = 'src/lib/actions/dashboard.js';
const PAGE_REL    = 'src/app/admin/page.jsx';
const CLIENT_REL  = 'src/app/admin/_components/DashboardClient.jsx';
const BUILD_REL   = 'src/lib/dashboard/buildMetrics.js';
const SCOPES_REL  = 'src/lib/dashboard/scopes.js';
const KEYS_REL    = 'src/lib/dashboard/scopeKeys.js';
const PLAN_REL    = 'src/lib/dashboard/backfillPlan.js';
const SIDEBAR_REL = 'src/components/layout/AdminSidebar.jsx';
const ROLES_PAGE  = 'src/app/admin/roles/page.jsx';

const ACTION  = readSource(ACTION_REL);
const PAGE    = readSource(PAGE_REL);
const CLIENT  = readSource(CLIENT_REL);
const BUILD   = readSource(BUILD_REL);
const SCOPES  = readSource(SCOPES_REL);
const KEYS    = readSource(KEYS_REL);
const PLAN    = readSource(PLAN_REL);
const SIDEBAR = readSource(SIDEBAR_REL);
const ROLES   = readSource(ROLES_PAGE);

/**
 * Per-file floors, not one number.
 *
 * MEASURED: a blanket `> 200` failed on scopeKeys.js, which strips to 135 chars
 * of code — correctly, because it is a three-line frozen object under a long
 * header, and `readSource().code` removes comments. Raising every floor to clear
 * it would have been backwards, and lowering every floor to 100 would have made
 * the check meaningless for the 5 kB files it is really guarding.
 *
 * So each file gets a floor sized to what it actually contains, and the tiny one
 * is named rather than excused. What this check is for is a readSource() that
 * silently returns nothing — after a rename, or a scrubber change — which would
 * make every assertion below pass vacuously.
 */
const CONTENT_FLOOR = new Map([
  [KEYS_REL, 100], // a frozen two-key object; the rest of the file is its reason
]);
const DEFAULT_FLOOR = 200;

test('scope enforcement: every scanned file has real content', () => {
  for (const src of [ACTION, PAGE, CLIENT, BUILD, SCOPES, KEYS, PLAN, SIDEBAR, ROLES]) {
    const floor = CONTENT_FLOOR.get(src.rel) ?? DEFAULT_FLOOR;
    assert.ok(
      src.code.length > floor,
      `${src.rel} scanned to ${src.code.length} chars (floor ${floor}) — every `
      + 'assertion about it below would pass vacuously',
    );
  }
});

test('CONTROL: the content floor can actually fail', () => {
  // Without this, the loop above reports nothing both when every file is fine
  // and when the floor is zero.
  assert.equal('' .length > 0, false);
  assert.ok(KEYS.code.length < DEFAULT_FLOOR,
    'scopeKeys.js grew past the default floor — its exception is now stale and '
    + 'should be deleted from CONTENT_FLOOR');
});

// ── 1. the action derives scopes from the session, and takes no scope arg ───

test('scope enforcement: the action reads the scopes off the session it guarded', () => {
  assert.match(
    ACTION.code, /const session = await requireAdmin\('dashboard'\)/,
    'the guard must return the session rather than being called for effect — the '
    + 'scopes have to come from the identity that was just validated',
  );
  assert.match(
    ACTION.code, /dashboardScopes\(session\?\.user\)/,
    'the scopes must be derived from session.user',
  );
});

/**
 * Every parameter `getDashboardMetrics` is allowed to take, BY NAME.
 *
 * ── A NAMED LIST, NOT A COUNT — AND WHY IT CHANGED IN ROUND E4 ─────────────
 * Round E2 pinned this at ONE parameter, reasoning that a `'use server'`
 * export's arguments are client-supplied and that `range` can only change WHICH
 * rows are counted, never WHETHER they are. E4's custom date range needs `from`
 * and `to`, which are the same kind of value and carry the same guarantee.
 *
 * The count became a NAMED allowlist rather than being raised to three, because
 * a count is satisfied by folding the three into one object — the letter of E2's
 * rule with none of its point. Naming them means a FOURTH parameter, or a
 * differently-named one, still fails here and still has to be argued for.
 *
 * What the rule was protecting is untouched: the SCOPES decide whether the
 * registration half runs at all, they come from the session, and they are read
 * before any of these three is looked at. A caller without
 * `dashboard_registrations` can post any from/to they like and reach no read.
 */
const ALLOWED_ACTION_PARAMS = ['range', 'from', 'to'];

test('scope enforcement: getDashboardMetrics accepts ONLY named window parameters', () => {
  const m = ACTION.code.match(/export async function getDashboardMetrics\(([^)]*)\)/);
  assert.ok(m, 'getDashboardMetrics was not found — has it been renamed?');
  const params = m[1].split(',').map((s) => s.trim()).filter(Boolean)
    .map((p) => p.split('=')[0].trim());
  assert.deepEqual(
    params, ALLOWED_ACTION_PARAMS,
    `getDashboardMetrics takes (${m[1]}). Every one is a value a browser can post `
    + 'to this endpoint. A parameter not on this list must be argued for here '
    + 'first — and it must not be able to widen what is read.',
  );
});

test('scope enforcement: the action VALIDATES the two date parameters itself', () => {
  // `from` and `to` are untrusted strings that reach a Mongo $match. They are
  // resolved in the action, where they arrive, so nothing downstream ever parses
  // a date and there is one place to read to know what a bad one does.
  assert.match(ACTION.withImports, /resolveCustomWindow/);
  assert.match(ACTION.code, /const custom = resolveCustomWindow\(\{ from, to \}\)/);
});

test('scope enforcement: requirePage/requireAdmin on `dashboard` is NOT weakened', () => {
  // The scopes NARROW. A caller still needs `dashboard` to reach either half.
  assert.match(ACTION.code, /requireAdmin\('dashboard'\)/);
  assert.match(PAGE.code, /requirePage\('dashboard'\)/);
});

// ── 2. the page does the same, and passes no scope prop ─────────────────────

test('scope enforcement: the page derives scopes from its own guarded session', () => {
  assert.match(PAGE.code, /const session = await requirePage\('dashboard'\)/);
  assert.match(PAGE.code, /const scopes = dashboardScopes\(session\?\.user\)/);
});

test('scope enforcement: no scope is read from searchParams', () => {
  /**
   * `sp` is the awaited searchParams object. It may be read for the WINDOW
   * parameters and nothing else — a `sp.scope`, `sp.scopes` or `sp.system` would
   * be a permission a URL can grant.
   *
   * `from` and `to` joined `range` in round E4. Same kind of value, same
   * guarantee: they select rows, they cannot select a SECTION. The list is the
   * same one the action allows, and it is named rather than counted for the
   * reason given at ALLOWED_ACTION_PARAMS above.
   */
  const reads = [...PAGE.code.matchAll(/\bsp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.ok(reads.length > 0, 'no sp.* read found at all — has the param been renamed?');
  assert.deepEqual(
    [...new Set(reads)].sort(), [...ALLOWED_ACTION_PARAMS].sort(),
    'the page reads a search parameter that is not a window parameter',
  );
});

test('scope enforcement: the date parameters are scoped like the range is', () => {
  /**
   * A `from`/`to` in a system-only caller's URL must leave no trace. The page
   * resolves them to '' without the scope — the same shape as `range`, which is
   * resolved to null — so the payload carries no evidence a window was asked for.
   */
  assert.match(PAGE.code, /scopes\.registrations \? String\(sp\.from \?\? ''\) : ''/);
  assert.match(PAGE.code, /scopes\.registrations \? String\(sp\.to\s+\?\? ''\) : ''/);
});

test('scope enforcement: DashboardClient is handed no scopes prop', () => {
  // The scopes travel INSIDE `data`, which the server action built. A separate
  // prop assembled by the page would be a second place the answer could differ
  // from the one the reads were run under.
  const m = PAGE.code.match(/<DashboardClient([\s\S]*?)\/>/);
  assert.ok(m, 'the DashboardClient element was not found in the page');
  assert.equal(
    /\bscopes=/.test(m[1]), false,
    'a `scopes` prop appeared — it would let the page and the action disagree',
  );
  assert.match(m[1], /data=\{data\}/, 'the payload is still passed as `data`');
});

test('scope enforcement: the client reads scopes off data, never off a prop', () => {
  assert.match(
    CLIENT.code, /const scopes = data\.scopes/,
    'DashboardClient must read the scopes out of the server-built payload',
  );
  const m = CLIENT.code.match(/export function DashboardClient\(\{([^}]*)\}/);
  assert.ok(m, 'the DashboardClient signature was not found');
  assert.equal(
    /\bscopes\b/.test(m[1]), false,
    `DashboardClient destructures a scopes prop: {${m[1]}}`,
  );
});

// ── 3. the read layer knows nothing about sessions ──────────────────────────

test('scope enforcement: buildMetrics imports no auth and no session', () => {
  // Read from `withImports` — the whole question is what the import lines say.
  assert.equal(
    /from '@\/lib\/(auth|rbac)/.test(BUILD.withImports), false,
    `${BUILD_REL} imports auth or rbac. It is the READ layer and must stay a pure `
    + 'function of the scopes it is handed; a guard in here would be a second '
    + 'place the decision is made, and the two would eventually disagree',
  );
  assert.equal(/requireAdmin|requirePage|\bauth\(\)/.test(BUILD.code), false);
});

test('scope enforcement: scopes.js resolves from a user, through canAccess', () => {
  assert.match(SCOPES.withImports, /import \{ canAccess \} from '@\/lib\/rbac\/access'/);
  assert.match(SCOPES.code, /canAccess\(user, DASHBOARD_SCOPE_KEYS\.registrations\)/);
  assert.match(SCOPES.code, /canAccess\(user, DASHBOARD_SCOPE_KEYS\.system\)/);
});

test('scope enforcement: the key strings are declared in ONE import-free module', () => {
  /**
   * They live in scopeKeys.js rather than in scopes.js because the backfill
   * script is a plain-node CLI that resolves neither the `@/` alias nor an
   * extensionless specifier, and scopes.js pulls in canAccess → the registry, an
   * alias chain three deep. Restating them in the script instead is exactly the
   * hand-kept mirror that left migrate-rbac.mjs three keys behind the registry.
   *
   * So: declared here, and NOWHERE ELSE. The scan is over source text, because
   * the failure mode is a second copy appearing — which no import graph reveals.
   */
  assert.match(KEYS.code, /registrations: 'dashboard_registrations'/);
  assert.match(KEYS.code, /system: 'dashboard_system'/);
  assert.equal(
    /^import /m.test(KEYS.withImports), false,
    `${KEYS_REL} gained an import. Its whole job is to be reachable from plain `
    + 'node, and one alias import anywhere in its graph ends that',
  );

  for (const src of [SCOPES, PLAN]) {
    assert.equal(
      /'dashboard_registrations'|'dashboard_system'/.test(src.code), false,
      `${src.rel} restates a scope key literal instead of importing it`,
    );
  }
  assert.match(SCOPES.withImports, /from '@\/lib\/dashboard\/scopeKeys'/);
  assert.match(
    PLAN.withImports, /from '\.\/scopeKeys\.js'/,
    'the plan must import RELATIVELY and with the .js suffix, or the backfill '
    + 'script cannot load it from plain node',
  );
});

test('scope enforcement: backfillPlan stays alias-free, so the script can load it', () => {
  // A regression here does not fail the suite — every test resolves `@/` fine.
  // It fails at 2am when someone runs the migration.
  const aliasImports = [...PLAN.withImports.matchAll(/^import[^;]*from '(@\/[^']+)'/gm)]
    .map((m) => m[1]);
  assert.deepEqual(
    aliasImports, [],
    'scripts/backfill-dashboard-scopes.mjs imports this module from plain node, '
    + 'which cannot resolve the @/ alias',
  );
});

test('scope enforcement: the upstream schedules fetch is gated too', () => {
  // The open-rounds tile is the one read on this page that is not a Mongo query.
  // It must be skipped, not fetched-then-dropped.
  assert.match(
    PAGE.code, /scopes\.system\s*\n?\s*\?\s*getAllSchedules\(/,
    'getAllSchedules must be behind scopes.system — a registration-only admin '
    + 'should make no call to MSDB at all',
  );
});

// ── 4. NAV: both keys are non-nav, and the sidebar gained nothing ───────────

test('scope enforcement: neither scope key appears in the sidebar source', () => {
  for (const key of Object.values(DASHBOARD_SCOPE_KEYS)) {
    assert.equal(
      SIDEBAR.code.includes(key), false,
      `${SIDEBAR_REL} mentions '${key}'. These gate SECTIONS of /admin, which the `
      + '`dashboard` row already links; a nav item for one would point at a route '
      + 'that does not exist',
    );
  }
});

test('scope enforcement: both scope rows carry no href, so no route can reach them', () => {
  const rows = ADMIN_PAGES.flatMap((g) => g.pages)
    .filter((p) => Object.values(DASHBOARD_SCOPE_KEYS).includes(p.key));
  assert.equal(rows.length, 2, 'both scope rows must be in the registry');
  for (const row of rows) {
    assert.equal(
      row.href, null,
      `${row.key} has href '${row.href}'. An href of '/admin' would make `
      + 'resolvePageKey ambiguous with `dashboard`, and any other href would offer '
      + 'the menu a 404',
    );
  }
});

// ── 5. ROLE EDITOR: both checkboxes land under ภาพรวม ───────────────────────

test('scope enforcement: both scopes are in the ภาพรวม group, beside `dashboard`', () => {
  /**
   * /admin/roles renders its checkbox sections straight from ADMIN_PAGES
   * (`<RolesClient … pageGroups={ADMIN_PAGES} />`), and each section maps its
   * `pages` array to one `<label><input type="checkbox">` per row. So membership
   * of this group IS the checkbox, and the group is where an admin would look
   * for a dashboard permission.
   */
  assert.deepEqual(
    PAGE_KEYS_BY_GROUP['ภาพรวม'],
    ['dashboard', 'dashboard_registrations', 'dashboard_system'],
    'the ภาพรวม group must hold the page key and both of its scopes, in that order',
  );
  assert.match(
    ROLES.code, /<RolesClient[^>]*pageGroups=\{ADMIN_PAGES\}/,
    'the role editor must still render from the registry — if it ever took a '
    + 'hand-written list, adding a key here would stop producing a checkbox',
  );
});

test('scope enforcement: both scope rows have a label, or the checkbox is blank', () => {
  const rows = ADMIN_PAGES.flatMap((g) => g.pages)
    .filter((p) => Object.values(DASHBOARD_SCOPE_KEYS).includes(p.key));
  for (const row of rows) {
    assert.ok(
      typeof row.label === 'string' && row.label.trim().length > 0,
      `${row.key} has no label — RolesClient renders <span>{p.label}</span>, so the `
      + 'checkbox would appear with nothing next to it',
    );
    assert.ok(
      row.label.includes('แดชบอร์ด'),
      `${row.key}'s label should name the page it scopes, so the three ภาพรวม rows `
      + `read as a group. Got: ${row.label}`,
    );
  }
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the parameter-count check can actually count', () => {
  // Without this, the assertion above would hold for a matcher that always
  // reported one parameter.
  const twoParams = 'export async function getDashboardMetrics(range = 1, scopes) {}';
  const m = twoParams.match(/export async function getDashboardMetrics\(([^)]*)\)/);
  assert.equal(m[1].split(',').map((s) => s.trim()).filter(Boolean).length, 2);

  const none = 'export async function getDashboardMetrics() {}';
  const m2 = none.match(/export async function getDashboardMetrics\(([^)]*)\)/);
  assert.equal(m2[1].split(',').map((s) => s.trim()).filter(Boolean).length, 0);
});

test('CONTROL: the sp.* scan finds a planted extra read', () => {
  const planted = 'const a = sp.range; const b = sp.scope;';
  const reads = [...planted.matchAll(/\bsp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(reads)].sort(), ['range', 'scope']);
});

test('CONTROL: the scopes-prop scan finds a planted prop', () => {
  const planted = '<DashboardClient data={data} scopes={scopes} />';
  const m = planted.match(/<DashboardClient([\s\S]*?)\/>/);
  assert.equal(/\bscopes=/.test(m[1]), true);
});
