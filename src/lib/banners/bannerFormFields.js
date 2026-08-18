/**
 * WHICH FIELDS EACH BANNER TYPE OFFERS — one table, no substring tests.
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 * BannerForm decided its whole layout from three derived booleans:
 *
 *     const isYouTube = type === LEGACY_TYPES.YOUTUBE;
 *     const isImage   = type.startsWith(BANNER_TYPES.IMAGE);
 *     const hasButton = type.includes('button');
 *
 * All three die on the four new ids, and each dies differently:
 *
 *   · `isYouTube` is an equality test against the LEGACY id, so a record saved
 *     as `video` offers no YouTube id field at all — the one field that type
 *     cannot render without.
 *   · `startsWith('image')` answers TRUE for the new `image` (correct, by
 *     accident) and FALSE for `course` and `article` (also correct, also by
 *     accident). It is a prefix match on a naming convention; nothing makes it
 *     keep agreeing with the type system, and the first id that happens to
 *     start with those five letters silently inherits the image upload.
 *   · `includes('button')` reads a WORD IN AN ID, not a field. There is no
 *     `button` in any of the four new ids, so every new type loses its link
 *     text — including `image`, which is the only type that should have it.
 *
 * The replacement is a COMPLETE LITERAL TABLE keyed by the normalised type.
 * Every cell is written down. A type with no row gets nothing rather than
 * inheriting whichever branch a substring happened to match, and adding a fifth
 * type means adding a row — a visible, reviewable diff — instead of discovering
 * months later which prefix test it accidentally satisfied.
 *
 * ── WHY IT IS NORMALISED FIRST ──────────────────────────────────────────────
 * All 22 stored documents carry a LEGACY id. `normaliseBannerType` folds those
 * five onto the four, so `image_button_desktop` and `image` reach the same row
 * by construction. That is what lets the table have four rows instead of nine
 * and, more importantly, what makes "an old record opens in the form exactly as
 * a migrated one would" true by construction rather than by two branches that
 * have to be kept in agreement.
 *
 * ── PURE, AND THAT IS LOAD-BEARING ──────────────────────────────────────────
 * No React, no next/*, no database. The form imports it, and so does the test
 * tier — so the assertion "a `course` record is not offered the image upload"
 * is made against the SAME table the form renders from, not against a fixture
 * that can drift from it.
 */

import { BANNER_TYPES, BANNER_TYPE_IDS, normaliseBannerType } from './bannerTypes';

/**
 * Field ids. These are the FORM CONTROL NAMES and, where a field maps 1:1 onto
 * the document, the DOCUMENT KEY as well — deliberately the same string, so the
 * three-layer coupling (form → payload parser → zod schema) can be checked by
 * comparing names rather than by remembering a mapping.
 *
 * `IMAGE` and `COURSE_REF` are the two that are not a single control: the image
 * field is a file input plus two hidden inputs, and the course reference is
 * three inputs (upstream id, code, kind). They are named for the SLOT, and the
 * payload parser owns the spelling of their parts.
 */
export const BANNER_FIELDS = Object.freeze({
  TITLE: 'title',
  TITLE_LINE2: 'title_line2',
  TITLE_HIGHLIGHT: 'title_highlight',
  SUBTITLE: 'subtitle',
  DESCRIPTION: 'description',
  YOUTUBE_ID: 'youtube_id',
  // ── NOT 'image'. THE GUARD REFUSED IT, AND THE GUARD WAS RIGHT ──────────
  // This slot was called `image` for about an hour, and
  // test/pure/bannerTypeSingleSource SCAN 2 reddened on it: a bare quoted
  // 'image' inside a banner surface is indistinguishable from the banner TYPE
  // id of the same name, and the scanner cannot tell a field id from a type id
  // by looking. Neither can a reader. Suppressing it would have meant either an
  // exception on this file — which then stops catching a REAL copied type id —
  // or a scanner that understands intent, which is not a thing a regex does.
  //
  // `image_upload` is also the more honest name: the slot is the UPLOAD, whose
  // three controls are `image_url`, `image_public_id` and `image_file`. It is
  // never a form control name and never a document key.
  IMAGE: 'image_upload',
  COURSE_REF: 'course_ref',
  ARTICLE_SLUG: 'article_slug',
  FEATURE_TAGS: 'feature_tags',
  LINK_URL: 'link_url',
  LINK_TEXT: 'link_text',
  WEIGHT: 'weight',
  ACTIVE: 'active',
  STARTS_AT: 'starts_at',
  ENDS_AT: 'ends_at',
});

/** Every field id, in the order the form renders them. */
export const BANNER_FIELD_IDS = Object.freeze(Object.values(BANNER_FIELDS));

/** The three states a cell can hold. `HIDDEN` is absence, spelled out. */
export const FIELD_REQUIRED = 'required';
export const FIELD_OPTIONAL = 'optional';
export const FIELD_HIDDEN = 'hidden';

const R = FIELD_REQUIRED;
const O = FIELD_OPTIONAL;

/**
 * The table. Four complete rows; a cell that is absent is HIDDEN.
 *
 * ── THE SLOTS THAT ARE HIDDEN, AND WHY EACH ONE IS ──────────────────────────
 *
 *   description   HIDDEN on course and article, because both HAVE a source and
 *                 an admin-typed one would shadow it silently. A course's long
 *                 copy is `course_teaser` (average 363 characters, measured
 *                 across all 79 live rows) and an article's is `excerpt`. The
 *                 mapper already reads them as the fallback after
 *                 `description ?? slide_text`; offering the field here would
 *                 mean the admin fills it once and the record then stops
 *                 tracking upstream forever, with nothing saying so.
 *
 *                 NOTE, because an earlier note in this repo said otherwise:
 *                 MSDB has NO `title` field on a public course. Measured — the
 *                 79-row union is 39 keys and `title` is not among them.
 *                 `course_name` is the short name (average 36 characters) and
 *                 `course_teaser` is the description. Any hint that says the
 *                 long body lives in `title` is wrong.
 *
 *   subtitle      SHOWN on course, and that is a ruling rather than a
 *                 derivation. Because there is no MSDB `title`, a course has NO
 *                 upstream source for a subtitle at all. The alternative was to
 *                 hide the slot on course records and let the mapper's
 *                 `courseName`-when-it-differs fallback fill it, which gives the
 *                 admin a subtitle they can neither see nor change. So the
 *                 admin types it, and the fallback stays as the default for a
 *                 record that leaves it blank.
 *
 *   feature_tags  HIDDEN on course and article: both DERIVE their chips.
 *                 `courseMeta()` builds level/duration/lessons chips from the
 *                 resolved record, and the mapper prefers stored tags over
 *                 derived ones — so a stored tag on a course record would
 *                 silently suppress the whole derived row.
 *
 *   link_url      SHOWN on image and video, HIDDEN on course and article, which
 *                 both derive their destination (`courseHref` /
 *                 `/articles/<slug>`). On VIDEO it carries an extra rule that
 *                 this table cannot express and the form enforces: it must not
 *                 be a YouTube URL. See `LINK_URL_REJECTS_YOUTUBE` below.
 *
 *   link_text     IMAGE ONLY. It labels the painted CTA on a section banner.
 *                 A video card plays inline and a course/article card's button
 *                 is the section's own, so on those three the field would be a
 *                 control with no consumer.
 *
 *   title         REQUIRED on video and image, OPTIONAL on course and article.
 *                 On those two it is an OVERRIDE: the mapper reads
 *                 `text(banner.title) ?? courseName ?? article.title`, so an
 *                 empty title means "track the record's own name", which is the
 *                 non-stale answer and the one an upstream rename keeps
 *                 correct. Making it required would force the admin to
 *                 denormalise a name that already exists upstream.
 */
const FIELD_TABLE = Object.freeze({
  [BANNER_TYPES.VIDEO]: Object.freeze({
    [BANNER_FIELDS.TITLE]: R,
    [BANNER_FIELDS.TITLE_LINE2]: O,
    [BANNER_FIELDS.TITLE_HIGHLIGHT]: O,
    [BANNER_FIELDS.SUBTITLE]: O,
    [BANNER_FIELDS.DESCRIPTION]: O,
    [BANNER_FIELDS.YOUTUBE_ID]: R,
    [BANNER_FIELDS.FEATURE_TAGS]: O,
    [BANNER_FIELDS.LINK_URL]: O,
    [BANNER_FIELDS.WEIGHT]: O,
    [BANNER_FIELDS.ACTIVE]: O,
    [BANNER_FIELDS.STARTS_AT]: O,
    [BANNER_FIELDS.ENDS_AT]: O,
  }),
  [BANNER_TYPES.IMAGE]: Object.freeze({
    [BANNER_FIELDS.TITLE]: R,
    [BANNER_FIELDS.TITLE_LINE2]: O,
    [BANNER_FIELDS.TITLE_HIGHLIGHT]: O,
    [BANNER_FIELDS.SUBTITLE]: O,
    [BANNER_FIELDS.DESCRIPTION]: O,
    [BANNER_FIELDS.IMAGE]: R,
    [BANNER_FIELDS.FEATURE_TAGS]: O,
    [BANNER_FIELDS.LINK_URL]: O,
    [BANNER_FIELDS.LINK_TEXT]: O,
    [BANNER_FIELDS.WEIGHT]: O,
    [BANNER_FIELDS.ACTIVE]: O,
    [BANNER_FIELDS.STARTS_AT]: O,
    [BANNER_FIELDS.ENDS_AT]: O,
  }),
  [BANNER_TYPES.COURSE]: Object.freeze({
    [BANNER_FIELDS.TITLE]: O,
    [BANNER_FIELDS.TITLE_LINE2]: O,
    [BANNER_FIELDS.TITLE_HIGHLIGHT]: O,
    [BANNER_FIELDS.SUBTITLE]: O,
    [BANNER_FIELDS.COURSE_REF]: R,
    [BANNER_FIELDS.WEIGHT]: O,
    [BANNER_FIELDS.ACTIVE]: O,
    [BANNER_FIELDS.STARTS_AT]: O,
    [BANNER_FIELDS.ENDS_AT]: O,
  }),
  [BANNER_TYPES.ARTICLE]: Object.freeze({
    [BANNER_FIELDS.TITLE]: O,
    [BANNER_FIELDS.TITLE_LINE2]: O,
    [BANNER_FIELDS.TITLE_HIGHLIGHT]: O,
    [BANNER_FIELDS.SUBTITLE]: O,
    [BANNER_FIELDS.ARTICLE_SLUG]: R,
    [BANNER_FIELDS.WEIGHT]: O,
    [BANNER_FIELDS.ACTIVE]: O,
    [BANNER_FIELDS.STARTS_AT]: O,
    [BANNER_FIELDS.ENDS_AT]: O,
  }),
});

/**
 * The types whose `title` is an override of a resolved name rather than the
 * only source of one. Derived from the table, so it cannot disagree with it.
 */
export const REF_BACKED_TYPES = Object.freeze(
  BANNER_TYPE_IDS.filter((id) => FIELD_TABLE[id][BANNER_FIELDS.TITLE] !== R)
);

/**
 * Does this type's record resolve its title from another record?
 *
 * Used by the zod schema and the mongoose model to decide whether an empty
 * `title` is legal. Accepts a legacy id too, because the model validates
 * whatever `type` the document carries.
 */
export function isRefBackedBannerType(type) {
  return REF_BACKED_TYPES.includes(normaliseBannerType(type));
}

/**
 * The one per-type rule the table cannot hold: on a VIDEO banner, `link_url`
 * must not point at YouTube.
 *
 * ── WHY IT IS A FORM RULE AND NOT ONLY A MAPPER RULE ────────────────────────
 * The mapper already refuses such a link — `detailsUrl = link && !isYouTubeUrl(link)`
 * — because "ดูรายละเอียด" must lead somewhere OTHER than the video the card is
 * already playing inline. But refusing it at RENDER time means the admin types a
 * URL, saves successfully, and gets a field that does nothing, with no error
 * anywhere. Measured: all six stored `youtube` records carry exactly this — a
 * watch URL for the id already in `youtube_id` — so this is the live state of
 * the data, not a hypothetical.
 *
 * A `Set` rather than a boolean per row because it is one rule about one field,
 * and folding it into the table would mean inventing a fourth cell state that
 * only one cell in sixteen could ever use.
 */
export const LINK_URL_REJECTS_YOUTUBE = Object.freeze([BANNER_TYPES.VIDEO]);

/** Must this type's `link_url` refuse a YouTube URL? */
export function linkUrlRejectsYouTube(type) {
  return LINK_URL_REJECTS_YOUTUBE.includes(normaliseBannerType(type));
}

/**
 * The whole row for a type, normalised. An unknown type gets an EMPTY row —
 * every field hidden — rather than a default row, so a record carrying a type
 * nothing knows renders as visibly empty instead of quietly as an image.
 */
export function fieldsForType(type) {
  return FIELD_TABLE[normaliseBannerType(type)] ?? {};
}

/** `'required' | 'optional' | 'hidden'` for one field on one type. */
export function fieldState(type, field) {
  return fieldsForType(type)[field] ?? FIELD_HIDDEN;
}

/** Does this type render this field at all? */
export function showsField(type, field) {
  return fieldState(type, field) !== FIELD_HIDDEN;
}

/** Does this type render this field AND demand a value? */
export function requiresField(type, field) {
  return fieldState(type, field) === FIELD_REQUIRED;
}

/** Every field this type renders, in BANNER_FIELD_IDS order. */
export function shownFields(type) {
  const row = fieldsForType(type);
  return BANNER_FIELD_IDS.filter((id) => row[id] && row[id] !== FIELD_HIDDEN);
}
