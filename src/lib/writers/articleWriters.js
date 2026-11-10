/**
 * An article's writers: the rules the form, the save path and the readers share.
 *
 * Pure, with no imports, so the client form and the test tier can use it. The
 * reads are handed in by the caller, as in lib/writers/writerPolicy.
 *
 * Reads are `.lean()`, so an article written before `writerIds` existed reads
 * back with the key absent. Everything here takes `undefined` as "none".
 */

export const NO_WRITER_MESSAGE = 'กรุณาเลือกผู้เขียนอย่างน้อย 1 คน';
export const LAST_WRITER_TOOLTIP = 'ต้องมีผู้เขียนอย่างน้อย 1 คน';
export const INVALID_WRITER_ID_MESSAGE = 'รหัสผู้เขียนไม่ถูกต้อง';

export const WRITER_NAME_SEPARATOR = ' & ';

/** Ids as strings, each once, keeping the first occurrence. */
export function dedupeIds(ids) {
  return [...new Set((ids ?? []).map(String))];
}

/** `found` in the order of `ids`. A database read comes back in its own order. */
export function orderWriters(ids, found) {
  const byId = new Map((found ?? []).map((writer) => [String(writer._id), writer]));
  return dedupeIds(ids).map((id) => byId.get(id)).filter(Boolean);
}

export function joinWriterNames(writers) {
  return (writers ?? [])
    .map((writer) => writer.displayName)
    .filter(Boolean)
    .join(WRITER_NAME_SEPARATOR);
}

/**
 * Which writers a save may store, in order.
 *
 * Only createArticle may arrive with none, and then it takes the default writer.
 * `found` holds the rows that exist, active or not.
 *
 * @returns {{ok: true, writers: object[]} | {ok: false, error: string}}
 */
export function planArticleWriters({ ids, found = [], defaultWriter = null, creating = false }) {
  const wanted = dedupeIds(ids);

  if (wanted.length === 0) {
    if (!creating) return { ok: false, error: NO_WRITER_MESSAGE };
    if (defaultWriter?.isActive === false || !defaultWriter) {
      return { ok: false, error: 'ไม่พบผู้เขียนเริ่มต้น — กรุณาเลือกผู้เขียน' };
    }
    return { ok: true, writers: [defaultWriter] };
  }

  const writers = orderWriters(wanted, found);
  if (writers.length !== wanted.length) {
    return { ok: false, error: 'ไม่พบผู้เขียนที่เลือก — กรุณาเลือกใหม่' };
  }
  const inactive = writers.find((writer) => writer.isActive === false);
  if (inactive) {
    return { ok: false, error: `ผู้เขียน "${inactive.displayName}" ถูกปิดใช้งานแล้ว — กรุณาเลือกคนอื่น` };
  }
  return { ok: true, writers };
}

/**
 * What an article card shows: up to two avatars and names, then a count of the rest.
 *
 * @returns {{shown: object[], label: string}}
 */
export function cardBylineParts(writers) {
  const list = writers ?? [];
  const shown = list.slice(0, 2);
  const more = list.length - shown.length;
  const names = joinWriterNames(shown);
  return { shown, label: more > 0 ? `${names} และอีก ${more} คน` : names };
}

/** Every distinct writer id across a list of articles, for one batched read. */
export function collectWriterIds(articles) {
  return dedupeIds((articles ?? []).flatMap((article) => article?.writerIds ?? []));
}

/** What the admin list shows: the writers' names, or the legacy `author` text. */
export function articleAuthorLabel(article, namesById = {}) {
  const names = dedupeIds(article?.writerIds).map((id) => namesById[id]).filter(Boolean);
  return names.length > 0 ? names.join(WRITER_NAME_SEPARATOR) : (article?.author ?? '');
}

/**
 * The rows the form opens with: the article's writers, or the default writer on
 * a new article and on one that has none yet, so that saving it binds it.
 */
export function initialArticleWriters(article, options) {
  const writers = orderWriters(article?.writerIds, options);
  if (writers.length > 0) return writers;
  const fallback = (options ?? []).find((writer) => writer.isDefault === true);
  return fallback ? [fallback] : [];
}

/** The picker's dropdown: active, not selected yet, matching the search. */
export function searchableWriters(options, selected, query = '') {
  const taken = new Set((selected ?? []).map((writer) => String(writer._id)));
  const term = String(query).trim().toLowerCase();
  return (options ?? []).filter((writer) => (
    writer.isActive !== false
    && !taken.has(String(writer._id))
    && (!term || `${writer.displayName} ${writer.role ?? ''}`.toLowerCase().includes(term))
  ));
}
