/**
 * FormData → the pre-validation banner payload.
 *
 * Extracted out of src/lib/actions/banners.js for the reason
 * src/lib/articleFormPayload.js states: that file is `'use server'`, and Next
 * requires every export of a server-actions module to be an async function, so
 * a sync helper cannot be exported from it and therefore cannot be called by the
 * test tier. Copying the parser into a test instead gives a fixture that drifts
 * from the real one — the exact failure the article suite already exists to
 * catch.
 *
 * ── THE THREE-LAYER COUPLING ────────────────────────────────────────────────
 * A field reaches the database only if all three of these name it:
 *
 *   1. BannerForm                 — the control is RENDERED for this type
 *   2. this parser                — the key is read out of the FormData
 *   3. src/lib/schemas/banner.js  — the key is declared in the zod object
 *
 * `bannerSchema` is a plain `z.object()`, i.e. STRIP mode: a key it does not
 * declare is dropped silently between parse and the mongoose write. So a
 * control wired through 1 and 2 but not 3 saves nothing, reports success, and
 * shows the old value again after a refresh, with no error anywhere.
 *
 * ══ THE RULE THAT MATTERS MOST IN THIS FILE ═════════════════════════════════
 *
 *   A FIELD THE FORM DID NOT RENDER IS PRESERVED, NEVER BLANKED.
 *
 * The old parser read every key unconditionally:
 *
 *     link_text: formData.get('link_text') || '',
 *
 * and BannerForm rendered `link_text` only for the button types and youtube. So
 * on any other type the control was absent, `formData.get` returned null, and
 * the save wrote `''` over whatever was stored. The same shape applied to
 * `youtube_id`, `slide_text` and `feature_tags` — four fields that a save could
 * silently empty purely because the form was on a different type that day.
 *
 * That was survivable while the form's five types all rendered nearly the same
 * controls. It stops being survivable now: the per-type table hides SEVEN
 * fields on `course` and `article`, and hides `link_text` on `video`. Measured
 * against the live collection before this change: SIX stored `youtube` records
 * carry `link_text: "YouTube"`, and six carry 187–340 characters of
 * `slide_text`. Under the old rule, opening any one of them in the reworked
 * form and pressing save would have destroyed both values.
 *
 * `FormData.has()` is what makes the rule expressible, and it is not the same
 * question as `get()`: an EMPTY text input posts `''` and `has()` is true, so
 * "the admin cleared this field" stays distinguishable from "this field was
 * never on screen". `get()` alone collapses the two into null.
 *
 * ── slide_text IS NEVER RENDERED AND NEVER WRITTEN ──────────────────────────
 * It is live data on six records and the model says plainly it must not be
 * renamed or dropped until a migration empties it. `description` replaces it,
 * and the mapper reads `description ?? slide_text`. So the form shows the
 * stored `slide_text` as the description field's initial value: saving copies
 * it into `description` VERBATIM, leaves `slide_text` untouched, and the
 * mapper's `??` then picks the identical string out of the new field. The
 * rendered page does not change by one character, and the record has migrated
 * itself. See BannerForm's description field.
 *
 * Pure — no next/*, no db, no models, no cloudinary — so the `pure` tier runs
 * the real parser rather than a copy of it.
 */

import { fromLocalInput } from '@/lib/articlePublishTime';
import {
  BANNER_FIELDS,
  showsField,
} from './bannerFormFields';
import { COURSE_KINDS } from './bannerTypes';

/**
 * The three FormData keys the course picker posts.
 *
 * Named here rather than spelled at four call sites: the picker writes them,
 * this parser reads them, and the round-trip probe asserts on them. `course_id`
 * deliberately matches upstream's own field name so the value is recognisable
 * in a log line without a lookup.
 */
export const COURSE_REF_INPUTS = Object.freeze({
  UPSTREAM_ID: 'course_upstream_id',
  COURSE_ID: 'course_id',
  KIND: 'course_kind',
});

/** The hidden inputs that carry an already-uploaded image. */
export const IMAGE_INPUTS = Object.freeze({
  URL: 'image_url',
  PUBLIC_ID: 'image_public_id',
  FILE: 'image_file',
});

/** The feature-tag editor posts its whole array as one JSON blob. */
export const FEATURE_TAGS_INPUT = 'feature_tags_json';

/** Every value out of a FormData is a string or a File; make it a string. */
function str(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

/**
 * Read one key, or fall back to what is already stored.
 *
 * `has()` and not `get() ?? fallback`, for the reason in the header: an empty
 * control posts `''`, which is a deliberate clear and must NOT be replaced by
 * the stored value.
 */
function read(formData, key, fallback) {
  return formData.has(key) ? str(formData.get(key)) : fallback;
}

/**
 * `feature_tags_json` → an array, or the fallback.
 *
 * A malformed blob yields `[]` rather than the fallback: the editor posted
 * SOMETHING, so the admin was on a type that owns this field, and silently
 * restoring the old tags would hide the fact that the payload was broken.
 */
function readFeatureTags(formData, fallback) {
  if (!formData.has(FEATURE_TAGS_INPUT)) return fallback;
  try {
    const parsed = JSON.parse(str(formData.get(FEATURE_TAGS_INPUT)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * A `datetime-local` value → an ISO instant, or `null`.
 *
 * `fromLocalInput` reads the wall-clock string as Asia/Bangkok rather than as
 * the runtime's zone — the whole point of that module, and it matters here for
 * exactly the reason it mattered for articles: this parser runs inside a server
 * action, and on Vercel the server's zone is UTC, so a naive
 * `new Date(raw).toISOString()` would store a scheduling window seven hours off
 * and roll the calendar date forward for anything picked at 17:00 or later.
 *
 * `''` becomes `null`, not `''`. The mongoose field is a Date whose default is
 * null, and `isLive()` in the mapper tests `banner.starts_at &&` — so null is
 * the spelling of "no window" that both ends already agree on. An empty string
 * would be cast by mongoose and is one more shape for nothing.
 */
function readWindow(formData, key, fallback) {
  if (!formData.has(key)) return fallback;
  const iso = fromLocalInput(str(formData.get(key)));
  return iso || null;
}

/**
 * @param {FormData} formData
 * @param {object}   [options]
 * @param {object|null} [options.existing] the stored document, on an UPDATE.
 *   Every field the form did not render is taken from here. `null` on a create,
 *   where "not rendered" can only mean "has no value yet".
 * @param {{image_url: string, image_public_id: string}|null} [options.image]
 *   the resolved image pair. The action owns this because resolving it may mean
 *   uploading a File to Cloudinary, which is not something a pure module does.
 *   `null` means "read the hidden inputs like any other field".
 * @returns {object} the pre-validation payload. Every key here must also be
 *   declared in `bannerSchema` or it is stripped silently.
 */
export function parseBannerFormData(formData, { existing = null, image = null } = {}) {
  const prev = existing ?? {};
  const type = str(formData.get('type'));

  const payload = {
    type,

    // ── Always rendered, on all four types ────────────────────────────────
    title: read(formData, BANNER_FIELDS.TITLE, str(prev.title)).trim(),
    title_line2: read(formData, BANNER_FIELDS.TITLE_LINE2, str(prev.title_line2)),
    title_highlight: read(
      formData,
      BANNER_FIELDS.TITLE_HIGHLIGHT,
      str(prev.title_highlight)
    ),
    subtitle: read(formData, BANNER_FIELDS.SUBTITLE, str(prev.subtitle)),
    weight: read(formData, BANNER_FIELDS.WEIGHT, prev.weight ?? 0),
    // The checkbox is normalised to the strings 'true'/'false' by the form's
    // own submit handler before it gets here, exactly as ArticleForm does, so
    // this key is always present. `=== 'true'` makes an absent key read false,
    // which is also the right answer for a native unchecked checkbox — those
    // post nothing at all.
    active: formData.has(BANNER_FIELDS.ACTIVE)
      ? formData.get(BANNER_FIELDS.ACTIVE) === 'true'
      : prev.active !== false,
    starts_at: readWindow(formData, BANNER_FIELDS.STARTS_AT, prev.starts_at ?? null),
    ends_at: readWindow(formData, BANNER_FIELDS.ENDS_AT, prev.ends_at ?? null),

    // ── Rendered on some types only. Absent ⇒ keep what is stored. ────────
    description: read(formData, BANNER_FIELDS.DESCRIPTION, str(prev.description)),
    youtube_id: read(formData, BANNER_FIELDS.YOUTUBE_ID, str(prev.youtube_id)),
    link_url: read(formData, BANNER_FIELDS.LINK_URL, str(prev.link_url)),
    link_text: read(formData, BANNER_FIELDS.LINK_TEXT, str(prev.link_text)),
    feature_tags: readFeatureTags(
      formData,
      Array.isArray(prev.feature_tags) ? prev.feature_tags : []
    ),

    // ── NEVER RENDERED, NEVER AUTHORED, ALWAYS CARRIED FORWARD ───────────
    // See the header. This is the one field whose value can only ever come
    // from the stored document, and writing it back unchanged is what keeps
    // the six live records intact through a save on the new form.
    slide_text: str(prev.slide_text),

    image_url: image ? str(image.image_url) : read(formData, IMAGE_INPUTS.URL, str(prev.image_url)),
    image_public_id: image
      ? str(image.image_public_id)
      : read(formData, IMAGE_INPUTS.PUBLIC_ID, str(prev.image_public_id)),
  };

  // ── course_ref ─────────────────────────────────────────────────────────
  // Written only when the picker was on screen. `kind` is taken VERBATIM from
  // the posted value and never defaulted here: the two namespaces share no
  // field names, so a guessed kind resolves to nothing at all, and the schema
  // is the right place for that refusal to be visible. See BannerCoursePicker.
  if (formData.has(COURSE_REF_INPUTS.KIND) || formData.has(COURSE_REF_INPUTS.COURSE_ID)) {
    payload.course_ref = {
      upstreamId: read(formData, COURSE_REF_INPUTS.UPSTREAM_ID, '').trim(),
      courseId: read(formData, COURSE_REF_INPUTS.COURSE_ID, '').trim(),
      kind: read(formData, COURSE_REF_INPUTS.KIND, ''),
    };
  } else if (prev.course_ref) {
    payload.course_ref = plainCourseRef(prev.course_ref);
  }

  // ── article_slug ───────────────────────────────────────────────────────
  // NOT normalised, NOT slugified, NOT ASCII-folded — only trimmed of the
  // whitespace a paste can carry. 265 of the 488 live slugs contain Thai
  // characters ('local-llm-คืออะไร' and friends); any transliteration or
  // `encodeURIComponent` here would produce a key that matches no Article and
  // would break every one of those links. The resolver looks the value up with
  // a plain `$in` on `Article.slug`, so the stored bytes must be the stored
  // bytes.
  if (formData.has(BANNER_FIELDS.ARTICLE_SLUG)) {
    payload.article_slug = str(formData.get(BANNER_FIELDS.ARTICLE_SLUG)).trim();
  } else if (prev.article_slug != null) {
    payload.article_slug = str(prev.article_slug);
  }

  return payload;
}

/**
 * A stored `course_ref` as a plain object.
 *
 * `existing` on the update path is a mongoose document, so `prev.course_ref` is
 * a subdocument — handing it straight back into `safeParse` puts a mongoose
 * instance where zod expects an object literal, and its internal keys ride
 * along into the write. Read the three fields by name instead.
 */
function plainCourseRef(ref) {
  return {
    upstreamId: str(ref.upstreamId),
    courseId: str(ref.courseId),
    kind: str(ref.kind) || COURSE_KINDS.INCLASS,
  };
}

/**
 * The fields this type renders that the payload must therefore carry a value
 * for. Exported for the round-trip probe and the coupling test, which assert
 * that the three layers name the same things — the check that catches a control
 * wired to a key the schema does not declare.
 */
export function expectedPayloadKeys(type) {
  const keys = ['type', 'slide_text', 'image_url', 'image_public_id'];
  for (const field of Object.values(BANNER_FIELDS)) {
    if (!showsField(type, field)) continue;
    if (field === BANNER_FIELDS.IMAGE) continue; // covered by the pair above
    if (field === BANNER_FIELDS.COURSE_REF) { keys.push('course_ref'); continue; }
    keys.push(field);
  }
  return keys;
}
