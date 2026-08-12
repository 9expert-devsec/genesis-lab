'use server';

/**
 * Server actions for the CourseExtension collection — admin-managed
 * SEO, gallery, and pretty-URL data layered on top of the upstream
 * read-only course API.
 *
 * Read functions (getCourseExtension, getCourseExtensionByAlias) are
 * intentionally NOT auth-gated — they're consumed by the public course
 * detail page. The data they return is meant to be public anyway.
 *
 * Write/list functions require an authenticated admin session. We
 * don't role-gate further (admin/editor can both manage content),
 * matching the existing banners / featured-* convention.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CourseExtension from '@/models/CourseExtension';
import { duplicateKeyMessage, duplicateKeyField } from '@/lib/db/duplicateKeyMessage';
import { aliasConflict, normaliseAlias, legacyPathOwner } from '@/lib/courses/aliasAvailability';
import { listPublicCourses } from '@/lib/api/public-courses';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';

const ADMIN_PATH = '/admin/courses';

function serialize(doc) {
  if (!doc) return null;
  return JSON.parse(JSON.stringify(doc));
}

// The local `normalizeAlias` is GONE, replaced by `normaliseAlias` from
// lib/courses/aliasAvailability. They were byte-identical, and two copies of
// the rule that decides what a stored alias LOOKS like is precisely how the
// create arm and the save action would come to disagree about whether "/x" and
// "x" are the same URL — the check would find no conflict and the unique index
// would then reject the write, which is the failure this whole round removed.

/** Fetch a single extension by upstream `course_id`. */
export async function getCourseExtension(courseId) {
  if (!courseId) return null;
  await dbConnect();
  const doc = await CourseExtension.findOne({ courseId }).lean();
  return serialize(doc);
}

/**
 * The stored `courseId` matching this code IGNORING CASE, or null.
 *
 * Used by the create flow's duplicate guard. `getCourseExtension` is an exact
 * match, which would let a new "MSE-L1" be created next to an existing "mse-l1"
 * — two courses one keystroke apart sharing one extension row, where saving
 * either overwrites the other's SEO and gallery.
 *
 * Returns the STORED spelling, not the queried one, so the caller can show the
 * admin the casing they actually collided with. Anchored and escaped: a code
 * is user input and `.` is a live regex metacharacter.
 */
export async function findCourseExtensionCodeInsensitive(code) {
  const wanted = String(code ?? '').trim();
  if (!wanted) return null;
  await dbConnect();
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const doc = await CourseExtension.findOne({
    courseId: { $regex: `^${escaped}$`, $options: 'i' },
  })
    .select('courseId')
    .lean();
  return doc?.courseId ?? null;
}

/** Fetch a single extension by its `urlAlias` (with or without leading slash). */
export async function getCourseExtensionByAlias(alias) {
  if (!alias) return null;
  await dbConnect();
  const normalized = normaliseAlias(alias);
  if (!normalized) return null;
  const doc = await CourseExtension.findOne({ urlAlias: normalized }).lean();
  return serialize(doc);
}

/** Admin-only — list every extension for the management table. */
export async function listCourseExtensions() {
  await requireAdmin('courses');
  await dbConnect();
  const docs = await CourseExtension.find({}).sort({ updatedAt: -1 }).lean();
  return serialize(docs);
}

/**
 * The extension summary logged as `before`/`after`.
 *
 * Scalars verbatim; `gallery` as a count. A gallery is a list of media objects
 * with URLs and alt text — twenty of them would blow the writer's 2 KB
 * per-field cap and land as a truncation marker. "the gallery went from 4 items
 * to 7" is the claim worth keeping; the images themselves are on the page.
 * `tags` stay verbatim because they are short and are the field people argue
 * about.
 */
function extensionFields(doc) {
  if (!doc) return null;
  return {
    urlAlias:            doc.urlAlias ?? '',
    metaTitle:           doc.metaTitle ?? '',
    metaDescription:     doc.metaDescription ?? '',
    ogImage:             doc.ogImage ?? '',
    tags:                Array.isArray(doc.tags) ? doc.tags : [],
    isPublished:         Boolean(doc.isPublished),
    omisePaymentEnabled: Boolean(doc.omisePaymentEnabled),
    galleryCount:        Array.isArray(doc.gallery) ? doc.gallery.length : 0,
  };
}

/**
 * Is `alias` free for `courseId` to take? `{ field, error }` or null.
 *
 * ── ONE RULE, TWO CALLERS, AND THAT IS THE POINT ────────────────────────────
 * Called by `saveCourseExtension` just before its write, and by the CREATE arm
 * of CourseForm BEFORE `createCourse` touches MSDB. Both must answer
 * identically or the create flow refuses on a rule the save flow does not, and
 * the admin learns the difference by hitting it.
 *
 * The decision itself is pure and lives in lib/courses/aliasAvailability; this
 * is only the lookup, exactly as `courseIdConflict` is pure while
 * `findCourseExtensionCodeInsensitive` does its reading.
 *
 * ── A FAILED LOOKUP IS NOT "FREE" ───────────────────────────────────────────
 * Same ruling as the duplicate-code guard: refusing to answer is not the same
 * as answering no. The error propagates rather than being swallowed into a
 * cheerful null, because guessing here costs another course's public URL.
 *
 * Exported because this file is 'use server' — every export must be an async
 * function, which is why the pure half lives in the other module.
 */
export async function checkAliasAvailable(alias, courseId) {
  const wanted = normaliseAlias(alias);
  if (!wanted) return null; // no custom URL — always allowed (sparse index)

  await dbConnect();

  /**
   * TWO QUESTIONS, ONE ROUND TRIP EACH, IN PARALLEL.
   *
   *   · does another extension row already hold this alias  (Mongo)
   *   · does it shadow some course's derived /<id>-training-course  (upstream)
   *
   * ── THE UPSTREAM READ IS AN EXTRA CALL, AND WHICH ONE MATTERS ─────────────
   * The create arm does NOT have a course list in hand when this runs: the one
   * `createCourse` fetches lives inside `findCourseCodeInsensitive`, runs AFTER
   * this check, and is deliberately `revalidate: 0` — a fresh network read every
   * time, because a stale duplicate-CODE answer costs another course's data.
   *
   * This uses the ISR-CACHED `listPublicCourses()` (tag `public-courses`)
   * instead, so on the create path it is a cache hit rather than a second
   * uncached fetch of the same list. The trade, stated rather than buried: a
   * course created upstream within the cache window is not yet in this list, so
   * an alias shadowing it would be allowed through. That is acceptable here in
   * a way it is not for the code guard — the consequence is one course being
   * reachable at one URL instead of two, recoverable by editing the alias,
   * against the code guard's silent overwrite of another course's SEO.
   *
   * A FAILED UPSTREAM READ IS NOT "NO SHADOW". It cannot be, on the same
   * reasoning as everywhere else in this flow — but it also must not block an
   * ordinary alias save during an upstream outage, when the alias-vs-alias
   * check is still perfectly answerable. So the failure is surfaced as its own
   * refusal rather than swallowed into a null.
   */
  const [owner, courseList] = await Promise.all([
    CourseExtension.findOne({
      urlAlias: wanted,
      // Scoped to OTHER courses: re-saving a course's own alias is not a
      // collision, and this action is an upsert keyed on courseId, so the
      // overwhelmingly common save is an edit that leaves the alias untouched.
      courseId: { $ne: courseId },
    })
      .select('courseId')
      .lean(),
    // includeHidden — a HIDDEN course still owns its derived
    // /<code>-training-course path. Filtering here would let an admin take an
    // alias that shadows it, and the collision would only surface the day that
    // course is re-published — at which point two rows point at one URL and
    // `findOne({urlAlias})` decides which page the public sees. That is the
    // exact failure the unique index and this check were added for.
    listPublicCourses({ includeHidden: true }).then(
      (r) => ({ ok: true, items: r?.items ?? [] }),
      (err) => ({ ok: false, error: err?.message ?? 'upstream lookup failed' })
    ),
  ]);

  // The alias-vs-alias answer is complete on its own — report it before
  // admitting the upstream half could not be checked.
  const taken = aliasConflict({ alias: wanted, existingCourseId: owner?.courseId ?? null });
  if (taken) return taken;

  if (!courseList.ok) {
    return {
      field: 'urlAlias',
      error:
        'ตรวจสอบ URL ซ้ำกับที่อยู่เดิมของหลักสูตรอื่นไม่สำเร็จ — '
        + `กรุณาลองใหม่อีกครั้ง (${courseList.error})`,
    };
  }

  return aliasConflict({
    alias: wanted,
    legacyOwner: legacyPathOwner({
      alias: wanted,
      courseIds: courseList.items.map((c) => c?.course_id),
      exceptCourseId: courseId,
    }),
  });
}

/** Admin-only — create or update by `courseId`. */
export async function saveCourseExtension(courseId, data) {
  const session = await requireAdmin('courses');
  await dbConnect();

  if (!courseId || typeof courseId !== 'string') {
    return { ok: false, error: 'Missing courseId' };
  }

  const cleanAlias = normaliseAlias(data?.urlAlias);

  // Normalize gallery — drop empty rows, re-number `order`.
  const galleryRaw = Array.isArray(data?.gallery) ? data.gallery : [];
  const gallery = galleryRaw
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

  const tags = Array.isArray(data?.tags)
    ? data.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const update = {
    courseId,
    urlAlias: cleanAlias,
    metaTitle: String(data?.metaTitle ?? '').trim(),
    metaDescription: String(data?.metaDescription ?? '').trim(),
    ogImage: String(data?.ogImage ?? '').trim(),
    tags,
    gallery,
    isPublished:
      typeof data?.isPublished === 'boolean' ? data.isPublished : true,
    omisePaymentEnabled:
      typeof data?.omisePaymentEnabled === 'boolean' ? data.omisePaymentEnabled : false,
  };

  /**
   * ── THE APP-LEVEL ALIAS CHECK — BELT, WITH THE INDEX AS BRACES ────────────
   * This does NOT replace the unique index on `urlAlias`, and must not be read
   * as making it optional. The two do different jobs:
   *
   *   the INDEX is the guarantee. It is the only thing that holds under
   *     concurrency — two admins saving the same alias at the same moment both
   *     pass the check below, because between this read and the write there is
   *     a window in which neither has committed. The index closes it; nothing
   *     at application level can.
   *
   *   this CHECK is the message. It names the course that already owns the
   *     alias, which the E11000 cannot — the driver reports the key, not the
   *     owner — and it produces that message on the normal return path instead
   *     of through an exception, so the caller gets `{ ok: false }` rather than
   *     a rejected write it has to interpret.
   *
   * Delete the index and this becomes a race with a nice error. Delete this and
   * the admin gets a correct but unhelpful "alias already used" with no idea by
   * what. Both, deliberately.
   *
   * SAME CHECK THE CREATE ARM RUNS, via the same `checkAliasAvailable`. It is
   * still needed here even though create now asks first: this action is also
   * the EDIT path and the create arm's RETRY path, neither of which goes
   * through that pre-flight, and it is the last thing between the alias and the
   * write.
   */
  const clash = await checkAliasAvailable(cleanAlias, courseId);
  if (clash) return { ok: false, ...clash };

  try {
    // `before` from an explicit read rather than `new: false`, because this
    // action RETURNS the post-update document to its caller — flipping the flag
    // would silently change what the admin UI receives. One indexed findOne on
    // a small collection is the cheaper mistake.
    //
    // null here is meaningful, not missing: this is an upsert, so a null
    // `before` is how the trail says "this created the extension".
    const before = extensionFields(await CourseExtension.findOne({ courseId }).lean());

    const doc = await CourseExtension.findOneAndUpdate({ courseId }, update, {
      upsert: true,
      new: true,
      runValidators: true,
    });

    // Revalidate the admin list, the per-course editor, and the public
    // detail page (both possible URL shapes — alias and code suffix).
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${courseId}`);
    if (cleanAlias) revalidatePath(cleanAlias);
    revalidatePath(`/${courseId.toLowerCase()}-training-course`);

    // THE SECOND KEY SPACE. `recordId` is the `course_id` CODE, not an MSDB
    // ObjectId — CourseExtension keys on it (see the model: "matches course_id
    // from the upstream API"). Same menu as courses.js, different key space,
    // unnormalised by decision (§8.7 ruling (e)). That is why the code doubles
    // as the label: unlike an ObjectId, it already reads as a course.
    recordAdminActionAfter({
      menu:        'courses',
      action:      before ? 'update' : 'create',
      entity:      'extension',
      recordId:    courseId,
      recordLabel: courseId,
      before,
      after:       extensionFields(doc),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, data: serialize(doc) };
  } catch (err) {
    /**
     * TWO unique indexes now, so an E11000 no longer identifies itself.
     *
     * This used to return the alias message for ANY 11000. While `urlAlias` was
     * not unique that branch could only ever be reached by a `courseId`
     * collision — so the single error it could receive was the one it described
     * wrongly. `duplicateKeyMessage` reads the failing index off the error and
     * says the right thing for each, falling back to a generic message rather
     * than guessing.
     *
     * Reaching here for an alias means the pre-check above lost the race, which
     * is exactly the case the index exists to catch.
     */
    const duplicate = duplicateKeyMessage(err);
    if (duplicate) {
      // `field` so the CALLER can put the refusal on the input that caused it,
      // and so the pre-check path and this race path are indistinguishable to
      // it — an alias refusal must land under the alias box whether the
      // application check caught it or the unique index did.
      const field = duplicateKeyField(err);
      return { ok: false, error: duplicate, ...(field ? { field } : {}) };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

/** Admin-only — delete an extension document. The upstream course
 *  itself remains; only the SEO/gallery layer is removed. */
export async function deleteCourseExtension(courseId) {
  const session = await requireAdmin('courses');
  await dbConnect();

  // findOneAndDelete rather than deleteOne: same single round-trip, but it
  // hands back the document being removed so `before` costs nothing extra.
  // The caller sees no difference — this action returns { ok: true } either
  // way, exactly as before.
  //
  // No label read is needed here, unlike deleteCourse: `courseId` IS the
  // human-readable code, so the record identifies itself.
  const removed = await CourseExtension.findOneAndDelete({ courseId }).lean();

  revalidatePath(ADMIN_PATH);

  recordAdminActionAfter({
    menu:        'courses',
    action:      'delete',
    entity:      'extension',
    recordId:    courseId,
    recordLabel: courseId,
    before:      extensionFields(removed),
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true };
}
