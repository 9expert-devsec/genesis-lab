'use server';

/**
 * Writers — server actions for /admin/writers.
 *
 * What may happen to a writer is decided in lib/writers/writerPolicy, which is
 * pure and tested without a database. This file connects, reads, writes and
 * audits.
 *
 * `isDefault` is never written here. The default writer comes from
 * scripts/seed-default-writer.mjs, and writerSchema does not declare the field.
 */

import { revalidatePath } from 'next/cache';
import mongoose from 'mongoose';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { deleteFromCloudinary } from '@/lib/cloudinary';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import Instructor from '@/models/Instructor';
import Writer from '@/models/Writer';
import { listPrograms } from '@/lib/api/programs';
import { instructorProgramLinks, toProgramOptions } from '@/lib/instructors/instructorPrograms';
import { getPageLinkability } from '@/lib/resolvePageSlug';
import { writerFieldErrors, writerSchema } from '@/lib/schemas/writer';
import { searchTermPattern } from '@/lib/searchTerm';
import { WRITER_SECTION_KEYS, isWriterAvatarPublicId, normalizeWriter } from '@/lib/writers/writerFields';
import {
  checkDeleteWriter,
  checkSetWriterActive,
  checkWriterUpdate,
  writerArticleCountPipeline,
} from '@/lib/writers/writerPolicy';

const ADMIN_PATH = '/admin/writers';

function serialise(doc) {
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc));
}

/**
 * The fields the audit trail records.
 *
 * `bio` and the section lists go in as sizes: they are the part of a writer that
 * can pass the writer's 2 KB per-field cap, which would turn the row into a
 * truncation marker.
 */
function writerFields(doc) {
  if (!doc) return null;
  const writer = normalizeWriter(doc);
  return {
    slug: writer.slug,
    displayName: writer.displayName,
    type: writer.type,
    role: writer.role,
    bioChars: writer.bio.length,
    avatarPublicId: writer.avatarPublicId,
    socialLinks: writer.socialLinks.length,
    sections: Object.fromEntries(WRITER_SECTION_KEYS.map((key) => [key, writer.sections[key].length])),
    instructorId: writer.instructorId ? String(writer.instructorId) : null,
    isActive: writer.isActive,
    isDefault: writer.isDefault,
  };
}

async function countArticlesByWriter(ids) {
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(String(id)));
  if (objectIds.length === 0) return new Map();
  const rows = await Article.aggregate(writerArticleCountPipeline(objectIds));
  return new Map(rows.map((row) => [String(row._id), row.n]));
}

const POLICY_READS = {
  findWriter: (id) => Writer.findById(id).lean(),
  countArticles: async (id) => (await countArticlesByWriter([id])).get(id) ?? 0,
};

/** Refuses an instructor the form could not have offered: gone, inactive or unnamed. */
async function refuseInstructor(instructorId, currentId = null) {
  if (!instructorId || instructorId === String(currentId ?? '')) return null;
  const row = await Instructor.findById(instructorId).select('name is_active').lean();
  return row?.is_active === true && String(row.name ?? '').trim()
    ? null
    : 'ไม่พบวิทยากรที่เลือก หรือวิทยากรถูกปิดใช้งาน';
}

async function removeOldAvatar(previous, next) {
  if (previous && previous !== next && isWriterAvatarPublicId(previous)) {
    await deleteFromCloudinary(previous);
  }
}

export async function listWriters({ status = 'all', q = '' } = {}) {
  await requireAdmin('writers');
  await dbConnect();

  const inactive = { isActive: false };
  const active = { isActive: { $ne: false } };
  const [all, activeCount] = await Promise.all([
    Writer.countDocuments({}),
    Writer.countDocuments(active),
  ]);

  const filter = status === 'active' ? { ...active } : status === 'inactive' ? { ...inactive } : {};
  const term = searchTermPattern(q);
  if (term) {
    filter.$or = [
      { displayName: { $regex: term, $options: 'i' } },
      { slug: { $regex: term, $options: 'i' } },
    ];
  }

  const docs = await Writer.find(filter).sort({ isDefault: -1, displayName: 1 }).lean();
  const instructorIds = docs.map((d) => d.instructorId).filter(Boolean);
  const [articleCounts, instructors] = await Promise.all([
    countArticlesByWriter(docs.map((d) => d._id)),
    instructorIds.length
      ? Instructor.find({ _id: { $in: instructorIds } }).select('name').lean()
      : [],
  ]);
  const instructorNames = new Map(instructors.map((i) => [String(i._id), i.name]));

  return {
    counts: { all, active: activeCount, inactive: all - activeCount },
    rows: docs.map((doc) => {
      const writer = normalizeWriter(serialise(doc));
      return {
        _id: writer._id,
        slug: writer.slug,
        displayName: writer.displayName,
        type: writer.type,
        avatarPublicId: writer.avatarPublicId,
        isActive: writer.isActive,
        isDefault: writer.isDefault,
        instructorName: instructorNames.get(String(writer.instructorId)) ?? '',
        articleCount: articleCounts.get(writer._id) ?? 0,
      };
    }),
  };
}

export async function getWriter(id) {
  await requireAdmin('writers');
  const key = String(id ?? '');
  if (!mongoose.isValidObjectId(key)) return null;
  await dbConnect();

  const doc = await Writer.findById(key).lean();
  if (!doc) return null;
  const articleCounts = await countArticlesByWriter([key]);
  return { ...normalizeWriter(serialise(doc)), articleCount: articleCounts.get(key) ?? 0 };
}

/**
 * The instructors the form may offer, each with its program links.
 *
 * Active rows only: the MSDB-synced rows are inactive and have blank names.
 * `currentId` keeps an already-linked instructor listed after it is disabled,
 * because a dropdown that cannot show the stored value would save it as ไม่ผูก.
 *
 * The upstream /programs read is best-effort, like /about-us: without it the
 * chips are empty and the dropdown still works.
 */
export async function listInstructorOptions(currentId = null) {
  await requireAdmin('writers');
  await dbConnect();

  const include = mongoose.isValidObjectId(currentId) ? [{ _id: currentId }] : [];
  const [rows, programsResp, linkability] = await Promise.all([
    Instructor.find({ $or: [{ is_active: true }, ...include] })
      .sort({ display_order: 1 })
      .select('name programs is_active')
      .lean(),
    listPrograms().catch(() => null),
    getPageLinkability(),
  ]);
  const options = toProgramOptions(programsResp?.items);

  return rows
    .filter((row) => String(row.name ?? '').trim())
    .map((row) => ({
      id: String(row._id),
      name: row.name,
      active: row.is_active === true,
      programs: instructorProgramLinks(row.programs, options, linkability),
    }));
}

export async function createWriter(input) {
  const session = await requireAdmin('writers');
  await dbConnect();

  const parsed = writerSchema.safeParse(input);
  if (!parsed.success) {
    const errors = writerFieldErrors(parsed.error);
    return { ok: false, error: Object.values(errors)[0], errors };
  }

  const instructorRefusal = await refuseInstructor(parsed.data.instructorId);
  if (instructorRefusal) return { ok: false, error: instructorRefusal };

  try {
    const doc = await Writer.create({ ...parsed.data, isActive: parsed.data.isActive !== false });

    revalidatePath(ADMIN_PATH);

    recordAdminActionAfter({
      menu: 'writers',
      action: 'create',
      entity: 'writer',
      recordId: String(doc._id),
      recordLabel: doc.displayName ?? '',
      after: writerFields(doc.toObject()),
      actor: { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, id: String(doc._id) };
  } catch (err) {
    if (err?.code === 11000) {
      const message = 'slug นี้ถูกใช้แล้ว';
      return { ok: false, error: message, errors: { slug: message } };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateWriter(id, input) {
  const session = await requireAdmin('writers');
  await dbConnect();

  const check = await checkWriterUpdate(id, input, POLICY_READS);
  if (!check.ok) return check;
  const { current } = check;

  const parsed = writerSchema.safeParse({ ...input, slug: current.slug });
  if (!parsed.success) {
    const errors = writerFieldErrors(parsed.error);
    return { ok: false, error: Object.values(errors)[0], errors };
  }

  const instructorRefusal = await refuseInstructor(parsed.data.instructorId, current.instructorId);
  if (instructorRefusal) return { ok: false, error: instructorRefusal };

  // The slug never leaves this function: the check above only proved it is
  // unchanged, and leaving it out of $set is what makes it locked.
  const { slug: _slug, isActive, ...fields } = parsed.data;
  const $set = isActive === undefined ? fields : { ...fields, isActive };

  try {
    const doc = await Writer.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true }).lean();
    if (!doc) return { ok: false, error: 'ไม่พบผู้เขียน' };

    // Only after the row is durable, so a failed write never leaves it pointing
    // at a deleted image.
    await removeOldAvatar(current.avatarPublicId, doc.avatarPublicId);

    revalidatePath(ADMIN_PATH);

    recordAdminActionAfter({
      menu: 'writers',
      action: 'update',
      entity: 'writer',
      recordId: String(doc._id),
      recordLabel: doc.displayName ?? '',
      before: writerFields(current),
      after: writerFields(doc),
      actor: { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function setWriterActive(id, active) {
  const session = await requireAdmin('writers');
  await dbConnect();

  const next = active === true;
  const check = await checkSetWriterActive(id, next, POLICY_READS);
  if (!check.ok) return check;
  const { current } = check;

  await Writer.findByIdAndUpdate(id, { $set: { isActive: next } });

  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu: 'writers',
    action: next ? 'activate' : 'deactivate',
    entity: 'writer',
    recordId: String(current._id),
    recordLabel: current.displayName ?? '',
    before: { isActive: current.isActive !== false },
    after: { isActive: next },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}

export async function deleteWriter(id) {
  const session = await requireAdmin('writers');
  await dbConnect();

  const check = await checkDeleteWriter(id, POLICY_READS);
  if (!check.ok) return check;
  const { current } = check;

  await Writer.findByIdAndDelete(id);
  await removeOldAvatar(current.avatarPublicId, '');

  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu: 'writers',
    action: 'delete',
    entity: 'writer',
    recordId: String(current._id),
    recordLabel: current.displayName ?? '',
    before: writerFields(current),
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}
