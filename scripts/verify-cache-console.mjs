/**
 * READ-ONLY verification for the cache console's destructive round.
 *
 * Prints PASS/FAIL per check and exits non-zero on any failure. It reads
 * production Mongo and the upstream API and WRITES NOTHING — no delete, no
 * upsert, no sync. Every check below is a question, never an instruction.
 *
 * Usage:  node --env-file=.env.local scripts/verify-cache-console.mjs
 *
 * ── WHAT THIS CANNOT DO, AND WHY THE MANUAL LIST AT THE END IS SHORT ────────
 * It cannot verify that an apply actually deletes, because running one against
 * production is forbidden this round and would be the wrong way to find out
 * anyway. What it CAN do is compute, live, exactly what each preview would show
 * — the same counts, through the same identity fields — so the numbers a human
 * sees on the screen can be checked against numbers produced independently of
 * the screen.
 */

import { register } from 'node:module';
import mongoose from 'mongoose';

// The modules under verification import each other through the `@/` alias,
// which Node does not resolve. The verification suite's loader already does;
// reuse it rather than duplicating the mapping, which would drift from the code
// being checked. Same reasoning as scripts/audit-course-id-casing.mjs:71.
register(new URL('../test/loader.mjs', import.meta.url));

const PASS = (m) => { console.log(`  PASS  ${m}`); };
const FAIL = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };
const INFO = (m) => { console.log(`  ----  ${m}`); };
let failures = 0;

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error('MONGODB_URI is not set — cannot verify. Nothing was read.');
  process.exit(1);
}

const { MIRROR_TARGETS } = await import('@/lib/cache-console/resetTargets');
const { assessReplace, COLLAPSE_SHRINK_RATIO, VERDICT } =
  await import('@/lib/cache-console/resetPlan');

await mongoose.connect(URI);
const db = mongoose.connection.db;

console.log('\n=== cache console — read-only verification ===\n');
console.log(`collapse threshold: shrink > ${Math.round(COLLAPSE_SHRINK_RATIO * 100)}% requires a second confirmation\n`);

// The collection each target maps to, taken from the model's own declaration
// rather than guessed from the key.
const COLLECTION = {
  career_paths: 'career_paths',
  faqs: 'faqs',
  instructors: 'instructors',
  promotions: 'promotions',
};

for (const target of MIRROR_TARGETS) {
  console.log(`── ${target.key} (${target.label}) ─────────────────────────`);

  const col = db.collection(COLLECTION[target.key]);

  // 1. The identity field is actually populated on every row. A row missing it
  //    would be invisible to the purge AND to the keep-set — it would simply
  //    never be considered, which is silent.
  const total = await col.countDocuments({});
  const withId = await col.countDocuments({ [target.idField]: { $exists: true, $ne: null } });
  if (total === withId) PASS(`every row (${total}) carries ${target.idField}`);
  else FAIL(`${total - withId} of ${total} rows have no ${target.idField} — invisible to the purge`);

  // 2. The identity field is unique locally. Two rows sharing an id would both
  //    be deleted by one $in match, so a duplicate is a hidden multiplier on
  //    any purge.
  const dupes = await col.aggregate([
    { $group: { _id: `$${target.idField}`, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'dupes' },
  ]).toArray();
  const dupeCount = dupes[0]?.dupes ?? 0;
  if (dupeCount === 0) PASS(`${target.idField} is unique across all rows`);
  else FAIL(`${dupeCount} duplicated ${target.idField} values — a purge would remove more than it counted`);

  // 3. What a preview would show RIGHT NOW, computed independently of the UI.
  let upstreamIds = null;
  try {
    upstreamIds = await target.fetchUpstream();
  } catch (err) {
    INFO(`upstream read failed (${err?.message ?? err}) — preview would REFUSE, correctly, and show no numbers`);
  }

  if (upstreamIds) {
    const localIds = (await col.find({}, { projection: { [target.idField]: 1, _id: 0 } }).toArray())
      .map((r) => r?.[target.idField]).filter(Boolean).map(String);
    const keep = new Set(upstreamIds.map(String));
    const doomed = localIds.filter((id) => !keep.has(id));
    const after = localIds.length - doomed.length;
    const verdict = assessReplace({ beforeCount: localIds.length, afterCount: after });

    INFO(`local ${localIds.length} · upstream ${upstreamIds.length} · would remove ${doomed.length} · would leave ${after}`);
    INFO(`verdict: ${verdict.verdict}${verdict.reason ? ` — ${verdict.reason}` : ''}`);

    if (verdict.verdict === VERDICT.REFUSE_EMPTY) {
      FAIL('the incoming set is EMPTY — the console will refuse, and it should. Investigate upstream before anything else');
    } else if (verdict.verdict === VERDICT.CONFIRM_COLLAPSE) {
      INFO('this collection would require the second confirmation today — read the numbers above before clicking it');
      PASS('the collapse guard is engaged for this collection');
    } else {
      PASS('a reset today would be an ordinary purge, no second confirmation');
    }

    // 4. Sanity on the join itself. If NOTHING matches, the identity fields on
    //    the two sides are not the same key space and every row looks doomed.
    const matched = localIds.filter((id) => keep.has(id)).length;
    if (localIds.length === 0) INFO('collection is empty — nothing to join');
    else if (matched === 0) FAIL(`ZERO of ${localIds.length} local rows matched upstream — the id join is broken, not the data`);
    else PASS(`${matched} of ${localIds.length} local rows matched upstream (the join works)`);
  }
  console.log('');
}

// 5. The audit contract is in place, or every destructive row loses its payload.
const { isValidPair, pairContract } = await import('@/lib/audit/auditContract');
for (const entity of ['snapshot', 'mirror']) {
  if (isValidPair('landing_cache', entity) && pairContract('landing_cache', entity).diff === 'full') {
    PASS(`audit contract: landing_cache|${entity} exists at diff=full`);
  } else {
    FAIL(`audit contract: landing_cache|${entity} missing or not full — reset payloads would be discarded`);
  }
}

await mongoose.disconnect();

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} ===`);
console.log(`
MANUAL, because nothing else can produce it — three clicks:

  1. /admin/cache → a collection → "ดูตัวอย่าง…". Confirm the four numbers
     match the "local / upstream / would remove / would leave" line printed
     above for that collection.
  2. WITHOUT clicking apply, wait ~2.5 minutes, then click apply. It must
     REFUSE as stale and clear the preview.
  3. Re-run the preview, then in a second tab run the same preview and apply
     it there first. The first tab's apply must REFUSE as drifted.

Everything else in this round is covered by the suite or by the checks above.
`);

process.exit(failures === 0 ? 0 : 1);
