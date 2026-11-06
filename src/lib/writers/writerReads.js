import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db/connect';
import Writer from '@/models/Writer';
import { collectWriterIds, dedupeIds, orderWriters } from '@/lib/writers/articleWriters';

/**
 * Writer reads for article surfaces.
 *
 * Not a 'use server' file: the public article page needs these, and an action
 * here would be a public POST endpoint. Each caller is a server component behind
 * its own page guard, or a save action past requireAdmin('articles').
 */

const BYLINE_FIELDS = 'slug displayName type avatarPublicId';
const OPTION_FIELDS = `${BYLINE_FIELDS} role isActive isDefault`;

const toPlain = (docs) => JSON.parse(JSON.stringify(docs));
const validIds = (ids) => dedupeIds(ids).filter((id) => mongoose.isValidObjectId(id));

/** The writers of one article, in byline order. An article with none costs no read. */
export async function readWritersByIds(ids) {
  const wanted = validIds(ids);
  if (wanted.length === 0) return [];
  await dbConnect();
  const docs = await Writer.find({ _id: { $in: wanted } }).select(BYLINE_FIELDS).lean();
  return toPlain(orderWriters(wanted, docs));
}

/** id → displayName for a page of articles, in one read rather than one per row. */
export async function readWriterNames(articles) {
  const wanted = validIds(collectWriterIds(articles));
  if (wanted.length === 0) return {};
  await dbConnect();
  const docs = await Writer.find({ _id: { $in: wanted } }).select('displayName').lean();
  return Object.fromEntries(docs.map((writer) => [String(writer._id), writer.displayName]));
}

/**
 * What the article form's picker offers: every active writer, plus any writer
 * already on this article, so a row can still be drawn for one that was since
 * switched off.
 */
export async function readWriterOptions(selectedIds) {
  await dbConnect();
  const docs = await Writer.find({
    $or: [{ isActive: { $ne: false } }, { _id: { $in: validIds(selectedIds) } }],
  })
    .select(OPTION_FIELDS)
    .sort({ isDefault: -1, displayName: 1 })
    .lean();
  return toPlain(docs);
}

/** The rows a save has to check: found or not, active or not. */
export async function readWritersForSave(ids) {
  const wanted = validIds(ids);
  if (wanted.length === 0) return [];
  return Writer.find({ _id: { $in: wanted } }).select('displayName isActive').lean();
}

export async function readDefaultWriter() {
  return Writer.findOne({ isDefault: true }).select('displayName isActive').lean();
}
