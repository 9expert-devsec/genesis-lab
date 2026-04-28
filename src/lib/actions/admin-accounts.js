'use server';

/**
 * Admin account management — server actions.
 *
 * All "list / create / update / delete" actions are guarded by
 * `requireSuperAdmin()`. The `updateOwnProfile` action is open to any
 * logged-in admin so they can rename themselves and change their own
 * password.
 *
 * Field-name note: this code uses `active` (matching the existing
 * Admin schema and other action files in this repo). The original
 * task spec calls the same flag `isActive`; semantics are identical.
 *
 * Role-name note: legacy seed records use `owner`; new code uses
 * `superadmin`. The guard treats both as full-privilege so existing
 * `owner` accounts keep working until the migration script flips them.
 */

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Admin from '@/models/Admin';
import { auth } from '@/lib/auth/options';

const SUPERADMIN_ROLES = new Set(['superadmin', 'owner']);
const VALID_ROLES = ['superadmin', 'admin', 'editor'];
const ADMIN_PATH = '/admin/accounts';

async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  if (!SUPERADMIN_ROLES.has(session.user.role)) {
    const err = new Error('Forbidden — superadmin only');
    err.status = 403;
    throw err;
  }
  return session;
}

function serialize(doc) {
  return JSON.parse(JSON.stringify(doc));
}

export async function listAdmins() {
  await requireSuperAdmin();
  await dbConnect();
  // Exclude password hash; totpSecret already `select: false` so won't come back.
  const docs = await Admin.find({}, '-password')
    .sort({ createdAt: -1 })
    .lean();
  return serialize(docs);
}

export async function createAdmin({ email, password, name, role }) {
  await requireSuperAdmin();
  await dbConnect();

  const cleanEmail = String(email ?? '').trim().toLowerCase();
  const cleanName = String(name ?? '').trim();
  const cleanRole = VALID_ROLES.includes(role) ? role : 'admin';

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
    role: cleanRole,
    active: true,
  });

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function updateAdmin(id, { name, role, active }) {
  await requireSuperAdmin();
  await dbConnect();

  const update = {};
  if (typeof name === 'string') update.name = name.trim();
  if (VALID_ROLES.includes(role)) update.role = role;
  if (typeof active === 'boolean') update.active = active;

  // Don't let the LAST superadmin downgrade themselves into a lockout.
  if (update.role && update.role !== 'superadmin') {
    const target = await Admin.findById(id).lean();
    if (target && SUPERADMIN_ROLES.has(target.role)) {
      const remaining = await Admin.countDocuments({
        _id: { $ne: id },
        role: { $in: ['superadmin', 'owner'] },
        active: true,
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
    if (target && SUPERADMIN_ROLES.has(target.role)) {
      const remaining = await Admin.countDocuments({
        _id: { $ne: id },
        role: { $in: ['superadmin', 'owner'] },
        active: true,
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
  await requireSuperAdmin();
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
  const session = await requireSuperAdmin();
  await dbConnect();

  // Cannot delete self.
  if (String(session.user.id) === String(id)) {
    return { ok: false, error: 'ไม่สามารถลบบัญชีของตัวเองได้' };
  }

  const target = await Admin.findById(id).lean();
  if (!target) return { ok: false, error: 'ไม่พบบัญชี' };

  // Cannot delete the last active superadmin.
  if (SUPERADMIN_ROLES.has(target.role)) {
    const remaining = await Admin.countDocuments({
      _id: { $ne: id },
      role: { $in: ['superadmin', 'owner'] },
      active: true,
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
 * Self-service profile update — any logged-in admin can rename
 * themselves and rotate their password. Requires the current
 * password if rotating (defense against a stolen session cookie
 * silently changing the password).
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
