import mongoose from 'mongoose';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import Instructor from '@/models/Instructor';
import Writer from '@/models/Writer';
import { PUBLIC_ARTICLE_FILTER } from '@/lib/articleListFields';
import { collectWriterIds, dedupeIds, orderWriters } from '@/lib/writers/articleWriters';
import { normalizeWriter } from '@/lib/writers/writerFields';
import { writerArticleCountPipeline } from '@/lib/writers/writerPolicy';
import { planWriterList } from '@/lib/writers/writerProfile';

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
 * Articles with their writers attached, for a page of cards: ONE read for the
 * whole page, however many cards it holds.
 *
 * Best-effort. A card without a byline is a better page than a failed one, so a
 * read that fails returns the articles with no writers.
 */
export async function withCardWriters(articles) {
  const list = articles ?? [];
  const wanted = validIds(collectWriterIds(list));
  if (wanted.length === 0) return list.map((article) => ({ ...article, writers: [] }));
  try {
    await dbConnect();
    const docs = toPlain(await Writer.find({ _id: { $in: wanted } }).select(BYLINE_FIELDS).lean());
    return list.map((article) => ({ ...article, writers: orderWriters(article.writerIds, docs) }));
  } catch {
    return list.map((article) => ({ ...article, writers: [] }));
  }
}

/** Who /writer lists, each with a published-article count. Also feeds the sitemap. */
export async function readPublicWriters() {
  await dbConnect();
  const writers = await Writer.find({ isActive: { $ne: false } })
    .select(`${BYLINE_FIELDS} role isActive isDefault updatedAt`)
    .lean();
  const rows = writers.length === 0 ? [] : await Article.aggregate(
    writerArticleCountPipeline(writers.map((writer) => writer._id), PUBLIC_ARTICLE_FILTER),
  );
  const counts = new Map(rows.map((row) => [String(row._id), row.n]));
  return toPlain(planWriterList(writers, counts));
}

/** One writer by address, active or not: the route decides what inactive means. */
export async function readWriterBySlug(slug) {
  await dbConnect();
  const doc = await Writer.findOne({ slug: String(slug) }).lean();
  return doc ? normalizeWriter(toPlain(doc)) : null;
}

/** The instructor behind a profile, or null when none is linked or it is disabled. */
export async function readProfileInstructor(instructorId) {
  if (!instructorId || !mongoose.isValidObjectId(instructorId)) return null;
  await dbConnect();
  const row = await Instructor.findById(instructorId).lean();
  return row?.is_active === true ? toPlain(row) : null;
}

/** Every article on a writer, for planning a transfer. Runs inside its transaction. */
export async function readArticlesForTransfer(writerId, session = null) {
  return Article.find({ writerIds: writerId }).select('slug writerIds').session(session).lean();
}

/** Display names for an article's other writers. */
export async function readWriterRows(ids, session = null) {
  const wanted = validIds(ids);
  if (wanted.length === 0) return [];
  return Writer.find({ _id: { $in: wanted } }).select('displayName').session(session).lean();
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
  return Writer.findOne({ isDefault: true }).select('slug displayName avatarPublicId isActive').lean();
}
