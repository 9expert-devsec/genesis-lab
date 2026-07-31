'use server';

/**
 * Role management server actions (Phase 5b). Superadmin-only — guarded by
 * `requireAdmin('roles')` (the `roles` page is seeded superadmin-only).
 *
 * All safety rules are enforced HERE, not just in the UI:
 *   - Singleton superadmin (via Role.assertSingleSuperadmin).
 *   - System roles are undeletable and their `isSuperadmin` can't be toggled.
 *   - The superadmin role can never lose its power.
 *   - A role assigned to any admin can't be deleted (no orphaned admins).
 *   - `key` is immutable; a superadmin role ignores `pages` (stored []).
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Role from '@/models/Role';
import Admin from '@/models/Admin';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { normalizeHex } from '@/lib/rbac/roleColor';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import { ROLE_TIERS, DEFAULT_TIER } from '@/lib/rbac/access';

const ADMIN_PATH = '/admin/roles';
const DEFAULT_COLOR = '#6b7280';

/**
 * ── THE AUDIT CALL SHAPE — SWEEP ROUND 1 ────────────────────────────────────
 *
 * This file is the reference. Roughly 156 more call sites copy what is below,
 * so the decisions are made once, here, and written down rather than inferred.
 *
 *   PLACEMENT   after the mutation succeeds, immediately before the return. If
 *               the write throws there is no row, which is correct — nothing
 *               happened. Nothing may mutate the logged values after the
 *               `after()` call, because the callback reads them later.
 *
 *   the call    `recordAdminActionAfter(...)` — synchronous, never awaited,
 *               returns nothing. It schedules the write for after the response
 *               and absorbs the one way scheduling can fail. Do NOT reach for
 *               `recordAdminAction` directly at a call site: that is the
 *               awaited writer, and awaiting it makes the admin wait on an
 *               audit row. The reasoning for both — why it is deferred, and
 *               why a scheduling failure drops the row instead of falling back
 *               to a floating promise — is in that function's docstring.
 *
 *   menu        the SAME literal already passed to requireAdmin() in this
 *               function — never a second copy typed independently. The
 *               coverage guard in test/fs/auditCoverage.test.mjs compares the
 *               two and reddens if they drift.
 *
 *   entity      names the KIND of record. `roles` holds one kind, so it is
 *               always 'role'. It is never '' — an empty entity is
 *               indistinguishable from a caller who forgot the argument, and
 *               makes the row invisible to the inline history widget.
 *
 *   actor       from the session requireAdmin() already returned. That is why
 *               `const session =` appears on guards that previously discarded
 *               it.
 *
 *   recordId    slugifyKey(key) — the STORED value (§8.7 ruling (g)). Only
 *               createRole can differ from its argument, but the whole file
 *               uses the same expression so there is one rule to copy. For
 *               update/delete it is provably a no-op: the lookup matched a
 *               stored row, and stored keys are always already slugified.
 *
 *   before/after  ONLY the fields the action touched, never the whole
 *               document. The action does NOT compute a diff — the reading
 *               surface does that once, rather than 159 times in 38 files.
 *               Deletes capture `before` first or it is gone.
 *
 * The action's RETURN VALUE does not change. Callers depend on it.
 */

/**
 * The fields updateRole/createRole can touch, snapshotted off a Role document.
 *
 * Serialised because `pages` is a Mongoose array and `before`/`after` are Mixed
 * — the writer JSON-stringifies to size-check, and a hydrated subdocument would
 * round-trip oddly. Six fields, roughly 700 bytes at the widest (a role holding
 * all 36 page keys), so two of these sit inside the writer's 2 KB per-field cap.
 */
function roleFields(doc) {
  return serialize({
    name:         doc.name,
    description:  doc.description,
    pages:        doc.pages,
    color:        doc.color,
    tier:         doc.tier,
    isSuperadmin: doc.isSuperadmin,
  });
}

/** Coerce a raw tier input to a valid tier, defaulting to least privilege. */
function cleanTier(tier) {
  return ROLE_TIERS.includes(tier) ? tier : DEFAULT_TIER;
}

function serialize(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

/** Normalize a raw key input to a slug: lowercase, [a-z0-9_] only. */
function slugifyKey(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Keep only known page keys, de-duplicated. */
function cleanPages(pages) {
  if (!Array.isArray(pages)) return [];
  const allowed = new Set(ALL_PAGE_KEYS);
  return [...new Set(pages.filter((k) => allowed.has(k)))];
}

/**
 * All roles (system first, then by name) with `assignedCount` = number of
 * admins holding each role's key.
 */
export async function listRolesFull() {
  await requireAdmin('roles');
  await dbConnect();
  const roles = await Role.find().sort({ isSystem: -1, name: 1 }).lean();
  const withCounts = await Promise.all(
    roles.map(async (r) => ({
      ...r,
      assignedCount: await Admin.countDocuments({ roleKey: r.key }),
    }))
  );
  return serialize(withCounts);
}

export async function createRole({ key, name, description, pages, color, isSuperadmin, tier }) {
  const session = await requireAdmin('roles');
  await dbConnect();

  const cleanKey = slugifyKey(key);
  const cleanName = String(name ?? '').trim();
  if (!cleanKey) return { ok: false, error: 'กรุณากรอก key (a-z, 0-9, _)' };
  if (!cleanName) return { ok: false, error: 'กรุณากรอกชื่อบทบาท' };

  const existing = await Role.findOne({ key: cleanKey }).lean();
  if (existing) return { ok: false, error: `key "${cleanKey}" ถูกใช้แล้ว` };

  const wantSuper = Boolean(isSuperadmin);
  if (wantSuper) {
    try {
      await Role.assertSingleSuperadmin({ isSuperadmin: true });
    } catch {
      return { ok: false, error: 'มี superadmin role อยู่แล้ว (จำกัดได้เพียง 1 บทบาท)' };
    }
  }

  const role = await Role.create({
    key: cleanKey,
    name: cleanName,
    description: String(description ?? '').trim(),
    // Superadmin bypasses page checks → store [] (cosmetic).
    pages: wantSuper ? [] : cleanPages(pages),
    color: normalizeHex(color) || DEFAULT_COLOR,
    // Tier is orthogonal to isSuperadmin; superadmin is treated as
    // developer at read time (getTier) so the stored value is advisory
    // for that role, but we still persist what the UI sent.
    tier: cleanTier(tier),
    isSystem: false, // UI-created roles are never system roles
    isSuperadmin: wantSuper,
    createdBy: session.user?.id ?? null,
  });

  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu:        'roles',
    action:      'create',
    entity:      'role',
    recordId:    cleanKey,
    recordLabel: cleanName,
    after:       roleFields(role),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true, role: serialize(role.toObject()) };
}

export async function updateRole(key, { name, description, pages, color, isSuperadmin, tier }) {
  const session = await requireAdmin('roles');
  await dbConnect();

  const role = await Role.findOne({ key }); // hydrated doc so pre-validate runs on save
  if (!role) return { ok: false, error: 'ไม่พบบทบาท' };

  const wantSuper = Boolean(isSuperadmin);

  // The superadmin role must always keep its power.
  if (role.isSuperadmin && !wantSuper) {
    return { ok: false, error: 'ไม่สามารถยกเลิกสิทธิ์ superadmin ของบทบาทนี้ได้' };
  }
  // System roles can't have their superadmin status toggled (Phase-0 rule).
  if (role.isSystem && wantSuper !== role.isSuperadmin) {
    return { ok: false, error: 'ไม่สามารถเปลี่ยนสถานะ superadmin ของ system role ได้' };
  }
  // Singleton guard when promoting a role to superadmin.
  if (wantSuper && !role.isSuperadmin) {
    try {
      await Role.assertSingleSuperadmin({ _id: role._id, isSuperadmin: true });
    } catch {
      return { ok: false, error: 'มี superadmin role อยู่แล้ว (จำกัดได้เพียง 1 บทบาท)' };
    }
  }

  // `before` is read off the document ALREADY IN HAND — no second query. The
  // action fetches a hydrated doc (so the pre-validate hook runs on save) and
  // then mutates it in place, so the only requirement is to snapshot before
  // line 1 of that mutation. findOneAndUpdate(…, {new: false}) would also work
  // and would also cost nothing extra, but it would replace the hydrated save
  // this function deliberately relies on.
  const before = roleFields(role);

  if (typeof name === 'string' && name.trim()) role.name = name.trim();
  if (typeof description === 'string') role.description = description.trim();
  if (color !== undefined) role.color = normalizeHex(color) || DEFAULT_COLOR;
  if (tier !== undefined) role.tier = cleanTier(tier);
  role.isSuperadmin = wantSuper;
  role.pages = wantSuper ? [] : cleanPages(pages);

  await role.save();
  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu:        'roles',
    action:      'update',
    entity:      'role',
    recordId:    slugifyKey(key),
    recordLabel: role.name,
    before,
    after:       roleFields(role),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true, role: serialize(role.toObject()) };
}

export async function deleteRole(key) {
  const session = await requireAdmin('roles');
  await dbConnect();

  const role = await Role.findOne({ key }).lean();
  if (!role) return { ok: false, error: 'ไม่พบบทบาท' };
  if (role.isSuperadmin) return { ok: false, error: 'ไม่สามารถลบ superadmin role ได้' };
  if (role.isSystem) return { ok: false, error: 'ไม่สามารถลบ system role ได้' };

  const assignedCount = await Admin.countDocuments({ roleKey: key });
  if (assignedCount > 0) {
    return {
      ok: false,
      error: `มีผู้ดูแล ${assignedCount} คนใช้บทบาทนี้ — โปรดเปลี่ยนบทบาทของผู้ดูแลเหล่านั้นก่อนลบ`,
    };
  }

  await Role.deleteOne({ key });
  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu:        'roles',
    action:      'delete',
    entity:      'role',
    recordId:    slugifyKey(key),
    recordLabel: role.name,
    // Captured before the delete — `role` was read at the top of this
    // function. After deleteOne there is nothing left to read.
    before:      roleFields(role),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}
