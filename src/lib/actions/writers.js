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

import { revalidatePath, revalidateTag } from 'next/cache';
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
  WRITER_REFUSALS,
  checkDeleteWriter,
  checkSetWriterActive,
  checkWriterUpdate,
  writerArticleCountPipeline,
} from '@/lib/writers/writerPolicy';
import { readArticlesForTransfer, readDefaultWriter, readWriterRows } from '@/lib/writers/writerReads';
import { collectWriterIds } from '@/lib/writers/articleWriters';
import { planWriterTransfer, transferArticlePaths, transferBulkOps } from '@/lib/writers/writerTransfer';
import { DEFAULT_WRITER_PATH, WRITER_LIST_PATH, writerPath } from '@/lib/writers/writerUrls';

const ADMIN_PATH = '/admin/writers';
const ADMIN_ARTICLES_PATH = '/admin/articles';
const PUBLIC_ARTICLES_PATH = '/articles';

function bustWriterCaches(slug) {
  revalidatePath(ADMIN_PATH);
  revalidatePath(WRITER_LIST_PATH);
  if (slug) revalidatePath(writerPath(slug));
}

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
    await deleteFromCloudinary(previous, { resourceType: 'image' });
  }
}

/**
 * Remove an avatar that a failed save uploaded and no row points at.
 *
 * The id comes from the browser, so it must be a writer avatar and no writer may
 * be using it. That second check also covers a save that reached the database
 * and lost its response on the way back: the "failed" upload is in use by then.
 */
export async function discardWriterAvatarUpload(publicId) {
  await requireAdmin('writers');
  if (!isWriterAvatarPublicId(publicId)) return { ok: false, error: 'รหัสรูปไม่ถูกต้อง' };
  await dbConnect();
  if (await Writer.exists({ avatarPublicId: publicId })) {
    return { ok: false, error: 'รูปนี้ถูกใช้งานอยู่' };
  }
  await removeOldAvatar(publicId, '');
  return { ok: true };
}

/**
 * What deactivating this writer would do, for the dialog. Counts only: the action
 * recounts when it runs.
 */
export async function getWriterDeactivationPreview(id) {
  await requireAdmin('writers');
  await dbConnect();

  const check = await checkSetWriterActive(id, false, POLICY_READS);
  if (!check.ok) return check;

  const academy = await readDefaultWriter();
  if (!academy || academy.isActive === false) {
    return { ok: false, error: WRITER_REFUSALS.noTransferTarget };
  }
  const articles = await readArticlesForTransfer(check.current._id);
  const plan = planWriterTransfer({ writerId: check.current._id, academy, articles });
  return {
    ok: true,
    total: plan.writes.length,
    sole: plan.sole,
    coWritten: plan.coWritten,
    academy: serialise({ displayName: academy.displayName, avatarPublicId: academy.avatarPublicId ?? '' }),
  };
}

/**
 * Move a writer's articles to 9Expert Academy, then switch the writer off.
 *
 * ONE TRANSACTION. The deployment is a replica set, and the registration routes
 * already rely on that: on anything else `withTransaction` throws, the action
 * reports the error, and nothing is written. Articles are written before the
 * writer, so the writer is only ever inactive with nothing left on it.
 *
 * The read happens inside, which is the recount: this works from what the
 * articles say now, not from what the dialog showed. `withTransaction` may run the
 * callback again on a transient error, so `plan` is reassigned on each run.
 */
async function transferArticlesAndDeactivate(current) {
  const academy = await readDefaultWriter();
  if (!academy || academy.isActive === false) {
    return { ok: false, error: WRITER_REFUSALS.noTransferTarget };
  }

  let plan = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const articles = await readArticlesForTransfer(current._id, session);
      const coWriters = await readWriterRows(collectWriterIds(articles), session);
      plan = planWriterTransfer({ writerId: current._id, academy, articles, coWriters });

      if (plan.writes.length > 0) {
        const result = await Article.bulkWrite(transferBulkOps(plan, current._id), {
          session,
          ordered: true,
          timestamps: false,
        });
        // An article that changed since the read matched no filter. Aborting
        // leaves everything as it was, and the writer still active.
        if (result.modifiedCount !== plan.writes.length) {
          throw new Error(WRITER_REFUSALS.transferConflict);
        }
      }

      await Writer.updateOne({ _id: current._id }, { $set: { isActive: false } }, { session });
    });
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  } finally {
    await session.endSession();
  }

  return { ok: true, plan };
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

    bustWriterCaches(doc.slug);

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

    bustWriterCaches(doc.slug);

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

  // Reactivating moves nothing back: what was transferred stays with Academy.
  let plan = null;
  if (next) {
    await Writer.findByIdAndUpdate(id, { $set: { isActive: true } });
  } else {
    const transfer = await transferArticlesAndDeactivate(current);
    if (!transfer.ok) return transfer;
    plan = transfer.plan;
  }

  bustWriterCaches(current.slug);
  if (plan) {
    const { paths, wholeRoute } = transferArticlePaths(plan);
    revalidateTag('articles');
    revalidatePath(ADMIN_ARTICLES_PATH);
    revalidatePath(PUBLIC_ARTICLES_PATH);
    revalidatePath(DEFAULT_WRITER_PATH);
    if (wholeRoute) revalidatePath(`${PUBLIC_ARTICLES_PATH}/[slug]`, 'page');
    paths.forEach((path) => revalidatePath(path));
  }

  // One row for the one thing the admin did: the articles are counted, not listed.
  recordAdminActionAfter({
    menu: 'writers',
    action: next ? 'activate' : 'deactivate',
    entity: 'writer',
    recordId: String(current._id),
    recordLabel: current.displayName ?? '',
    before: { isActive: current.isActive !== false },
    after: { isActive: next },
    ...(plan ? { meta: { alsoTouched: plan.writes.length, sole: plan.sole, coWritten: plan.coWritten } } : {}),
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

  bustWriterCaches(current.slug);

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
