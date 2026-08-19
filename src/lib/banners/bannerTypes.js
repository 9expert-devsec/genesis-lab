/**
 * Banner type ids, labels and hints — THE one home for all of them.
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 * The five banner type strings were hand-maintained in FIVE places, with
 * nothing enforcing agreement:
 *
 *   1. src/models/Banner.js                      mongoose `enum`
 *   2. src/lib/schemas/banner.js                 zod `z.enum`
 *   3. admin/banners/_components/BannerForm      TYPE_OPTIONS (value + label)
 *   4. admin/banners/_components/AdminBannerList TYPE_LABELS
 *   5. _components/home/HeroBannerCarousel       filter predicate + render switch
 *
 * They had already drifted. The two admin surfaces printed a DIFFERENT NAME for
 * every one of the five types — not one of them agreed:
 *
 *   id                    BannerForm                                    AdminBannerList
 *   youtube               Video Banner (YouTube)                        Video Banner
 *   image_desktop         Hero Image – Desktop (1920×700)               Hero Image (Desktop)
 *   image_mobile          Hero Image – Mobile (360×584)                 Hero Image (Mobile)
 *   image_button_desktop  Section Banner + Button – Desktop (1920×700)  Section Banner (Desktop)
 *   image_button_mobile   Section Banner + Button – Mobile (360×584)    Section Banner (Mobile)
 *
 * An admin picking "Hero Image – Desktop (1920×700)" in the form then saw it
 * listed as "Hero Image (Desktop)" one screen later. That is what one map ends.
 *
 * ── NAME AND SPEC ARE SEPARATE, ON PURPOSE ──────────────────────────────────
 * The form's labels were the list's labels plus a pixel spec, welded into one
 * string. They are split here: LABELS hold the name, HINTS hold the spec. That
 * is why the disagreement could be resolved without either surface losing
 * information, and it is the shape the four NEW types already use.
 *
 * ── THE LEGACY IDS ARE STILL HERE, AND MUST STAY FOR NOW ────────────────────
 * All 22 documents in the `banners` collection carry a legacy id. Removing them
 * from the enum before the migration runs would make every existing record fail
 * validation on the next admin save. LEGACY_TYPE_IDS is retired in the LAST
 * slice, after the data has moved — never before.
 *
 * ── DO NOT WRITE A TYPE STRING ANYWHERE ELSE ────────────────────────────────
 * test/pure/bannerTypeSingleSource enforces it. Import from here instead.
 */

/** The four types the reworked Feature Content section is built around. */
export const BANNER_TYPES = Object.freeze({
  VIDEO: 'video',
  IMAGE: 'image',
  COURSE: 'course',
  ARTICLE: 'article',
});

export const BANNER_TYPE_IDS = Object.freeze([
  BANNER_TYPES.VIDEO,
  BANNER_TYPES.IMAGE,
  BANNER_TYPES.COURSE,
  BANNER_TYPES.ARTICLE,
]);

/**
 * The five ids every stored document currently uses.
 *
 * NAMED, not just listed, because call sites need to compare against ONE of
 * them — the dormant carousel filters `image_mobile` from `image_desktop` — and
 * a call site that cannot name an id has no choice but to re-type the literal,
 * which is the drift this module exists to stop.
 */
export const LEGACY_TYPES = Object.freeze({
  YOUTUBE: 'youtube',
  IMAGE_DESKTOP: 'image_desktop',
  IMAGE_MOBILE: 'image_mobile',
  IMAGE_BUTTON_DESKTOP: 'image_button_desktop',
  IMAGE_BUTTON_MOBILE: 'image_button_mobile',
});

/**
 * ORDER MATTERS — it is the order the admin form has always offered, and
 * changing it would reorder the dropdown for no reason.
 */
export const LEGACY_TYPE_IDS = Object.freeze([
  LEGACY_TYPES.YOUTUBE,
  LEGACY_TYPES.IMAGE_DESKTOP,
  LEGACY_TYPES.IMAGE_MOBILE,
  LEGACY_TYPES.IMAGE_BUTTON_DESKTOP,
  LEGACY_TYPES.IMAGE_BUTTON_MOBILE,
]);

/**
 * What the schema accepts DURING the transition: both sets at once.
 *
 * This is what makes the migration the last slice rather than the first. New
 * records can be written in the new shape and old records keep validating, so
 * no document has to move until every line of code that reads it is in place.
 */
export const ALL_TYPE_IDS = Object.freeze([
  ...BANNER_TYPE_IDS,
  ...LEGACY_TYPE_IDS,
]);

/**
 * Legacy id → the new id it becomes.
 *
 * All four image variants collapse to one `image`. The desktop/mobile split
 * exists because the dormant carousel served a different crop per viewport;
 * the Feature Content section has no portrait slot at any breakpoint, so the
 * distinction has no consumer left. The migration keeps the DESKTOP record and
 * deletes its mobile twin — this map only says what the surviving record's
 * `type` becomes.
 */
export const LEGACY_TO_NEW = Object.freeze({
  [LEGACY_TYPES.YOUTUBE]: BANNER_TYPES.VIDEO,
  [LEGACY_TYPES.IMAGE_DESKTOP]: BANNER_TYPES.IMAGE,
  [LEGACY_TYPES.IMAGE_BUTTON_DESKTOP]: BANNER_TYPES.IMAGE,
  [LEGACY_TYPES.IMAGE_MOBILE]: BANNER_TYPES.IMAGE,
  [LEGACY_TYPES.IMAGE_BUTTON_MOBILE]: BANNER_TYPES.IMAGE,
});

/** Display names for the four new types. Thai — these are admin-facing. */
export const BANNER_TYPE_LABELS = Object.freeze({
  [BANNER_TYPES.VIDEO]: 'วิดีโอ (YouTube)',
  [BANNER_TYPES.IMAGE]: 'รูปภาพ',
  [BANNER_TYPES.COURSE]: 'คอร์สเรียน',
  [BANNER_TYPES.ARTICLE]: 'บทความ',
});

/**
 * Display names for the legacy types.
 *
 * These are AdminBannerList's wording, which wins because it is a name and not
 * a name-plus-spec. BannerForm's dropdown consequently drops the trailing pixel
 * spec from its five option labels — the only user-visible text this slice
 * changes, and the point of unifying. Nothing is lost: the spec still shows on
 * the upload field's own hint, where it is actionable.
 */
export const LEGACY_TYPE_LABELS = Object.freeze({
  [LEGACY_TYPES.YOUTUBE]: 'Video Banner',
  [LEGACY_TYPES.IMAGE_DESKTOP]: 'Hero Image (Desktop)',
  [LEGACY_TYPES.IMAGE_MOBILE]: 'Hero Image (Mobile)',
  [LEGACY_TYPES.IMAGE_BUTTON_DESKTOP]: 'Section Banner (Desktop)',
  [LEGACY_TYPES.IMAGE_BUTTON_MOBILE]: 'Section Banner (Mobile)',
});

/** Every label, old and new, in one lookup. */
export const ALL_TYPE_LABELS = Object.freeze({
  ...BANNER_TYPE_LABELS,
  ...LEGACY_TYPE_LABELS,
});

/**
 * Upload specs, keyed by type.
 *
 * `image` is 16:9 and that is the whole retirement mechanism for the Feature
 * Content section's letterboxing: the section renders `object-contain`, so once
 * a record carries 16:9 art, contain and cover converge and the bars disappear
 * with NO code change. Do not "fix" the letterbox in CSS — fix it here, at the
 * source, and let the visible bars mark which records still carry legacy art.
 *
 * The legacy specs are the measured truth of the live records: image_desktop is
 * 1920×700 on every active document, image_mobile 360×584.
 */
export const BANNER_TYPE_HINTS = Object.freeze({
  [BANNER_TYPES.IMAGE]: '1920×1080 px (16:9)',
});

export const LEGACY_TYPE_HINTS = Object.freeze({
  [LEGACY_TYPES.IMAGE_DESKTOP]: '1920×700 px แนะนำ',
  [LEGACY_TYPES.IMAGE_MOBILE]: '360×584 px แนะนำ',
  [LEGACY_TYPES.IMAGE_BUTTON_DESKTOP]: '1920×700 px แนะนำ',
  [LEGACY_TYPES.IMAGE_BUTTON_MOBILE]: '360×584 px แนะนำ',
});

/** Is `value` any banner type this codebase knows — new or legacy? */
export function isBannerType(value) {
  return typeof value === 'string' && ALL_TYPE_IDS.includes(value);
}

/** Is `value` one of the four types the rework targets? */
export function isCurrentBannerType(value) {
  return typeof value === 'string' && BANNER_TYPE_IDS.includes(value);
}

/** Is `value` one of the five ids the migration will retire? */
export function isLegacyBannerType(value) {
  return typeof value === 'string' && LEGACY_TYPE_IDS.includes(value);
}
