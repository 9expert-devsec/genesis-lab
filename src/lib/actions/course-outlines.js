'use server';

/**
 * COURSE OUTLINE PDFs — sign an upload, then record what landed.
 *
 * ══ WHY THIS IS ITS OWN MODULE AND NOT PART OF courses.js ══════════════════
 *
 * courses.js writes EXCLUSIVELY through MSDB over HTTP and never touches
 * Mongo. That is not incidental — auditCoverage.test.mjs carries a control
 * asserting it ("those three are invisible to the Mongo half of the pattern
 * alone"), which is what proved the classifier needed to learn the msdb* names
 * in the first place. Adding a Mongo write to that file turns it into a hybrid
 * and destroys the premise of that control.
 *
 * So the outline actions live here: one module, one storage story — Cloudinary
 * for the bytes, Mongo for the record, MSDB never involved. The PATH that MSDB
 * stores is emitted by shapePayload() in courses.js, which is the only part of
 * this feature that belongs there.
 *
 * ══ requireAdmin, NOT requirePageAction — DO NOT "FIX" THIS BACK ═══════════
 *
 * Both resolve through canAccess and both are correct authorisation. The audit
 * sweep pairs the recorded  against the requireAdmin LITERAL found in the
 * same function body (requireAdminKey() in auditCoverage.test.mjs), so a
 * requirePageAction call leaves that guard unable to see the menu and the
 * assertion fails. Buying an exemption entry to hold a convention difference is
 * a worse trade than matching the convention.
 *
 * ── THE RULE THE WHOLE FEATURE RESTS ON ────────────────────────────────────
 * The filename and the public_id are DERIVED from (courseId, lang) by
 * src/lib/courses/courseOutline.js and never accepted from the client. Uploads
 * here are signed with overwrite:true, so whoever names the path names the
 * asset that gets destroyed. /admin/media can accept a filename precisely
 * because it refuses to overwrite; this path cannot, and a source-scan guard
 * (test/fs/courseOutlineDerivation.test.mjs) asserts nothing here builds a path
 * or a public_id of its own.
 */

import { v2 as cloudinary } from 'cloudinary';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import CourseOutlineFile from '@/models/CourseOutlineFile';
import {
  isOutlineLang,
  normaliseCourseIdForPath,
  outlineFileName,
  outlinePublicPath,
} from '@/lib/courses/courseOutline';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { recordCourseFileReplacement } from '@/lib/courses/courseVersionWriter';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';
import { extensionOf, refuseUpload } from '@/lib/legacyUploadPolicy.mjs';

/* ══ COURSE OUTLINE PDFs ═══════════════════════════════════════════════════
 *
 * Browser-direct signed upload, the same shape /admin/media uses, with two
 * deliberate differences and one rule that is not negotiable.
 *
 * THE RULE: the filename and the public_id are COMPUTED HERE, from courseId +
 * lang, and never accepted from the client. `overwrite: true` means whoever
 * names the path chooses which asset gets destroyed, so the only thing a caller
 * may influence is which COURSE it writes to — which requirePageAction already
 * governs. /admin/media can accept a filename precisely because it refuses to
 * overwrite; this path cannot.
 *
 * THE DIFFERENCES from signMediaUpload:
 *   overwrite: true    a re-upload must land at the SAME URL, or every MSDB row
 *                      pointing at the old path goes stale on each replacement.
 *   invalidate: true   measured 2026-08-09: a Cloudinary overwrite+invalidate
 *                      flips the served bytes in well under a second, so the
 *                      admin sees the new PDF rather than the cached old one.
 *
 * /admin/media's own same-name refusal and delete guards are untouched: this is
 * an additional, narrower path, not a loosening of that one.
 */

/**
 * Everything derived from (courseId, lang), or a reason it cannot be.
 * Pure enough to test; the action below is just I/O around it.
 */
function deriveOutlineTarget(courseId, lang) {
  if (!isOutlineLang(lang)) {
    return { ok: false, error: `ภาษาไม่ถูกต้อง (${String(lang)}) — รองรับเฉพาะ th และ en` };
  }
  const normalised = normaliseCourseIdForPath(courseId);
  if (!normalised.ok) return { ok: false, error: normalised.reason };

  const language = String(lang).toLowerCase();
  const fileName = outlineFileName(normalised.value, language);
  const publicPath = outlinePublicPath(normalised.value, language);
  const { publicId } = legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX);

  return { ok: true, courseId: normalised.value, lang: language, fileName, publicPath, publicId };
}

/**
 * Sign a browser-direct upload of one course outline PDF.
 *
 * Returns the same envelope signMediaUpload does, so the client component can
 * treat the two identically.
 */
export async function signCourseOutlineUpload({ courseId, lang, bytes } = {}) {
  const session = await requireAdmin('courses');

  const target = deriveOutlineTarget(courseId, lang);
  if (!target.ok) return { ok: false, error: target.error };

  // The SHARED policy, not a second opinion: pdf is on the allow-list, the raw
  // ceiling is 10 MB, and an empty file is refused. Restating any of it here
  // would be a copy that can drift from what /admin/media enforces.
  const refusal = refuseUpload({ filename: target.fileName, bytes });
  if (refusal) return { ok: false, error: refusal };

  // Belt to the allow-list's braces: this endpoint is for PDFs only, whatever
  // else the shared policy would accept.
  if (extensionOf(target.fileName) !== 'pdf') {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ PDF' };
  }

  const timestamp = Math.round(Date.now() / 1000);
  // EXACTLY the params the browser will send, or the signature will not match.
  const toSign = {
    public_id: target.publicId,
    timestamp,
    overwrite: true,
    invalidate: true,
    unique_filename: false,
  };
  const signature = cloudinary.utils.api_sign_request(toSign, process.env.CLOUDINARY_API_SECRET);

  recordAdminActionAfter({
    menu: 'courses',
    action: 'update',
    entity: 'course',
    recordId: target.courseId,
    recordLabel: `outline ${target.lang.toUpperCase()} — ${target.publicPath}`,
    after: { publicPath: target.publicPath, publicId: target.publicId, bytes: Number(bytes) || 0 },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return {
    ok: true,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
    apiKey: process.env.CLOUDINARY_API_KEY,
    params: { ...toSign, signature },
    resourceType: 'raw',
    publicId: target.publicId,
    publicPath: target.publicPath,
    fileName: target.fileName,
  };
}

/**
 * Record what Cloudinary accepted. Called by the browser AFTER the upload.
 *
 * Separate from signing because only the browser knows whether the upload
 * finished — and because the row must describe bytes that actually landed, not
 * bytes somebody intended to send. The target is re-derived here rather than
 * trusted from the request for the same reason it is derived in the signer.
 */
export async function recordCourseOutlineUpload({ courseId, lang, bytes, contentType } = {}) {
  const session = await requireAdmin('courses');

  const target = deriveOutlineTarget(courseId, lang);
  if (!target.ok) return { ok: false, error: target.error };

  try {
    await dbConnect();
    const updated = await CourseOutlineFile.findOneAndUpdate(
      { courseId: target.courseId, lang: target.lang },
      {
        $set: {
          publicId: target.publicId,
          legacyPath: target.publicPath,
          bytes: Number(bytes) || 0,
          contentType: String(contentType || 'application/pdf'),
          uploadedAt: new Date(),
          uploadedBy: String(session.user?.name || session.user?.id || ''),
        },
        // Starts at 1 on insert and counts replacements thereafter — the only
        // record that these bytes were ever replaced.
        $inc: { version: 1 },
        $setOnInsert: { courseId: target.courseId, lang: target.lang },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    recordAdminActionAfter({
      menu: 'courses',
      action: 'update',
      entity: 'course',
      recordId: target.courseId,
      recordLabel: `outline ${target.lang.toUpperCase()} v${updated?.version ?? 1} — ${target.publicPath}`,
      after: { publicPath: target.publicPath, bytes: Number(bytes) || 0, version: updated?.version ?? 1 },
      actor: { id: session.user?.id, name: session.user?.name },
    });

    /**
     * ── A COURSE VERSION, HERE, AND NOT ONLY AT SAVE TIME ──────────────────
     *
     * The two uploads on this form are NOT symmetrical, and treating them the
     * same way would lose one of them entirely.
     *
     * The COVER IMAGE gets a fresh Cloudinary public_id on every re-upload, so
     * the live cover does not change until the admin presses save — the
     * ordinary save-time snapshot catches it, and its URL visibly differs.
     *
     * THIS ONE OVERWRITES IN PLACE. The public_id is derived from
     * (courseId, lang) and the upload is signed `overwrite: true`, so THE LIVE
     * FILE CHANGES THE MOMENT IT IS PICKED — before, and regardless of, any
     * save. An admin who replaces the PDF and then closes the form without
     * saving has already changed what customers download, and a save-time-only
     * hook would record nothing at all.
     *
     * So a version can exist here for a form that was never saved. That is
     * correct and intended: the file really did change and it is live.
     *
     * A DISTINCT KIND, not a content snapshot. The stored path is byte-identical
     * before and after, so there is nothing a diff could show; the row carries
     * the language and the CourseOutlineFile counter/bytes/timestamp instead —
     * which is a REFERENCE to the row just written, not a second copy of it.
     * Never suppressed as a no-op: a replacement is never a no-op.
     *
     * `courseId` is the RAW argument canonicalised, not `target.courseId` —
     * that one is lower-cased for the path, and the save path keys on the code
     * as typed. One key space or the two writers file into two histories of one
     * course.
     *
     * Awaited, and it cannot throw: the writer swallows everything. The file is
     * already up at this point and a lost history row must not turn a landed
     * upload into a reported failure.
     */
    await recordCourseFileReplacement({
      courseId,
      file: {
        field: `course_outline_${target.lang}`,
        lang: target.lang,
        filename: target.fileName,
        publicPath: target.publicPath,
        bytes: Number(bytes) || 0,
        uploadedAt: updated?.uploadedAt ?? new Date(),
        outlineVersion: updated?.version ?? 1,
      },
      actor: { id: session.user?.id, name: session.user?.name },
    });
    return {
      ok: true,
      publicPath: target.publicPath,
      version: updated?.version ?? 1,
    };
  } catch (err) {
    // The file IS uploaded at this point. Failing to record it must not read as
    // a failed upload, or the admin re-uploads bytes that are already there.
    return {
      ok: false,
      recorded: false,
      publicPath: target.publicPath,
      error: `อัปโหลดสำเร็จ แต่บันทึกประวัติไม่สำเร็จ — ${err?.message ?? err}`,
    };
  }
}
