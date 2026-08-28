'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { FeaturedCourse } from '@/models/FeaturedCourse';
import { getCourseByCode } from '@/lib/api/public-courses';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';
import { requireAdmin } from '@/lib/actions/auth';

export async function getFeaturedCourses() {
  await dbConnect();
  const items = await FeaturedCourse.find({})
    .sort({ sort_order: 1, createdAt: -1 })
    .lean();
  return JSON.parse(JSON.stringify(items));
}

export async function getActiveFeaturedCourseIds() {
  await dbConnect();
  const items = await FeaturedCourse.find({ active: true })
    .sort({ sort_order: 1 })
    .lean();
  return items.map((i) => i.course_id);
}

export async function addFeaturedCourse(formData) {
  await requireAdmin('featured_courses');
  await dbConnect();

  const rawId = formData.get('course_id');
  // Preserve case — upstream course_id is case-sensitive (e.g. "Power-Apps",
  // not "POWER-APPS"). The autocomplete already selects the exact value
  // from the API, so no normalization needed.
  const course_id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!course_id) return { ok: false, error: 'กรุณาระบุ Course ID' };

  const course_name =
    typeof formData.get('course_name') === 'string'
      ? formData.get('course_name').trim()
      : '';
  if (!course_name) return { ok: false, error: 'กรุณาระบุชื่อคอร์ส' };

  const course_cover_url =
    typeof formData.get('course_cover_url') === 'string'
      ? formData.get('course_cover_url').trim()
      : '';

  const exists = await FeaturedCourse.findOne({ course_id });
  if (exists) return { ok: false, error: `${course_id} มีอยู่แล้ว` };

  // Resolve the cover BEFORE creating, and AWAIT it.
  //
  // The list endpoint does not carry `course_cover_url` — only the detail
  // endpoint does (docs/api-domains.md:117, and see enrich-courses.js) — and
  // the admin page strips the field out of the autocomplete payload anyway, so
  // `course_cover_url` arriving from the form is empty in practice.
  //
  // This used to be a FIRE-AND-FORGET backfill after the create: an un-awaited
  // getCourseByCode(...).then(() => findOneAndUpdate(...)). Two problems with
  // that, and the second is the serious one.
  //
  //   1. The document this action RETURNS is the one the client splices into
  //      its list, so it rendered with no image while the server's very next
  //      render had one. The splice's whole premise is that the client shows
  //      what the server would show.
  //   2. A floating promise in a serverless function has no guarantee of
  //      running. Vercel may freeze or terminate the invocation once the
  //      response is sent, so the backfill could simply never happen — and on
  //      localhost the process lives, so it always completes and the hazard is
  //      invisible in development. (Audited 2026-07-31: all 6 production rows
  //      DO have a cover, so it has landed every time so far. The risk is
  //      latent, not realised — which is exactly when it is cheap to remove.)
  //
  // Cost of awaiting: one upstream call, tag-cached for an hour under
  // `course:<id>`, so it is usually a Data Cache hit. `after()` from
  // next/server was the alternative, but it fixes only problem 2 — the row
  // would still be returned coverless — so the await would be needed anyway
  // and running both would be redundant.
  let cover = course_cover_url;
  if (!cover) {
    try {
      const detail = await getCourseByCode(course_id);
      cover = detail?.course_cover_url ?? '';
    } catch (err) {
      // A cover is not worth failing the add over. The row is created without
      // one, exactly as a failed backfill used to leave it.
      console.warn('[featured-courses] cover lookup failed:', course_id, err?.message ?? err);
    }
  }

  const count = await FeaturedCourse.countDocuments();
  const created = await FeaturedCourse.create({
    course_id,
    course_name,
    course_cover_url: cover,
    sort_order: count,
    active: true,
  });

  revalidatePath('/');
  revalidatePath('/admin/featured-courses');

  // AWAIT vs after() — the rule, written here because this action contains one
  // of each and the two look identical at the call site.
  //
  //   AWAIT when the CLIENT needs the value back. The cover fetch above is
  //     awaited because the document this action RETURNS is spliced into the
  //     list; a value that arrives later arrives too late to be rendered.
  //
  //   after() when nobody is waiting on the value but it must actually RUN.
  //     `triggerLandingSync()` below LOOKS fire-and-forget and is not: it is a
  //     synchronous wrapper that schedules its work inside `after()` from
  //     next/server (see src/lib/landing/triggerLandingSync.js). Do NOT "fix"
  //     it to `await` — the sync fans out to ~10 upstream calls and takes
  //     5-15s, which would be added to every admin save for a cache warm
  //     nobody is waiting on.
  //
  // The third shape — a bare floating promise — is the one that is never
  // acceptable, and is what this file used to do with the cover. A serverless
  // invocation may be frozen or terminated once the response is sent, so the
  // work may never run; on localhost the process lives and it always
  // completes, which is why the hazard is invisible in development.
  triggerLandingSync();

  // { ok, data } as in portfolio.js / nearby-places.js, serialised the way
  // getFeaturedCourses() serialises (lean + JSON round-trip) so the row the
  // client splices is shaped like the one the next server render sends.
  //
  // `createdAt` is what makes this worth returning rather than reconstructing
  // client-side: the list's comparator is { sort_order: 1, createdAt: -1 }, and
  // only the database knows the timestamp.
  //
  // The cover is resolved above, so `data` is complete: the row the client
  // splices renders identically to the row the next server read returns.
  return { ok: true, data: JSON.parse(JSON.stringify(created.toObject())) };
}

export async function updateFeaturedCourse(id, formData) {
  await requireAdmin('featured_courses');
  await dbConnect();

  const sort_order = Number(formData.get('sort_order') ?? 0);
  const active = formData.get('active') === 'true';

  /**
   * `skipSync` — set on all-but-one call by FeaturedCourseList's
   * deferred-save reorder batch, which calls this action once per CHANGED
   * row via Promise.allSettled. Without this, N changed rows would each
   * schedule their own triggerLandingSync() — N overlapping 5-15s
   * landing-snapshot rebuilds for one save. The batch designates exactly one
   * of its calls to carry skipSync=false, so a save collapses to ONE sync
   * regardless of how many rows moved — and because the batch only reaches
   * its "fully succeeded" branch when every call (including the
   * skipSync=false one) has landed, that one call is guaranteed to have run
   * whenever a sync is expected. `handleToggle`'s own single-row call never
   * sets this flag, so an active/inactive toggle still syncs immediately, as
   * before.
   */
  const skipSync = formData.get('skipSync') === 'true';

  /**
   * TRY/CATCH ADDED (was previously absent — a thrown Mongo error propagated
   * as an unhandled rejection to whichever caller awaited this, with no
   * {ok:false} to check). Every caller was enumerated before this change
   * (FeaturedCourseList.jsx: the reorder-save batch, handleToggle; no caller
   * anywhere else in the repo) and each now handles ok:false explicitly.
   */
  try {
    await FeaturedCourse.findByIdAndUpdate(id, { sort_order, active });
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }

  revalidatePath('/');
  revalidatePath('/admin/featured-courses');
  if (!skipSync) triggerLandingSync();
  return { ok: true };
}

export async function deleteFeaturedCourse(id) {
  await requireAdmin('featured_courses');
  await dbConnect();
  await FeaturedCourse.findByIdAndDelete(id);
  revalidatePath('/');
  revalidatePath('/admin/featured-courses');
  triggerLandingSync();
  return { ok: true };
}
