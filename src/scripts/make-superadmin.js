/**
 * One-time migration: flip the bootstrap admin and any legacy `owner`
 * records to `superadmin`.
 *
 * Run from the repo root with the env file loaded:
 *   node --env-file=.env.local src/scripts/make-superadmin.js
 *
 * Optionally pass an email argument to target a specific admin:
 *   node --env-file=.env.local src/scripts/make-superadmin.js admin@9expert.co.th
 *
 * No build step needed — this is a standalone script that connects
 * to MongoDB directly and uses a minimal schema. It does NOT touch
 * passwords or 2FA fields; only `role` and `active`.
 */

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

if (!MONGODB_URI) {
  console.error(
    'Error: MONGODB_URI is not set. Run with --env-file=.env.local'
  );
  process.exit(1);
}

const AdminSchema = new mongoose.Schema(
  {
    email:  String,
    name:   String,
    role:   { type: String, default: 'admin' },
    active: { type: Boolean, default: true },
  },
  { collection: 'admins', strict: false }
);

const Admin =
  mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });

  // 1) Flip every legacy `owner` record to `superadmin` (active stays).
  const ownerResult = await Admin.updateMany(
    { role: 'owner' },
    { $set: { role: 'superadmin' } }
  );
  console.log(`owner → superadmin: ${ownerResult.modifiedCount} record(s)`);

  // 2) If an email was passed, force that account to superadmin + active.
  const targetEmail = process.argv[2]?.trim().toLowerCase();
  if (targetEmail) {
    const result = await Admin.findOneAndUpdate(
      { email: targetEmail },
      { $set: { role: 'superadmin', active: true } },
      { new: true }
    );
    if (result) {
      console.log(
        `Updated ${result.email}: role=${result.role} active=${result.active}`
      );
    } else {
      console.warn(`No admin found with email "${targetEmail}"`);
    }
  } else {
    // 3) Sanity check: warn if no superadmin exists at all.
    const count = await Admin.countDocuments({ role: 'superadmin', active: true });
    if (count === 0) {
      console.warn(
        'WARNING: no active superadmin in the DB. ' +
        'Re-run with the bootstrap email, e.g.:\n' +
        '  node --env-file=.env.local src/scripts/make-superadmin.js admin@9expert.co.th'
      );
    } else {
      console.log(`Active superadmin count: ${count}`);
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
