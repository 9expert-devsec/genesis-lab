// One-time repair: recompute MasterclassBatch.registered_count from paid registrations.
// Usage:
//   node --env-file=.env.local scripts/recompute-batch-seats.mjs           (dry run)
//   node --env-file=.env.local scripts/recompute-batch-seats.mjs --apply   (write)
// Requires Node 20.6+ for --env-file. Alternatively: MONGODB_URI=... node scripts/...

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Run with --env-file=.env.local or set it inline.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const batches = db.collection('masterclass_batches');
  const regs    = db.collection('masterclass_registrations');

  const all = await batches.find({}).toArray();
  console.log(`Found ${all.length} batches. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  for (const b of all) {
    const paid = await regs
      .find({ batch_id: b._id, status: 'paid' })
      .project({ attendeesCount: 1 })
      .toArray();
    const seats = paid.reduce((s, r) => s + Math.max(1, Number(r.attendeesCount) || 1), 0);
    const drift = (b.registered_count ?? 0) !== seats;

    console.log(
      `${String(b._id)} | ${b.batch_label ?? `batch_no ${b.batch_no}`} | ` +
      `stored=${b.registered_count ?? 0} → computed=${seats} ${drift ? '⚠ FIX' : 'ok'}`
    );

    if (APPLY && drift) {
      const set = { registered_count: seats };
      if (!b.status_override) {
        if (b.status === 'open' && seats >= b.capacity) set.status = 'full';
        else if (b.status === 'full' && seats < b.capacity) set.status = 'open';
      }
      await batches.updateOne({ _id: b._id }, { $set: set });
    }
  }

  await mongoose.disconnect();
  console.log(`\nDone. ${APPLY ? 'Changes written.' : 'Dry run — re-run with --apply to write.'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
