'use server';

/**
 * THE COURSE-CODE RENAME. One action, both sides, no manual second step.
 *
 * ── THE TWO PHASES ARE RETIRED ─────────────────────────────────────────────
 * This used to write the genesis stores and stop, leaving the tech lead to
 * change `course_id` in MSDB by hand. That is over: the requirement is that an
 * admin renames in genesis and is DONE. The upstream write lives here now.
 *
 * ── ORDER: UPSTREAM FIRST, THEN GENESIS ───────────────────────────────────
 * The single most important line in this file, and it is the reverse of what
 * came before.
 *
 * A non-2xx from MSDB before any genesis mutation is a CLEAN REFUSAL: nothing
 * anywhere has moved, the caches are untouched, and the admin may retry or walk
 * away with no debris. The old order had no such state. Both divergences were
 * measured on 2026-08-16:
 *
 *   genesis-done / upstream-pending   NOT reversible. Genesis has written
 *                                     `formerCodes`, and its own collision and
 *                                     formerCodes guards then refuse the undo.
 *   upstream-done / genesis-pending   FULLY reversible while genesis is
 *                                     untouched — and, since the `upstreamId`
 *                                     backfill, RESUMABLE with proof.
 *
 * So the inversion trades an unrecoverable failure state for a recoverable one.
 *
 * ── THE OLD CODE IS BRIEFLY FREE UPSTREAM, AND NOTHING CLAIMS IT ──────────
 * Between the upstream write and the genesis write the old code belongs to
 * nobody upstream. Measured shape of that window: two awaited Mongo round trips
 * plus one uncached upstream read — hundreds of milliseconds, entirely inside
 * one server action.
 *
 * NOTHING IN THIS ACTION CAN CLOSE IT, and pretending otherwise would be worse
 * than naming it. Closing it would need either a reservation upstream (there is
 * no such endpoint) or a lock across two systems that do not share a
 * transaction. What it would take to LOSE the race is another admin creating a
 * course with exactly the freed code, in that window, through
 * `createCourse` — whose duplicate guard reads upstream uncached and would find
 * the code free. It is acceptable because the window is sub-second, course
 * creation is rare and manual, and the loser is detected rather than silent:
 * the genesis half would then be renaming into a code a different course holds,
 * and the next preview reports it as a collision the anchor disproves.
 *
 * ── SUCCESS IS A READ-BACK ────────────────────────────────────────────────
 * `{ok: true}` from the write is the request's view of itself. Every outcome
 * here is decided by re-reading the row BY `_id`. A timeout is UNKNOWN, never
 * failure, and nothing is ever rolled back on a guess.
 *
 * ── THE GATE ───────────────────────────────────────────────────────────────
 * `requireAdmin('courses')`, NOT `requirePageAction`. Two reasons, both
 * reported rather than decided quietly:
 *
 *   1. `requirePageAction(pageKey)` takes ONE argument. There is no per-action
 *      permission dimension in `canAccess`, so `requirePageAction('courses',
 *      'rename')` would silently ignore the second argument and authorise
 *      exactly what `requireAdmin('courses')` authorises — a gate that LOOKS
 *      tighter than it is, which is worse than an honest one.
 *   2. The audit sweep pairs the recorded menu against the `requireAdmin`
 *      literal in the same body. course-outlines.js already faced this and
 *      chose the same way, under a "DO NOT FIX THIS BACK" heading.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { normalizeCourseCode } from '@/lib/courses/courseOrder';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';
import { triggerNavMenuSync } from '@/lib/navmenu/triggerNavMenuSync';
import { previewCourseCodeRename } from '@/lib/actions/course-rename-preview';
import { aiFetch, unwrap } from '@/lib/api/client';
import { msdbUpdate } from '@/lib/api/msdb-write';
import { bustUpstream } from '@/lib/api/bustUpstream';
import { renameCacheTargets } from '@/lib/courses/renameCacheFanout';
import { isAnchorShaped } from '@/lib/courses/upstreamAnchorPlan';
import {
  classifyUpstreamWrite,
  isTimeoutError,
  UPSTREAM_OUTCOME,
  UNKNOWN_ADVICE,
} from '@/lib/courses/renameUpstreamPlan';
import {
  previewFingerprint,
  countsFromPreview,
  diffAgainstPreview,
  codeTaken,
  detectRenameState,
} from '@/lib/courses/renameCoursePlan';
import { outlinePublicPath } from '@/lib/courses/courseOutline';

import { CourseExtension } from '@/models/CourseExtension';
import CourseOutlineFile from '@/models/CourseOutlineFile';
import ProgramOrder from '@/models/ProgramOrder';
import SkillOrder from '@/models/SkillOrder';
import EarlyBirdConfig from '@/models/EarlyBirdConfig';
import CoursePromoLink from '@/models/CoursePromoLink';
import { FeaturedCourse } from '@/models/FeaturedCourse';
import { FeaturedOnlineCourse } from '@/models/FeaturedOnlineCourse';
import { NavFeaturedOnlineCourse } from '@/models/NavFeaturedOnlineCourse';
import ScheduleLocal from '@/models/ScheduleLocal';
import Promotion from '@/models/Promotion';
import Article from '@/models/Article';

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

/**
 * Re-read the upstream row BY `_id`.
 *
 * ── WHY IT SCANS THE LIST INSTEAD OF FILTERING ─────────────────────────────
 * `/public-course?_id=<oid>` is SILENTLY IGNORED upstream — it returns the
 * whole catalogue rather than one row (curl-verified 2026-04-23, recorded in
 * docs/api-domains.md). So "read by _id" has to be a full uncached read plus a
 * local find. It is one extra call on a rare admin action, and the alternative
 * — reading by CODE — is the thing this whole design refuses: after a rename
 * the code is exactly the value in question, and after a TIMEOUT it is not
 * known which code the row carries. Only the `_id` is stable across both.
 *
 * `revalidate: 0` because a cached read would make the write look applied when
 * it was not, or the reverse. The read-back is the evidence; it cannot come
 * from the cache the write just invalidated the meaning of.
 */
async function readUpstreamById(id) {
  const raw = await aiFetch('/public-course', { revalidate: 0 });
  const { items } = unwrap(raw);
  return (items ?? []).find((c) => String(c?._id) === String(id)) ?? null;
}

/**
 * Report what a half-finished rename looks like right now.
 *
 * Exported so the screen can ask before offering the button — the resumability
 * story is worth nothing if an interrupted run is invisible. Read-only.
 */
export async function inspectRenameState({ oldCode, newCode } = {}) {
  await requireAdmin('courses');
  const [asOld, asNew] = await Promise.all([
    previewCourseCodeRename({ oldCode, newCode }),
    previewCourseCodeRename({ oldCode: newCode, newCode: oldCode }),
  ]);
  /**
   * `asOld.upstream` and not a third fetch: the forward preview already read
   * the upstream catalogue for its collision check, and its `upstream` block
   * is the unfiltered answer for BOTH codes. Taken from the forward call
   * because its `oldCode`/`newCode` are the right way round.
   */
  return detectRenameState({
    oldCounts: countsFromPreview(asOld),
    newCounts: countsFromPreview(asNew),
    upstream: asOld.upstream,
  });
}

/**
 * Rename a course's code across every genesis store.
 *
 * @param {object} input
 * @param {string} input.oldCode
 * @param {string} input.newCode
 * @param {string} input.previewToken the fingerprint returned by the preview
 */
export async function renameCourseCode({ oldCode, newCode, previewToken } = {}) {
  const session = await requireAdmin('courses');
  await dbConnect();

  const from = String(oldCode ?? '').trim();
  const to = String(newCode ?? '').trim();
  if (!from || !to) return fail('ต้องระบุทั้งรหัสเดิมและรหัสใหม่');
  if (from === to) return fail('รหัสใหม่เหมือนรหัสเดิมทุกประการ');

  /**
   * RE-RUN THE PREVIEW AT WRITE TIME. Not a re-read of what the caller sent:
   * the whole point is to compare live state against what they were shown.
   */
  const preview = await previewCourseCodeRename({ oldCode: from, newCode: to });
  if (!preview.ok) return fail(preview.blocked.join(' | '), { preview });

  const expected = countsFromPreview(preview);
  const fingerprint = previewFingerprint({ oldCode: from, newCode: to, counts: expected });

  if (!previewToken) {
    return fail(
      'ต้องดูผลตรวจสอบ (preview) ก่อนจึงจะเปลี่ยนรหัสได้',
      { needsPreview: true, fingerprint }
    );
  }
  if (previewToken !== fingerprint) {
    /**
     * A HARD STOP, not a warning. The admin agreed to a specific blast radius
     * and something moved between the preview and now — a course joined the
     * group, an article pinned this course, a promo link was created. Writing
     * anyway would touch rows nobody consented to.
     */
    return fail(
      'ข้อมูลเปลี่ยนไปหลังจากตรวจสอบ — กรุณาตรวจสอบใหม่ก่อนเปลี่ยนรหัส',
      { stale: true, expectedFingerprint: fingerprint, sentFingerprint: previewToken }
    );
  }

  /**
   * COLLISION, CHECKED AGAIN HERE. The preview checked it too, but a preview is
   * a read at a moment and this is the write — a course created in between
   * would otherwise be overwritten. Live codes come from the preview's own
   * upstream read; former codes are read fresh, because nothing else does.
   */
  const formerHolders = await CourseExtension.find(
    { formerCodes: { $exists: true, $ne: [] } },
    { courseId: 1, formerCodes: 1, _id: 0 }
  ).lean();
  const allFormer = formerHolders.flatMap((r) => r.formerCodes ?? []);
  /**
   * A PROVEN self-upstream hit is NOT a live code held by somebody else — it is
   * this course's own row, already carrying the new code because the upstream
   * half landed and the genesis half did not. Leaving it in `liveCodes` would
   * make the resume path collide with itself and refuse forever, which is the
   * one thing the anchor exists to prevent.
   */
  const upstreamHit = preview.selfUpstream?.proven ? null : preview.collision.inMsdb;
  const clash = codeTaken(to, {
    liveCodes: [upstreamHit, preview.collision.inExtension].filter(Boolean),
    formerCodes: allFormer,
    exceptCode: from,
  });
  if (clash.taken) {
    return fail(
      clash.where === 'former'
        ? `รหัส "${clash.matched}" เคยถูกใช้โดยหลักสูตรอื่นมาก่อน — ใช้ซ้ำจะทำให้ลิงก์และใบเสนอราคาเก่าชี้ผิดหลักสูตร`
        : `รหัส "${clash.matched}" ถูกใช้อยู่แล้ว`,
      { collision: clash }
    );
  }

  /**
   * ════ THE UPSTREAM WRITE. FIRST, AND BEFORE ANY GENESIS MUTATION. ════════
   *
   * ── THE ANCHOR IS REQUIRED, AND ITS ABSENCE IS A REFUSAL ────────────────
   * The PUT is addressed by `CourseExtension.upstreamId` — never by looking the
   * course up by code. A code lookup is precisely what cannot distinguish this
   * course from whatever else now answers to its code, and it is the lookup the
   * anchor was backfilled to remove.
   *
   * An unanchored row is refused BY NAME rather than falling back. An empty
   * anchor is "identity unknown", not "no objection".
   */
  const anchor = String(preview.anchor ?? '').trim();
  if (!isAnchorShaped(anchor)) {
    return fail(
      `แถว CourseExtension ของ "${from}" ไม่มี upstreamId ที่ใช้อ้างอิงได้ — `
      + 'ระบบจะไม่ค้นหาหลักสูตรจากรหัสแทน เพราะรหัสคือสิ่งที่กำลังจะเปลี่ยน '
      + 'ให้รัน npm run backfill:extension-anchor ก่อน แล้วลองใหม่',
      { outcome: UPSTREAM_OUTCOME.REFUSED, needsAnchor: true, courseId: from, wroteGenesis: false }
    );
  }

  /**
   * ── ONE KEY. MERGE IS ESTABLISHED, SO THE REST OF THE ROW IS NOT SENT ────
   * Measured 2026-08-16 (scripts/_probe-msdb-put-semantics): a one-key PUT left
   * 35 of 36 fields untouched. Sending a reconstructed full payload would need
   * a read-modify-write and would open a lost-update window against any other
   * admin editing the course; a one-key merge has none.
   */
  let writeError = null;
  try {
    await msdbUpdate('public-course', anchor, { course_id: to });
  } catch (err) {
    writeError = err;
  }

  /**
   * ── SUCCESS IS A READ-BACK, NOT A RESPONSE ──────────────────────────────
   * `{ok: true}` with a 36-key echo is the REQUEST's view of itself. The row is
   * the authority, and it is re-read by `_id` here — ALWAYS, including after an
   * error, because a timeout aborts the client and never the server, so the
   * write may well have landed.
   */
  let upstreamRow = null;
  let readFailed = false;
  try {
    upstreamRow = await readUpstreamById(anchor);
  } catch (err) {
    readFailed = true;
    console.error('[renameCourseCode] read-back failed:', err?.message ?? err);
  }

  const verdict = classifyUpstreamWrite({
    oldCode: from,
    newCode: to,
    error: writeError ? { message: writeError.message, timeout: isTimeoutError(writeError) } : null,
    row: upstreamRow,
    readFailed,
  });

  if (verdict.outcome !== UPSTREAM_OUTCOME.APPLIED) {
    /**
     * NOTHING IN GENESIS HAS BEEN TOUCHED, and that is the whole reason the
     * order was inverted. Every non-applied outcome returns from here with
     * `wroteGenesis: false`, which the screen renders as "nothing was written".
     *
     * UNKNOWN IS NOT FAILURE and nothing is rolled back on it. A rollback would
     * be a guess, and the guess that loses is the one that renames a course
     * BACK after the original write actually landed.
     */
    return fail(
      verdict.outcome === UPSTREAM_OUTCOME.UNKNOWN
        ? UNKNOWN_ADVICE.th
        : `เปลี่ยนรหัสที่ MSDB ไม่สำเร็จ — ${writeError?.message ?? verdict.reason} `
          + '(ฝั่งระบบนี้ยังไม่ได้เขียนอะไรเลย)',
      {
        outcome: verdict.outcome,
        upstreamReason: verdict.reason,
        upstreamCode: verdict.code,
        wroteUpstream: verdict.wroteUpstream,
        wroteGenesis: false,
        from, to, anchor,
      }
    );
  }

  const upper = normalizeCourseCode(from);
  const lower = from.toLowerCase();
  const toUpper = normalizeCourseCode(to);
  const toLower = to.toLowerCase();
  const actual = {};

  /**
   * ── THE FIRST GENESIS WRITE, AND IT IS FIRST FOR A REASON ──────────────
   * The alias. With no alias the public URL is DERIVED from the code, so once
   * the code changes the old URL has nothing mapping it to the new one. An
   * alias pinned to the OLD derived path is what makes the URL survive.
   *
   * IT USED TO PRECEDE THE RENAME AND NOW FOLLOWS THE UPSTREAM HALF, which is
   * a real ordering change and not an accident of the inversion. Upstream goes
   * first so a refusal leaves nothing written anywhere, which means there is a
   * sub-second window where upstream carries the new code and no alias points
   * at the old URL. Nobody can observe it: the public page is served from an
   * hour-long ISR cache and this action does not bust anything until the very
   * end, by which time the alias exists. Paying a window nobody can see to buy
   * a failure state that leaves no debris is the right trade.
   *
   * Idempotent: only written when the row has no alias.
   */
  let aliasCreated = null;
  if (preview.url.mustCreateAliasFirst && preview.url.aliasToCreate) {
    const res = await CourseExtension.updateOne(
      { courseId: from, $or: [{ urlAlias: { $exists: false } }, { urlAlias: '' }, { urlAlias: null }] },
      { $set: { urlAlias: preview.url.aliasToCreate } }
    );
    aliasCreated = res.modifiedCount > 0 ? preview.url.aliasToCreate : null;
  }

  /**
   * ── STEP 2 — CourseExtension, and formerCodes with it ──────────────────
   * One update so the row can never carry the new code without the old one
   * recorded. `$addToSet` makes the re-run a no-op rather than a duplicate.
   */
  const extRes = await CourseExtension.updateOne(
    { courseId: from },
    { $set: { courseId: to }, $addToSet: { formerCodes: upper } }
  );
  actual.courseExtension = extRes.modifiedCount;

  // ── STEP 3 — outline rows. The BLOB objects are NOT moved; see the result.
  const outlineRes = await CourseOutlineFile.updateMany(
    { courseId: lower },
    { $set: { courseId: toLower } }
  );
  actual.courseOutlineFile = outlineRes.modifiedCount;

  // ── STEP 4/5 — the two order lists. Positional `$` keeps the POSITION.
  const progRes = await ProgramOrder.updateMany(
    { courseOrder: upper },
    { $set: { 'courseOrder.$[el]': toUpper } },
    { arrayFilters: [{ el: upper }] }
  );
  actual.programOrder = progRes.modifiedCount;

  const skillRes = await SkillOrder.updateMany(
    { courseOrder: upper },
    { $set: { 'courseOrder.$[el]': toUpper } },
    { arrayFilters: [{ el: upper }] }
  );
  actual.skillOrder = skillRes.modifiedCount;

  // ── STEP 6+ — the exact-match stores.
  for (const [key, Model, field] of [
    ['earlyBirdConfig', EarlyBirdConfig, 'course_id'],
    ['coursePromoLink', CoursePromoLink, 'course_id'],
    ['featuredCourse', FeaturedCourse, 'course_id'],
    ['featuredOnlineCourse', FeaturedOnlineCourse, 'course_id'],
    ['navFeaturedOnlineCourse', NavFeaturedOnlineCourse, 'course_id'],
    ['scheduleLocal', ScheduleLocal, 'course_id'],
  ]) {
    const res = await Model.updateMany({ [field]: from }, { $set: { [field]: to } });
    actual[key] = res.modifiedCount;
  }

  // ── Array-valued references.
  const promoRes = await Promotion.updateMany(
    { related_course_ids: from },
    { $set: { 'related_course_ids.$[el]': to } },
    { arrayFilters: [{ el: from }] }
  );
  actual.promotion = promoRes.modifiedCount;

  const articleRes = await Article.updateMany(
    { relatedCourses: from },
    { $set: { 'relatedCourses.$[el]': to } },
    { arrayFilters: [{ el: from }] }
  );
  actual.article = articleRes.modifiedCount;

  /**
   * WHAT WAS WRITTEN vs WHAT WAS PROMISED. A divergence here means the write
   * touched a different number of rows than the admin agreed to, and it is
   * reported as a failure with the offending store named — even though the
   * writes have already happened, because the honest report of a partial
   * surprise is not "ok: true".
   */
  const diff = diffAgainstPreview(expected, actual);

  recordAdminActionAfter({
    menu:        'courses',
    action:      'rename',
    entity:      'course_code',
    // The NEW code: findable from the course that exists now, which is what a
    // reader looking at today's catalogue has in hand. The old one is in meta.
    recordId:    to,
    recordLabel: `เปลี่ยนรหัสหลักสูตร ${from} → ${to}`,
    after:       { code: to },
    meta:        {
      from, to,
      aliasCreated,
      anchor,
      upstream: { outcome: verdict.outcome, reason: verdict.reason },
      counts: actual,
      divergences: diff.divergences,
      // Named for the same reason the nav sync names its refusals: a rename
      // that half-agreed with its preview is the row somebody comes looking for.
      ok: diff.ok,
    },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  /**
   * ════ THE FAN-OUT. ONLY HERE, AND ONLY ON A CONFIRMED SUCCESS. ══════════
   *
   * Reached only after the upstream write was CONFIRMED BY READ-BACK and every
   * genesis store has been written. Nothing above this line invalidates
   * anything, which is deliberate twice over: an aborted rename leaves the
   * caches describing a world that is still true, and the sub-second window in
   * which upstream has moved and the alias has not is invisible because the
   * public pages are still being served from the cache nobody has touched yet.
   *
   * ── WHY THIS IS NEW, WHEN THE GENESIS-ONLY RENAME NEEDED NONE OF IT ─────
   * While the action wrote Mongo alone, every cached upstream read was still
   * CORRECT. Now the upstream row itself has changed, so each one is WRONG —
   * it names a `course_id` that no longer exists — and it stays wrong for up to
   * an hour. The catalogue would advertise a code whose page 404s.
   *
   * The targets are computed by a pure planner so "both codes, both URLs" is
   * assertable rather than a list somebody has to keep in their head.
   */
  const fanout = renameCacheTargets({
    oldCode: from,
    newCode: to,
    upstreamId: anchor,
    alias: aliasCreated || preview.url?.aliased ? (aliasCreated || preview.url.current) : '',
  });
  bustUpstream(fanout.tags);
  for (const path of fanout.paths) {
    try { revalidatePath(path); }
    catch (err) { console.warn(`[renameCourseCode] revalidatePath(${path}) failed:`, err?.message ?? err); }
  }
  triggerLandingSync();
  triggerNavMenuSync();

  /**
   * WHAT THIS ACTION DELIBERATELY DID NOT DO. Reported in the result rather
   * than left for the admin to discover.
   *
   * The MSDB obligation is GONE from this list — it is done, and confirmed by
   * read-back. What remains are the things a code change genuinely does not
   * carry with it.
   */
  const followUps = [
    'URL และการค้นหาด้วยรหัสเดิมยังใช้ได้ผ่าน formerCodes',
    'แคชสาธารณะถูกล้างแล้ว และสั่ง sync เมนู/หน้าแรกใหม่ในเบื้องหลัง — '
      + 'หน้าเว็บอาจใช้เวลาสักครู่จึงจะแสดงรหัสใหม่ครบทุกจุด',
  ];
  if (outlineRes.modifiedCount > 0) {
    followUps.push(
      'ไฟล์ PDF ยังอยู่ที่พาธเดิม — แถวถูกเปลี่ยนรหัสแล้วแต่ไฟล์ยังไม่ถูกย้าย: '
      + `${outlinePublicPath(lower, 'th')} → ${outlinePublicPath(toLower, 'th')}`
    );
  }

  return {
    ok: diff.ok,
    ...(diff.ok ? {} : { error: 'จำนวนแถวที่เขียนไม่ตรงกับผลตรวจสอบ', divergences: diff.divergences }),
    outcome: UPSTREAM_OUTCOME.APPLIED,
    wroteUpstream: true,
    wroteGenesis: true,
    from, to, anchor, aliasCreated, counts: actual,
    cacheBusted: fanout,
    followUps,
  };
}
