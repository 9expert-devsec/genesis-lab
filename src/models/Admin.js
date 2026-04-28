import mongoose from 'mongoose';

const AdminSchema = new mongoose.Schema(
  {
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:     { type: String, required: true, trim: true },
    password: { type: String, required: true }, // bcrypt hash; $2b$10$... compatible with legacy
    // `owner` retained for back-compat with existing records — treated
    // identically to `superadmin` by the role guards. New seeds should
    // use `superadmin`. The migration script in src/scripts/ flips
    // `owner` → `superadmin` in place.
    role:     { type: String, enum: ['superadmin', 'owner', 'admin', 'editor'], default: 'admin' },
    active:   { type: Boolean, default: true },
    lastLoginAt: { type: Date },

    // ── TOTP (2FA) — Google Authenticator compatible ──────────────
    // `totpSecret` is the base32 secret returned by otplib; null until
    // the admin completes the setup flow. We do NOT encrypt at rest —
    // the value is already useless without the user's authenticator
    // app, and the DB itself is access-controlled. Add field-level
    // encryption later if compliance requires it.
    totpSecret:     { type: String, default: null, select: false },
    totpEnabled:    { type: Boolean, default: false },
    totpVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'admins' }
);

export default mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
