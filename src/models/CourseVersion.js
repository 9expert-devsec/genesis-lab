import mongoose from 'mongoose';

import { VERSION_KIND, VERSION_KINDS } from '@/lib/courses/courseSnapshot';

/**
 * CourseVersion — what a course looked like, once per save.
 *
 * The course analogue of PageVersion, and modelled on it deliberately: a full
 * snapshot rather than a diff, unbounded history, `createdAt` only, and a write
 * that MUST NEVER block a save. Where it departs from that model, it is because
 * a course is not a page, and each departure is named below.
 *
 * ── WHY NOT THE AUDIT LOG ───────────────────────────────────────────────────
 * `admin_audit_logs` caps every payload field at 2 KB (MAX_PAYLOAD_CHARS) and
 * `courseFields()` therefore records ten scalars plus four COUNTS — "the
 * objectives list went from 6 items to 4". That is the right trade for a trail
 * whose job is who/what/when across the whole admin. It cannot answer "what did
 * the third topic's wording used to say", and it should not try. This
 * collection is allowed to be large; that is the whole point of it being
 * separate. Nothing is stored twice: no long value appears in both.
 *
 * ── TWO KINDS OF ROW, AND WHY THE DISTINCTION IS A FIELD ────────────────────
 * `kind` is an enum, not something a reader infers from which fields are
 * populated:
 *
 *   'content'          a save. `snapshot` holds the whole state; `file` is
 *                      null. A diff UI compares it to the previous CONTENT row.
 *   'file_replacement' a course-outline PDF was replaced. `file` names what
 *                      changed; `snapshot` is null and there is NOTHING to
 *                      diff. A UI renders it as an event, not a comparison.
 *
 * A file_replacement row exists because the outline upload is not symmetrical
 * with the cover image. The cover gets a fresh Cloudinary public_id on every
 * re-upload, so the live cover does not change until the admin saves and the
 * ordinary save-time snapshot catches it. The outline signs a DERIVED public_id
 * with `overwrite: true`, so THE LIVE FILE CHANGES THE MOMENT IT IS PICKED —
 * before, and regardless of, any save. An admin who replaces the PDF and then
 * closes the form without saving has changed what customers download, and a
 * save-time-only hook would record nothing at all.
 *
 * So yes: a file_replacement row can exist for a form that was never saved.
 * That is correct. The file really did change and it is live.
 *
 * ── THE TRAP THE `file` BLOCK EXISTS FOR ────────────────────────────────────
 * The outline path is derived from course_id, so a re-upload leaves the stored
 * path string IDENTICAL before and after. A naive snapshot diff shows no change
 * whatsoever. The recorded size, timestamp and CourseOutlineFile version are
 * what make the change visible — in this row, and in every content snapshot's
 * `outlineRefs`.
 *
 * ── WHAT IS NOT HERE ────────────────────────────────────────────────────────
 * The old bytes. Viewing a superseded file is out of scope, so nothing copies
 * or archives what `overwrite: true` destroyed. This records THAT it happened
 * and enough to describe it.
 */
const FileChangeSchema = new mongoose.Schema(
  {
    /** The course field the file belongs to, e.g. 'course_outline_th'. */
    field: { type: String, default: '' },
    /** 'th' | 'en' — the outline language. */
    lang: { type: String, default: '' },
    /** Derived server-side from (courseId, lang); never client-supplied. */
    filename: { type: String, default: '' },
    /** The root-relative path — IDENTICAL before and after. See the trap note. */
    publicPath: { type: String, default: '' },
    bytes: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: null },
    /**
     * CourseOutlineFile's own replacement counter, not Cloudinary's version.
     *
     * Ruled deliberately: Cloudinary's `version` IS returned to the browser on
     * the direct upload, and is discarded before it reaches the server. Threading
     * it through would mean changing `recordCourseOutlineUpload`'s signature for
     * a value the local counter already answers — the counter is incremented by
     * the same write that records the file, so it cannot drift from it.
     */
    outlineVersion: { type: Number, default: null },
  },
  { _id: false }
);

const CourseVersionSchema = new mongoose.Schema(
  {
    /**
     * The course_id CODE, upper-cased — see canonicalCourseKey.
     *
     * NOT the MSDB ObjectId, and this is the one place this collection departs
     * from the audit log on purpose. That trail accepts both key spaces on the
     * `courses` menu because its rows are independent. Versions are a SEQUENCE:
     * N and N+1 have to be adjacent rows of one series, so both writers must
     * agree on the key before either writes — and the code is the only
     * identifier the outline-upload writer has ever been given.
     */
    courseId: { type: String, required: true, trim: true },

    /**
     * The MSDB `_id`, when the writer had one. Recorded, never keyed on: the
     * edit form is routed by it and can supply it, the outline upload cannot.
     * It is here so a later UI can link a version to the upstream row without
     * a lookup by code — the lookup the rename anchor exists to avoid.
     */
    upstreamId: { type: String, default: '' },

    kind: { type: String, enum: VERSION_KINDS, required: true, default: VERSION_KIND.CONTENT },

    /**
     * The whole state, for a CONTENT row. Mixed, like PageVersion's, because it
     * spans two stores whose schemas drift independently and the history has to
     * survive that. Null on a file_replacement row.
     */
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    /** Populated on a file_replacement row; null on a content row. */
    file: { type: FileChangeSchema, default: null },

    /**
     * The state before this save could not be read.
     *
     * Set ONLY on the first row of a course's history, and only when the
     * pre-image GET actually FAILED. A create sets it false — there was no
     * earlier state, so nothing is missing. The distinction matters to a reader:
     * without the flag, "history starts here because the course was new" and
     * "history starts here because MSDB did not answer" are the same row.
     *
     * An admin's save is NEVER blocked by a failed pre-image read.
     */
    preImageMissing: { type: Boolean, default: false },

    /**
     * Sequential within one `courseId`. Null is a real state, not a defect —
     * see the numbering note on the index below.
     */
    versionNumber: { type: Number, default: null },

    actor: {
      id: { type: String, default: '' },
      // A SNAPSHOT of the display name at the time. Admins get renamed and
      // deleted; the history must still say who it was.
      name: { type: String, default: '' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'course_versions' }
);

/** One course's history, newest first — the read a diff UI will make. */
CourseVersionSchema.index({ courseId: 1, createdAt: -1 });

/** Serves the "what is the highest number so far" read the writer makes. */
CourseVersionSchema.index({ courseId: 1, versionNumber: -1 });

/**
 * ── THE NUMBERING GUARANTEE ─────────────────────────────────────────────────
 *
 * PageVersion gets its numbers from a counter it does not own: `$inc` on
 * `PageBuilder.publishedVersion`, inside the same single-document write that
 * publishes. THAT IS NOT AVAILABLE HERE. A course's authoritative row lives in
 * MSDB, written over HTTP; the only Mongo document per course is its
 * `course_extensions` row, which is an upsert and is legitimately ABSENT for
 * courses nobody has given SEO to. A counter that depends on a document which
 * may not exist is a counter that silently stops working.
 *
 * So the number is allocated the other way round: THIS INDEX IS THE MECHANISM,
 * not the backstop. The writer reads the highest number for the course, adds
 * one, and inserts; the unique index is what makes the increment atomic, by
 * refusing the loser of any race. The writer then re-reads and retries. See
 * courseVersionWriter.js for the retry budget and what happens when it runs
 * out.
 *
 * PARTIAL on `versionNumber` being a NUMBER, for exactly the reason PageVersion
 * is: Mongo treats a missing field as null and considers two nulls EQUAL in a
 * unique index, so a plain unique index would reject the second unnumbered row
 * on any course. Unnumbered rows are the deliberate last resort when the retry
 * budget is exhausted — losing the SNAPSHOT to protect the numbering would be
 * the wrong way round.
 */
CourseVersionSchema.index(
  { courseId: 1, versionNumber: 1 },
  { unique: true, partialFilterExpression: { versionNumber: { $type: 'number' } } }
);

export default mongoose.models.CourseVersion ||
  mongoose.model('CourseVersion', CourseVersionSchema);
