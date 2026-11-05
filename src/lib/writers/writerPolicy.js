/**
 * What may be done to a writer — decided here, written in the actions.
 *
 * A `'use server'` file may export only async functions, and its arguments
 * arrive from the browser, so the reads cannot be injected there. These take
 * them as `{ findWriter, countArticles }` instead, which lets the test tier run
 * every refusal without a database. test/fs/writerActionGuards proves each
 * action calls its check before it writes.
 *
 * Every check returns `{ ok: true, current }` or `{ ok: false, error }`.
 */

export const WRITER_REFUSALS = Object.freeze({
  notFound: 'ไม่พบผู้เขียน',
  slugLocked: 'เปลี่ยน URL (slug) ไม่ได้ — ตั้งได้ตอนสร้างเท่านั้น',
  defaultFlag: 'เปลี่ยนสถานะผู้เขียนหลักไม่ได้',
  defaultDeactivate: 'ปิดใช้งานผู้เขียนหลักไม่ได้ — เป็นผู้เขียนเริ่มต้นของบทความใหม่',
  defaultDelete: 'ลบผู้เขียนหลักไม่ได้ — เป็นผู้เขียนเริ่มต้นของบทความใหม่',
  deactivateWithArticles: (n) => `ปิดใช้งานไม่ได้ — ผู้เขียนนี้ยังมีบทความ ${n} รายการ`,
  deleteWithArticles: (n) => `ลบไม่ได้ — ผู้เขียนนี้ยังมีบทความ ${n} รายการ`,
});

const ID = /^[a-f\d]{24}$/i;

async function loadWriter(id, { findWriter }) {
  const key = String(id ?? '');
  if (!ID.test(key)) return null;
  return (await findWriter(key)) ?? null;
}

/**
 * The deactivation rule, shared by setWriterActive and updateWriter so a save
 * cannot do what the toggle was refused.
 *
 * ── THE ARTICLE REFUSAL IS TEMPORARY ───────────────────────────────────────
 * Round 3 replaces it with the transfer to 9Expert Academy. Until that flow
 * exists, deactivating a writer who has articles would strand them, so it is
 * refused. Articles have no `writerIds` yet, so the count is 0 today.
 */
async function refuseDeactivation(current, { countArticles }) {
  if (current.isDefault === true) return WRITER_REFUSALS.defaultDeactivate;
  const articles = await countArticles(String(current._id));
  return articles > 0 ? WRITER_REFUSALS.deactivateWithArticles(articles) : null;
}

export async function checkWriterUpdate(id, input, deps) {
  const current = await loadWriter(id, deps);
  if (!current) return { ok: false, error: WRITER_REFUSALS.notFound };

  // Read off the RAW input: the schema strips `isDefault`, so by the time it has
  // run, a request to unset the flag looks like a request that never mentioned it.
  const raw = input && typeof input === 'object' ? input : {};
  if ('slug' in raw && raw.slug !== current.slug) {
    return { ok: false, error: WRITER_REFUSALS.slugLocked, errors: { slug: WRITER_REFUSALS.slugLocked } };
  }
  if ('isDefault' in raw && raw.isDefault !== (current.isDefault === true)) {
    return { ok: false, error: WRITER_REFUSALS.defaultFlag };
  }
  if (raw.isActive === false && current.isActive !== false) {
    const refusal = await refuseDeactivation(current, deps);
    if (refusal) return { ok: false, error: refusal };
  }
  return { ok: true, current };
}

export async function checkSetWriterActive(id, active, deps) {
  const current = await loadWriter(id, deps);
  if (!current) return { ok: false, error: WRITER_REFUSALS.notFound };
  if (active !== true) {
    const refusal = await refuseDeactivation(current, deps);
    if (refusal) return { ok: false, error: refusal };
  }
  return { ok: true, current };
}

export async function checkDeleteWriter(id, deps) {
  const current = await loadWriter(id, deps);
  if (!current) return { ok: false, error: WRITER_REFUSALS.notFound };
  if (current.isDefault === true) return { ok: false, error: WRITER_REFUSALS.defaultDelete };
  const articles = await deps.countArticles(String(current._id));
  if (articles > 0) return { ok: false, error: WRITER_REFUSALS.deleteWithArticles(articles) };
  return { ok: true, current };
}

/**
 * Articles per writer, as one aggregate.
 *
 * AN AGGREGATE AND NOT `countDocuments`, on purpose: `writerIds` is not on the
 * Article schema until round 2, and a query filter on an undeclared path is only
 * kept while Mongoose's strictQuery stays off. If it were ever switched on, the
 * filter would vanish and every writer would count every article. A pipeline is
 * not filtered through the schema, so it cannot fail that way.
 *
 * @param {unknown[]} writerIds  ObjectIds, as stored
 */
export function writerArticleCountPipeline(writerIds) {
  return [
    { $match: { writerIds: { $in: writerIds } } },
    { $unwind: '$writerIds' },
    { $match: { writerIds: { $in: writerIds } } },
    { $group: { _id: '$writerIds', n: { $sum: 1 } } },
  ];
}
