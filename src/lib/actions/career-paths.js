'use server';

/**
 * Server actions for the CareerPath collection.
 *
 * Reads are public; writes require an authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CareerPath from '@/models/CareerPath';
import { auth } from '@/lib/auth/options';
import { syncCareerPaths } from '@/lib/career-paths/syncCareerPaths';

const ADMIN_PATH  = '/admin/career-paths';
const PUBLIC_PATH = '/career-path-project';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

export async function toggleCareerPathActive(careerPathId, isActive) {
  await requireAdmin();
  await dbConnect();

  if (!careerPathId) return { ok: false, error: 'Missing career_path_id' };

  await CareerPath.findOneAndUpdate(
    { career_path_id: careerPathId },
    { $set: { is_active: Boolean(isActive) } }
  );
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  revalidatePath('/[...slug]', 'page');
  return { ok: true };
}

/**
 * Persist a new ordering. `orderedIds` is an array of career_path_id
 * values in the desired display order. Each row's display_order is set
 * to its index in the array.
 */
export async function updateCareerPathOrder(orderedIds) {
  await requireAdmin();
  await dbConnect();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds must be a non-empty array' };
  }

  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { career_path_id: String(id) },
      update: { $set: { display_order: index } },
    },
  }));
  await CareerPath.bulkWrite(ops);
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true };
}

export async function syncCareerPathsAction() {
  await requireAdmin();
  const result = await syncCareerPaths();
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  revalidatePath('/[...slug]', 'page');
  return result;
}