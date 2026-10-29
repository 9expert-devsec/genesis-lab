'use server';

/**
 * Custom PRIVATE programs and skills — the admin catalogue at
 * /admin/courses/private-taxonomy.
 *
 * GENESIS-ONLY. These three call the private_taxonomy store and the audit log
 * and nothing that writes upstream: no msdbCreate/msdbUpdate/msdbDelete, no
 * aiFetch, no upstream tag bust. test/fs/privateCourseNoMsdb pins each body's
 * calls against an allowlist.
 *
 * `requireAdmin('courses')` — the menu the private course actions use, since
 * this catalogue exists only to serve them. Audit rows use the
 * `courses`/`private_taxonomy` pair (lib/audit/auditContract).
 */

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import {
  validateTaxonomyInput,
  insertTaxonomyItem,
  updateTaxonomyItem,
  removeTaxonomyItem,
  getTaxonomyItem,
  coursesReferencingTaxonomy,
  taxonomyDeleteRefusal,
} from '@/lib/courses/privateTaxonomyStore';

const PAGE_PATH = '/admin/courses/private-taxonomy';

function fields(item) {
  return {
    kind: item?.kind ?? '',
    name: item?.name ?? '',
    logoUrl: item?.logoUrl ?? '',
    color: item?.color ?? '',
  };
}

function plain(item) {
  return item ? { ...fields(item), _id: String(item._id) } : null;
}

export async function createPrivateTaxonomyItem(input) {
  const session = await requireAdmin('courses');
  const checked = validateTaxonomyInput(input);
  if (!checked.ok) return checked;
  try {
    const item = await insertTaxonomyItem(checked.value);
    revalidatePath(PAGE_PATH);
    recordAdminActionAfter({
      menu:        'courses',
      action:      'create',
      entity:      'private_taxonomy',
      recordId:    String(item?._id ?? ''),
      recordLabel: `${checked.value.kind}: ${checked.value.name}`,
      after:       fields(item),
      actor:       { id: session.user?.id, name: session.user?.name },
    });
    return { ok: true, item: plain(item) };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updatePrivateTaxonomyItem(id, input) {
  const session = await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing id' };
  try {
    const before = await getTaxonomyItem(id);
    if (!before) return { ok: false, error: 'ไม่พบรายการนี้' };
    // The kind is fixed at creation; validate against it, not the request.
    const checked = validateTaxonomyInput({ ...input, kind: before.kind });
    if (!checked.ok) return checked;
    const item = await updateTaxonomyItem(id, checked.value);
    revalidatePath(PAGE_PATH);
    recordAdminActionAfter({
      menu:        'courses',
      action:      'update',
      entity:      'private_taxonomy',
      recordId:    String(id),
      recordLabel: `${item?.kind}: ${item?.name}`,
      before:      fields(before),
      after:       fields(item),
      actor:       { id: session.user?.id, name: session.user?.name },
    });
    return { ok: true, item: plain(item) };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

/**
 * REFUSES while any private course still points at the item, naming each one
 * (code + name). No cascade — the admin re-points those courses first.
 */
export async function deletePrivateTaxonomyItem(id) {
  const session = await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing id' };
  try {
    const refusal = taxonomyDeleteRefusal(await coursesReferencingTaxonomy(id));
    if (refusal) return refusal;
    const removed = await removeTaxonomyItem(id);
    if (!removed) return { ok: false, error: 'ไม่พบรายการนี้' };
    revalidatePath(PAGE_PATH);
    recordAdminActionAfter({
      menu:        'courses',
      action:      'delete',
      entity:      'private_taxonomy',
      recordId:    String(id),
      recordLabel: `${removed.kind}: ${removed.name}`,
      before:      fields(removed),
      actor:       { id: session.user?.id, name: session.user?.name },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบไม่สำเร็จ' };
  }
}
