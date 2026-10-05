/**
 * Legacy Drupal tag URLs (`/tags/<slug>`) → a Genesis article tag.
 *
 * Drupal built the slug from the tag's display string: lowercased, spaces to
 * hyphens, some punctuation dropped (`C#` → `c`), and a few tags carried a
 * leading U+00A0 that survives as `%c2%a0`. Genesis stores the display string
 * itself on `articles.tags` (`การใช้สูตร Excel`) and filters on it exactly
 * (`/articles?tag=…`). Neither side can be turned into the other, so both are
 * reduced to one comparison KEY and matched on that.
 *
 * PURE: no db, no env. The route caches the tag list; this only compares.
 */

/**
 * Space-like code points spelled out alongside `\s` (which already covers most
 * of them in modern engines — listed so the intent does not rest on that):
 * NBSP, ogham space, U+2000-U+200B (en/em/thin/zero-width spaces), line and
 * paragraph separators, narrow NBSP, medium math space, ideographic space, BOM.
 * Built from code points so no invisible character sits in the source.
 */
const EXTRA_SPACES = [0x00a0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]
  .concat(Array.from({ length: 0x200b - 0x2000 + 1 }, (_, i) => 0x2000 + i))
  .map((c) => String.fromCharCode(c))
  .join('');

/** Whitespace of every kind, hyphens, underscores, and the listed ASCII punctuation. */
const STRIP_RE = new RegExp(String.raw`[\s${EXTRA_SPACES}\-_#.+&/'"():,]`, 'gu');

/** Runs of whitespace / hyphens / underscores, for the free-text form. */
const SPACING_RE = new RegExp(String.raw`[\s${EXTRA_SPACES}\-_]+`, 'gu');

/** decodeURIComponent that keeps the raw string when the sequence is malformed. */
export function safeDecode(value) {
  const s = String(value ?? '');
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * The comparison key for a tag string or a legacy slug:
 * percent-decode (malformed → raw) → NFC → lowercase → strip whitespace,
 * hyphens, underscores and `# . + & / ' " ( ) : ,`. Thai, Latin and digits survive.
 */
export function normalizeTagKey(value) {
  return safeDecode(value).normalize('NFC').toLowerCase().replace(STRIP_RE, '');
}

/**
 * key → winning tag. When several tags reduce to one key, the tag on the most
 * active articles wins; a tie goes to the alphabetically first (code-point
 * order, so the result does not depend on the runtime's locale data).
 *
 * @param {Array<{ tag: string, count: number }>} tagCounts
 * @returns {Map<string, { tag: string, count: number, candidates: string[] }>}
 */
export function buildTagIndex(tagCounts) {
  const groups = new Map();
  for (const { tag, count } of tagCounts ?? []) {
    const key = normalizeTagKey(tag);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ tag, count: Number(count) || 0 });
  }
  const index = new Map();
  for (const [key, list] of groups) {
    list.sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    index.set(key, { tag: list[0].tag, count: list[0].count, candidates: list.map((x) => x.tag) });
  }
  return index;
}

/**
 * Resolve a `/tags/<slug>` segment (raw, possibly percent-encoded) against an
 * index from buildTagIndex. `null` when nothing matches.
 */
export function resolveLegacyTag(slug, index) {
  const key = normalizeTagKey(slug);
  if (!key) return null;
  return index.get(key) ?? null;
}

/**
 * The slug as free text: decoded, hyphens/underscores and every space-like
 * character turned into a single space, trimmed. For a search fallback.
 */
export function legacySlugToText(slug) {
  return safeDecode(slug)
    .normalize('NFC')
    .replace(SPACING_RE, ' ')
    .trim();
}
