'use server';

/**
 * Server actions for the Faq collection.
 *
 * Reads are public; writes require an authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Faq from '@/models/Faq';
import { auth } from '@/lib/auth/options';
import { syncFaqs } from '@/lib/faqs/syncFaqs';

const ADMIN_PATH  = '/admin/faqs';
const PUBLIC_PATH = '/faq';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

export async function toggleFaqActive(faqId, isActive) {
  await requireAdmin();
  await dbConnect();

  if (!faqId) return { ok: false, error: 'Missing faq_id' };

  await Faq.findOneAndUpdate(
    { faq_id: faqId },
    { $set: { is_active: Boolean(isActive) } }
  );
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true };
}

/**
 * Persist a new ordering. `orderedIds` is an array of faq_id values
 * in the desired display order. Each row's display_order is set to its
 * index in the array.
 */
export async function updateFaqOrder(orderedIds) {
  await requireAdmin();
  await dbConnect();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds must be a non-empty array' };
  }

  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { faq_id: String(id) },
      update: { $set: { display_order: index } },
    },
  }));
  await Faq.bulkWrite(ops);
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true };
}

/**
 * Override (or clear) the category label for one FAQ.
 * Empty / null / whitespace → clears the override (use upstream_category).
 */
export async function updateFaqCategoryOverride(faqId, categoryOverride) {
  await requireAdmin();
  await dbConnect();

  if (!faqId) return { ok: false, error: 'Missing faq_id' };

  const trimmed = typeof categoryOverride === 'string'
    ? categoryOverride.trim()
    : '';
  const value = trimmed.length > 0 ? trimmed : null;

  await Faq.findOneAndUpdate(
    { faq_id: faqId },
    { $set: { category_override: value } }
  );
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return { ok: true };
}

export async function syncFaqsAction() {
  await requireAdmin();
  const result = await syncFaqs();
  revalidatePath(ADMIN_PATH);
  revalidatePath(PUBLIC_PATH);
  return result;
}