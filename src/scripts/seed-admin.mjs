/**
 * One-time seed: create the first admin user.
 *
 * Run with Node 20+ native env-file loader:
 *   node --env-file=.env.local src/scripts/seed-admin.mjs
 *
 * Override defaults via env:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 *
 * The Admin schema is inlined here so the script doesn't depend on
 * Next.js path aliases (which `node` alone doesn't resolve).
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { MONGODB_URI, MONGODB_DB_NAME } = process.env;

if (!MONGODB_URI) {
  console.error(
    'MONGODB_URI is not set.\n' +
      'Run with:  node --env-file=.env.local src/scripts/seed-admin.mjs'
  );
  process.exit(1);
}

const AdminSchema = new mongoose.Schema(
  {
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:        { type: String, required: true, trim: true },
    password:    { type: String, required: true },
    role:        { type: String, enum: ['owner', 'admin', 'editor'], default: 'admin' },
    active:      { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, collection: 'admins' }
);

async function main() {
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });

  const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

  const email    = process.env.SEED_ADMIN_EMAIL    || 'admin@9expert.co.th';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@9expert2024';
  const name     = process.env.SEED_ADMIN_NAME     || '9Expert Admin';

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log('Admin already exists:', email);
    await mongoose.disconnect();
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 12);
  await Admin.create({
    email,
    password: hashed,
    name,
    role: 'owner',
    active: true,
  });

  console.log('Admin created:', email);
  console.log('Password:   ', password);
  console.log('Change the password after first login.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
