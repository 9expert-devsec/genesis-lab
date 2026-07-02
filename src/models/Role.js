import mongoose from 'mongoose';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { normalizeHex } from '@/lib/rbac/roleColor';

/**
 * Role — a dynamic RBAC role (phase 0 of the RBAC rollout).
 *
 * Permission unit is a page key from ADMIN_PAGES: a role either fully
 * accesses a page or not at all. `color` is a free hex rendered inline
 * (see roleColor.js). `isSuperadmin` bypasses page checks and is a
 * singleton — enforced by callers via `Role.assertSingleSuperadmin`, NOT
 * by an automatic hook (kept off the write path to keep the model cheap).
 *
 * NOTE: additive only. Nothing reads this in phase 0 — session/guards are
 * wired in later phases.
 */
const DEFAULT_COLOR = '#6b7280'; // gray-500

const RoleSchema = new mongoose.Schema(
  {
    // Immutable slug — the stable identifier used by sessions/guards later.
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // Page keys from ADMIN_PAGES. Unknown keys are dropped on validate.
    pages: { type: [String], default: [] },

    // Normalized '#rrggbb' (see pre-validate below). Free hex, inline-styled.
    color: { type: String, default: DEFAULT_COLOR },

    // Seeded default role — not user-deletable (enforced in later phases).
    isSystem: { type: Boolean, default: false },
    // Bypasses all page checks. Singleton — see assertSingleSuperadmin.
    isSuperadmin: { type: Boolean, default: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true, collection: 'roles' }
);

// Normalize the color to '#rrggbb', falling back to neutral gray on any
// invalid input so a bad value can't reach the render path.
RoleSchema.pre('validate', function normalizeColor(next) {
  this.color = normalizeHex(this.color) || DEFAULT_COLOR;
  next();
});

// Defensive: keep only known page keys. The phase-5 UI should already
// constrain the checkboxes, but silently drop anything stale/unknown.
RoleSchema.pre('validate', function pruneUnknownPages(next) {
  if (Array.isArray(this.pages)) {
    const allowed = new Set(ALL_PAGE_KEYS);
    this.pages = this.pages.filter((k) => allowed.has(k));
  }
  next();
});

/**
 * Enforce the "exactly one superadmin" rule. Callers in phases 5/6 MUST
 * invoke this in the role create/update actions BEFORE persisting when
 * `isSuperadmin` is being set to true; it throws if another role already
 * holds the flag. Intentionally NOT a pre-save hook — we don't want a
 * collection query on every write.
 *
 * `candidate` is the role being saved: { _id?, isSuperadmin }.
 */
RoleSchema.statics.assertSingleSuperadmin = async function assertSingleSuperadmin(candidate) {
  if (!candidate || !candidate.isSuperadmin) return;
  const query = { isSuperadmin: true };
  if (candidate._id) query._id = { $ne: candidate._id };
  const existing = await this.findOne(query).select('key').lean();
  if (existing) {
    throw new Error(
      `Superadmin is a singleton: role "${existing.key}" already has isSuperadmin=true.`
    );
  }
};

// Guard against re-registration during Next.js hot-reload / repeated imports.
export default mongoose.models.Role || mongoose.model('Role', RoleSchema);
