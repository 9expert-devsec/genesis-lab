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
import { normalizeHex } from '@/lib/rbac/roleColor';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';

const ADMIN_PATH = '/admin/roles';
const DEFAULT_COLOR = '#6b7280';

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

export async function createRole({ key, name, description, pages, color, isSuperadmin }) {
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
    isSystem: false, // UI-created roles are never system roles
    isSuperadmin: wantSuper,
    createdBy: session.user?.id ?? null,
  });

  revalidatePath(ADMIN_PATH);
  return { ok: true, role: serialize(role.toObject()) };
}

export async function updateRole(key, { name, description, pages, color, isSuperadmin }) {
  await requireAdmin('roles');
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

  if (typeof name === 'string' && name.trim()) role.name = name.trim();
  if (typeof description === 'string') role.description = description.trim();
  if (color !== undefined) role.color = normalizeHex(color) || DEFAULT_COLOR;
  role.isSuperadmin = wantSuper;
  role.pages = wantSuper ? [] : cleanPages(pages);

  await role.save();
  revalidatePath(ADMIN_PATH);
  return { ok: true, role: serialize(role.toObject()) };
}

export async function deleteRole(key) {
  await requireAdmin('roles');
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
  return { ok: true };
}
