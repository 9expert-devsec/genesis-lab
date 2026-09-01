'use server';

/**
 * Server actions for Public Course CRUD against the upstream MSDB API.
 *
 * Genesis does NOT keep a Mongo cache for course detail rows — public
 * pages call MSDB via aiFetch with ISR + cache tags. So these actions
 * only have to:
 *   1. Forward the form payload to MSDB (msdb-write helpers).
 *   2. Revalidate the admin list path so the table refreshes.
 *   3. Bust the public read-side tags (updateCourse only — see below).
 *
 * Public-page revalidation is ALSO triggered by the inbound MSDB webhook
 * (`course.created` / `course.updated` / `course.deleted`), but that is an
 * upstream push this app does not control the subscription for. updateCourse
 * busts courseTag/publicCourseTag/UPSTREAM_TAGS.PUBLIC_COURSES itself so an
 * edit is not silently dependent on that webhook reaching this domain.
 *
 * Field mapping — Genesis form ↔ MSDB PublicCourse (curl-verified):
 *   course_name          ← course display name
 *   course_id            ← human-readable code (required on create,
 *                          immutable on edit by convention)
 *   course_teaser        ← card / SEO snippet
 *   title                ← LONG rich-text body (yes — MSDB's "title"
 *                          field stores the description)
 *   course_trainingdays  ← number of training days
 *   course_traininghours ← number of training hours
 *   course_levels        ← "1"|"2"|"3"|"4"
 *   course_price         ← list price (THB)
 *   course_netprice      ← net price after discount (nullable)
 *   course_cover_url     ← Cloudinary URL
 *   course_type_public   ← boolean
 *   course_type_inhouse  ← boolean
 *   course_workshop_status     ← boolean
 *   course_certificate_status  ← boolean
 *   course_promote_status      ← boolean
 *   sort_order           ← display order
 *   program              ← ObjectId
 *   skills[]             ← ObjectId[]
 *   previous_course      ← ObjectId   (resolved from course_id by caller)
 *   related_courses[]    ← ObjectId[] (resolved from course_id[] by caller, max 5)
 *   course_objectives[]          ← string[] (bullets)
 *   course_target_audience[]     ← string[]
 *   course_prerequisites[]       ← string[]
 *   course_system_requirements[] ← string[]
 *   bullets[]                    ← string[] (highlight bullets)
 *   training_topics              ← [{ title, bullets[] }]
 *
 * NOT SENT, and therefore not listed above: course_doc_paths, course_lab_paths,
 * course_case_study_paths, exam_links, website_urls. The form no longer edits
 * them and the payload no longer mentions them, so MSDB keeps whatever it
 * already holds. They still exist upstream and are still returned by the read
 * side — `website_urls` in particular is still READ on public surfaces
 * (articles/[slug]/_components/ArticleDetailClient.jsx:712 links every related
 * course card through `website_urls[0]`, and lib/actions/career-paths.js:286
 * copies it into a curriculum's publicUrl). What was removed is the ability to
 * EDIT it from genesis admin; MSDB's own admin still can.
 */

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { aiFetch, unwrap } from '@/lib/api/client';
import { parseTrainingTopicsValue } from '@/lib/courses/trainingTopics';
import { outlineFromFormValue } from '@/lib/courses/courseOutline';
import { checkboxBool, courseTypeFlags } from '@/lib/courses/courseTypeFlags';
import { courseIdConflict } from '@/lib/courses/courseIdAvailability';
import { findCourseExtensionCodeInsensitive } from '@/lib/actions/course-extensions';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import {
  resolveCourseObjectIds,
  resolveCourseObjectId,
} from '@/lib/api/resolveIds';
import { bustUpstream, courseTag, publicCourseTag, UPSTREAM_TAGS } from '@/lib/api/bustUpstream';
import { derivedCoursePath } from '@/lib/courses/renameCacheFanout';

const ADMIN_PATH = '/admin/courses';

/**
 * ── AUDIT NOTES FOR THIS FILE — THE MSDB HALF ───────────────────────────────
 *
 * Nothing here writes Mongo. Every mutation is an HTTP call to MSDB, which is
 * exactly why the coverage guard could not see these three exports until its
 * classifier learned the `msdb*` names (§8.9). Two consequences for the audit
 * call that do not apply anywhere else in the sweep:
 *
 *   recordId is an MSDB ObjectId, and it identifies NOTHING to a human. That
 *   is what makes `recordLabel` load-bearing here rather than decorative — see
 *   the comment in deleteCourse.
 *
 *   `before` costs a network round-trip, not a Mongo read. It is taken only
 *   where the value cannot be recovered another way: on DELETE, where the
 *   record is about to stop existing. On update it is deliberately skipped —
 *   see courseFields().
 */

/**
 * The compact course summary logged as `before`/`after`.
 *
 * NOT the shaped MSDB payload. That object carries `training_topics`,
 * `bullets`, four arrays of URLs and a long rich-text `title`; a single edit
 * would blow past the writer's 2 KB per-field cap and land in the trail as a
 * truncation marker — 200 characters of arbitrary prefix, which is worse than
 * a chosen summary because it looks like data.
 *
 * So: the scalar fields an admin would actually dispute, verbatim, plus counts
 * for the long-form arrays. "the objectives list went from 6 items to 4" is the
 * useful claim; the objectives themselves are on the page.
 */
function courseFields(body) {
  return {
    course_id:            body.course_id ?? '',
    course_name:          body.course_name ?? '',
    course_levels:        body.course_levels ?? '',
    course_price:         body.course_price ?? null,
    course_netprice:      body.course_netprice ?? null,
    sort_order:           body.sort_order ?? null,
    course_type_public:   Boolean(body.course_type_public),
    course_type_inhouse:  Boolean(body.course_type_inhouse),
    course_promote_status: Boolean(body.course_promote_status),
    program:              body.program ?? '',
    counts: {
      skills:          Array.isArray(body.skills) ? body.skills.length : 0,
      related_courses: Array.isArray(body.related_courses) ? body.related_courses.length : 0,
      objectives:      Array.isArray(body.course_objectives) ? body.course_objectives.length : 0,
      training_topics: Array.isArray(body.training_topics) ? body.training_topics.length : 0,
    },
  };
}

/**
 * Read one course fresh, bypassing every cache.
 *
 * `revalidate: 0` is client.js's documented "admin-page always fresh" signal —
 * it becomes `cache: 'no-store'`. This must NOT go through
 * `getPublicCourse()` (tagged, 1 h ISR) or `resolveCourseObjectId()`
 * (resolveIds.js:26, 300 s and untagged): a label read through a cached path
 * logs the course's name from BEFORE a rename, and the audit row would then
 * assert the wrong thing about the record that was just deleted.
 *
 * Filters on `course`, never `_id`. Upstream silently ignores `_id` and
 * returns the whole list — verified again 2026-07-31: `?_id=<oid>` gives 77
 * rows, `?course=<oid>` gives exactly the one.
 *
 * Never throws: a label is worth a round-trip, not a failed delete.
 */
async function readCourseUncached(id) {
  try {
    const raw = await aiFetch('/public-course', { params: { course: id }, revalidate: 0 });
    const { items } = unwrap(raw);
    return items?.[0] ?? null;
  } catch (err) {
    console.warn('[courses] uncached label read failed:', err?.message ?? err);
    return null;
  }
}

/** "COPILOT-STU — AI Agents with Microsoft Copilot Studio" */
function courseLabel(courseId, courseName) {
  return [courseId, courseName].map((s) => String(s ?? '').trim()).filter(Boolean).join(' — ');
}

// ── coercion helpers ────────────────────────────────────────────────

function toStr(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function toNum(v) {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toNullableNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toStrArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.length > 0) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Split a textarea value into trimmed lines, dropping blanks. Used for
 * bullet lists and URL arrays.
 */
function linesOf(formData, key) {
  const raw = formData instanceof FormData ? formData.get(key) : formData?.[key];
  return toStr(raw)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pull the JSON-serialized Training Topics out of the form and decode them.
 *
 * Each row is `{ title: string, bullets: string[] }` — the shape MSDB actually
 * stores. It was `{ topic, subtopics }` here, which upstream discards, so a
 * save replaced real subdocuments with schema defaults. The decode itself lives
 * in src/lib/courses/trainingTopics.js, which carries the measurement and is
 * importable by tests; this module is `'use server'` and is not.
 */
function parseTrainingTopics(formData) {
  const raw = formData instanceof FormData
    ? formData.get('training_topics')
    : formData?.training_topics;
  return parseTrainingTopicsValue(raw);
}

/**
 * Shape the form payload for MSDB. Returns an object with **course_id
 * strings** still present in `related_courses` / `previous_course` —
 * the caller resolves these to ObjectIds before POSTing upstream so
 * the local doc retains the human-readable codes.
 */
function shapePayload(formData) {
  const get = (k) =>
    formData instanceof FormData ? formData.get(k) : formData?.[k];
  const getAll = (k) => {
    if (formData instanceof FormData) return formData.getAll(k);
    const v = formData?.[k];
    return Array.isArray(v) ? v : [];
  };

  // course_type comes from either two checkboxes (new form) or the legacy
  // single select. Which dialect this is, is decided by whether the LEGACY
  // FIELD was posted — never by whether a checkbox has a value, because an
  // unchecked box posts nothing and so cannot tell the two apart. See
  // lib/courses/courseTypeFlags for the trace this came out of.
  const { isPublic, isInhouse } = courseTypeFlags({
    courseType:   get('course_type'),
    publicField:  get('course_type_public'),
    inhouseField: get('course_type_inhouse'),
  });

  /**
   * ── TWO KEYS ARE WRITTEN NOWHERE BECAUSE THEY CAN BE READ NOWHERE ────────
   *
   * `title` (MSDB's name for the long rich-text body) and `bullets` are NOT
   * in the payload below. Not sent empty — ABSENT, which is the difference
   * that matters: `PUT /public-course/<id>` MERGES, established by controlled
   * experiment in a98df7a (35 fields absent from a one-key body survived it
   * untouched), so an omitted key leaves the stored value alone while an empty
   * one overwrites it.
   *
   * ── WHAT THEY WERE DOING ────────────────────────────────────────────────
   * Neither key is returned by ANY read route. Measured 2026-08-31 across all
   * 80 courses: `title` and `bullets` appear on 0 of them, in the list and in
   * the `?course_id=` detail query alike; the path-style detail routes 405.
   * They are the only two of the payload's 28 keys in that state — every other
   * key round-trips.
   *
   * So the admin form's inputs were populated from `initial?.title` /
   * `initial?.bullets`, which are permanently `undefined`, and the textarea
   * therefore always rendered blank. Every save then posted `title: ''` and
   * `bullets: []` over whatever MSDB actually held. Opening a course in genesis
   * admin and pressing save destroyed its rich body — no warning, no way to see
   * it had happened from this side, because this side cannot read the field.
   *
   * ── WHY OMISSION IS THE FIX, NOT A DIFFERENT EMPTY VALUE ────────────────
   * If genesis cannot read a field, it cannot preserve it, so it must not
   * write it. Any value at all — '', [], null — is genesis asserting something
   * about a field it has never seen.
   *
   * ── WHAT THIS COSTS, STATED PLAINLY ─────────────────────────────────────
   * `title`'s input is left in the form and INERT: an admin can type in it and
   * saving will do nothing. That is deliberately worse-looking and strictly
   * better than the alternative, which is that typing in it worked once and
   * then the next save of that course wiped it. Leaving it in place is a form
   * choice, not a payload one — the real repair is MSDB returning `title` on
   * read; then the key comes back to this payload and the input works for the
   * first time.
   *
   * `bullets`' input was different: the user confirmed it unused and it was
   * removed from the form outright rather than left inert. The key stays
   * omitted here regardless — this is the guard against MSDB one day
   * returning it and a stray write path reappearing, not a statement about
   * whether the form still shows it.
   */
  return {
    course_name:               toStr(get('course_name') || get('title')),
    course_id:                 toStr(get('course_id')),
    course_teaser:             toStr(get('course_teaser') || get('short_desc')),
    /* `title` IS NOT EMITTED — the key is absent, not empty. See the
     * read-blind-write note above the return. */
    course_trainingdays:       toNum(get('course_trainingdays') || get('duration_days')),
    course_traininghours:      toNum(get('course_traininghours')),
    course_levels:             toStr(get('course_levels')) || '1',
    course_price:              toNum(get('course_price') || get('price')),
    course_netprice:           toNullableNum(get('course_netprice')),
    course_cover_url:          toStr(get('course_cover_url') || get('image_url')),
    sort_order:                toNum(get('sort_order')),
    course_type_public:        isPublic,
    course_type_inhouse:       isInhouse,
    course_workshop_status:    checkboxBool(get('course_workshop_status')),
    course_certificate_status: checkboxBool(get('course_certificate_status')),
    course_promote_status:     checkboxBool(get('course_promote_status')),
    /* STAYS `|| undefined` — deliberately NOT clearable, unlike its neighbour.
     * A course with no program drops out of the mega menu, the /schedule
     * grouping and all-courses at once. Measured before ruling: 0 of the 77
     * upstream courses have an empty program, so nothing depends on clearing
     * it. MSDB would accept null (the path is not `required`), which is exactly
     * why the guard has to live here and in the form's `required` select rather
     * than upstream. Omitting the key leaves the stored program in place. */
    program:                   toStr(get('program')) || undefined,
    skills:                    toStrArr(getAll('skills')),
    // course_id strings — caller resolves to ObjectIds for MSDB body.
    /* `null`, not undefined and NOT '': an optional prerequisite has to be
     * removable, and undefined omitted the key so "— ไม่มี —" never saved.
     * Verified read-only against MSDB's schema — the path is
     * `{ ObjectId, ref: PublicCourse, default: null }`, so null is its own
     * resting value and validates; '' is REJECTED with a cast-to-ObjectId
     * error, which is why the empty string is not the fix here. */
    previous_course:           toStr(get('previous_course')) || null,
    related_courses:           toStrArr(getAll('related_courses')).slice(0, 5),
    // Bullets / arrays
    course_objectives:           linesOf(formData, 'course_objectives'),
    course_target_audience:      linesOf(formData, 'course_target_audience'),
    course_prerequisites:        linesOf(formData, 'course_prerequisites'),
    course_system_requirements:  linesOf(formData, 'course_system_requirements'),
    /* `bullets` IS NOT EMITTED either, and for the same reason — see below. */
    /* course_doc_paths, course_lab_paths, course_case_study_paths and
     * exam_links are NOT EMITTED — the keys are absent, not empty.
     *
     * Their inputs were removed from the form (section 8). `linesOf` returns
     * `[]` for a missing key, never undefined, so leaving these lines in place
     * would have sent four empty arrays on every save and MSDB's unfiltered
     * `findByIdAndUpdate(id, body)` would have written them: 74 of 77 courses
     * carry a course_doc_paths URL and 2 carry exam_links. Omitting the keys
     * puts them in the same leave-alone channel as `program`.
     *
     * Restoring one is one line — plus its input back in section 8. */
    training_topics:             parseTrainingTopics(formData),
    /* ── OUTLINE PDFs — ALWAYS BOTH KEYS, ALWAYS THE FULL 8-KEY OBJECT ──────
     *
     * The form posts a root-relative path per language, or '' to clear. An
     * empty value becomes the ALL-EMPTY OBJECT, never an omitted key: omitting
     * asks MSDB to leave the previous value alone, so "clear" would appear to
     * work in the form and change nothing upstream — the same silent no-op
     * that hid the training_topics damage.
     *
     * The five keys we do not set (file_id, filename, content_type, size,
     * uploaded_at) are left exactly as upstream leaves them. Measured: they
     * are empty even on POWER-BI, the row that renders a working button.
     */
    course_outline_th:           outlineFromFormValue(toStr(get('course_outline_th_path'))),
    course_outline_en:           outlineFromFormValue(toStr(get('course_outline_en_path'))),
  };
}

/**
 * Replace course_id strings with ObjectIds in `previous_course` and
 * `related_courses` so the upstream body is FK-correct.
 */
async function resolveCourseRefs(body) {
  const out = { ...body };

  if (body.previous_course) {
    const id = await resolveCourseObjectId(body.previous_course);
    // If the code didn't resolve, drop the field rather than send a
    // nonsense string that MSDB will reject.
    if (id) out.previous_course = id;
    else    delete out.previous_course;
  }

  if (Array.isArray(body.related_courses) && body.related_courses.length > 0) {
    out.related_courses = await resolveCourseObjectIds(body.related_courses);
  } else {
    out.related_courses = [];
  }

  return out;
}

/**
 * The MSDB course_id matching `code` IGNORING CASE, or null — read UNCACHED.
 *
 * Two reasons this is not `getCourseByCode`:
 *   · that is ISR-cached for an hour, and a guard whose failure mode is
 *     overwriting another course's SEO must not answer from a cache that
 *     predates the course it is looking for;
 *   · upstream `?course_id=` is EXACT-MATCH and case-sensitive (verified:
 *     `COPILOT-STU` → 1 row, `copilot-stu` → 0), so the exact hit is only half
 *     the question. The list scan is what catches a differently-cased twin.
 *
 * Returns the STORED spelling so the caller can name the casing that collided.
 * Injectable for tests; the default fetches the real thing.
 */
export async function findCourseCodeInsensitive(code, { fetchAll } = {}) {
  const wanted = String(code ?? '').trim();
  if (!wanted) return null;

  const load = fetchAll ?? (async () => {
    const raw = await aiFetch('/public-course', { revalidate: 0 });
    return unwrap(raw).items ?? [];
  });

  const items = await load();
  const lower = wanted.toLowerCase();
  const hit = (items ?? []).find(
    (c) => String(c?.course_id ?? '').toLowerCase() === lower
  );
  return hit?.course_id ?? null;
}

export async function createCourse(formData) {
  const session = await requireAdmin('courses');
  const body = shapePayload(formData);
  if (!body.course_name) return { ok: false, error: 'กรุณากรอกชื่อหลักสูตร' };
  if (!body.course_id)   return { ok: false, error: 'กรุณากรอกรหัสหลักสูตร (course_id)' };

  /**
   * DUPLICATE GUARD — BEFORE ANY WRITE, and covering BOTH stores.
   *
   * Lives inside the action rather than in the form so it cannot be bypassed,
   * and runs before `msdbCreate` so a refusal creates nothing at all. See
   * lib/courses/courseIdAvailability for why a duplicate code is destructive
   * rather than merely invalid: the extension write is an upsert keyed by the
   * code, so it would silently overwrite a DIFFERENT course's SEO, gallery and
   * omisePaymentEnabled.
   *
   * A failed lookup is NOT treated as "free". Refusing to answer is not the
   * same as answering no, and guessing here costs another course's data.
   */
  try {
    const [existingCourseId, existingExtensionId] = await Promise.all([
      findCourseCodeInsensitive(body.course_id),
      findCourseExtensionCodeInsensitive(body.course_id),
    ]);
    const conflict = courseIdConflict({
      code: body.course_id,
      existingCourseId,
      existingExtensionId,
    });
    if (conflict) return { ok: false, ...conflict };
  } catch (err) {
    return {
      ok: false,
      field: 'course_id',
      error:
        'ตรวจสอบรหัสหลักสูตรซ้ำไม่สำเร็จ จึงยังไม่ได้สร้างหลักสูตร — '
        + `กรุณาลองใหม่อีกครั้ง (${err?.message ?? 'lookup failed'})`,
    };
  }

  try {
    const payload = await resolveCourseRefs(body);
    const { item } = await msdbCreate('public-course', payload);
    revalidatePath(ADMIN_PATH);

    recordAdminActionAfter({
      menu:        'courses',
      action:      'create',
      entity:      'course',
      // The MSDB-assigned _id, which only exists after the write.
      recordId:    String(item?._id ?? ''),
      recordLabel: courseLabel(body.course_id, body.course_name),
      after:       courseFields(body),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, item, id: item?._id };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'สร้างหลักสูตรไม่สำเร็จ' };
  }
}

export async function updateCourse(id, formData) {
  const session = await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing course id' };

  const body = shapePayload(formData);
  try {
    const payload = await resolveCourseRefs(body);
    const { item } = await msdbUpdate('public-course', id, payload);
    revalidatePath(ADMIN_PATH);
    revalidatePath(`${ADMIN_PATH}/${id}/edit`);

    /**
     * BUST THE PUBLIC READ-SIDE TAGS. Without this, `getCourseByCode` and
     * `getPublicCourse` keep serving the pre-edit row for up to 3600s — the
     * two `revalidatePath` calls above only refresh the ADMIN routes, which
     * read MSDB uncached. Today this gap is masked by the MSDB
     * `course.updated` webhook busting the same tags on its own delivery, but
     * this domain is not confirmed as a subscriber in production, so the bust
     * belongs here regardless of whether that webhook arrives.
     *
     * Tag builders imported from bustUpstream.js — the same module
     * renameCacheFanout.js:73-76 uses — rather than retyped literals, so a
     * rename of the read-side template cannot silently desync from this call.
     * `publicCourseTag(id)` because the admin edit route (this one) hands
     * `getPublicCourse` an ObjectId, not the code — see renameCacheFanout.js's
     * header for why both forms are tagged.
     *
     * NAME-LEVEL PROOF ONLY: this cannot be observed behaving correctly from
     * here (no request context to re-read through), and test/pure/
     * courseUpdateTagBust.test.mjs proves the tag NAMES match the read side
     * byte-for-byte — it does not and cannot prove the cache actually goes
     * stale-then-fresh.
     */
    bustUpstream(
      UPSTREAM_TAGS.PUBLIC_COURSES,
      courseTag(body.course_id),
      publicCourseTag(body.course_id),
      publicCourseTag(id),
    );
    revalidatePath(derivedCoursePath(body.course_id));

    // NO `before`, deliberately. Capturing it would mean an extra uncached MSDB
    // round-trip on every course edit — a 10 s-timeout network call, paid every
    // save, to record something the trail already holds: once every update logs
    // its `after`, the previous row's `after` for the same recordId IS this
    // row's before. The reading surface reconstructs it by walking the record's
    // history, which it already fetches. Deletes are the exception (see below),
    // because there is no next row to reconstruct from.
    recordAdminActionAfter({
      menu:        'courses',
      action:      'update',
      entity:      'course',
      recordId:    String(id),
      recordLabel: courseLabel(body.course_id, body.course_name),
      after:       courseFields(body),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อัปเดตหลักสูตรไม่สำเร็จ' };
  }
}

export async function deleteCourse(id) {
  const session = await requireAdmin('courses');
  if (!id) return { ok: false, error: 'Missing course id' };

  // READ BEFORE DELETING, and this is the one place in the sweep so far where
  // the extra round-trip is unambiguously worth it.
  //
  // `recordId` here is an MSDB ObjectId — `692d39b52ee07293c9131fd8`. It
  // identifies nothing to a human, and the moment msdbDelete returns, there is
  // nothing left anywhere to resolve it against. "Who deleted this, and what
  // was it called" is the question the central page exists to answer, and after
  // the delete the snapshotted label is the ONLY thing that can answer it.
  //
  // This looks like the opposite of round 2, where every delete logs
  // `recordLabel: ''`. It is the same principle reaching a different answer:
  // there `recordId` IS the human-readable reference (the admin's เลขอ้างอิง is
  // literally String(_id).slice(-8).toUpperCase()) and the PII policy forbids
  // anything more. Here the id is opaque and a course name is not personal data.
  //
  // The read is UNCACHED on purpose — see readCourseUncached().
  const existing = await readCourseUncached(id);

  try {
    await msdbDelete('public-course', id);
    revalidatePath(ADMIN_PATH);

    recordAdminActionAfter({
      menu:        'courses',
      action:      'delete',
      entity:      'course',
      recordId:    String(id),
      recordLabel: courseLabel(existing?.course_id, existing?.course_name),
      before:      existing ? courseFields(existing) : null,
      // A failed label read must not be invisible: without this, a row with an
      // empty label reads identically to a course that never had a name.
      ...(existing ? {} : { meta: { labelReadFailed: true } }),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบหลักสูตรไม่สำเร็จ' };
  }
}

