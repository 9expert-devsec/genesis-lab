/**
 * CATALOG PDFs on a program page and a skill page — the shape, the path, the
 * id, and the one predicate the button renders on. Pure; no I/O.
 *
 * ══ THE PRECEDENT IS THE COURSE OUTLINE, MINUS THE LANGUAGE ═════════════════
 *
 * lib/courses/courseOutline does this for a course: derive the filename and
 * the Cloudinary public_id from the entity's key, never accept them from the
 * client, lowercase and refuse anything outside [a-z0-9-], sign the upload
 * `overwrite: true` so a replacement lands at the SAME URL. All of that
 * transfers. What does not: the 8-key MSDB object (the config is ours, in
 * Mongo, so the stored shape is ours to choose) and the language pair — this
 * round is Thai only, one file per entity, and a `lang` nobody sets would be a
 * field that rots. If English is ever wanted the path gains a suffix then.
 *
 * ══ THE KEY IS THE UPSTREAM CODE, NOT THE SLUG AND NOT THE NAME ═════════════
 *
 * ProgramPageConfig is keyed by `programId` (= upstream `program_id`, e.g.
 * "POWER-BI") and SkillPageConfig by `skillId` (= `skill_id`, e.g. "DEV").
 * That is the one identifier an admin cannot edit from the page-config
 * screen: `urlSlug` and every display name can change under a file, and a
 * path built from either would point at a file named for the old value the
 * moment someone renamed the page. The code it is.
 *
 * ── AND THE KIND IS IN THE PATH, BECAUSE THE TWO KEY SPACES OVERLAP ─────────
 * A program and a skill can carry the same code — `DEV` is both. Deriving
 * `/files/catalog/dev-catalog.pdf` for either would make the program's upload
 * overwrite the skill's, silently, at the same Cloudinary id. So the kind is a
 * segment of the filename: `program-dev-catalog.pdf`, `skill-dev-catalog.pdf`.
 *
 * ══ WHY THE PATH IS ROOT-RELATIVE ═══════════════════════════════════════════
 * `/files/catalog/<kind>-<key>-catalog.pdf`, the same `/files/<category>/…`
 * shape the outline uses, so the existing RAW rewrite in next.config.mjs
 * serves it from Cloudinary with no new rule — the category segment is any
 * valid isValidCategory() and needs no registration.
 *
 * ══ ONE PREDICATE, BOTH PAGES, AND THE TESTS ════════════════════════════════
 * `hasCatalog(config)` is the only test of "does this page have a file". The
 * program page, the skill page and the render tests all call it; two
 * lookalike conditions would be two things to drift.
 */

import { normaliseKeyForPath } from '@/lib/files/pathKey';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';
import { extensionOf } from '@/lib/legacyUploadPolicy.mjs';

/** The category segment catalogs live in. A valid isValidCategory(). */
export const CATALOG_CATEGORY = 'catalog';

/** The two entities that may carry a catalog, and the only two. */
export const CATALOG_KINDS = Object.freeze(['program', 'skill']);

/** Per kind: the config field that keys it, and how the refusal names it. */
const KIND_NAMES = Object.freeze({
  program: { label: 'program_id', noun: 'รหัสโปรแกรม' },
  skill: { label: 'skill_id', noun: 'รหัส Skill' },
});

/**
 * The button's label. Follows the site's own catalog button on
 * /training-course (ดาวน์โหลดแคตตาล็อกหลักสูตร) — Thai transliteration, not
 * the English word — trimmed of หลักสูตร because on these pages the catalog
 * is the program's or the skill's, not a course list.
 */
export const CATALOG_DOWNLOAD_LABEL = 'ดาวน์โหลดแคตตาล็อก';

/** Is `kind` one of the two? Anything else is refused, never defaulted. */
export function isCatalogKind(kind) {
  return CATALOG_KINDS.includes(String(kind ?? ''));
}

/** `<kind>-<key>-catalog.pdf`, all lowercase. */
export function catalogFileName(kind, normalisedKey) {
  return `${kind}-${normalisedKey}-catalog.pdf`;
}

/** The root-relative public path — the string stored on the config. */
export function catalogPublicPath(kind, normalisedKey) {
  return `/${'files'}/${CATALOG_CATEGORY}/${catalogFileName(kind, normalisedKey)}`;
}

/**
 * Everything derived from (kind, key), or a reason it cannot be.
 *
 * The action is I/O around this. The client sends the kind and the raw key
 * and nothing else; the filename, the path and the public_id come out of
 * here, so the only thing a caller can influence is WHICH program or skill it
 * writes to — which requireAdmin('page_configs') already governs.
 */
export function catalogTarget(kind, rawKey) {
  if (!isCatalogKind(kind)) {
    return { ok: false, error: `ประเภทไม่ถูกต้อง (${String(kind)}) — รองรับเฉพาะ program และ skill` };
  }
  const normalised = normaliseKeyForPath(rawKey, KIND_NAMES[kind]);
  if (!normalised.ok) return { ok: false, error: normalised.reason };

  const fileName = catalogFileName(kind, normalised.value);
  const publicPath = catalogPublicPath(kind, normalised.value);
  const { publicId } = legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX);
  return { ok: true, kind, key: normalised.value, fileName, publicPath, publicId };
}

/**
 * Is the picked file a PDF? `null` when it is; a Thai reason when not.
 *
 * Judged on what the browser reports about the PICKED file — its name and
 * its type — because the derived target filename is always `.pdf` and a check
 * on that would pass everything. A picker `accept` filter is a convenience;
 * this is the validation, and it runs in the action.
 */
export function refuseNonPdf({ filename, contentType } = {}) {
  const name = String(filename ?? '').trim();
  if (!name) return 'ไม่พบชื่อไฟล์';
  if (extensionOf(name) !== 'pdf') return `รองรับเฉพาะไฟล์ PDF — ไฟล์ที่เลือกคือ .${extensionOf(name) || '?'}`;
  const type = String(contentType ?? '').trim().toLowerCase();
  // An empty type is a browser that could not tell; a stated non-PDF type is a
  // renamed file and is refused.
  if (type && type !== 'application/pdf') return `รองรับเฉพาะไฟล์ PDF — ไฟล์ที่เลือกเป็น ${type}`;
  return null;
}

/**
 * The stored record on a config, with nothing in it.
 *
 * Mirrors what CourseOutlineFile keeps about an outline — bytes, when, who,
 * how many replacements — folded onto the config row rather than a separate
 * collection, because a program has one catalog and one config and the second
 * row would only ever be joined to the first.
 */
export function emptyCatalog() {
  return { path: '', bytes: 0, uploadedAt: null, uploadedBy: '', version: 0 };
}

/**
 * Does this config carry a catalog file?
 *
 * TRUE only for a stored, non-blank path. Absent config, absent field, null,
 * '' and whitespace are all "no file" — and "no file" means NO BUTTON, not a
 * disabled one, so this is the whole decision.
 */
export function hasCatalog(config) {
  const path = config?.catalogPdf?.path;
  return typeof path === 'string' && path.trim().length > 0;
}
