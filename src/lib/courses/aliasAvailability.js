/**
 * Is this URL alias free — before anything is written?
 *
 * The sibling of lib/courses/courseIdAvailability, and deliberately the same
 * shape: a pure decision returning `{ field, error }` or null, so the create
 * flow refuses BOTH kinds of duplicate the same way, in the same place, before
 * any store is touched.
 *
 * ── WHY THIS RUNS BEFORE THE COURSE IS CREATED ──────────────────────────────
 * It used to run after. `createCourse` wrote to MSDB, then
 * `saveCourseExtension` refused the alias — so a clash left a real course in
 * MSDB with no extension row, and the admin discovered the problem only once it
 * was too late to not create the course. The duplicate-code guard has always
 * refused before writing anything; this is the same class of check and had no
 * business behaving differently.
 *
 * ── THIS DOES NOT REPLACE THE UNIQUE INDEX ──────────────────────────────────
 * `urlAlias_1` is unique+sparse in the database, and that is the guarantee.
 * Between this check and the write there is a window where two admins can both
 * pass, and only the index closes it. What this adds is WHEN and HOW the
 * refusal happens: before the MSDB write rather than after, naming the course
 * that already owns the alias, on the field the admin can fix.
 *
 * PURE: no db, no env, no network.
 */

/**
 * The canonical stored form of a typed alias: trimmed, with exactly one leading
 * slash, or null for "no custom URL".
 *
 * null rather than '' because the unique index is SPARSE — it skips documents
 * whose key is null, which is what lets every course without a custom URL
 * coexist. An empty string is a value and would collide.
 *
 * The rail's input holds the alias WITHOUT the slash (it renders a literal "/"
 * beside the box), while the database stores it WITH one, so this is also the
 * seam where those two representations meet. Both callers must use it or they
 * will compare "/x" against "x" and find no conflict where there is one.
 */
export function normaliseAlias(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * @param {object} input
 * @param {string} input.alias                    the alias being saved (either representation)
 * @param {string|null} [input.existingCourseId]  course_id already holding it, or null
 * @returns {{ field: 'urlAlias', error: string }|null} null when the alias is free
 */
export function aliasConflict({ alias, existingCourseId = null } = {}) {
  const wanted = normaliseAlias(alias);
  if (!wanted) return null; // no custom URL is always allowed — sparse index

  if (existingCourseId) {
    return {
      field: 'urlAlias',
      // The owning course is named, because "this alias is taken" without
      // saying BY WHAT leaves the admin guessing at 78 courses. The driver's
      // E11000 cannot supply this — it reports the key, not the owner — which
      // is the whole reason an application-level check exists alongside the
      // index.
      error:
        `URL Alias นี้ถูกใช้แล้วโดยหลักสูตร "${existingCourseId}" — `
        + 'กรุณาใช้ URL อื่น',
    };
  }

  return null;
}
