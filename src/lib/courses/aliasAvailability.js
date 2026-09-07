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

// The ONE derivation of a course's legacy URL, already written for the webhook
// revalidation planner. Imported rather than re-derived: two copies of the
// `<id>` → `/<id>-training-course` rule is how this check and the route it
// protects would come to disagree about which URL a course actually has.
import { coursePathFromId } from '@/lib/webhooks/courseRevalidatePlan';
import { reservedPathOwner } from '@/lib/courses/reservedPaths';

/**
 * The canonical stored form of a typed alias: trimmed, LOWER-CASED, with exactly
 * one leading slash and no trailing slash — or null for "no custom URL".
 *
 * null rather than '' because the unique index is SPARSE — it skips documents
 * whose key is null, which is what lets every course without a custom URL
 * coexist. An empty string is a value and would collide.
 *
 * The rail's input holds the alias WITHOUT the slash (it renders a literal "/"
 * beside the box), while the database stores it WITH one, so this is also the
 * seam where those two representations meet. Both callers must use it or they
 * will compare "/x" against "x" and find no conflict where there is one.
 *
 * ── AND A TRAILING SLASH IS STRIPPED ────────────────────────────────────────
 * `/x` and `/x/` are two distinct keys to a unique index, so both save — while
 * Next redirects `/x/` to `/x` (trailingSlash is unset, so the default applies),
 * meaning the two rows resolve to ONE final URL with the index seeing no
 * conflict. Stripping here collapses them before either the check or the index
 * ever sees them.
 *
 * ── ROUND U4 (D3): LOWER-CASED ──────────────────────────────────────────────
 * Aliases were matched case-SENSITIVELY (`findOne({urlAlias})`, no collation)
 * while course codes were matched case-INSENSITIVELY. So `/Excel-Course` and
 * `/excel-course` were two aliases to the index and two different pages to a
 * crawler, while `/EXCEL-training-course` and `/excel-training-course` were one
 * page. One rule for one kind of URL and a different rule for the other is the
 * shape that ships a duplicate.
 *
 * Lower-casing HERE rather than at the lookup is what makes it one rule: this
 * function is what the save path, the conflict check, the canonical tag, the
 * og:url, the JSON-LD, the sitemap and the link helper all call, so they cannot
 * disagree about what a stored alias looks like. A read path that lower-cased on
 * its own would find the row and then emit a canonical the row does not match.
 *
 * ── ROUND U4 (D4): DUPLICATE LEADING SLASHES COLLAPSE ───────────────────────
 * `//x` used to pass through untouched — it is already slash-prefixed, so the
 * old prefix rule had nothing to add. But `//x` is a protocol-relative URL: a
 * browser reads `//x` as `https://x`, an entirely different origin. An alias
 * that shape is not a path on this site at all.
 *
 * It is fixed here and not in the link helper for the reason U3 recorded when it
 * deliberately left it: the link, the canonical tag, the og:url, the JSON-LD and
 * the sitemap all read through this one function, and fixing it in one of the
 * five would make that one disagree with the other four.
 *
 * PROVABLY BEHAVIOUR-PRESERVING ON EXISTING DATA: measured against the live
 * collection immediately before this change, across all 80 rows holding a
 * non-null `urlAlias` — zero contain an uppercase character, zero begin with
 * `//`, zero carry a trailing slash and zero lack a leading slash. So no stored
 * alias changes meaning, no row starts colliding with another that did not
 * before, and nothing needs migrating. This normalises what is TYPED from here
 * on; it does not rewrite what is stored.
 */
export function normaliseAlias(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  // '/' alone strips to '' — that is "no custom URL", not an alias of nothing.
  if (!trimmed) return null;
  // Leading slashes collapse to exactly one, whether there were none or three.
  return `/${trimmed.replace(/^\/+/, '')}`.toLowerCase();
}

/**
 * The course whose derived legacy URL this alias would shadow, or null.
 *
 * ── THE GAP THE UNIQUE INDEX CANNOT SEE ─────────────────────────────────────
 * A course reachable at `/<id>-training-course` has no `urlAlias` row for that
 * path — resolveCourse DERIVES it (path 2). So an admin can give course A the
 * alias `/power-apps-training-course` while course B is `POWER-APPS`, and the
 * index finds nothing wrong: it compares aliases to aliases and never to a
 * derived path. resolveCourse tries the alias FIRST, so A wins and B becomes
 * unreachable at its own URL — silently, with no error anywhere.
 *
 * Case-insensitive because the derived path is built by lowercasing the id, so
 * `/POWER-APPS-training-course` and `/power-apps-training-course` are the same
 * claim on the same course.
 *
 * `exceptCourseId` matters: a course whose alias IS its own legacy path is
 * harmless — both paths resolve to it — and refusing that would reject a
 * perfectly ordinary save.
 *
 * @param {object} input
 * @param {string} input.alias
 * @param {string[]} [input.courseIds]      every upstream course_id
 * @param {string|null} [input.exceptCourseId] the course being saved
 * @returns {string|null} the shadowed course_id, verbatim
 */
export function legacyPathOwner({ alias, courseIds = [], exceptCourseId = null } = {}) {
  const wanted = normaliseAlias(alias);
  if (!wanted) return null;
  const target = wanted.toLowerCase();
  const except = String(exceptCourseId ?? '').toLowerCase();

  for (const id of courseIds) {
    const code = String(id ?? '');
    if (!code || code.toLowerCase() === except) continue;
    if (coursePathFromId(code) === target) return code;
  }
  return null;
}

/**
 * @param {object} input
 * @param {string} input.alias                    the alias being saved (either representation)
 * @param {string|null} [input.existingCourseId]  course_id already holding it, or null
 * @param {string|null} [input.formerOwnerCourseId] course_id that USED to hold it, or null
 * @param {string|null} [input.legacyOwner]       course_id whose derived path it shadows
 * @returns {{ field: 'urlAlias', error: string }|null} null when the alias is free
 */
export function aliasConflict({
  alias,
  existingCourseId = null,
  formerOwnerCourseId = null,
  legacyOwner = null,
} = {}) {
  const wanted = normaliseAlias(alias);
  if (!wanted) return null; // no custom URL is always allowed — sparse index

  /**
   * A RESERVED SEGMENT LOSES SILENTLY, which is why it is checked first.
   *
   * An alias of `/schedule` or `/promotion` does not produce a conflict, an
   * error, or a duplicate — the static route or the redirect simply wins,
   * [...slug] never runs, and the alias does nothing at all. Of the four
   * refusals here it is the only one with no visible symptom whatsoever, so it
   * is the one most worth catching at save time.
   *
   * Derived from RESERVED_PATHS, which is hand-listed BECAUSE the app-router
   * tree is only part of the reserved space — see that file.
   */
  const reserved = reservedPathOwner(wanted);
  if (reserved) {
    return {
      field: 'urlAlias',
      error:
        `"/${reserved.segment}" เป็น URL ที่ระบบใช้อยู่แล้ว — `
        + 'ถ้าใช้ซ้ำ หน้าหลักสูตรนี้จะไม่ถูกเปิดเลย กรุณาใช้ URL อื่น',
    };
  }

  // Checked BEFORE the alias-vs-alias case only because it is the more
  // surprising of the two; either alone is a refusal. Both name the owner.
  if (legacyOwner) {
    return {
      field: 'urlAlias',
      error:
        `URL นี้เป็นที่อยู่เดิมของหลักสูตร "${legacyOwner}" อยู่แล้ว — `
        + 'การใช้ซ้ำจะทำให้หลักสูตรนั้นเข้าถึงไม่ได้ กรุณาใช้ URL อื่น',
    };
  }

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

  /**
   * ── A FORMER ALIAS OF ANOTHER COURSE (U4.2) ─────────────────────────────
   * Checked LAST of the four, because it is the weakest claim: the other
   * course is not using this URL right now, it is only still redirecting from
   * it. But allowing it would mean one URL means two courses — course B would
   * render at /x while course A still redirects /x to itself, and which one a
   * visitor gets would depend on which lookup ran first.
   *
   * THE UNIQUE INDEX CANNOT EXPRESS THIS. `urlAlias_1` compares urlAlias to
   * urlAlias; the rule here is "B.urlAlias must not equal any of
   * A.formerAliases", which spans two DIFFERENT fields on two different
   * documents. MongoDB has no cross-field uniqueness, so a multikey unique
   * index on formerAliases would only stop two courses sharing a former alias
   * — a different and much rarer collision. This therefore stays an
   * application-level rule, with the same concurrency window every
   * application-level check in this file has, and the index does not close
   * this one.
   */
  if (formerOwnerCourseId) {
    return {
      field: 'urlAlias',
      error:
        `URL นี้เคยเป็นที่อยู่ของหลักสูตร "${formerOwnerCourseId}" — `
        + 'ยังมีลิงก์เดิมที่ส่งต่อไปยังหลักสูตรนั้นอยู่ ถ้าใช้ซ้ำ URL เดียวจะหมายถึงสองหลักสูตร กรุณาใช้ URL อื่น',
    };
  }

  return null;
}
