'use server';

/**
 * Course version history — the I/O half.
 *
 * ── WHERE THIS SITS IN A SAVE, AND WHY IT IS NOT INSIDE EITHER WRITE ────────
 * One press of บันทึก is TWO independent writes: `updateCourse` PUTs the course
 * upstream to MSDB, `saveCourseExtension` upserts the local rail and gallery.
 * Either can fail alone. A version written inside one of them would describe
 * half a course — and would describe it BEFORE the other half had landed, so
 * the snapshot would be of a state that never existed on screen.
 *
 * So the version is written at the JOINT POINT: after both have returned,
 * whatever they returned. Nothing here inspects their results. It re-reads both
 * stores and records what is actually there, which is the only account that is
 * true for a partial save as well as a clean one.
 *
 * ── AND WHY THAT NEEDS TWO CALLS ────────────────────────────────────────────
 * The baseline — the state BEFORE the writes — can only be read before them,
 * and MSDB is written over HTTP so there is no `new: false` to recover it
 * afterwards. `captureCoursePreImage` runs first and returns it; the caller
 * hands it back to `commitCourseVersion`, which does every WRITE.
 *
 * The extra round trip is paid ONCE PER COURSE, not once per save:
 * `captureCoursePreImage` checks for existing history first and returns
 * immediately without touching MSDB when there is any. Only a course whose
 * history is empty costs a read.
 *
 * ── NOTHING ON THE WRITE PATH MAY FAIL A SAVE ───────────────────────────────
 * The two WRITE exports swallow everything. They are called after the save has
 * already happened, so there is no outcome they could usefully report and
 * nothing the admin could do about one. The returns exist for tests and for a
 * reader.
 *
 * The READ exports at the foot of this file are the deliberate exception: they
 * report a refusal instead of swallowing it, because an empty answer there
 * would read as "this course has no history". See the note above them.
 */

import { after } from 'next/server';
import { requireAdmin } from '@/lib/actions/auth';
import { aiFetch, unwrap } from '@/lib/api/client';
import { dbConnect } from '@/lib/db/connect';
import CourseExtension from '@/models/CourseExtension';
import CourseOutlineFile from '@/models/CourseOutlineFile';
import CourseVersion from '@/models/CourseVersion';
import {
  PRE_IMAGE,
  buildCourseSnapshot,
  canonicalCourseKey,
} from '@/lib/courses/courseSnapshot';
import { recordCourseContentVersion } from '@/lib/courses/courseVersionWriter';
// ADDED beside the statements above rather than folded into either — the
// standing rule in this repo. `VERSION_KIND` comes from courseSnapshot, which
// is already imported above; it is named in its own statement so the read
// side's dependencies are visible as a group.
import { VERSION_KIND } from '@/lib/courses/courseSnapshot';
import { diffSnapshots, summariseChanges, VERSION_PAGE_SIZE } from '@/lib/courses/courseVersionDiff';

/**
 * Read one course from MSDB, bypassing every cache.
 *
 * `revalidate: 0` is client.js's documented "admin-page always fresh" signal.
 * A history entry read through a cached path would record the course as it was
 * up to an hour ago and assert it was the state at save time — the single most
 * damaging thing a version row can get wrong, because it looks right.
 *
 * Filters on `course` when an ObjectId is in hand, exactly as
 * readCourseUncached in lib/actions/courses.js does and for the same measured
 * reason: upstream silently ignores `_id` and returns the whole list. Falls
 * back to the exact-match `course_id` when the caller has only a code — the
 * outline path never sees an ObjectId.
 *
 * NEVER THROWS. Null means "could not read", which the caller turns into an
 * explicit flag rather than an empty snapshot.
 */
async function readCourseUncached({ upstreamId, courseId }) {
  const params = upstreamId ? { course: upstreamId } : { course_id: courseId };
  if (!upstreamId && !courseId) return null;
  try {
    const raw = await aiFetch('/public-course', { params, revalidate: 0 });
    const { items } = unwrap(raw);
    return items?.[0] ?? null;
  } catch (err) {
    console.warn('[courseVersion] uncached course read failed:', err?.message ?? err);
    return null;
  }
}

/**
 * Both local halves for one course code.
 *
 * Read directly rather than through `getCourseExtension`, because that helper
 * serialises through JSON for a client boundary this never crosses, and because
 * the outline rows have no accessor of their own — CourseOutlineFile is
 * documented as "not a delivery lookup", read only so a human can answer
 * questions about a file, which is precisely what this is.
 */
async function readLocalHalves(courseId) {
  await dbConnect();
  const [extension, outlineFiles] = await Promise.all([
    CourseExtension.findOne({ courseId }).lean(),
    // Lower-cased: CourseOutlineFile keys on the NORMALISED code, because that
    // is what the path and the Cloudinary public_id are built from. See the
    // model's own note on why the raw form would let one asset occupy two rows.
    CourseOutlineFile.find({ courseId: String(courseId).toLowerCase() }).lean(),
  ]);
  return { extension, outlineFiles };
}

/** The whole state of one course, from both stores. Never throws. */
async function readCourseState({ upstreamId, courseId }) {
  const [course, local] = await Promise.all([
    readCourseUncached({ upstreamId, courseId }),
    readLocalHalves(courseId).catch((err) => {
      console.warn('[courseVersion] local read failed:', err?.message ?? err);
      return { extension: null, outlineFiles: [] };
    }),
  ]);
  return {
    course,
    snapshot: buildCourseSnapshot({
      course,
      extension: local.extension,
      outlineFiles: local.outlineFiles,
    }),
  };
}

/**
 * The state before a save — call BEFORE the two writes.
 *
 * @returns {Promise<{state: string, snapshot?: object}>} one of PRE_IMAGE:
 *   SKIPPED     the course already has history; nothing was read
 *   CAPTURED    a baseline, ready to be handed to commitCourseVersion
 *   ABSENT      the read worked and there is no such course yet (a create)
 *   UNAVAILABLE the read FAILED — the save must still proceed, and the first
 *               version row will say the baseline is missing
 *
 * Never throws, including on a permission error: this runs on the save path and
 * refusing to answer must not be able to stop a save. A caller that cannot
 * reach it at all simply omits the argument, which reads as SKIPPED.
 */
export async function captureCoursePreImage({ courseId, upstreamId } = {}) {
  try {
    await requireAdmin('courses');
  } catch {
    return { state: PRE_IMAGE.SKIPPED };
  }

  const code = canonicalCourseKey(courseId);
  if (!code) return { state: PRE_IMAGE.SKIPPED };

  try {
    await dbConnect();
    // The cheap question first. A course with history needs no baseline, and
    // this is what keeps the MSDB round trip off every save but the first.
    const existing = await CourseVersion.findOne({ courseId: code }).select('_id').lean();
    if (existing) return { state: PRE_IMAGE.SKIPPED };

    const { course, snapshot } = await readCourseState({
      upstreamId: String(upstreamId ?? ''),
      courseId: code,
    });

    // A read that came back with no course is an ANSWER, not a failure — it is
    // what a create looks like. Only a thrown read is UNAVAILABLE, and
    // readCourseUncached is the only thing that can tell the two apart, which
    // is why it returns null for both and this asks about `course`.
    if (!course) return { state: PRE_IMAGE.ABSENT };

    return { state: PRE_IMAGE.CAPTURED, snapshot };
  } catch (err) {
    console.warn('[courseVersion] pre-image capture failed:', err?.message ?? err);
    return { state: PRE_IMAGE.UNAVAILABLE };
  }
}

/**
 * Record a version — call AFTER both save writes have returned.
 *
 * Re-reads both stores and writes what is there. Deliberately indifferent to
 * whether either write succeeded: if neither landed, the state is unchanged and
 * the no-op rule drops the row on its own, so "both failed" needs no special
 * case and cannot produce a phantom version.
 *
 * ── SCHEDULED, NOT AWAITED ──────────────────────────────────────────────────
 * The work runs in `after()`, exactly as recordAdminActionAfter does, so an
 * admin never waits on an MSDB round trip for a record they did not ask for.
 * `after()` throws outside a request scope (a script, a seed), and an unguarded
 * call would break the never-block-a-save rule in the one case where the guard
 * looks unnecessary — so it is wrapped, and a version lost outside a request is
 * the correct outcome, because no admin action happened.
 */
export async function commitCourseVersion({ courseId, upstreamId, preImage } = {}) {
  let session;
  try {
    session = await requireAdmin('courses');
  } catch {
    return { ok: false, reason: 'forbidden' };
  }

  const code = canonicalCourseKey(courseId);
  if (!code) return { ok: false, reason: 'no-course-id' };

  const actor = { id: session.user?.id, name: session.user?.name };
  const anchor = String(upstreamId ?? '');
  // Re-shaped rather than trusted: only the two keys this needs survive, so a
  // malformed envelope degrades to SKIPPED instead of reaching the writer.
  const baseline = {
    state: String(preImage?.state ?? PRE_IMAGE.SKIPPED),
    snapshot: preImage?.snapshot ?? null,
  };

  const run = async () => {
    try {
      const { snapshot } = await readCourseState({ upstreamId: anchor, courseId: code });
      await recordCourseContentVersion({
        courseId: code,
        upstreamId: anchor,
        snapshot,
        preImage: baseline,
        actor,
      });
    } catch (err) {
      console.warn('[courseVersion] commit failed:', err?.message ?? err);
    }
  };

  try {
    after(run);
  } catch (err) {
    console.warn('[courseVersion] could not schedule the write:', err?.message ?? err);
  }

  return { ok: true };
}

/* ══ THE READ SIDE ═════════════════════════════════════════════════════════
 *
 * READ ONLY, ALL OF IT. Nothing below writes to `course_versions`, to a course,
 * or to anything else. There is no restore, no rollback and no delete, by
 * ruling — a version history that can also change things is a second write path
 * into the course, and this round is not that.
 *
 * Unlike the two writers above, these do NOT swallow a permission failure into
 * a benign empty result. On the save path an empty answer is the right
 * degradation; here it would render as "this course has no history" to someone
 * who simply may not see it, which is a lie the UI would have no way to correct.
 * They return an explicit refusal instead and the tab says so.
 */

/* VERSION_PAGE_SIZE is imported, NOT declared here: this module is
 * `'use server'` and every export of such a file must be an async function —
 * a plain `export const` is a build error, not a style preference. It lives in
 * lib/courses/courseVersionDiff with the rest of the read side's pure values. */

/** A file block as the client renders it — Dates become strings. */
function serialiseFile(file) {
  return {
    field: file.field ?? '',
    lang: file.lang ?? '',
    filename: file.filename ?? '',
    publicPath: file.publicPath ?? '',
    bytes: Number(file.bytes) || 0,
    uploadedAt: file.uploadedAt ? new Date(file.uploadedAt).toISOString() : null,
    outlineVersion: file.outlineVersion ?? null,
  };
}

/**
 * Changed-field labels for one page of rows, as a Map keyed by row id.
 *
 * Only CONTENT rows take part. A file_replacement carries no snapshot, is never
 * diffed, and must not sit between two content rows as if it were one — so it
 * is skipped on both sides of every comparison.
 */
async function summarisePage(courseId, pageRows) {
  const out = new Map();
  const contentRows = pageRows.filter((r) => r.kind === VERSION_KIND.CONTENT);
  if (contentRows.length === 0) return out;

  const oldest = pageRows[pageRows.length - 1];

  // The listed content rows, plus the newest content row OLDER than the page,
  // which is what the last row on the page is diffed against. Without it the
  // last row on every page would claim to have changed everything.
  const [onPage, predecessor] = await Promise.all([
    CourseVersion.find({ _id: { $in: contentRows.map((r) => r._id) } })
      .select('snapshot createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .lean(),
    CourseVersion.findOne({
      courseId,
      kind: VERSION_KIND.CONTENT,
      createdAt: { $lt: oldest.createdAt },
    })
      .select('snapshot')
      .sort({ createdAt: -1, _id: -1 })
      .lean(),
  ]);

  const ordered = [...onPage, ...(predecessor ? [predecessor] : [])];
  for (let i = 0; i < onPage.length; i += 1) {
    const current = ordered[i];
    const previous = ordered[i + 1] ?? null;
    // The FIRST version of a course has nothing before it. Its summary is empty
    // and the UI says so, rather than pretending every field was created at once.
    const changes = previous ? diffSnapshots(previous.snapshot, current.snapshot) : [];
    out.set(String(current._id), summariseChanges(changes));
  }
  return out;
}

/**
 * One course's version list — METADATA ONLY.
 *
 * ── THE PROJECTION IS THE POINT ────────────────────────────────────────────
 * `.select('-snapshot')` is not a micro-optimisation. A snapshot is 7.5 KB on
 * the smallest real course today and 20.3 KB on the largest, measured across
 * all 79; the metadata beside it is a couple of hundred bytes. Shipping the
 * list with snapshots attached would move close to half a megabyte per tab-open
 * on a course with a full page of history, to render rows that show a number, a
 * date and a name — and that ratio only worsens, because the rich editors that
 * dominate a snapshot are the ones the admin has barely started using.
 *
 * The same split, for the same measured reason, as getPageVersions in
 * lib/actions/pageBuilder.js. Its note carries the page-side numbers.
 *
 * ── WHY THE SUMMARY IS A SECOND READ AND NOT A WIDER PROJECTION ────────────
 * The list shows WHICH FIELDS changed, and that cannot be known without
 * comparing two snapshots — there is no stored changed-field list, because
 * adding one would mean changing the writer, which this round may not do.
 *
 * So the summary is computed HERE, on the server, over a BOUNDED page of rows,
 * and only the resulting labels cross to the client. The browser never receives
 * a snapshot from this action at all. That keeps the WIRE cost proportional to
 * what is displayed, which is the constraint that mattered. The server-side
 * read is real, is bounded by VERSION_PAGE_SIZE, and is stated here rather than
 * hidden: the cheap fix is a `changedKeys` array written at save time, which is
 * a writer change and deliberately NOT made in this round.
 */
export async function listCourseVersions({ courseId, limit = VERSION_PAGE_SIZE } = {}) {
  try {
    await requireAdmin('courses');
  } catch {
    return { ok: false, reason: 'forbidden', rows: [] };
  }

  const code = canonicalCourseKey(courseId);
  if (!code) return { ok: false, reason: 'no-course-id', rows: [] };

  try {
    await dbConnect();

    /**
     * NEWEST FIRST BY `createdAt`, NEVER BY `versionNumber`.
     *
     * The number is nullable by design — the writer falls back to an unnumbered
     * row when it cannot win a number under concurrency, precisely so a
     * snapshot is never lost to protect the numbering. Sorting on it would rank
     * every such row against every number, and Mongo puts null below all of
     * them on a descending sort, so the NEWEST row could sort last. `_id`
     * breaks a same-millisecond tie, exactly as the writer's own lookup does.
     */
    const rows = await CourseVersion.find({ courseId: code })
      .select('-snapshot')     // NOT the snapshot — see above
      .sort({ createdAt: -1, _id: -1 })
      .limit(Math.max(1, Math.min(Number(limit) || VERSION_PAGE_SIZE, 100)))
      .lean();

    if (rows.length === 0) return { ok: true, rows: [] };

    const summaries = await summarisePage(code, rows);

    return {
      ok: true,
      rows: rows.map((r) => ({
        id: String(r._id),
        kind: r.kind,
        versionNumber: r.versionNumber ?? null,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        actorName: r.actor?.name ?? '',
        preImageMissing: Boolean(r.preImageMissing),
        file: r.file ? serialiseFile(r.file) : null,
        summary: summaries.get(String(r._id)) ?? '',
      })),
    };
  } catch (err) {
    console.warn('[courseVersion] list failed:', err?.message ?? err);
    return { ok: false, reason: 'error', rows: [] };
  }
}

/**
 * ONE version's field-by-field comparison against the version before it.
 *
 * Returns the COMPUTED CHANGES, not the two snapshots. The client never
 * receives a whole snapshot from this action either: only the fields that
 * actually moved travel, and for an unchanged field neither value does. That is
 * what keeps a 20 KB snapshot off the wire to show a price edit.
 *
 * `previousMissing` is a real and different answer from "nothing changed":
 *   · the FIRST version of a course has no predecessor — expected, not an error
 *   · a version whose `preImageMissing` is set has one because the pre-image
 *     read FAILED, and the UI must say the previous state was never captured
 *     rather than render a diff against nothing.
 */
export async function getCourseVersionDiff({ versionId } = {}) {
  try {
    await requireAdmin('courses');
  } catch {
    return { ok: false, reason: 'forbidden' };
  }

  const id = String(versionId ?? '').trim();
  if (!id) return { ok: false, reason: 'no-version-id' };

  try {
    await dbConnect();
    const row = await CourseVersion.findById(id).lean();
    if (!row) return { ok: false, reason: 'not-found' };

    /**
     * A FILE REPLACEMENT IS NEVER DIFFED. It carries no snapshot by
     * construction, and the path it describes is byte-identical before and
     * after, so there is nothing a comparison could show. It returns as an
     * EVENT and the UI renders it as one.
     */
    if (row.kind === VERSION_KIND.FILE_REPLACEMENT) {
      return {
        ok: true,
        kind: row.kind,
        file: row.file ? serialiseFile(row.file) : null,
        changes: [],
        preImageMissing: false,
        previousMissing: false,
      };
    }

    const previous = await CourseVersion.findOne({
      courseId: row.courseId,
      kind: VERSION_KIND.CONTENT,
      createdAt: { $lt: row.createdAt },
    })
      .select('snapshot versionNumber createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    return {
      ok: true,
      kind: row.kind,
      file: null,
      preImageMissing: Boolean(row.preImageMissing),
      previousMissing: !previous,
      previousVersionNumber: previous?.versionNumber ?? null,
      changes: previous ? diffSnapshots(previous.snapshot, row.snapshot) : [],
    };
  } catch (err) {
    console.warn('[courseVersion] diff failed:', err?.message ?? err);
    return { ok: false, reason: 'error' };
  }
}
