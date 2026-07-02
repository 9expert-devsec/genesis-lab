/**
 * RBAC Phase 1 migration — seed default roles + backfill admins' `roleKey`.
 *
 * Run with Node 20+ native env-file loader:
 *   node --env-file=.env.local src/scripts/migrate-rbac.mjs
 *
 * Idempotent & non-destructive:
 *   - Roles are upserted with `$setOnInsert`, so a re-run is a pure no-op
 *     for any role that already exists (no field is overwritten, no
 *     updatedAt bump). Delete a role first if you want the seed re-applied.
 *   - Admins get `roleKey` written ONLY when it's unset or different; the
 *     legacy `role` enum is never touched (that field is removed in Phase 6).
 *   - No deletes anywhere. Safe to run against production data.
 *
 * The app still authorizes via the legacy `role` enum this phase — this
 * migration only adds data. Enforcement via `roleKey` arrives in Phase 2+.
 *
 * Constants mirror the Phase-0 registry (src/lib/rbac/pages.js `ALL_PAGE_KEYS`
 * and src/lib/rbac/roleColor.js `DEFAULT_ROLE_COLORS`). They are INLINED here
 * — matching this repo's script convention — because the project ships no
 * `"type": "module"`, so those `.js` files are CommonJS to plain `node` and
 * their ESM named exports can't be imported from a `.mjs` CLI script. The
 * `assertRegistryCoverage()` guard keeps `ALL_PAGE_KEYS` and `PAGE_SET` in
 * lock-step; if you add a page in Phase 0, update both here too.
 *
 * We talk to Mongo via the native driver (mongoose.connection.db) rather than
 * the Role/Admin models: Role.js imports via `@/` aliases that `node` can't
 * resolve, and the native driver gives precise, timestamp-stable upserts.
 */

import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB_NAME } = process.env;

// Mirror of src/lib/rbac/pages.js `ALL_PAGE_KEYS`, in registry order.
const ALL_PAGE_KEYS = [
  'dashboard',
  'featured_courses', 'featured_online_courses', 'nav_featured_online_courses',
  'courses', 'schedules', 'instructors', 'programs', 'career_paths', 'masterclass',
  'mc_registrations', 'tnhs_courses', 'page_configs',
  'banners', 'promotions', 'promotions_banner', 'notifications', 'about', 'contact',
  'portfolio', 'nearby_places', 'featured_reviews', 'articles', 'pages', 'faqs',
  'local_faqs', 'schedule_pdf',
  'registrations', 'career_path_registrations', 'recruits', 'landing_cache',
  'webhook_logs', 'security', 'profile', 'accounts', 'roles',
];

// Mirror of src/lib/rbac/roleColor.js `DEFAULT_ROLE_COLORS`.
const DEFAULT_ROLE_COLORS = {
  superadmin: '#2563eb',
  admin: '#6b7280',
  editor: '#ca8a04',
  registration_admin: '#16a34a',
  it_support_admin: '#9333ea',
};

if (!MONGODB_URI) {
  console.error(
    'MONGODB_URI is not set.\n' +
      'Run with:  node --env-file=.env.local src/scripts/migrate-rbac.mjs'
  );
  process.exit(1);
}

// ── Sidebar → page mapping ──────────────────────────────────────────────
// Each admin page key is tagged with the AdminSidebar `roles` set it came
// from (verified against NAV_GROUPS in src/components/layout/AdminSidebar.jsx):
//   ALL   → ALL_ADMIN_ROLES        (superadmin, owner, admin, editor,
//                                    registration_admin, it_support_admin)
//   REG   → REGISTRATION_ADMIN_ROLES (superadmin, owner, admin,
//                                      registration_admin, it_support_admin)
//   IT    → IT_SUPPORT_ROLES       (superadmin, owner, admin, it_support_admin)
//   SUPER → no `roles` key / superadminOnly → historically superadmin/owner-only
const PAGE_SET = {
  // ภาพรวม
  dashboard: 'ALL',
  // จัดการหลักสูตร
  featured_courses: 'IT',
  featured_online_courses: 'IT',
  nav_featured_online_courses: 'SUPER',
  courses: 'IT',
  schedules: 'ALL',
  instructors: 'SUPER',
  programs: 'IT',
  career_paths: 'IT',
  masterclass: 'IT',
  mc_registrations: 'REG',
  tnhs_courses: 'SUPER',
  page_configs: 'SUPER',
  // จัดการคอนเทนต์
  banners: 'SUPER',
  promotions: 'SUPER',
  promotions_banner: 'SUPER',
  notifications: 'SUPER',
  about: 'SUPER',
  contact: 'SUPER',
  portfolio: 'SUPER',
  nearby_places: 'SUPER',
  featured_reviews: 'SUPER',
  articles: 'IT',
  pages: 'IT',
  faqs: 'IT',
  local_faqs: 'IT',
  schedule_pdf: 'IT',
  // ระบบ
  registrations: 'REG',
  career_path_registrations: 'REG',
  recruits: 'SUPER',
  landing_cache: 'SUPER',
  webhook_logs: 'SUPER',
  security: 'SUPER',
  profile: 'ALL',
  accounts: 'SUPER', // superadminOnly
  roles: 'SUPER', // NEW page — superadmin-only
};

// Which sidebar sets each (non-superadmin, non-admin) default role belongs
// to. `admin` is handled specially below (intentional widening); `superadmin`
// bypasses page checks so its list is cosmetic (all pages).
const ROLE_MEMBERSHIP = {
  it_support_admin: new Set(['ALL', 'REG', 'IT']),
  registration_admin: new Set(['ALL', 'REG']),
  editor: new Set(['ALL']),
};

/** Pages a sidebar-derived role sees = every key whose set the role is in. */
function pagesForMembership(setNames) {
  return ALL_PAGE_KEYS.filter((k) => setNames.has(PAGE_SET[k]));
}

// Guard: PAGE_SET must stay in lock-step with the registry so a page added
// in Phase 0 can't be silently missed here.
function assertRegistryCoverage() {
  const registry = new Set(ALL_PAGE_KEYS);
  const mapped = new Set(Object.keys(PAGE_SET));
  const missing = ALL_PAGE_KEYS.filter((k) => !mapped.has(k));
  const extra = Object.keys(PAGE_SET).filter((k) => !registry.has(k));
  if (missing.length || extra.length) {
    throw new Error(
      'PAGE_SET is out of sync with ADMIN_PAGES registry.\n' +
        (missing.length ? `  Missing from PAGE_SET: ${missing.join(', ')}\n` : '') +
        (extra.length ? `  Unknown in PAGE_SET:   ${extra.join(', ')}\n` : '')
    );
  }
}

// ── The 5 default system roles ──────────────────────────────────────────
const ADMIN_EXCLUDED = new Set(['accounts', 'roles']); // intentional admin cap
function buildSeedRoles() {
  return [
    {
      key: 'superadmin',
      name: 'Super Admin',
      // Cosmetic — superadmin bypasses page checks (Phase 2). Set to all
      // pages so the Phase-5 UI displays it as "all".
      pages: [...ALL_PAGE_KEYS],
      color: DEFAULT_ROLE_COLORS.superadmin,
      isSuperadmin: true,
    },
    {
      key: 'admin',
      name: 'Admin',
      // INTENTIONAL POLICY CHANGE: widened to ALL pages except accounts &
      // roles (historically admin only saw items whose sidebar entry listed
      // it). Deliberate expansion — not a 1:1 preservation. See report note.
      pages: ALL_PAGE_KEYS.filter((k) => !ADMIN_EXCLUDED.has(k)),
      color: DEFAULT_ROLE_COLORS.admin,
      isSuperadmin: false,
    },
    {
      key: 'it_support_admin',
      name: 'IT Support Admin',
      pages: pagesForMembership(ROLE_MEMBERSHIP.it_support_admin),
      color: DEFAULT_ROLE_COLORS.it_support_admin,
      isSuperadmin: false,
    },
    {
      key: 'registration_admin',
      name: 'Registration Admin',
      pages: pagesForMembership(ROLE_MEMBERSHIP.registration_admin),
      color: DEFAULT_ROLE_COLORS.registration_admin,
      isSuperadmin: false,
    },
    {
      key: 'editor',
      name: 'Editor',
      pages: pagesForMembership(ROLE_MEMBERSHIP.editor),
      color: DEFAULT_ROLE_COLORS.editor,
      isSuperadmin: false,
    },
  ];
}

// Legacy enum `role` → new `roleKey`. `owner` folds into superadmin; the 5
// known keys map to themselves; anything else falls back to `admin`.
const ROLE_KEY_MAP = {
  superadmin: 'superadmin',
  owner: 'superadmin',
  admin: 'admin',
  editor: 'editor',
  registration_admin: 'registration_admin',
  it_support_admin: 'it_support_admin',
};
const FALLBACK_ROLE_KEY = 'admin';

function mapLegacyRole(role) {
  const key = ROLE_KEY_MAP[role];
  return { key: key ?? FALLBACK_ROLE_KEY, known: Boolean(key) };
}

function tally(list, keyFn) {
  const out = {};
  for (const item of list) {
    const k = keyFn(item) || '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function printCounts(title, counts) {
  console.log(`\n${title}`);
  const keys = Object.keys(counts).sort();
  if (keys.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const k of keys) console.log(`  ${k.padEnd(22)} ${counts[k]}`);
}

async function main() {
  assertRegistryCoverage();

  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
  const db = mongoose.connection.db;
  const rolesCol = db.collection('roles');
  const adminsCol = db.collection('admins');

  const seedRoles = buildSeedRoles();

  // ── 1) Seed roles (idempotent upsert; pure no-op on re-run) ──────────
  console.log('=== Seeding default roles ===');
  const now = new Date();
  let inserted = 0;
  let existed = 0;
  for (const r of seedRoles) {
    const res = await rolesCol.updateOne(
      { key: r.key },
      {
        $setOnInsert: {
          key: r.key,
          name: r.name,
          description: '',
          pages: r.pages,
          color: r.color,
          isSystem: true,
          isSuperadmin: r.isSuperadmin,
          createdBy: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      inserted += 1;
      console.log(`  + inserted '${r.key}' (${r.pages.length} pages)`);
    } else {
      existed += 1;
      console.log(`  = '${r.key}' already exists — left untouched`);
    }
  }
  console.log(`Roles: ${inserted} inserted, ${existed} already present.`);

  // ── 2) Enforce singleton superadmin ─────────────────────────────────
  const superadminRoles = await rolesCol
    .find({ isSuperadmin: true })
    .project({ key: 1 })
    .toArray();
  if (superadminRoles.length !== 1) {
    throw new Error(
      `Expected exactly ONE role with isSuperadmin=true, found ${superadminRoles.length}` +
        ` (${superadminRoles.map((r) => r.key).join(', ') || 'none'}). Aborting.`
    );
  }
  console.log(`\nSingleton superadmin OK → '${superadminRoles[0].key}'.`);

  // ── 3) Backfill admins' roleKey ─────────────────────────────────────
  console.log('\n=== Backfilling admins.roleKey ===');
  const admins = await adminsCol
    .find({}, { projection: { role: 1, roleKey: 1, email: 1 } })
    .toArray();

  const beforeCounts = tally(admins, (a) => a.role);

  let updated = 0;
  let alreadyCorrect = 0;
  const unknownLegacy = [];
  const afterRoleKeys = [];

  for (const a of admins) {
    const { key: targetKey, known } = mapLegacyRole(a.role);
    afterRoleKeys.push(targetKey);
    if (!known) {
      unknownLegacy.push({ email: a.email, role: a.role });
      console.log(
        `  ! ${a.email ?? a._id}: unknown/empty legacy role ${JSON.stringify(a.role)} → '${targetKey}'`
      );
    }
    if (a.roleKey === targetKey) {
      alreadyCorrect += 1;
      continue;
    }
    await adminsCol.updateOne({ _id: a._id }, { $set: { roleKey: targetKey } });
    updated += 1;
  }
  console.log(`Admins: ${updated} updated, ${alreadyCorrect} already correct.`);
  if (unknownLegacy.length) {
    console.log(`  (${unknownLegacy.length} had unknown/empty legacy roles → '${FALLBACK_ROLE_KEY}')`);
  }

  const afterCounts = tally(afterRoleKeys, (k) => k);

  // ── 4) Verify & report ──────────────────────────────────────────────
  printCounts('Admins per legacy `role` (before):', beforeCounts);
  printCounts('Admins per `roleKey` (after):', afterCounts);

  // Reconciliation: fold expected legacy → roleKey and compare to `after`.
  const expected = {};
  for (const [legacy, count] of Object.entries(beforeCounts)) {
    const target = legacy === '(none)' ? FALLBACK_ROLE_KEY : mapLegacyRole(legacy).key;
    expected[target] = (expected[target] ?? 0) + count;
  }
  const reconKeys = new Set([...Object.keys(expected), ...Object.keys(afterCounts)]);
  let reconOk = true;
  for (const k of reconKeys) {
    if ((expected[k] ?? 0) !== (afterCounts[k] ?? 0)) {
      reconOk = false;
      console.error(
        `  RECONCILE MISMATCH '${k}': expected ${expected[k] ?? 0}, got ${afterCounts[k] ?? 0}`
      );
    }
  }

  // Seeded roles summary (live from DB).
  console.log('\nSeeded system roles (from DB):');
  const dbRoles = await rolesCol
    .find({ key: { $in: seedRoles.map((r) => r.key) } })
    .project({ key: 1, name: 1, pages: 1, isSuperadmin: 1, color: 1 })
    .toArray();
  for (const r of dbRoles.sort((x, y) => x.key.localeCompare(y.key))) {
    console.log(
      `  ${r.key.padEnd(20)} ${String(r.pages?.length ?? 0).padStart(2)} pages` +
        `  color=${r.color}${r.isSuperadmin ? '  [superadmin — bypasses page checks]' : ''}`
    );
  }

  // Explicit callout so post-migration review doesn't flag this as a regression.
  console.log(
    '\nNOTE: the `admin` role was INTENTIONALLY WIDENED to all pages except ' +
      "`accounts` and `roles`. This is a deliberate policy expansion (confirmed " +
      'with product owner), NOT a 1:1 preservation of the historical admin sidebar ' +
      'visibility. Do not treat the extra pages as a regression.'
  );

  // ── Exit status ─────────────────────────────────────────────────────
  const adminsMissingKey = afterRoleKeys.filter((k) => !k).length;
  const problems = [];
  if (superadminRoles.length !== 1) problems.push('more than one superadmin role');
  if (adminsMissingKey > 0) problems.push(`${adminsMissingKey} admins without roleKey`);
  if (!reconOk) problems.push('reconciliation mismatch');

  if (problems.length) {
    console.error(`\n✗ Migration FAILED: ${problems.join('; ')}.`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ Migration complete — all checks green.');
  }
}

main()
  .catch((err) => {
    console.error('\nMigration error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
