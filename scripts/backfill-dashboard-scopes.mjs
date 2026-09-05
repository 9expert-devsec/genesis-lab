/**
 * Dashboard scopes backfill — DRY RUN BY DEFAULT. Writes NOTHING without
 * `--apply`.
 *
 * Round E2 split `/admin` into two permissions:
 *
 *   dashboard_registrations — the registration/payment cards, donut and trend
 *   dashboard_system        — the ภาพรวมระบบ strip
 *
 * `dashboard` still gates the page. This script gives both scopes to every role
 * that already holds `dashboard`, so nobody's registration view changes on
 * deploy.
 *
 * ══ READ THIS BEFORE --apply: ONE HALF PRESERVES, ONE HALF WIDENS ═══════════
 *
 * `dashboard_registrations` is a pure preservation. A role that could see the
 * registration cards keeps seeing them.
 *
 * `dashboard_system` IS A WIDENING. The ภาพรวมระบบ strip used to be gated on
 * `isSuperadmin` and no page grant could produce it. After this runs, EVERY
 * non-superadmin role holding `dashboard` gains it. That is the round's stated
 * purpose — content writers and course staff are meant to get the system
 * overview — but it is a real access change, and it is the reason this script
 * is handed over unrun.
 *
 * If you do NOT want that: drop DASHBOARD_SCOPE_KEYS.system from SCOPES_TO_ADD
 * in src/lib/dashboard/backfillPlan.js and grant the key per role from
 * /admin/roles instead. A test pins that decision in both directions.
 *
 * ── SESSIONS DO NOT PICK THIS UP IMMEDIATELY ────────────────────────────────
 * `pages` is baked into the NextAuth JWT at sign-in (see the staleness note in
 * src/lib/auth/config.js). A role edited here reaches a signed-in admin only
 * when their token is next reissued, and the absolute session lifetime is 72 h.
 * Until then an already-signed-in non-superadmin with `dashboard` and neither
 * scope in their token sees the no-section state. Ask them to sign out and back
 * in, or run this at a quiet hour.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 *   · Dry run by default; `--apply` is the only thing that writes.
 *   · `$addToSet`, so re-running is a no-op — the plan lists only keys a role
 *     lacks, and a second run finds none.
 *   · No deletes, no other field touched, no role created.
 *   · Native driver rather than the Role model: Role.js imports through `@/`
 *     aliases plain node cannot resolve, same reason migrate-rbac.mjs does.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-dashboard-scopes.mjs
 *   node --env-file=.env.local scripts/backfill-dashboard-scopes.mjs --apply
 */

import { MongoClient } from 'mongodb';
import {
  BACKFILL_TRIGGER_KEY,
  SCOPES_TO_ADD,
  planDashboardScopeBackfill,
  sectionsVisible,
  sectionsVisibleBeforeE2,
} from '../src/lib/dashboard/backfillPlan.js';

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'roles';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env.local …');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const col = db.collection(COLLECTION);

console.log('═'.repeat(66));
console.log(' DASHBOARD SCOPES BACKFILL — dashboard → + both halves');
console.log('═'.repeat(66));
console.log(`   DATABASE : ${db.databaseName}.${COLLECTION}`);
console.log(`   MODE     : ${APPLY ? '--apply  (WILL WRITE)' : 'dry run  (writes nothing)'}`);
console.log(`   TRIGGER  : pages contains '${BACKFILL_TRIGGER_KEY}'`);
console.log(`   ADDS     : ${SCOPES_TO_ADD.join(', ')}`);

const roles = await col
  .find({}, { projection: { key: 1, name: 1, pages: 1, isSuperadmin: 1 } })
  .toArray();

console.log(`\n   ROLES    : ${roles.length}`);

const { toUpdate, skipped } = planDashboardScopeBackfill(roles);

// ── The plan, role by role, with the before/after each admin would notice ───
console.log('\nPLAN');
console.log('  ' + '─'.repeat(62));
for (const role of roles) {
  const planned = toUpdate.find((r) => r.key === (role.key ?? '(unkeyed)'));
  const skip = skipped.find((r) => r.key === (role.key ?? '(unkeyed)'));
  const before = sectionsVisibleBeforeE2(role);
  const after = sectionsVisible({
    pages: planned ? planned.after : (role.pages ?? []),
    isSuperadmin: role.isSuperadmin,
  });
  const shape = (s) => `${s.registrations ? 'REG' : '---'}/${s.system ? 'SYS' : '---'}`;
  const verdict = planned ? `+ ${planned.add.join(', ')}` : `skip — ${skip?.reason ?? 'n/a'}`;
  const widened = !before.system && after.system ? '   ← GAINS ภาพรวมระบบ' : '';
  console.log(
    `  ${String(role.key ?? '(unkeyed)').padEnd(20)} ${shape(before)} → ${shape(after)}  ${verdict}${widened}`
  );
}
console.log('  ' + '─'.repeat(62));
console.log(`  would update : ${toUpdate.length}`);
console.log(`  unchanged    : ${skipped.length}`);

// ── The widening, counted and named, not buried in the table ───────────────
const widening = roles.filter((role) => {
  const planned = toUpdate.find((r) => r.key === (role.key ?? '(unkeyed)'));
  if (!planned) return false;
  return !sectionsVisibleBeforeE2(role).system
    && sectionsVisible({ pages: planned.after, isSuperadmin: role.isSuperadmin }).system;
});
if (widening.length) {
  console.log(`\n  *** ${widening.length} role(s) GAIN the ภาพรวมระบบ strip they could not see before:`);
  for (const r of widening) console.log(`        ${r.key ?? '(unkeyed)'}${r.name ? ` — ${r.name}` : ''}`);
  console.log('      This is intended by round E2. If it is not what you want, see the');
  console.log('      header of src/lib/dashboard/backfillPlan.js for the one-line change.');
}

if (!APPLY) {
  console.log('\n DRY RUN — nothing was written.');
  console.log(' To apply, run it yourself:');
  console.log('     node --env-file=.env.local \\');
  console.log('       scripts/backfill-dashboard-scopes.mjs --apply');
  await client.close();
  process.exit(0);
}

// ── Apply ───────────────────────────────────────────────────────────────────
let updated = 0;
for (const role of toUpdate) {
  const res = await col.updateOne(
    { key: role.key },
    { $addToSet: { pages: { $each: role.add } } }
  );
  if (res.modifiedCount) updated += 1;
  console.log(`  ${role.key.padEnd(20)} matched=${res.matchedCount} modified=${res.modifiedCount}`);
}

console.log(`\n APPLIED — ${updated} role(s) updated.`);
console.log(' Re-run without --apply to confirm the plan is now empty ($addToSet');
console.log(' makes this idempotent, so a second run reports 0 to update).');
console.log(' Signed-in admins keep their old `pages` until their JWT is reissued');
console.log(' (72 h absolute) — ask them to sign out and back in.');

await client.close();
