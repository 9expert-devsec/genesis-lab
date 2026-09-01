/**
 * Has the course editor been changed since it was seeded?
 *
 * ── WHY A SIGNATURE AND NOT A FIELD-BY-FIELD DIFF ───────────────────────────
 * The editor spans two stores and about thirty fields, most of them
 * UNCONTROLLED (`defaultValue`), so the typed values live in the DOM and not in
 * React state. Reading them back means `new FormData(form)`, and the honest
 * comparison is "the whole submission, then versus now". A per-field diff would
 * need a hand-maintained list of fields, and the field it forgot would be the
 * one whose loss goes unwarned.
 *
 * ── A FALSE POSITIVE IS WORSE THAN NO GUARD ─────────────────────────────────
 * A dialog that appears when nothing changed teaches admins to dismiss it, and
 * then it does not protect the one time it matters. Two things make that a real
 * risk here rather than a theoretical one:
 *
 *   1. TrainingTopicsEditor calls `setRows(seedNormalised)` in a MOUNT EFFECT,
 *      so its hidden `training_topics` input holds one value on first paint and
 *      another a tick later. React runs child effects BEFORE the parent's, so a
 *      baseline captured in the parent's mount effect catches the pre-normalised
 *      value and every page load looks edited. The caller therefore snapshots
 *      after a frame, and additionally gates on real user interaction.
 *   2. The Gallery tab is `hidden`, not unmounted. Its rows are ordinary React
 *      state with no `name` attributes, so they never enter FormData — they are
 *      compared here explicitly. Being present is not being changed.
 *   3. Section 7's RICH bullets are the same kind of thing: React state with no
 *      `name`, lifted out of TrainingTopicsEditor. They must be compared here
 *      because a FORMATTING-ONLY edit — bolding a word, nesting a bullet —
 *      leaves the plain projection in the hidden input byte-identical. Without
 *      this entry the guard would report CLEAN and let the admin navigate away
 *      from work the form is holding.
 *
 * `order` is deliberately dropped from the gallery comparison: it is positional
 * and is renumbered on save, so carrying it would report a change for a list
 * that is identical.
 */

const str = (v) => (v == null ? '' : String(v));

/**
 * A stable, comparable snapshot of everything the editor can change.
 *
 * @param {object}   input
 * @param {Array<[string, unknown]>} [input.formEntries] — `[...new FormData(form)]`
 * @param {object}   [input.extension] — the rail + gallery state
 */
export function courseEditorSignature({ formEntries = [], extension = {} } = {}) {
  // File entries are dropped: a File is not comparable across renders, and the
  // uploaders post their RESULT as a hidden text input, which is compared.
  const form = formEntries
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => [str(key), value])
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));

  const gallery = (Array.isArray(extension.gallery) ? extension.gallery : []).map((item) => ({
    type: str(item?.type),
    url: str(item?.url),
    videoId: str(item?.videoId),
    alt: str(item?.alt),
  }));

  /**
   * The rich bullets as stored: a flat `string[]`, one sanitised entry per
   * kept row. Compared as-is because that IS what would be written — the
   * array is already normalised by `buildTopicSavePayload`, and `[]` (no rich
   * copy) and a populated array are exactly the two states the save can send.
   */
  const trainingTopicsRich = Array.isArray(extension.trainingTopicsRich)
    ? extension.trainingTopicsRich.map(str)
    : [];

  return JSON.stringify({
    form,
    ext: {
      urlAlias: str(extension.urlAlias).replace(/^\//, ''),
      metaTitle: str(extension.metaTitle),
      metaDescription: str(extension.metaDescription),
      ogImage: str(extension.ogImage),
      tags: str(extension.tags),
      isPublished: extension.isPublished !== false,
      gallery,
      trainingTopicsRich,
      // Same reasoning as trainingTopicsRich just above: React state with no
      // `name` attribute, lifted out of the course body editor, so it never
      // enters FormData and must be compared here explicitly or a
      // formatting-only edit reads as clean.
      descriptionRich: str(extension.descriptionRich),
    },
  });
}

/**
 * Dirty is a comparison against the SEED, never against emptiness.
 *
 * A null baseline means "not snapshotted yet" and reports CLEAN. That is the
 * safe direction for the one frame before the snapshot exists: warning about
 * work that cannot have happened yet is precisely the false positive above.
 */
export function isCourseEditorDirty(baseline, current) {
  if (baseline == null) return false;
  return baseline !== current;
}
