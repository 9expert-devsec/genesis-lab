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
 * ── NOTHING HERE MAY FAIL A SAVE ────────────────────────────────────────────
 * Both exports swallow everything. They are called after the save has already
 * happened, so there is no outcome they could usefully report and nothing the
 * admin could do about one. The returns exist for tests and for a reader.
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
