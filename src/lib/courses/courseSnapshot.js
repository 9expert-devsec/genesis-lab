/**
 * What a course LOOKED LIKE, as one comparable object — the pure half of the
 * course version history.
 *
 * ── WHY THIS IS OUT OF THE ACTION FILE ──────────────────────────────────────
 * Same reason trainingTopics.js and extensionUpdate.js are: the action module
 * is `'use server'` and no test can import it. "Two saves that changed nothing
 * produce the SAME object" and "a populated `program` and a bare id produce the
 * same object" are questions a test has to be able to RUN, not read off the
 * source.
 *
 * ── A SNAPSHOT, NEVER A DIFF ────────────────────────────────────────────────
 * Every row stores the whole state. A later UI derives the diff by comparing
 * adjacent versions; storing a computed diff would freeze today's comparison
 * format into the data and make a better comparison unimplementable.
 *
 * ── WHY IT IS BIGGER THAN THE AUDIT LOG'S PAYLOAD, ON PURPOSE ───────────────
 * `courseFields()` in lib/actions/courses.js records ten scalars and four
 * COUNTS, and excludes every long field by name — because an audit row is
 * capped at 2 KB per field (MAX_PAYLOAD_CHARS) and a truncation marker holding
 * 200 arbitrary characters is worse than a chosen summary. This object is the
 * opposite trade deliberately: it carries the rich bodies and the topic
 * bullets, which is the entire reason the history lives in its own collection
 * instead of in `admin_audit_logs`. Nothing here is stored twice — the two
 * field sets do not overlap on a single long value.
 */

/**
 * The two kinds of row, and the field that tells them apart.
 *
 * A later diff UI must be able to render "content changed" and "file replaced"
 * DIFFERENTLY WITHOUT GUESSING, so the distinction is an explicit enum rather
 * than something inferred from which fields happen to be populated:
 *
 *   CONTENT           — `snapshot` is an object, `file` is null. Diff it
 *                       against the previous CONTENT row.
 *   FILE_REPLACEMENT  — `file` is an object, `snapshot` is null. There is
 *                       nothing to diff; render the file block.
 *
 * The two are mutually exclusive and the writer enforces it, so `kind` and the
 * shape can never disagree.
 */
export const VERSION_KIND = Object.freeze({
  CONTENT: 'content',
  FILE_REPLACEMENT: 'file_replacement',
});

export const VERSION_KINDS = Object.freeze([
  VERSION_KIND.CONTENT,
  VERSION_KIND.FILE_REPLACEMENT,
]);

/**
 * How the state BEFORE this save was obtained. Four states, because three of
 * them look identical from the row and mean completely different things.
 *
 *   CAPTURED    — the pre-image GET succeeded. It becomes the baseline row.
 *   ABSENT      — the GET succeeded and there was no course. A create. There
 *                 is no earlier state to be missing, so nothing is flagged.
 *   UNAVAILABLE — the GET FAILED. The save still happened; the row carries
 *                 `preImageMissing: true` so a reader is never left inferring
 *                 an empty baseline from a failed read.
 *   SKIPPED     — the course already has history, so no baseline is needed and
 *                 no GET was made.
 */
export const PRE_IMAGE = Object.freeze({
  CAPTURED: 'captured',
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
  SKIPPED: 'skipped',
});

/**
 * ONE key space for a course's history, and it is the CODE.
 *
 * The audit log accepts two key spaces on the `courses` menu (an MSDB ObjectId
 * for the course row, the `course_id` code for everything keyed locally) and
 * says so in auditContract.js. A version history cannot: version N and N+1 have
 * to be adjacent rows of one sequence, so the two writers must agree on the key
 * before either writes.
 *
 * The CODE is the only identifier BOTH writers hold. `recordCourseOutlineUpload`
 * is handed a course code and a language and has never seen an MSDB `_id` — the
 * upload component is routed by the code. Keying on the ObjectId would leave
 * every file-replacement row unable to name its own course.
 *
 * Upper-cased because that is the form the admin types (the course_id input
 * upper-cases on change) and the form MSDB stores. Lower-cased twins are a real
 * hazard here — `npm run audit:course-id-casing` exists for them — and this is
 * what stops `power-bi` and `POWER-BI` from becoming two histories of one
 * course.
 *
 * KNOWN LIMIT, stated rather than hidden: renaming a course's code STARTS A NEW
 * HISTORY. `CourseExtension.formerCodes` already records the old code, so a
 * later UI can stitch the two sequences; nothing here does it, and no row is
 * lost either way.
 */
export function canonicalCourseKey(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * An upstream reference as a plain id string.
 *
 * MSDB returns `program`, `previous_course` and `related_courses` either
 * POPULATED (a whole sub-document) or as a bare ObjectId, depending on the
 * route and the query. Storing whichever arrived would make two snapshots of an
 * unchanged course compare as different — the no-op rule would then write a
 * version on every save, which is the failure it exists to prevent.
 */
function refId(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value._id ?? value.id ?? '');
  return String(value);
}

function refIds(value) {
  return Array.isArray(value) ? value.map(refId).filter(Boolean) : [];
}

function str(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function strArr(value) {
  return Array.isArray(value) ? value.map(str) : [];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** An instant as an ISO string, so two reads of one Date compare equal. */
function iso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * One training topic, reduced to the two keys MSDB actually stores.
 *
 * `{ title, bullets }` — the shape lib/courses/trainingTopics.js decodes and
 * the shape upstream keeps. The TITLES AND THE BULLET BODIES ARE BOTH HERE:
 * they are the single biggest thing the audit log records only as a count, and
 * "the third topic's wording changed" is the question this history exists to
 * answer.
 */
function topic(row) {
  return {
    title: str(row?.title),
    bullets: strArr(row?.bullets),
  };
}

/**
 * The stored outline object, reduced to the one key that identifies a file.
 *
 * The other seven keys upstream carries (file_id, filename, content_type,
 * size, uploaded_at …) are measured EMPTY even on courses with a working
 * download button, so keeping them would store seven nulls and imply they mean
 * something.
 *
 * ── THIS PATH IS THE ONE THAT CANNOT SHOW A CHANGE ──────────────────────────
 * The path is derived from (course_id, lang) and the upload signs with
 * `overwrite: true`, so replacing the PDF leaves this string byte-identical.
 * That is why `outlineRefs` below exists, and why it is not optional.
 */
function outline(value) {
  return { download_url: str(value?.download_url) };
}

/**
 * The pointer to a CourseOutlineFile row — RULING 3.
 *
 * NOT a copy of that row. The file's identity, its Cloudinary public_id, its
 * content type and its uploader stay where they already live; this carries the
 * three values that make a replacement VISIBLE in a snapshot diff, and nothing
 * else:
 *
 *   outlineVersion — CourseOutlineFile's own `$inc` counter. The only number in
 *                    the system that counts how many times these bytes have
 *                    been replaced. Cloudinary keeps ONE version at a fixed id
 *                    and the MSDB path never changes, so without it a
 *                    replacement leaves no trace a diff can reach.
 *   bytes          — a different file is almost always a different size.
 *   uploadedAt     — when it happened.
 *
 * `null` means no file for that language. A reader that wants the publicId or
 * the uploader looks the row up by (courseId, lang); duplicating them here
 * would be two records of one fact, drifting apart the first time one is
 * edited.
 */
function outlineRef(row) {
  if (!row) return null;
  return {
    outlineVersion: num(row.version),
    bytes: num(row.bytes),
    uploadedAt: iso(row.uploadedAt),
  };
}

/**
 * Assemble one course's content snapshot from the two stores it lives in.
 *
 * @param {object}   [input.course]       the MSDB public-course row, or null
 * @param {object}   [input.extension]    the course_extensions doc, or null
 * @param {object[]} [input.outlineFiles] CourseOutlineFile rows for this course
 *
 * Both stores may legitimately be absent: a course with no extension row is
 * ordinary (the row is an upsert), and a snapshot taken when the MSDB read came
 * back empty is a real state. Absence is recorded as `null`, never as an empty
 * object, so a reader can tell "no extension" from "an extension with nothing
 * in it" — which is the same distinction extensionFields() gets wrong for the
 * audit log and is allowed to, because it reports a boolean rather than
 * reconstructing a state.
 */
export function buildCourseSnapshot({ course, extension, outlineFiles } = {}) {
  const files = Array.isArray(outlineFiles) ? outlineFiles : [];
  const byLang = (lang) => files.find((f) => str(f?.lang).toLowerCase() === lang) ?? null;

  return {
    course: course ? courseSide(course) : null,
    extension: extension ? extensionSide(extension) : null,
    outlineRefs: {
      th: outlineRef(byLang('th')),
      en: outlineRef(byLang('en')),
    },
  };
}

/**
 * The MSDB half.
 *
 * `title` and `bullets` are ABSENT, and that is not an oversight — measured
 * across all 80 courses, upstream returns neither on any read route, so genesis
 * has never been able to see them. shapePayload omits them from every write for
 * that reason. A snapshot cannot record a field the system cannot read, and
 * putting `title: ''` here would assert that every course has an empty body.
 */
function courseSide(row) {
  return {
    course_id: str(row.course_id),
    course_name: str(row.course_name),
    course_teaser: str(row.course_teaser),
    course_trainingdays: num(row.course_trainingdays),
    course_traininghours: num(row.course_traininghours),
    course_levels: str(row.course_levels),
    course_price: num(row.course_price),
    course_netprice: num(row.course_netprice),
    course_cover_url: str(row.course_cover_url),
    sort_order: num(row.sort_order),
    course_type_public: Boolean(row.course_type_public),
    course_type_inhouse: Boolean(row.course_type_inhouse),
    course_workshop_status: Boolean(row.course_workshop_status),
    course_certificate_status: Boolean(row.course_certificate_status),
    course_promote_status: Boolean(row.course_promote_status),
    program: refId(row.program),
    skills: strArr(row.skills),
    previous_course: refId(row.previous_course),
    related_courses: refIds(row.related_courses),
    course_objectives: strArr(row.course_objectives),
    course_target_audience: strArr(row.course_target_audience),
    course_prerequisites: strArr(row.course_prerequisites),
    course_system_requirements: strArr(row.course_system_requirements),
    training_topics: Array.isArray(row.training_topics) ? row.training_topics.map(topic) : [],
    course_outline_th: outline(row.course_outline_th),
    course_outline_en: outline(row.course_outline_en),
  };
}

/**
 * The genesis half — and the half that holds the LONG TEXT.
 *
 * `descriptionRich` is where a course's description actually lives: MSDB's
 * `title` is unreadable and therefore unwritable, so the rich body an admin
 * types goes to `course_extensions`. `trainingTopicsRich` holds the topic
 * bodies. Both are excluded from the audit log by name. They are the reason
 * this collection exists.
 */
function extensionSide(doc) {
  return {
    urlAlias: str(doc.urlAlias),
    metaTitle: str(doc.metaTitle),
    metaDescription: str(doc.metaDescription),
    ogImage: str(doc.ogImage),
    tags: strArr(doc.tags),
    isPublished: doc.isPublished !== false,
    omisePaymentEnabled: Boolean(doc.omisePaymentEnabled),
    gallery: Array.isArray(doc.gallery)
      ? doc.gallery.map((g) => ({
          type: str(g?.type),
          url: str(g?.url),
          videoId: str(g?.videoId),
          alt: str(g?.alt),
          order: num(g?.order),
        }))
      : [],
    descriptionRich: str(doc.descriptionRich),
    trainingTopicsRich: strArr(doc.trainingTopicsRich),
    objectivesRich: str(doc.objectivesRich),
    targetAudienceRich: str(doc.targetAudienceRich),
    prerequisitesRich: str(doc.prerequisitesRich),
    systemRequirementsRich: str(doc.systemRequirementsRich),
  };
}

/**
 * A snapshot as one canonical string.
 *
 * Keys are emitted in SORTED order at every level, so two objects that differ
 * only in key order compare equal. `JSON.stringify` alone would not: it emits
 * insertion order, and a document read back from Mongo does not promise the
 * same key order as one just built in memory. The no-op rule rests entirely on
 * this, so it is a sort rather than a hope.
 */
export function snapshotFingerprint(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortDeep(value[key]);
    return out;
  }
  return value;
}

/**
 * Are these two snapshots the same state? — the no-op rule (B3).
 *
 * Two nulls are NOT equal here: a null snapshot is the absence of a comparison,
 * not a state that can match. Returning true for it would suppress the very
 * first version of every course.
 */
export function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return snapshotFingerprint(a) === snapshotFingerprint(b);
}
