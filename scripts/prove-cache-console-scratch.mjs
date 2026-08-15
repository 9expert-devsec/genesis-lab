/**
 * PROOF AGAINST REAL DOCUMENT SHAPES, ON A SCRATCH COPY.
 *
 * Round 3 proved the purge only against injected fakes, and injected fakes are
 * exactly what hid the `instructors` shape until the live verifier ran: hand-
 * written fixtures had a mirror id on every row and no duplicates, because that
 * is what a person writes when they invent one.
 *
 * This copies real collections into scratch collections and runs the REAL
 * preview and apply logic against them. Production is READ ONLY — every write
 * goes to a `zz_scratch_*` collection this script created and drops.
 *
 * Usage: node --env-file=.env.local scripts/prove-cache-console-scratch.mjs
 *
 * ── WHAT THIS CAN AND CANNOT UPGRADE ────────────────────────────────────────
 * It upgrades "the purge deletes the right rows" from "true of my fakes" to
 * "true of real document shapes" — duplicates, missing ids, mixed types and
 * all. It does NOT prove anything about production data being deleted, and it
 * cannot: no destructive path runs against a production collection here, by
 * construction. Claims that still need that are listed at the end as unproven.
 */

import { register } from 'node:module';
import mongoose from 'mongoose';

register(new URL('../test/loader.mjs', import.meta.url));

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI not set — nothing was read.'); process.exit(1); }

const { resetMirror } = await import('@/lib/cache-console/applyReset');
const { VERDICT } = await import('@/lib/cache-console/resetPlan');
const { assessDowngrade, sectionCountsOf, DOWNGRADE_VERDICT } =
  await import('@/lib/cache-console/downgradeGuard');

let failures = 0;
const PASS = (m) => console.log(`  PASS  ${m}`);
const FAIL = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };
const NOTE = (m) => console.log(`  ----  ${m}`);

await mongoose.connect(URI);
const db = mongoose.connection.db;

const SCRATCH_PREFIX = 'zz_scratch_cacheconsole_';
const created = [];

/** Copy a production collection into a scratch one. Production is read-only. */
async function makeScratch(sourceName) {
  const target = `${SCRATCH_PREFIX}${sourceName}`;
  await db.collection(target).drop().catch(() => {});
  const docs = await db.collection(sourceName).find({}).toArray();
  if (docs.length) await db.collection(target).insertMany(docs);
  created.push(target);
  return { name: target, col: db.collection(target), sourceCount: docs.length };
}

async function cleanup() {
  for (const name of created) await db.collection(name).drop().catch(() => {});
}

console.log('\n=== cache console — proof against real shapes (scratch copies) ===\n');

try {
  // ── 1. The instructors shape, which is what the fakes did not have ────────
  console.log('── instructors: the shape injected fakes did not reproduce ──');
  const scratch = await makeScratch('instructors');
  NOTE(`copied ${scratch.sourceCount} real rows into ${scratch.name}`);

  const rows = await scratch.col.find({}, { projection: { instructor_id: 1, _id: 1 } }).toArray();
  const withoutId = rows.filter((r) => r.instructor_id == null || r.instructor_id === '');
  const byId = new Map();
  for (const r of rows) {
    if (r.instructor_id == null || r.instructor_id === '') continue;
    const k = String(r.instructor_id);
    byId.set(k, (byId.get(k) ?? 0) + 1);
  }
  const dupes = [...byId.entries()].filter(([, n]) => n > 1);

  NOTE(`rows ${rows.length} · without instructor_id ${withoutId.length} · duplicated ids ${dupes.length}`);
  if (withoutId.length === 0 && dupes.length === 0) {
    NOTE('NOTE: this copy is clean — the assertions below then prove less than intended');
  }

  // Drive the REAL orchestrator with real readers over the scratch copy.
  // `managed` mirrors the action's own readMirrorState: rows WITH a mirror id,
  // carried as Mongo _ids so the delete and the count share one key space.
  const managed = rows
    .filter((r) => r.instructor_id != null && r.instructor_id !== '')
    .map((r) => ({ _id: String(r._id), mirrorId: String(r.instructor_id) }));

  // Pretend upstream dropped exactly ONE mirror id — the duplicated one when
  // there is one, because that is the case a fake could not produce.
  const targetMirrorId = dupes.length ? dupes[0][0] : managed[0]?.mirrorId;
  const survivingIds = managed.filter((m) => m.mirrorId !== targetMirrorId).map((m) => m._id);
  const expectedDeletes = managed.filter((m) => m.mirrorId === targetMirrorId).length;

  NOTE(`simulating upstream dropping mirror id ${targetMirrorId} → ${expectedDeletes} row(s) should go`);

  const before = await scratch.col.countDocuments({});
  const result = await resetMirror({
    target: 'instructors',
    preview: { target: 'instructors', beforeCount: managed.length, issuedAt: Date.now() },
    confirmed: true,
    now: Date.now(),
    readLive: async () => ({ beforeCount: managed.length, ids: managed.map((m) => m._id) }),
    fetchUpstreamIds: async () => ({ ok: true, ids: survivingIds }),
    remove: async (doomedIds) => {
      const res = await scratch.col.deleteMany({
        _id: { $in: doomedIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      return res.deletedCount ?? 0;
    },
  });
  const after = await scratch.col.countDocuments({});

  if (result.ok) PASS('the orchestrator completed against real documents');
  else FAIL(`orchestrator refused unexpectedly: ${result.reason}`);

  if (result.removedCount === expectedDeletes) {
    PASS(`removed exactly ${expectedDeletes} row(s) — the count matched the deletion`);
  } else {
    FAIL(`previewed/《reported》 ${result.removedCount} but expected ${expectedDeletes}`);
  }

  if (before - after === expectedDeletes) {
    PASS(`the collection really shrank by ${expectedDeletes} (${before} → ${after})`);
  } else {
    FAIL(`collection went ${before} → ${after}, expected a drop of ${expectedDeletes}`);
  }

  // THE CLAIM THE FAKES COULD NOT MAKE: rows with no mirror id survive.
  const survivorsWithoutId = await scratch.col.countDocuments({
    $or: [{ instructor_id: { $exists: false } }, { instructor_id: null }, { instructor_id: '' }],
  });
  if (survivorsWithoutId === withoutId.length) {
    PASS(`all ${withoutId.length} rows without instructor_id survived — unmanaged rows are never doomed`);
  } else {
    FAIL(`${withoutId.length - survivorsWithoutId} unmanaged row(s) were deleted`);
  }

  if (dupes.length) {
    PASS('the duplicate case was exercised against a real duplicate, not an invented one');
  } else {
    NOTE('no duplicate present in this copy — the duplicate claim rests on the pure tests alone');
  }

  console.log('');

  // ── 2. The downgrade guard against the REAL stored snapshot ───────────────
  console.log('── downgrade guard: real landing_cache payload ──');
  const landing = await db.collection('landing_cache').findOne({ key: 'homepage_v1' });
  if (!landing) {
    FAIL('no landing_cache document — cannot exercise the guard against real shape');
  } else {
    const storedCounts = sectionCountsOf(landing.data);
    NOTE(`payload sections: ${JSON.stringify(storedCounts)}`);
    NOTE(`stored sections field: ${JSON.stringify(landing.sections ?? null)}`);

    // The inconsistency this guard was designed around, checked on real data.
    const mismatched = Object.entries(storedCounts)
      .filter(([k, v]) => landing.sections && k in landing.sections && landing.sections[k] !== v);
    if (mismatched.length) {
      NOTE(`sections field DISAGREES with the payload for: ${mismatched.map(([k]) => k).join(', ')} — this is why the guard counts the payload`);
    } else {
      NOTE('sections field agrees with the payload today (it can still diverge after a failed run)');
    }

    const half = Object.fromEntries(
      Object.entries(storedCounts).map(([k, v]) => [k, Math.floor(v / 3)])
    );
    const refused = assessDowngrade({ storedCounts, incomingCounts: half });
    if (refused.verdict === DOWNGRADE_VERDICT.REFUSE_DOWNGRADE) {
      PASS(`a two-thirds cut of the REAL snapshot is refused (${refused.shrunk.length} section(s))`);
    } else {
      FAIL('a two-thirds cut of the real snapshot was NOT refused');
    }

    const same = assessDowngrade({ storedCounts, incomingCounts: storedCounts });
    if (same.verdict === DOWNGRADE_VERDICT.OK) PASS('an identical snapshot writes');
    else FAIL('an identical snapshot was refused — the guard would block every healthy run');

    const grown = Object.fromEntries(Object.entries(storedCounts).map(([k, v]) => [k, v + 1]));
    if (assessDowngrade({ storedCounts, incomingCounts: grown }).verdict === DOWNGRADE_VERDICT.OK) {
      PASS('a grown snapshot writes — the repair path is open');
    } else {
      FAIL('a grown snapshot was refused — a damaged snapshot could never be repaired');
    }
  }
} finally {
  await cleanup();
  console.log('\n  ----  scratch collections dropped');
  await mongoose.disconnect();
}

console.log(`\n=== ${failures === 0 ? 'ALL PROOFS PASSED' : `${failures} PROOF(S) FAILED`} ===`);
console.log(`
STILL UNPROVEN, and not upgraded by this script:
  · that a purge against a PRODUCTION collection behaves as it does here.
    Nothing destructive was run against one, deliberately.
  · that the compare-and-swap resolves two truly concurrent applies. This is
    single-threaded; MongoDB's per-document atomicity is taken from its docs.
  · that revalidatePath after a write refreshes the served page — unobservable
    from application code at all (inventory §E).
`);

process.exit(failures === 0 ? 0 : 1);
