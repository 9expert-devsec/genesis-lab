'use server';

/**
 * PHASE 1 of a course-code rename: every GENESIS store, and nothing upstream.
 *
 * ── THE TWO PHASES, AND WHY THIS ONE WRITES NO MSDB ────────────────────────
 * Phase 1 (here) rewrites the genesis stores and records the old code in
 * `CourseExtension.formerCodes`. The tech lead then changes `course_id` in
 * MSDB by hand. Phase 2 verifies the two sides agree.
 *
 * There is NO msdbCreate/msdbUpdate/msdbDelete in this file or anywhere in its
 * import closure, and that is asserted structurally in
 * test/fs/renameNoUpstreamWrite rather than promised in this comment — the
 * same treatment the preview's read-only property gets, and for the same
 * reason: a sentence claiming a property is exactly what a later edit walks
 * past.
 *
 * ── THE INTERVAL IS NOT FREE, AND THE ACTION SAYS SO ───────────────────────
 * Between the two phases the upstream course still carries the OLD code while
 * every genesis row carries the NEW one. `formerCodes` bridges the two sites
 * that were ruled in — `/search` and `resolveCourse` — so the URL and the
 * search keep working. The ORDERING and ENRICHMENT stores have no such bridge:
 * during the window the live course sorts to the unlisted tier, and its
 * early-bird price, promo links, schedule overrides and featured entries stop
 * matching. That is reported in the result as `intervalWarnings` so the admin
 * who pressed the button is the person who reads it, and it is why phase 2
 * should follow within minutes rather than days.
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
import { previewCourseCodeRename } from '@/lib/actions/course-rename-preview';
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
export async function renameCourseCodePhase1({ oldCode, newCode, previewToken } = {}) {
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
  const clash = codeTaken(to, {
    liveCodes: [preview.collision.inMsdb, preview.collision.inExtension].filter(Boolean),
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

  const upper = normalizeCourseCode(from);
  const lower = from.toLowerCase();
  const toUpper = normalizeCourseCode(to);
  const toLower = to.toLowerCase();
  const actual = {};

  /**
   * ── STEP 1, AND IT IS FIRST FOR A REASON ───────────────────────────────
   * The alias. With no alias the public URL is DERIVED from the code, so the
   * moment the code changes the old URL 404s and nothing maps old to new.
   * Creating an alias pinned to the OLD derived path before anything else is
   * what makes the URL survive — and it has to precede the rename, which is
   * precisely why this cannot be a form field's blur handler.
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
      phase: 1,
      counts: actual,
      divergences: diff.divergences,
      // Named for the same reason the nav sync names its refusals: a rename
      // that half-agreed with its preview is the row somebody comes looking for.
      ok: diff.ok,
    },
    actor:       { id: session.user?.id, name: session.user?.name },
  });

  revalidatePath('/');
  revalidatePath('/training-course');
  revalidatePath('/admin/courses');
  triggerLandingSync();

  /**
   * WHAT PHASE 1 DELIBERATELY DID NOT DO. Reported in the result rather than
   * left for the admin to discover.
   */
  const intervalWarnings = [
    'MSDB ยังไม่ถูกแก้ — ต้องเปลี่ยน course_id ที่ต้นทางด้วยตนเอง แล้วจึงตรวจสอบ (phase 2)',
    'ระหว่างนี้หลักสูตรจะหลุดจากลำดับของโปรแกรม (ไปอยู่กลุ่มยังไม่จัดลำดับ) และ Early Bird / '
      + 'ลิงก์โปรโมชั่น / ตารางที่แก้ในระบบ / รายการแนะนำ จะยังไม่ผูกกับหลักสูตรนี้',
    'URL และการค้นหาด้วยรหัสเดิมยังใช้ได้ผ่าน formerCodes',
  ];
  if (outlineRes.modifiedCount > 0) {
    intervalWarnings.push(
      'ไฟล์ PDF ยังอยู่ที่พาธเดิม — แถวถูกเปลี่ยนรหัสแล้วแต่ไฟล์ยังไม่ถูกย้าย: '
      + `${outlinePublicPath(lower, 'th')} → ${outlinePublicPath(toLower, 'th')}`
    );
  }

  return {
    ok: diff.ok,
    ...(diff.ok ? {} : { error: 'จำนวนแถวที่เขียนไม่ตรงกับผลตรวจสอบ', divergences: diff.divergences }),
    from, to, aliasCreated, counts: actual, intervalWarnings,
  };
}
