/**
 * Read-side helpers for the CareerPath collection.
 *
 * All reads come from MongoDB — never the upstream API. The cron + admin
 * sync paths are responsible for keeping the collection fresh; everything
 * else (public landing, detail page, admin UI) reads here.
 */

import { dbConnect } from '@/lib/db/connect';
import CareerPath from '@/models/CareerPath';

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/** Active career paths for the public /career-path-project landing. */
export async function getActiveCareerPaths() {
  await dbConnect();
  const docs = await CareerPath.find({ is_active: true })
    .sort({ display_order: 1 })
    .lean();
  return serialize(docs);
}

/**
 * Resolve a single (active) career path by slug for the detail page.
 *
 * The upstream slug already includes the `-career-path` suffix
 * (e.g. "prompt-engineer-career-path"). We accept either the full
 * suffixed slug or a bare slug — both forms are tried so callers don't
 * have to think about it.
 */
export async function getCareerPathBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim();
  if (!clean) return null;

  await dbConnect();
  const candidates = new Set([
    clean,
    clean.endsWith('-career-path') ? clean : `${clean}-career-path`,
    clean.replace(/-career-path$/, ''),
  ]);

  const doc = await CareerPath.findOne({
    api_slug: { $in: [...candidates] },
    is_active: true,
  }).lean();
  return serialize(doc);
}

/** All career paths (active + inactive) for the admin list. */
export async function getAllCareerPaths() {
  await dbConnect();
  const docs = await CareerPath.find({}).sort({ display_order: 1 }).lean();
  return serialize(docs);
}