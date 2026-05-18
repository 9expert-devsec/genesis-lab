/**
 * Read-side helpers for the Faq collection.
 *
 * All reads come from MongoDB — never the upstream API. The cron + admin
 * sync paths are responsible for keeping the collection fresh; everything
 * else (public /faq page, admin UI) reads here.
 */

import { dbConnect } from '@/lib/db/connect';
import Faq from '@/models/Faq';

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function effectiveCategory(doc) {
  return doc?.category_override ?? doc?.upstream_category ?? 'ทั่วไป';
}

/**
 * Active FAQs for the public /faq page, grouped by effective category.
 * effectiveCategory = category_override ?? upstream_category ?? 'ทั่วไป'
 * Sorted by display_order ASC; group insertion order matches the first-seen
 * row for that category (so reordering rows also reorders the groups).
 */
export async function getActiveFaqsGrouped() {
  await dbConnect();
  const docs = await Faq.find({ is_active: true })
    .sort({ display_order: 1 })
    .lean();

  const groups = {};
  for (const doc of docs) {
    const cat = effectiveCategory(doc);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(doc);
  }
  return serialize(groups);
}

/** All FAQs (active + inactive) for the admin list. */
export async function getAllFaqs() {
  await dbConnect();
  const docs = await Faq.find({}).sort({ display_order: 1 }).lean();
  return serialize(docs);
}

/** Distinct effective categories across all FAQs (admin filter source). */
export async function getFaqCategories() {
  await dbConnect();
  const docs = await Faq.find(
    {},
    { upstream_category: 1, category_override: 1 }
  ).lean();
  const cats = new Set(docs.map(effectiveCategory));
  return [...cats].sort();
}