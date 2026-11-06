import { DEFAULT_WRITER_SLUG } from './defaultWriter.js';

/**
 * The legacy `author` text → writer slug, for scripts/migrate-article-writers.mjs.
 *
 * Exact values, taken from the distinct `author` strings in the collection. A
 * value not listed here is reported and skipped: an article is never given a
 * writer on a guess.
 */
export const ARTICLE_AUTHOR_TO_WRITER = Object.freeze(new Map([
  ['9Expert Team', DEFAULT_WRITER_SLUG],
  ['9Expert-Team', DEFAULT_WRITER_SLUG],
  ['9Expert Academy', DEFAULT_WRITER_SLUG],
  ['9Expert Academic', DEFAULT_WRITER_SLUG],
  ['9Expert Training', DEFAULT_WRITER_SLUG],
  ['9Expert News', DEFAULT_WRITER_SLUG],
  ['ชไลเวท พิพัฒพรรณวงศ์ (อ.เวท)', 'chalaivate'],
]));

/** The slugs the migration needs. It aborts unless each is present and active. */
export const MIGRATION_WRITER_SLUGS = Object.freeze([...new Set(ARTICLE_AUTHOR_TO_WRITER.values())]);

export const BLANK_AUTHOR_LABEL = '(empty / missing)';

const isBlank = (author) => !String(author ?? '').trim();

/** A slug, or null for a value the table does not know. */
export function writerSlugForAuthor(author) {
  if (isBlank(author)) return DEFAULT_WRITER_SLUG;
  return ARTICLE_AUTHOR_TO_WRITER.get(author) ?? null;
}

/**
 * Decide every article's fate. Writes nothing.
 *
 * @param {Array<{_id, author?, active?, writerIds?}>} articles
 * @param {Map<string, *>} writerIdBySlug
 */
export function planArticleWriterMigration(articles, writerIdBySlug) {
  const mapped = new Map();
  const unmapped = new Map();
  const writes = [];
  let alreadySet = 0;

  for (const article of articles) {
    if ((article.writerIds?.length ?? 0) > 0) {
      alreadySet += 1;
      continue;
    }

    const slug = writerSlugForAuthor(article.author);
    if (!slug) {
      const row = unmapped.get(article.author) ?? { author: article.author, ids: [] };
      row.ids.push(article._id);
      unmapped.set(article.author, row);
      continue;
    }

    const label = isBlank(article.author) ? BLANK_AUTHOR_LABEL : article.author;
    const row = mapped.get(label) ?? { author: label, slug, active: 0, inactive: 0 };
    row[article.active === false ? 'inactive' : 'active'] += 1;
    mapped.set(label, row);
    writes.push({ _id: article._id, writerId: writerIdBySlug.get(slug) });
  }

  return { alreadySet, mapped: [...mapped.values()], unmapped: [...unmapped.values()], writes };
}
