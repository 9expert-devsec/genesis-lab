/**
 * Career-path outline PDF — the ONE place the filename comes from.
 *
 * ── THE SHAPE ────────────────────────────────────────────────────────────────
 *   /files/course-outline/career-<slugKey>-course-outline-<lang>.pdf
 *
 * Same category as the course outlines, on purpose: round OUT-RDR shipped the
 * ten existing career-path outlines under exactly this name, with 307
 * redirects (src/lib/legacyOutlineRedirects.mjs) pointing at them, and the
 * `/files/` rewrite serves the category by pattern with no function in the
 * path. A `career-path/` category would strand those files and their
 * redirects. The `career-` prefix is what keeps a career path from ever
 * colliding with a course whose course_id happens to equal its slug.
 *
 * ── slugKey, NOT api_slug ────────────────────────────────────────────────────
 * Upstream `slug` already carries the `-career-path` suffix
 * (`rpa-developer-career-path`); the file is named for the part before it.
 * The key passes through lib/files/pathKey's rule — lowercase `[a-z0-9-]` —
 * which is the same rule course_id and the catalog keys obey, so every
 * `/files/` filename in the app is derivable from one alphabet.
 *
 * ── WHY NO OVERRIDE MAP HERE ─────────────────────────────────────────────────
 * One of the ten files (data-engineer-bi) was uploaded under the old Drupal
 * name rather than its slug. scripts/repoint-career-path-outlines.mjs carries
 * that as an explicit one-row override so the LINK can point at the file that
 * exists; this module does not, because an upload must land at the derived
 * name or the derivation stops being the rule. Uploading a new outline for
 * that path writes the slug-derived file and moves the link; the old asset
 * stays (nothing is ever deleted).
 */
import { normaliseKeyForPath } from '@/lib/files/pathKey';

/** The `/files/<category>` segment — shared with course outlines, see above. */
export const CAREER_OUTLINE_CATEGORY = 'course-outline';

/** The filename prefix that separates a career path from a course. */
export const CAREER_OUTLINE_PREFIX = 'career-';

export const CAREER_OUTLINE_LANGS = Object.freeze(['th', 'en']);

const SUFFIX = '-career-path';

export function isCareerOutlineLang(lang) {
  return CAREER_OUTLINE_LANGS.includes(String(lang ?? '').toLowerCase());
}

/**
 * `api_slug` → the key the filename embeds. Strips the `-career-path` suffix
 * (once, and only at the end) and validates through the shared path-key rule.
 *
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
export function careerOutlineSlugKey(apiSlug) {
  const raw = String(apiSlug ?? '').trim().toLowerCase();
  const stripped = raw.endsWith(SUFFIX) ? raw.slice(0, -SUFFIX.length) : raw;
  return normaliseKeyForPath(stripped, { label: 'slug', noun: 'slug ของ Career Path' });
}

export function careerOutlineFileName(slugKey, lang) {
  return `${CAREER_OUTLINE_PREFIX}${slugKey}-course-outline-${String(lang).toLowerCase()}.pdf`;
}

export function careerOutlinePublicPath(slugKey, lang) {
  return `/files/${CAREER_OUTLINE_CATEGORY}/${careerOutlineFileName(slugKey, lang)}`;
}

/**
 * Is this stored value one of OUR download paths? Anything else is an external
 * paste (a `9exp.link` or a bare Cloudinary URL) that the site must not link
 * to any more — the save guard refuses it, the form shows it read-only until
 * an upload replaces it.
 *
 * Deliberately narrower than "starts with /files/": one category segment, one
 * filename, `.pdf`, nothing that could escape the folder or carry a query.
 */
export function isFilesPdfPath(value) {
  const v = String(value ?? '');
  return /^\/files\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._-]*\.pdf$/.test(v)
    && !v.includes('..');
}

/**
 * Would editing api_slug strand the stored outline?
 *
 * The stored path embeds the slug key, so a rename leaves the row pointing at a
 * file named for the OLD slug. The file still resolves — nothing breaks today —
 * which is exactly why this warns rather than blocks (the course form's
 * outlineWouldGoStale makes the same call). Fires only on an ACTUAL change of
 * key: a stored path that never matched its slug (the one OUT-RDR-named file)
 * is not a rename and is not reported here.
 *
 * @returns {{ from: string, to: string, stored: string, derived: string } | null}
 */
export function careerOutlineWouldGoStale({ previousApiSlug, nextApiSlug, outlineUrl, lang = 'th' }) {
  const stored = String(outlineUrl ?? '');
  if (!isFilesPdfPath(stored)) return null;
  const before = careerOutlineSlugKey(previousApiSlug);
  const after = careerOutlineSlugKey(nextApiSlug);
  if (!before.ok || !after.ok || before.value === after.value) return null;
  const derived = careerOutlinePublicPath(after.value, lang);
  if (derived === stored) return null;
  return { from: before.value, to: after.value, stored, derived };
}
