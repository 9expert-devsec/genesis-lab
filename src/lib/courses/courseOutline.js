/**
 * COURSE OUTLINE PDFs — the shape, the path, and the id. Pure; no I/O.
 *
 * ══ THE 8-KEY OBJECT IS MSDB'S, NOT OURS ════════════════════════════════════
 *
 * MEASURED 2026-08-09 against live MSDB: `course_outline_th` / `course_outline_en`
 * are objects with EXACTLY these keys —
 *
 *     kind, url, file_id, filename, content_type, size, uploaded_at, download_url
 *
 * — on every row, whether or not a file exists. POWER-BI carries
 * `kind:"link"` plus a URL in both `url` and `download_url`; CANVA-L1 carries
 * the same eight keys all empty and therefore renders no button. The other five
 * keys are empty on BOTH, including the row that works.
 *
 * So this module writes the two keys that are observably used and leaves the
 * other five exactly as upstream leaves them. Inventing values for
 * `file_id`/`size`/`uploaded_at` would be guessing at a schema we did not
 * design, and MSDB SILENTLY DROPS KEYS IT DOES NOT KEEP — the failure mode that
 * emptied training_topics. What we send has to be what we saw.
 *
 * ══ WHY THE URL IS ROOT-RELATIVE ════════════════════════════════════════════
 *
 * `/files/course-outline/<file>.pdf`, not an absolute Cloudinary URL. When www
 * moves onto genesis the same stored string keeps resolving, with no data
 * migration and no second rewrite rule. An absolute URL would pin every stored
 * row to today's asset host.
 *
 * ══ WHY THE FILENAME IS DERIVED, NEVER SUPPLIED ═════════════════════════════
 *
 * The client sends `courseId` and `lang` and nothing else. If it could name the
 * file it could name the PATH, and the path is what decides which Cloudinary
 * public_id gets overwritten — `overwrite:true` turns a chosen filename into a
 * chosen victim. Deriving it here means the only thing a caller can influence is
 * WHICH COURSE it is writing to, which the page guard already governs.
 *
 * ── AND WHY IT IS LOWERCASED ────────────────────────────────────────────────
 * Cloudinary FOLDS public_id case. `POWER-BI` and `power-bi` are the same
 * asset, so two courses whose ids differ only in case would silently overwrite
 * each other's outline. Lowercasing makes that collision impossible to express
 * rather than merely unlikely, and the character check that follows rejects
 * anything a URL segment could not carry cleanly.
 */

/** The one category segment course outlines live in. A valid isValidCategory(). */
export const OUTLINE_CATEGORY = 'course-outline';

/** The two languages, and the only two. */
export const OUTLINE_LANGS = Object.freeze(['th', 'en']);

/** MSDB's `kind` for a row that points at a file. */
export const OUTLINE_KIND_LINK = 'link';

/**
 * The all-empty object — what MSDB holds for a course with no outline, copied
 * from a real CANVA-L1 row rather than composed from the field names.
 *
 * CLEARING WRITES THIS, IT DOES NOT DROP THE KEY. Omitting the key entirely
 * asks MSDB to leave the old value alone, so a "clear" would appear to work in
 * the form and change nothing upstream — the same class of silent no-op that
 * hid the training_topics damage.
 */
export function emptyOutline() {
  return {
    kind: '',
    url: '',
    file_id: null,
    filename: '',
    content_type: '',
    size: 0,
    uploaded_at: null,
    download_url: '',
  };
}

/** Is `lang` one of the two? Anything else is refused, never defaulted. */
export function isOutlineLang(lang) {
  return OUTLINE_LANGS.includes(String(lang ?? '').toLowerCase());
}

/**
 * Normalise a course_id for use in a path segment.
 *
 * Returns `{ ok: true, value }` or `{ ok: false, reason }` NAMING the offending
 * input — a refusal that does not say which course_id it refused sends an admin
 * hunting through a form with 40 fields.
 */
export function normaliseCourseIdForPath(courseId) {
  const raw = String(courseId ?? '').trim();
  if (!raw) return { ok: false, reason: 'course_id ว่าง — กรอกรหัสหลักสูตรก่อนอัปโหลด' };

  const value = raw.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(value)) {
    return {
      ok: false,
      reason: `course_id "${raw}" มีอักขระที่ใช้ในชื่อไฟล์ไม่ได้ — รองรับเฉพาะ a-z 0-9 และ - `
        + `(ตรวจแล้วได้ "${value}")`,
    };
  }
  return { ok: true, value };
}

/** `<course-id>-course-outline-<lang>.pdf`, lowercased. */
export function outlineFileName(normalisedCourseId, lang) {
  return `${normalisedCourseId}-course-outline-${String(lang).toLowerCase()}.pdf`;
}

/** The root-relative public path — the string that goes into MSDB. */
export function outlinePublicPath(normalisedCourseId, lang) {
  return `/${'files'}/${OUTLINE_CATEGORY}/${outlineFileName(normalisedCourseId, lang)}`;
}

/**
 * The full 8-key object for a stored outline.
 *
 * `url` and `download_url` are both set to the same root-relative path: MSDB
 * populates both on the row that works, and PDFDownload.jsx renders its button
 * off `download_url` alone. Setting only one would either produce no button or
 * leave a field the upstream form fills.
 */
export function outlineObject(publicPath) {
  const path = String(publicPath ?? '');
  if (!path) return emptyOutline();
  return { ...emptyOutline(), kind: OUTLINE_KIND_LINK, url: path, download_url: path };
}

/**
 * One form value → the object MSDB is sent. '' clears; a path links.
 *
 * Lives here rather than inside shapePayload() because shapePayload is in a
 * 'use server' module that imports next/cache and the MSDB write client, so no
 * test can import it — and the claim worth pinning is precisely that CLEARING
 * EMITS THE EMPTY OBJECT RATHER THAN DROPPING THE KEY. An omitted key asks MSDB
 * to keep its previous value, so a "clear" that omits looks like it worked and
 * changes nothing.
 */
export function outlineFromFormValue(value) {
  const path = typeof value === 'string' ? value.trim() : '';
  return path ? outlineObject(path) : emptyOutline();
}

/** Does this stored object point at a file? The same test PDFDownload makes. */
export function hasOutline(value) {
  return Boolean(value && typeof value === 'object' && typeof value.download_url === 'string'
    && value.download_url.length > 0);
}

/**
 * Would changing course_id strand an existing outline?
 *
 * The stored path embeds the course_id, so renaming the course leaves the row
 * pointing at a file named for the OLD id. The file still resolves — nothing
 * breaks today — which is exactly why this warns rather than blocks: refusing
 * the rename would be a bigger intervention than the problem, and silently
 * re-deriving the path would point at a file that was never uploaded.
 */
export function outlineWouldGoStale({ previousCourseId, nextCourseId, outlines }) {
  const before = normaliseCourseIdForPath(previousCourseId);
  const after = normaliseCourseIdForPath(nextCourseId);
  if (!before.ok || !after.ok || before.value === after.value) return null;
  const present = OUTLINE_LANGS.filter((l) => hasOutline(outlines?.[l]));
  if (present.length === 0) return null;
  return { from: before.value, to: after.value, langs: present };
}
