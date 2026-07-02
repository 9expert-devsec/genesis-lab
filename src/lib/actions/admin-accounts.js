'use server';

/**
 * Admin account management — server actions.
 *
 * The "list / create / update / delete" actions are guarded by
 * `requireAdmin('accounts')` — the `accounts` page is seeded superadmin-only,
 * so only a superadmin passes (and, via the null-sentinel, can never be
 * locked out). The `updateOwnProfile` action is login-only (any admin may
 * rename themselves / change their own password) — it operates solely on
 * `session.user`, never on arbitrary accounts.
 *
 * Field-name note: this code uses `active` (matching the existing Admin
 * schema and other action files in this repo).
 *
 * Role note: the system now authorizes by `roleKey`. We dual-write the
 * legacy `role` enum in sync so nothing that still reads `role` breaks
 * before Phase 6 (which drops the enum and this dual-write). "Is this admin
 * a superadmin?" is derived from `roleKey` → a Role with `isSuperadmin`,
 * NOT the legacy enum.
 */

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import Role from '@/models/Role';
import { auth } from '@/lib/auth/options';
import { requireAdmin } from '@/lib/actions/auth';

const ADMIN_PATH = '/admin/accounts';

function serialize(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * The set of role keys that are superadmin. Superadmin is a singleton
 * (Phase 1), but we resolve from the Role collection so a future rename
 * still works; fall back to the known 'superadmin' key.
 * Requires an active DB connection.
 */
async function superadminRoleKeys() {
  const roles = await Role.find({ isSuperadmin: true }).select('key').lean();
  const keys = roles.map((r) => r.key);
  return keys.length ? keys : ['superadmin'];
}

/**
 * Validate an incoming role value against the roles that actually exist in
 * the DB (never a hardcoded enum). Unknown → 'admin' (safe non-superadmin).
 * Requires an active DB connection.
 */
async function resolveRoleKey(incoming) {
  const validKeys = (await Role.find().select('key').lean()).map((r) => r.key);
  return validKeys.includes(incoming) ? incoming : 'admin';
}

export async function listAdmins() {
  await requireAdmin('accounts');
  await dbConnect();
  // Exclude password hash; totpSecret already `select: false` so won't come back.
  const docs = await Admin.find({}, '-password')
    .sort({ createdAt: -1 })
    .lean();
  return serialize(docs);
}

/**
 * Assignable roles for the account form (options + badge colors). System
 * roles first, then alphabetical by name. DB-driven — never a hardcoded
 * list — so custom roles (Phase 5b) appear automatically.
 */
export async function listRoles() {
  await requireAdmin('accounts');
  await dbConnect();
  const roles = await Role.find()
    .select('key name color isSuperadmin')
    .sort({ isSystem: -1, name: 1 })
    .lean();
  return serialize(roles);
}

export async function createAdmin({ email, password, name, role }) {
  await requireAdmin('accounts');
  await dbConnect();

  const cleanEmail = String(email ?? '').trim().toLowerCase();
  const cleanName = String(name ?? '').trim();
  const cleanRoleKey = await resolveRoleKey(role);

  if (!cleanEmail) return { ok: false, error: 'กรุณากรอกอีเมล' };
  if (!cleanName) return { ok: false, error: 'กรุณากรอกชื่อ' };
  if (!password || password.length < 8) {
    return { ok: false, error: 'รหัสผ่านอย่างน้อย 8 ตัวอักษร' };
  }

  const existing = await Admin.findOne({ email: cleanEmail });
  if (existing) return { ok: false, error: 'อีเมลนี้ถูกใช้แล้ว' };

  const hashed = await bcrypt.hash(password, 12);
  await Admin.create({
    email: cleanEmail,
    password: hashed,
    name: cleanName,
    roleKey: cleanRoleKey, // sole authority (the legacy `role` enum is gone)
    active: true,
  });

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function updateAdmin(id, { name, role, active }) {
  await requireAdmin('accounts');
  await dbConnect();

  const update = {};
  if (typeof name === 'string') update.name = name.trim();
  if (typeof role === 'string' && role) {
    // The select value IS the role key; validate against DB roles.
    update.roleKey = await resolveRoleKey(role); // sole authority
  }
  if (typeof active === 'boolean') update.active = active;

  const superKeys = await superadminRoleKeys();

  // Don't let the LAST superadmin downgrade themselves into a lockout.
  // "Is superadmin" is by roleKey, not the legacy enum.
  if (update.roleKey && !superKeys.includes(update.roleKey)) {
    const target = await Admin.findById(id).lean();
    if (target && superKeys.includes(target.roleKey)) {
      const remaining = await Admin.countDocuments({
        _id: { $ne: id },
        active: true,
        roleKey: { $in: superKeys },
      });
      if (remaining === 0) {
        return {
          ok: false,
          error: 'ไม่สามารถลดสิทธิ์ superadmin คนสุดท้ายได้',
        };
      }
    }
  }

  // Same guard if deactivating the last superadmin.
  if (update.active === false) {
    const target = await Admin.findById(id).lean();
    if (target && superKeys.includes(target.roleKey)) {
      const remaining = await Admin.countDocuments({
        _id: { $ne: id },
        active: true,
        roleKey: { $in: superKeys },
      });
      if (remaining === 0) {
        return {
          ok: false,
          error: 'ไม่สามารถปิดใช้ superadmin คนสุดท้ายได้',
        };
      }
    }
  }

  await Admin.findByIdAndUpdate(id, update);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function resetAdminPassword(id, newPassword) {
  await requireAdmin('accounts');
  await dbConnect();

  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'รหัสผ่านอย่างน้อย 8 ตัวอักษร' };
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await Admin.findByIdAndUpdate(id, { password: hashed });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function deleteAdmin(id) {
  const session = await requireAdmin('accounts');
  await dbConnect();

  // Cannot delete self.
  if (String(session.user.id) === String(id)) {
    return { ok: false, error: 'ไม่สามารถลบบัญชีของตัวเองได้' };
  }

  const target = await Admin.findById(id).lean();
  if (!target) return { ok: false, error: 'ไม่พบบัญชี' };

  // Cannot delete the last active superadmin — counted by roleKey.
  const superKeys = await superadminRoleKeys();
  if (superKeys.includes(target.roleKey)) {
    const remaining = await Admin.countDocuments({
      _id: { $ne: id },
      active: true,
      roleKey: { $in: superKeys },
    });
    if (remaining === 0) {
      return { ok: false, error: 'ไม่สามารถลบ superadmin คนสุดท้ายได้' };
    }
  }

  await Admin.findByIdAndDelete(id);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/**
 * Self-service profile update — any logged-in admin can rename themselves
 * and rotate their password. Login-only (NOT gated by `accounts`): it
 * operates on `session.user` only, never on arbitrary accounts. Requires
 * the current password if rotating (defense against a stolen session
 * cookie silently changing the password).
 */
export async function updateOwnProfile({ name, currentPassword, newPassword }) {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, error: 'Unauthorized' };
  }
  await dbConnect();

  const admin = await Admin.findOne({ email: session.user.email });
  if (!admin) return { ok: false, error: 'ไม่พบบัญชี' };

  const wantsPasswordChange = newPassword && newPassword.length > 0;

  if (wantsPasswordChange) {
    if (newPassword.length < 8) {
      return { ok: false, error: 'รหัสผ่านอย่างน้อย 8 ตัวอักษร' };
    }
    if (!currentPassword) {
      return { ok: false, error: 'กรุณากรอกรหัสผ่านปัจจุบัน' };
    }
    const valid = await bcrypt.compare(currentPassword, admin.password);
    if (!valid) {
      return { ok: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' };
    }
    admin.password = await bcrypt.hash(newPassword, 12);
  }

  if (typeof name === 'string' && name.trim().length > 0) {
    admin.name = name.trim();
  }

  await admin.save();
  revalidatePath('/admin/profile');
  return { ok: true };
}
