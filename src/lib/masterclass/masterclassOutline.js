/**
 * Masterclass outline PDF — the ONE place the filename comes from.
 *
 *   /files/masterclass-outline/<slug>-course-outline-<lang>.pdf
 *
 * Its own category, unlike the career-path outlines (which share
 * `course-outline` because round OUT-RDR had already shipped files there):
 * nothing has ever been uploaded under this shape, so there is no existing
 * asset to stay compatible with, and a masterclass is not a course — the
 * two key spaces must never be able to collide. The `/files/` rewrite serves
 * any category by pattern, so a new segment costs no config.
 *
 * The key is the masterclass `slug` through lib/files/pathKey's alphabet
 * (lowercase `[a-z0-9-]`). The admin form's slugify admits more (Thai, `_`,
 * `.`, `~`); a slug outside the alphabet cannot name a file and the sign step
 * refuses it with the field named — both live slugs are plain ASCII.
 */
import { normaliseKeyForPath } from '@/lib/files/pathKey';

export const MASTERCLASS_OUTLINE_CATEGORY = 'masterclass-outline';
export const MASTERCLASS_OUTLINE_LANGS = Object.freeze(['th', 'en']);

export function isMasterclassOutlineLang(lang) {
  return MASTERCLASS_OUTLINE_LANGS.includes(String(lang ?? '').toLowerCase());
}

/** @returns {{ ok: true, value: string } | { ok: false, reason: string }} */
export function masterclassOutlineSlugKey(slug) {
  return normaliseKeyForPath(slug, { label: 'slug', noun: 'slug ของ Masterclass' });
}

export function masterclassOutlineFileName(slugKey, lang) {
  return `${slugKey}-course-outline-${String(lang).toLowerCase()}.pdf`;
}

export function masterclassOutlinePublicPath(slugKey, lang) {
  return `/files/${MASTERCLASS_OUTLINE_CATEGORY}/${masterclassOutlineFileName(slugKey, lang)}`;
}

/**
 * The href a download button can render for a stored `course_outline_url`,
 * during the transition and after it: a `/files/…` path is ours and is used
 * as is; a full `http(s)://` URL (the two hand-uploaded Cloudinary files
 * today) passes through untouched; anything else is not a link.
 */
export function outlineHref(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (v.startsWith('/files/')) return v;
  if (/^https?:\/\//.test(v)) return v;
  return null;
}
