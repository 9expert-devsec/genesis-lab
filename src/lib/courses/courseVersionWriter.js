/**
 * The one writer for `course_versions`.
 *
 * Contract, in order of importance — the same posture as recordAdminAction and
 * snapshotVersion, and for the same reason:
 *
 *   1. NEVER THROWS. A caller can await it anywhere without a failed history
 *      write ever surfacing as a failed save. A lost version row is acceptable;
 *      a lost save is not. This is the single most important property in the
 *      file and everything else gives way to it.
 *   2. NEVER SILENT ON FAILURE. It logs before it swallows. A history that has
 *      quietly not been writing is discovered the first time someone needs it,
 *      which is the worst possible moment. The caller still sees nothing: the
 *      return value is a report nobody has to check.
 *   3. NO NO-OP ROWS. An identical content snapshot writes nothing. An admin
 *      pressing save twice must not produce two versions.
 *
 * Server-only (imports a mongoose model). The pure decisions — what a snapshot
 * contains, whether two are equal — live in courseSnapshot.js so they are
 * testable without a connection.
 */

import CourseVersion from '@/models/CourseVersion';
import {
  VERSION_KIND,
  PRE_IMAGE,
  canonicalCourseKey,
  snapshotsEqual,
} from '@/lib/courses/courseSnapshot';

/**
 * How many times to re-read the highest number and try again after losing a
 * race for it.
 *
 * FOUR, and the number is a judgement rather than a measurement. Each attempt
 * costs one indexed read and one rejected insert, so the budget is cheap; four
 * simultaneous savers of ONE course is already far past anything this admin
 * sees, and a budget large enough to cover a pathological case would just mean
 * a long stall before the same fallback.
 */
export const MAX_NUMBER_ATTEMPTS = 4;

/** Mongo's duplicate-key error, however the driver wrapped it. */
function isDuplicateKey(err) {
  return err?.code === 11000 || err?.code === 11001;
}

/**
 * Allocate the next number for this course and insert.
 *
 * ── WHY READ-MAX-THEN-INSERT, AND NOT A COUNTER ─────────────────────────────
 * There is no document to `$inc`. The course itself is upstream over HTTP, and
 * `course_extensions` — the only Mongo doc per course — is an upsert that is
 * legitimately absent for courses nobody has given SEO to. A counter living in
 * a document that may not exist is a counter that stops working for exactly the
 * courses least likely to be noticed. Introducing a second collection whose
 * only job is to hold integers would be a new store to keep consistent with
 * this one, for a sequence this one already contains.
 *
 * So the collection IS the counter, and the partial unique index on
 * (courseId, versionNumber) is what makes the increment atomic.
 *
 * ── TWO ADMINS SAVING THE SAME COURSE AT THE SAME MOMENT ────────────────────
 * Both read the same highest number N. Both compute N+1. Both insert.
 *
 *   · ONE WINS. Its row lands with N+1.
 *   · THE OTHER IS REFUSED by the unique index — E11000, not a silent
 *     overwrite. It re-reads (now N+1), computes N+2, and inserts again.
 *
 * Both rows survive, both numbers are distinct, and the order is the order the
 * database accepted them in. Nothing is lost and no number is handed out twice.
 * The loser pays one extra read and one rejected insert.
 *
 * ── WHEN THE BUDGET RUNS OUT ────────────────────────────────────────────────
 * The row is written UNNUMBERED, and that is the deliberate choice rather than
 * a failure. A repeated number is bad; a LOST SNAPSHOT is worse, and it is the
 * one outcome that cannot be repaired afterwards — the state it described is
 * gone. `versionNumber: null` is excluded from the unique index precisely so
 * this row can land, and PageVersion's own history has the same state in it for
 * every row written before numbering existed. A UI that meets one omits the
 * number rather than inventing a placeholder.
 */
async function insertNumbered(Model, base, warn) {
  for (let attempt = 1; attempt <= MAX_NUMBER_ATTEMPTS; attempt += 1) {
    const latest = await Model.findOne({ courseId: base.courseId })
      .sort({ versionNumber: -1 })
      .select('versionNumber')
      .lean();

    const highest = Number(latest?.versionNumber);
    const versionNumber = Number.isFinite(highest) ? highest + 1 : 1;

    try {
      const row = await Model.create({ ...base, versionNumber });
      return { row, versionNumber };
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      warn(
        `[courseVersion] number ${versionNumber} for ${base.courseId} was taken `
        + `(attempt ${attempt}/${MAX_NUMBER_ATTEMPTS}) — re-reading and retrying.`
      );
    }
  }

  warn(
    `[courseVersion] could not allocate a number for ${base.courseId} after `
    + `${MAX_NUMBER_ATTEMPTS} attempts — writing the row UNNUMBERED rather than `
    + 'losing the snapshot.'
  );
  const row = await Model.create({ ...base, versionNumber: null });
  return { row, versionNumber: null };
}

/**
 * Write one content version — a save.
 *
 * @param {object}  entry
 * @param {string}  entry.courseId    the course_id code; canonicalised here
 * @param {string} [entry.upstreamId] the MSDB _id, when the caller has one
 * @param {object}  entry.snapshot    from buildCourseSnapshot
 * @param {object} [entry.preImage]   { state, snapshot } — see PRE_IMAGE
 * @param {{id?:string,name?:string}} [entry.actor]
 * @param {object} [deps] test seam ONLY — production passes nothing.
 *
 * @returns {Promise<{written:number, reason:string, versionNumbers:number[]}>}
 *   A report. Nobody has to read it.
 */
export async function recordCourseContentVersion(entry = {}, deps = {}) {
  const {
    CourseVersion: Model = CourseVersion,
    warn = (...args) => console.warn(...args),
  } = deps;

  const courseId = canonicalCourseKey(entry.courseId);
  if (!courseId) {
    warn('[courseVersion] refusing a row with no course code.');
    return { written: 0, reason: 'no-course-id', versionNumbers: [] };
  }
  if (!entry.snapshot) {
    warn(`[courseVersion] refusing a row with no snapshot for ${courseId}.`);
    return { written: 0, reason: 'no-snapshot', versionNumbers: [] };
  }

  const actor = {
    id: entry.actor?.id == null ? '' : String(entry.actor.id),
    name: String(entry.actor?.name ?? ''),
  };
  const upstreamId = entry.upstreamId == null ? '' : String(entry.upstreamId);
  const preImage = entry.preImage ?? { state: PRE_IMAGE.SKIPPED };

  try {
    /**
     * ── THE BASELINE ROW ────────────────────────────────────────────────────
     * Only when the course has NO history at all. Its snapshot is the state the
     * caller read BEFORE the writes — the only moment that state was ever
     * observable, since MSDB is written over HTTP and offers no `new: false`.
     *
     * Without it, a course's first recorded version has nothing to be compared
     * against and its whole content reads as newly created. With it, the very
     * first save is diffable.
     *
     * It is written INSIDE this call, at the joint point after both stores have
     * been written, rather than at the moment it was read. The value crossed
     * back through the caller to get here, which is what keeps every write to
     * this collection at one place in the save sequence.
     */
    const existing = await Model.findOne({ courseId }).select('_id').lean();
    const rows = [];

    if (!existing && preImage.state === PRE_IMAGE.CAPTURED && preImage.snapshot) {
      rows.push({
        courseId,
        upstreamId,
        kind: VERSION_KIND.CONTENT,
        snapshot: preImage.snapshot,
        file: null,
        // The baseline IS the pre-image, so by construction nothing is missing.
        preImageMissing: false,
        actor,
      });
    }

    rows.push({
      courseId,
      upstreamId,
      kind: VERSION_KIND.CONTENT,
      snapshot: entry.snapshot,
      file: null,
      /**
       * Flagged only when the read genuinely FAILED, and only on a course whose
       * history starts here. A create (`ABSENT`) had no earlier state, so
       * nothing about it is missing — saying otherwise would report a defect
       * every time someone adds a course.
       */
      preImageMissing: !existing && preImage.state === PRE_IMAGE.UNAVAILABLE,
      actor,
    });

    /**
     * ── THE NO-OP RULE ──────────────────────────────────────────────────────
     * Compared against the newest CONTENT row, and against each row this call
     * is about to write, so a save that changed nothing adds nothing — whether
     * the previous version came from an earlier save or from the baseline two
     * lines above.
     *
     * file_replacement rows are excluded from the comparison entirely. They
     * carry no snapshot, so treating one as "the latest state" would make the
     * next save look like a change from nothing.
     */
    /**
     * ── WHY THE SORT IS COMPOUND ────────────────────────────────────────────
     * `createdAt` ALONE IS NOT A TOTAL ORDER. Two rows written in the same
     * millisecond tie, and Mongo is then free to return either — so "the latest
     * version" would be a coin flip, and the no-op rule would compare against
     * the wrong snapshot roughly half the time. A baseline and the save that
     * follows it are written back to back and are exactly that likely to
     * collide.
     *
     * `_id` breaks the tie the same way the audit trail's cursor does: ObjectIds
     * rise with insertion, so the newest row wins its own millisecond. Found by
     * a test whose fake stamped every row with one timestamp — see the note on
     * `makeModel` in test/pure/courseVersionWriter.
     *
     * NOT sorted on `versionNumber`, which looks like the obvious key and is
     * the wrong one: it is nullable by design, and a descending sort puts every
     * number above every null — so a numbered row would be picked as "latest"
     * over the unnumbered row written after it.
     */
    const latest = await Model.findOne({ courseId, kind: VERSION_KIND.CONTENT })
      .sort({ createdAt: -1, _id: -1 })
      .select('snapshot')
      .lean();

    let previous = latest?.snapshot ?? null;
    const written = [];

    for (const row of rows) {
      if (snapshotsEqual(previous, row.snapshot)) continue;
      const { versionNumber } = await insertNumbered(Model, row, warn);
      written.push(versionNumber);
      previous = row.snapshot;
    }

    return {
      written: written.length,
      reason: written.length ? 'written' : 'unchanged',
      versionNumbers: written,
    };
  } catch (err) {
    // Rule 1. The save already happened and must still report success.
    warn(
      `[courseVersion] content version NOT written for ${courseId} — `
      + `history is now missing a save: ${err?.message ?? err}`
    );
    return { written: 0, reason: 'error', versionNumbers: [] };
  }
}

/**
 * Write one file-replacement version — a course-outline PDF was overwritten.
 *
 * ── NEVER SUPPRESSED AS A NO-OP, AND THAT IS THE POINT ──────────────────────
 * The no-op rule above compares snapshots. This row has none, and it must not
 * acquire one: the path it describes is byte-identical before and after, so any
 * snapshot-shaped comparison would find nothing changed and drop the row — the
 * exact blindness this kind of row exists to fix. A file replacement is never a
 * no-op. The bytes really were destroyed and replaced.
 *
 * @param {object} entry
 * @param {string} entry.courseId  the course_id code; canonicalised here
 * @param {object} entry.file      { field, lang, filename, publicPath, bytes,
 *                                   uploadedAt, outlineVersion }
 * @param {{id?:string,name?:string}} [entry.actor]
 * @param {object} [deps] test seam ONLY — production passes nothing.
 */
export async function recordCourseFileReplacement(entry = {}, deps = {}) {
  const {
    CourseVersion: Model = CourseVersion,
    warn = (...args) => console.warn(...args),
  } = deps;

  const courseId = canonicalCourseKey(entry.courseId);
  if (!courseId) {
    warn('[courseVersion] refusing a file row with no course code.');
    return { written: 0, reason: 'no-course-id', versionNumbers: [] };
  }
  if (!entry.file) {
    warn(`[courseVersion] refusing a file row with no file block for ${courseId}.`);
    return { written: 0, reason: 'no-file', versionNumbers: [] };
  }

  const f = entry.file;
  const base = {
    courseId,
    upstreamId: entry.upstreamId == null ? '' : String(entry.upstreamId),
    kind: VERSION_KIND.FILE_REPLACEMENT,
    // Null, not an empty object: `kind` and the shape must never disagree, and
    // a reader tests `snapshot` to decide whether a diff is even possible.
    snapshot: null,
    file: {
      field: String(f.field ?? ''),
      lang: String(f.lang ?? ''),
      filename: String(f.filename ?? ''),
      publicPath: String(f.publicPath ?? ''),
      bytes: Number.isFinite(Number(f.bytes)) ? Number(f.bytes) : 0,
      uploadedAt: f.uploadedAt ? new Date(f.uploadedAt) : new Date(),
      outlineVersion: Number.isFinite(Number(f.outlineVersion))
        ? Number(f.outlineVersion)
        : null,
    },
    preImageMissing: false,
    actor: {
      id: entry.actor?.id == null ? '' : String(entry.actor.id),
      name: String(entry.actor?.name ?? ''),
    },
  };

  try {
    const { versionNumber } = await insertNumbered(Model, base, warn);
    return { written: 1, reason: 'written', versionNumbers: [versionNumber] };
  } catch (err) {
    warn(
      `[courseVersion] file version NOT written for ${courseId} — a replaced `
      + `outline is now unrecorded: ${err?.message ?? err}`
    );
    return { written: 0, reason: 'error', versionNumbers: [] };
  }
}
