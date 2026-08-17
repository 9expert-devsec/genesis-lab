/**
 * Build a SCRATCH DATABASE with a seeded downgrade refusal, so the override
 * path can be walked end to end without arranging a real shrink.
 *
 * Production is READ-ONLY here: collections are copied out of it into a
 * separate database (`<db>_r6scratch`) and every write lands there.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-refusal-scratch.mjs seed
 *   node --env-file=.env.local scripts/seed-refusal-scratch.mjs status
 *   node --env-file=.env.local scripts/seed-refusal-scratch.mjs drop
 *
 * Then point local dev at it:
 *   MONGODB_URI=<same host>/<db>_r6scratch npm run dev
 *
 * ── WHAT A SEEDED REFUSAL CAN AND CANNOT PROVE ──────────────────────────────
 * It proves the READ → RENDER → CLICK → CLEAR path: that the panel reads a
 * refusal, shows the real per-section numbers, that the confirm restates them,
 * that the override runs with allowShrink, that `lastRefusal` clears, that an
 * audit row lands with a full pre-image, and that RecordHistory's `rows` state
 * renders for this menu.
 *
 * It does NOT prove that a genuinely shrinking sync WRITES the refusal in the
 * first place. That half is covered by test/pure/downgradeGuard and
 * test/fs/downgradeGuardWiring, and by nothing that has ever run against a real
 * upstream. The two halves meet only when a real shrink happens.
 */

import { register } from 'node:module';
import mongoose from 'mongoose';

register(new URL('../test/loader.mjs', import.meta.url));

const RAW = process.env.MONGODB_URI;
if (!RAW) { console.error('MONGODB_URI not set'); process.exit(1); }

const parsed = RAW.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]*)(\?.*)?$/);
if (!parsed) { console.error('could not parse MONGODB_URI'); process.exit(1); }
const [, HOST, DB, QS = ''] = parsed;
const SCRATCH = `${DB}_r6scratch`;

const mode = process.argv[2] ?? 'status';

await mongoose.connect(`${HOST}/${SCRATCH}${QS}`);
const scratch = mongoose.connection.db;
const prod = mongoose.connection.client.db(DB);

const COPY = [
  'landing_cache', 'nav_menu_cache', 'admin_audit_logs',
  'admins', 'roles',
];

async function seed() {
  console.log(`\n=== seeding ${SCRATCH} (production ${DB} is read-only) ===\n`);

  for (const name of COPY) {
    const docs = await prod.collection(name).find({}).toArray();
    await scratch.collection(name).drop().catch(() => {});
    if (docs.length) await scratch.collection(name).insertMany(docs);
    console.log(`  copied ${String(docs.length).padStart(4)} docs  ${name}`);
  }

  const { sectionCountsOf } = await import('@/lib/cache-console/downgradeGuard');
  const doc = await scratch.collection('landing_cache').findOne({ key: 'homepage_v1' });
  if (!doc) { console.error('\nno landing_cache document copied — cannot seed'); process.exit(1); }

  const stored = sectionCountsOf(doc.data);

  /**
   * The seeded refusal describes a shrink that would have been refused, using
   * the REAL stored counts on the left. The incoming side is fabricated — that
   * is the whole point and the limit of this exercise — but it is fabricated to
   * the shape `assessDowngrade` actually produces, so the panel is rendering
   * the same field names a real refusal would carry.
   */
  const incoming = Object.fromEntries(
    Object.entries(stored).map(([k, v]) => [k, Math.max(0, Math.floor(v / 5))])
  );
  const shrunk = Object.entries(stored)
    .filter(([k, before]) => before > 0 && incoming[k] < before)
    .map(([section, before]) => {
      const after = incoming[section];
      return { section, before, after, lost: before - after, ratio: (before - after) / before };
    })
    .filter((s) => s.ratio > 0.5);

  await scratch.collection('landing_cache').updateOne(
    { key: 'homepage_v1' },
    {
      $set: {
        lastRefusal: {
          at: new Date(),
          actor: 'system:cron',
          storedSections: stored,
          incomingSections: incoming,
          shrunk,
          vanished: [],
          reason:
            `สแนปช็อตใหม่เล็กลงมากเกินเกณฑ์ 50% จึงไม่เขียนทับของเดิม: `
            + shrunk.map((s) => `${s.section} ${s.before} → ${s.after} (-${Math.round(s.ratio * 100)}%)`).join(', ')
            + ' (refused: the incoming snapshot is materially smaller; the stored one is untouched)',
          syncStatus: 'partial',
          syncErrors: ['seeded by scripts/seed-refusal-scratch.mjs — not a real run'],
        },
      },
    }
  );

  console.log(`\n  seeded lastRefusal with ${shrunk.length} shrunken section(s):`);
  for (const s of shrunk) {
    console.log(`    ${s.section.padEnd(26)} ${s.before} → ${s.after}  (-${Math.round(s.ratio * 100)}%)`);
  }
  console.log(`\n  point dev at it:\n    MONGODB_URI="${HOST}/${SCRATCH}${QS}" npm run dev\n`);
}

async function status() {
  const doc = await scratch.collection('landing_cache').findOne({ key: 'homepage_v1' });
  if (!doc) { console.log('scratch has no landing_cache — run `seed` first'); return; }
  console.log(`\n=== ${SCRATCH} ===`);
  console.log('lastRefusal present :', Boolean(doc.lastRefusal));
  if (doc.lastRefusal) {
    console.log('  actor   :', doc.lastRefusal.actor);
    console.log('  shrunk  :', JSON.stringify(doc.lastRefusal.shrunk?.map((s) => `${s.section} ${s.before}->${s.after}`)));
  }
  console.log('syncedAt            :', doc.syncedAt);
  const rows = await scratch.collection('admin_audit_logs')
    .find({ menu: 'landing_cache' }).sort({ createdAt: -1 }).limit(5).toArray();
  console.log(`audit rows (landing_cache): ${rows.length}`);
  for (const r of rows) {
    console.log(`  ${r.action}/${r.entity}/${r.recordId} by ${r.actor?.name || r.actor?.id || '?'}`);
    if (r.before || r.after) console.log(`    before=${JSON.stringify(r.before)} after=${JSON.stringify(r.after)}`);
    if (r.meta) console.log(`    meta=${JSON.stringify(r.meta).slice(0, 200)}`);
  }
  console.log('');
}

async function drop() {
  await scratch.dropDatabase();
  console.log(`dropped ${SCRATCH}`);
}

if (mode === 'seed') await seed();
else if (mode === 'drop') await drop();
else await status();

await mongoose.disconnect();
