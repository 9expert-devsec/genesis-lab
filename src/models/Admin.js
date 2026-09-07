import mongoose from 'mongoose';

const AdminSchema = new mongoose.Schema(
  {
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    name:     { type: String, required: true, trim: true },
    password: { type: String, required: true }, // bcrypt hash; $2b$10$... compatible with legacy
    // Dynamic-RBAC role reference → Role.key. THE authority for permissions.
    // (The legacy `role` enum was removed in Phase 6; existing docs may still
    // carry a stale `role` value in Mongo — harmless, Mongoose ignores it.)
    roleKey:  { type: String, trim: true, lowercase: true, index: true },
    active:   { type: Boolean, default: true },
    lastLoginAt: { type: Date },

    // ── Profile avatar — a Cloudinary public_id, NOT a URL ────────────
    // DELIBERATELY DIFFERENT FROM EVERY OTHER IMAGE FIELD IN THIS REPO.
    // Banners, instructors and course covers all store `secure_url`, and a
    // later reader will be tempted to "fix" this into consistency with them.
    // Do not: one avatar is rendered at several sizes — 36px in the sidebar
    // footer, 128px on the profile page — and a stored URL is a finished
    // delivery URL that cannot be transformed at read time. The public_id can,
    // so the size lives at the render site instead of in the database.
    //
    // ONE FIELD, not a publicId + a url. Two columns describing one image drift
    // the first time a write updates one and not the other, and the URL is
    // derivable from this — see src/lib/avatar/avatarUrl.js, which is the only
    // place that derivation happens.
    imagePublicId: { type: String, default: null, trim: true },

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
