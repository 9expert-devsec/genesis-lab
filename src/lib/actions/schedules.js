'use server';

/**
 * Server actions for upstream Schedule CRUD.
 *
 * Genesis does not cache schedules in Mongo — public pages call MSDB
 * directly with a short ISR window. These actions:
 *   1. Resolve the human `course_id` to its MSDB `_id` (Schedule.course
 *      is an ObjectId ref).
 *   2. Write through to MSDB.
 *   3. Upsert a ScheduleLocal sidecar with metadata MSDB doesn't track
 *      (`max_seats`, `instructor_ids`).
 *
 * Webhooks bust the public ISR caches; revalidating the admin path
 * here keeps the table fresh after each mutation.
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import { resolveCourseObjectId } from '@/lib/api/resolveIds';
import ScheduleLocal from '@/models/ScheduleLocal';
// `toNullableNum` is deliberately NOT imported: every numeric sidecar field is
// coerced inside `sidecarSetFields` now, and importing it here would invite the
// next edit to read a sidecar key directly off the FormData again — which is
// exactly the clobber that module exists to prevent.
import { sidecarSetFields, toStr, toStrArr } from '@/lib/schedule/scheduleLocalFields';

const ADMIN_PATH = '/admin/schedules';

/**
 * The schedule summary logged as `before`/`after`.
 *
 * `course_id` rather than the resolved ObjectId, because that is the value a
 * human recognises; the ObjectId is already the ref MSDB stores. Dates are a
 * short array of date strings and are kept verbatim — they are the whole point
 * of a schedule and the field most likely to be disputed.
 */
function scheduleFields(courseIdString, body, formData) {
  return {
    course_id:  courseIdString,
    dates:      body.dates,
    status:     body.status,
    type:       body.type,
    signup_url: body.signup_url,
    // Local-only sidecar fields; MSDB never sees these, so without them the
    // trail would be silent about half of what the form actually changed.
    //
    // SPREAD, so the trail records only the fields the form ACTUALLY SENT. It
    // used to read all three unconditionally, which wrote `max_seats: null`
    // into the `after` snapshot of every save that did not carry the key —
    // a trail claiming an admin cleared a value they never saw. The keys the
    // form omits are now simply absent here, which is the truth.
    ...sidecarSetFields(formData),
  };
}

/** "POWER-BI-PQ — 2026-08-03 (+2 more)" — a schedule has no name of its own. */
function scheduleLabel(courseIdString, dates = []) {
  const list = Array.isArray(dates) ? dates : [];
  const first = list[0] ?? '';
  const extra = list.length > 1 ? ` (+${list.length - 1} more)` : '';
  return [courseIdString, first ? `${first}${extra}` : '']
    .filter(Boolean)
    .join(' — ');
}

/**
 * Bust the ISR caches that read schedules. Called after every write.
 *   - tag `schedules`                — list views (admin table, /search)
 *   - tag `schedules:course:<oid>`   — per-course detail page
 *   - path `/admin/schedules`        — admin table re-render
 * The per-course tag is a noop when courseObjectId is empty.
 */
function bustScheduleCaches(courseObjectId) {
  try { revalidateTag('schedules'); } catch (err) {
    console.warn('[schedules] revalidateTag(schedules) failed:', err?.message);
  }
  if (courseObjectId) {
    try { revalidateTag(`schedules:course:${courseObjectId}`); } catch (err) {
      console.warn('[schedules] revalidateTag(per-course) failed:', err?.message);
    }
  }
  try { revalidatePath(ADMIN_PATH); } catch (err) {
    console.warn('[schedules] revalidatePath failed:', err?.message);
  }
}

/*
 * `toStr`, `toStrArr` and `toNullableNum` were declared here. They moved to
 * lib/schedule/scheduleLocalFields (imported above) so that `sidecarSetFields`
 * and this file cannot disagree about what an empty seat count or a blank price
 * coerces to — the two now share one definition rather than each holding a
 * copy. Behaviour is byte-for-byte what it was; only the address changed.
 */

/**
 * Pull dates from the form. Accepts either repeated `dates` keys
 * (legacy) or a JSON-encoded `dates_json` field (new multi-date editor).
 */
function readDates(formData) {
  const json = toStr(formData.get('dates_json'));
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return toStrArr(parsed);
    } catch {
      // fall through
    }
  }
  return toStrArr(formData.getAll('dates'));
}

/**
 * Build the MSDB body. Only the fields MSDB knows about — local-only
 * fields (max_seats, instructor_ids) stay in Genesis.
 */
function shapeMsdbPayload(courseObjectId, formData) {
  return {
    course:     courseObjectId,
    dates:      readDates(formData),
    status:     toStr(formData.get('status')) || 'open',
    type:       toStr(formData.get('type'))   || 'classroom',
    signup_url: toStr(formData.get('signup_url')),
  };
}

/**
 * Upsert the Genesis-only sidecar.
 *
 * ── THE `$set` IS PARTIAL, AND THAT IS THE WHOLE POINT ──────────────────────
 * The three sidecar keys come from `sidecarSetFields`, which returns ONLY the
 * ones the form actually carried. This block used to read all three
 * unconditionally, and `FormData.get` answers `null` for a key that was never
 * sent — so every save silently overwrote every sidecar field, whether or not
 * the form had an input for it. See that module's docstring for the full
 * reasoning and for why presence, not emptiness, is the test.
 *
 * The two identity fields stay unconditional: they are what the upsert matches
 * and labels on, and they are always derived from the request rather than typed.
 */
async function upsertLocal({ msdbScheduleId, courseIdString, formData }) {
  if (!msdbScheduleId) return;
  await dbConnect();
  await ScheduleLocal.findOneAndUpdate(
    { msdb_schedule_id: String(msdbScheduleId) },
    {
      $set: {
        msdb_schedule_id: String(msdbScheduleId),
        course_id:        courseIdString,
        ...sidecarSetFields(formData),
      },
    },
    { upsert: true, new: true }
  );
}

/**
 * Build the Genesis registration URL for a schedule. MSDB's
 * `/schedules` list filters out rows with empty `signup_url`, so a
 * just-created schedule with no URL never reaches the admin table or
 * the public detail page. We auto-fill on create.
 *
 *   slug rule: course_id lowercased, "_" → "-" (matches the public
 *              detail-page route at /<slug>-training-course).
 *   base:      NEXT_PUBLIC_SITE_URL with any trailing slashes stripped.
 *
 * Returns '' when env or inputs are missing — caller falls back to
 * whatever the admin typed.
 */
function buildAutoSignupUrl(courseIdString, scheduleId) {
  const base = String(process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
  if (!base || !courseIdString || !scheduleId) return '';
  const slug = String(courseIdString).toLowerCase().replace(/_/g, '-');
  return `${base}/registration/public?course=${encodeURIComponent(slug)}&class=${encodeURIComponent(String(scheduleId))}`;
}

export async function createSchedule(formData) {
  const session = await requireAdmin('schedules');

  const courseIdString = toStr(formData.get('course_id'));
  if (!courseIdString) return { ok: false, error: 'กรุณาเลือกหลักสูตร' };

  const courseObjectId = await resolveCourseObjectId(courseIdString);
  if (!courseObjectId) {
    return { ok: false, error: `ไม่พบหลักสูตร: ${courseIdString}` };
  }

  const body = shapeMsdbPayload(courseObjectId, formData);
  if (!body.dates.length) {
    return { ok: false, error: 'กรุณาเลือกอย่างน้อย 1 วัน' };
  }

  try {
    const { item } = await msdbCreate('schedules', body);
    const newId = item?._id;

    // Auto-fill signup_url when the admin didn't supply one. We need
    // the upstream-assigned `_id` to build the URL, so this is a
    // second round-trip — failures are non-fatal because the row
    // already exists; we just warn and let the admin set it manually.
    let finalItem = item;
    if (!body.signup_url && newId) {
      const autoUrl = buildAutoSignupUrl(courseIdString, newId);
      if (autoUrl) {
        try {
          const updated = await msdbUpdate('schedules', newId, {
            ...body,
            signup_url: autoUrl,
          });
          finalItem = updated?.item ?? { ...item, signup_url: autoUrl };
        } catch (err) {
          console.warn(
            '[createSchedule] auto-fill signup_url failed:',
            err?.message
          );
        }
      }
    }

    await upsertLocal({
      msdbScheduleId: newId,
      courseIdString,
      formData,
    });
    bustScheduleCaches(courseObjectId);

    recordAdminActionAfter({
      menu:        'schedules',
      action:      'create',
      entity:      'schedule',
      // MSDB-assigned; only exists after the write. Already the value this
      // action returns as `id`, so nothing new had to be surfaced for the log.
      recordId:    String(newId ?? ''),
      recordLabel: scheduleLabel(courseIdString, body.dates),
      after:       scheduleFields(courseIdString, body, formData),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, item: finalItem, id: newId };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'สร้างตารางไม่สำเร็จ' };
  }
}

/**
 * Update a schedule. The id can be passed positionally (legacy) OR
 * embedded in the FormData under `schedule_id` (preferred — lets the
 * client wire it up via a hidden input + plain `updateSchedule(fd)`
 * call without juggling two args).
 */
export async function updateSchedule(idOrFormData, maybeFormData) {
  const session = await requireAdmin('schedules');

  // Resolve which arg is which. THE AUDIT CALL REUSES THE `id` THIS PRODUCES —
  // it does not re-read the overload. Two parsers of the same overloaded
  // signature can disagree, and when they do the log points at the wrong
  // schedule with no symptom anywhere: the write succeeds, the row is written,
  // and it names a record nobody touched. Log the value the action USED.
  let id, formData;
  if (idOrFormData instanceof FormData) {
    formData = idOrFormData;
    id = toStr(formData.get('schedule_id'));
  } else {
    id = toStr(idOrFormData);
    formData = maybeFormData;
  }
  if (!formData) return { ok: false, error: 'Missing form data' };
  if (!id)       return { ok: false, error: 'Missing schedule id' };

  const courseIdString = toStr(formData.get('course_id'));
  const courseObjectId = courseIdString
    ? await resolveCourseObjectId(courseIdString)
    : null;
  if (!courseObjectId) {
    return { ok: false, error: `ไม่พบหลักสูตร: ${courseIdString || '(missing)'}` };
  }

  const body = shapeMsdbPayload(courseObjectId, formData);
  if (!body.dates.length) {
    return { ok: false, error: 'กรุณาเลือกอย่างน้อย 1 วัน' };
  }

  try {
    const { item } = await msdbUpdate('schedules', id, body);
    await upsertLocal({
      msdbScheduleId: id,
      courseIdString,
      formData,
    });
    bustScheduleCaches(courseObjectId);

    recordAdminActionAfter({
      menu:        'schedules',
      action:      'update',
      entity:      'schedule',
      // `id` is the local resolved above — NOT a second reading of the overload.
      recordId:    String(id),
      recordLabel: scheduleLabel(courseIdString, body.dates),
      after:       scheduleFields(courseIdString, body, formData),
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อัปเดตตารางไม่สำเร็จ' };
  }
}

export async function deleteSchedule(id) {
  const session = await requireAdmin('schedules');
  if (!id) return { ok: false, error: 'Missing schedule id' };

  // Sidecar lookup — if present, we can also bust the per-course
  // cache tag. Resolving via the local row avoids an extra MSDB call
  // just to learn which course the deleted schedule pointed at.
  //
  // It doubles as the audit label source: the sidecar holds `course_id`, the
  // only human-readable thing about a schedule, and this read already happens.
  let courseObjectId = '';
  let sidecarCourseId = '';
  try {
    await dbConnect();
    const sidecar = await ScheduleLocal.findOne({
      msdb_schedule_id: String(id),
    }).lean();
    if (sidecar?.course_id) {
      sidecarCourseId = String(sidecar.course_id);
      courseObjectId = (await resolveCourseObjectId(sidecar.course_id)) ?? '';
    }
  } catch {
    // Non-fatal — proceed with the delete, bust only the general tag.
  }

  try {
    await msdbDelete('schedules', id);

    // Best-effort sidecar cleanup. If MSDB delete already succeeded,
    // a leftover sidecar is harmless but worth tidying up.
    //
    // THIS ACTION WRITES TWICE — MSDB then Mongo — AND CAN RETURN OK WITH THE
    // SECOND HALF FAILED. The `.catch()` below is pre-existing and deliberate
    // (a stranded sidecar must not fail a delete that already happened
    // upstream), but it means "ok" does not mean "both halves succeeded". The
    // audit row is still ONE row, because one thing happened as far as the
    // human is concerned — and `meta.sidecarDeleted` records which halves
    // actually landed, so a future orphaned-sidecar hunt has somewhere to look.
    // Flagged as a pre-existing correctness question, not fixed here.
    let sidecarDeleted = true;
    await ScheduleLocal.deleteOne({ msdb_schedule_id: String(id) })
      .catch(() => { sidecarDeleted = false; });

    bustScheduleCaches(courseObjectId);

    recordAdminActionAfter({
      menu:        'schedules',
      action:      'delete',
      entity:      'schedule',
      recordId:    String(id),
      // From the sidecar read above; '' when no sidecar existed, which is
      // itself worth seeing in the trail.
      recordLabel: sidecarCourseId,
      meta:        { sidecarDeleted },
      actor:       { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบตารางไม่สำเร็จ' };
  }
}

/**
 * Read-side helper for the admin page. Returns ScheduleLocal sidecar
 * rows so the UI can merge them with MSDB schedules.
 *
 *   - `getScheduleLocals()`           → every row (used by the
 *                                       program-grouped admin view)
 *   - `getScheduleLocals(idArray)`    → just rows whose
 *                                       `msdb_schedule_id` is in the
 *                                       array (legacy callers)
 *
 * Always returns a plain serialised array. Callers that want a lookup
 * map can build one with Object.fromEntries(rows.map(r => [...])).
 */
export async function getScheduleLocals(scheduleIds) {
  await dbConnect();
  const filter =
    Array.isArray(scheduleIds) && scheduleIds.length > 0
      ? { msdb_schedule_id: { $in: scheduleIds.map(String) } }
      : {};
  const rows = await ScheduleLocal.find(filter).lean();
  return JSON.parse(JSON.stringify(rows));
}
