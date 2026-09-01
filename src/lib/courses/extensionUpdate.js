/**
 * THE CourseExtension UPDATE OBJECT — key selection, and nothing else.
 *
 * ══ WHY THIS IS ITS OWN MODULE ═════════════════════════════════════════════
 *
 * `src/lib/actions/course-extensions.js` is `'use server'`. It imports
 * next/cache, the audit recorder and the Mongo client, so NO TEST IN THIS SUITE
 * CAN IMPORT IT — the same constraint that put the training_topics parse in
 * lib/courses/trainingTopics.js rather than in the action beside it.
 *
 * The rule this module holds is one a test has to be able to run, not merely
 * read: "does the object built for the payloads the two real callers send today
 * still equal the object that was built before the change?" That question is
 * behavioural. A source scan can confirm the shape of the code and would have
 * been satisfied by a builder that was subtly wrong.
 *
 * ══ OMISSION MEANS LEAVE-ALONE. IT USED TO MEAN CLEAR. ═════════════════════
 *
 * The action used to build this object naming all its keys UNCONDITIONALLY,
 * each computed from `data` with a hardcoded fallback. A caller that did not
 * render a field therefore did not merely fail to update it — it actively WROTE
 * the fallback.
 *
 * That is not Mongoose replacing the document. The update is operator-free, so
 * Mongoose wraps it in `$set` and only the NAMED keys are touched — which is
 * exactly why `upstreamId` and `formerCodes`, absent from this builder, survive
 * every save. The blanking was the literal's own doing, and this is where it is
 * fixed.
 *
 * It had already cost a live incident: `omisePaymentEnabled` was silently reset
 * to false by a caller that did not render the toggle.
 *
 * ══ KEY PRESENCE, NEVER VALUE ══════════════════════════════════════════════
 *
 * Selection is `Object.prototype.hasOwnProperty` — NOT `data.x !== undefined`,
 * and NOT truthiness. The difference is the entire safety property:
 *
 *   `{ metaTitle: undefined }` — a broken destructure, a bad prop, a typo — is a
 *   caller SAYING metaTitle. It keeps taking the old path and CLEARS the field.
 *   Reading it as leave-alone would trade one silent bug for another that looks
 *   identical from outside, and the new one would be harder to find, because the
 *   field would simply never change again.
 *
 *   `{}` — the key genuinely absent — is a caller saying nothing about
 *   metaTitle, and leaves whatever is stored exactly as it is.
 *
 * ══ PER-KEY COERCION IS UNCHANGED ══════════════════════════════════════════
 *
 * For every key that IS present, the normalisation and the fallback are
 * byte-for-byte what the action did before. ONLY the selection changed. That is
 * what makes this a provable no-op for both current callers — they pass every
 * key — and the equivalence test in test/pure/extensionUpdate.test.mjs is what
 * proves it rather than asserting it.
 */

import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';

/** Present means "the caller named this key", whatever value it named. */
const has = (data, key) => Object.prototype.hasOwnProperty.call(data ?? {}, key);

/**
 * The gallery, with empty rows dropped and `order` renumbered.
 *
 * Lifted verbatim from the action. A row is empty when it has no type, or a
 * `youtube` row with no videoId, or an `image` row with no url — the three
 * shapes the editor can leave behind when a row is added and not filled in.
 */
function normaliseGallery(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .filter((item) => {
      if (!item || !item.type) return false;
      if (item.type === 'youtube') return Boolean(item.videoId?.trim());
      if (item.type === 'image') return Boolean(item.url?.trim());
      return false;
    })
    .map((item, i) => ({
      type: item.type,
      url: item.type === 'image' ? String(item.url ?? '').trim() : '',
      videoId: item.type === 'youtube' ? String(item.videoId ?? '').trim() : '',
      alt: String(item.alt ?? '').trim(),
      order: i,
    }));
}

/**
 * EVERY WRITABLE KEY, with the coercion it has always had.
 *
 * `urlAlias` takes its value from the caller rather than recomputing it: the
 * action normalises the alias BEFORE this runs because it needs the same value
 * for `checkAliasAvailable` and for `revalidatePath`. Normalising it twice would
 * be two implementations of what a stored alias looks like, which is the exact
 * duplication `normaliseAlias` was consolidated to remove.
 *
 * `trainingTopicsRich` HAS NO FALLBACK ENTRY OF ITS OWN, deliberately — see
 * the note on it below. Its coercion only ever runs when the key is present.
 */
export const EXTENSION_FIELDS = Object.freeze([
  'urlAlias',
  'metaTitle',
  'metaDescription',
  'ogImage',
  'tags',
  'gallery',
  'isPublished',
  'omisePaymentEnabled',
  'trainingTopicsRich',
  'descriptionRich',
]);

/**
 * Build the `$set` payload for `findOneAndUpdate({ courseId }, …)`.
 *
 * @param {object}   input
 * @param {string}   input.courseId    the upsert key
 * @param {object}   input.data        whatever the caller sent
 * @param {string}   input.cleanAlias  `normaliseAlias(data.urlAlias)`, already
 *                                     computed by the action for its own use
 * @returns {object} an object carrying `courseId` plus ONLY the keys `data` named
 */
export function buildExtensionUpdate({ courseId, data, cleanAlias } = {}) {
  const coerce = {
    urlAlias:            () => cleanAlias,
    metaTitle:           () => String(data?.metaTitle ?? '').trim(),
    metaDescription:     () => String(data?.metaDescription ?? '').trim(),
    ogImage:             () => String(data?.ogImage ?? '').trim(),
    tags:                () => (Array.isArray(data?.tags)
      ? data.tags.map((t) => String(t).trim()).filter(Boolean)
      : []),
    gallery:             () => normaliseGallery(data?.gallery),
    isPublished:         () => (typeof data?.isPublished === 'boolean' ? data.isPublished : true),
    omisePaymentEnabled: () => (typeof data?.omisePaymentEnabled === 'boolean'
      ? data.omisePaymentEnabled
      : false),
    /**
     * ── NO FALLBACK, AND THAT IS THE POINT ────────────────────────────────
     * Absent is the SENTINEL for "no rich copy exists for this course" — the
     * state all 79 courses are in, with no backfill planned. There is no value
     * this builder could invent for an absent key that would not be a wipe, so
     * the key-presence gate is the only thing that makes adding this field to a
     * live collection safe: every existing caller omits it, and must therefore
     * leave it alone.
     *
     * When the key IS present it is coerced to a clean array of strings, so a
     * caller cannot land a non-string into a `[String]` path.
     */
    trainingTopicsRich:  () => (Array.isArray(data?.trainingTopicsRich)
      ? data.trainingTopicsRich.map((s) => String(s ?? ''))
      : []),

    /**
     * ── NO FALLBACK, SAME REASON AS trainingTopicsRich ABOVE ─────────────────
     * '' is the sentinel for "no rich body exists for this course" — every row
     * today. Sanitised HERE, on write, whatever the client did: a server action
     * is a POST endpoint and the client is not a trust boundary. Re-sanitised
     * again at render for the same defence-in-depth reason `sanitizeRichHtml`'s
     * other callers are (stored bytes can predate any version of this code).
     */
    descriptionRich:     () => sanitizeRichHtml(String(data?.descriptionRich ?? '')),
  };

  // `courseId` is the upsert key and is always written: on an insert there is
  // nothing to carry forward from, and on an update it is what was matched.
  const update = { courseId };
  for (const key of EXTENSION_FIELDS) {
    if (has(data, key)) update[key] = coerce[key]();
  }
  return update;
}
