/**
 * Resolve a public URL slug to its course detail.
 *
 * Two paths in priority order:
 *   1. `urlAlias` match in CourseExtension — admin set a pretty URL.
 *   2. Legacy "<code>-training-course" suffix — strip + uppercase to
 *      get the upstream `course_id`.
 *
 * Returns `{ course, extension, mode }` or `null`. `extension` may be
 * `null` even on a successful resolution (legacy URLs without an
 * extension document).
 *
 * NOTE on case-sensitivity: upstream `course_id` has no canonical casing (5 of
 * 77 are mixed-case) and upstream may RENAME one at any time. BOTH paths
 * therefore look up through `getCourseByCodeInsensitive`, for two different
 * reasons:
 *
 *   path 2 never had the casing — it uppercases a URL fragment.
 *   path 1 had it and it went STALE — `extension.courseId` is a copy frozen
 *          when an admin last saved that row, and nothing propagates a rename.
 *
 * The older note here said courses with lowercase letters "still resolve via
 * urlAlias". That was the exact opposite of the truth once upstream renamed
 * `Power-Apps` to `POWER-APPS`: the alias path was the one that broke.
 */

import {
  getCourseExtension,
  getCourseExtensionByAlias,
  getCourseExtensionByFormerCode,
} from '@/lib/actions/course-extensions';
import { getCourseByCodeInsensitive } from '@/lib/api/public-courses';

const SUFFIX = '-training-course';

/**
 * `deps` exists so both paths are testable without a network or a database;
 * production callers pass nothing. Same reasoning as
 * getCourseByCodeInsensitive's own `deps` — this resolver's whole behaviour is
 * which lookup it reaches for, and that is not observable from source text
 * alone (an fs guard asserting the CALL is what let the stale-casing bug sit
 * here, green, in the first place).
 */
export async function resolveCourse(
  slug,
  {
    fetchExtensionByAlias = getCourseExtensionByAlias,
    fetchExtension = getCourseExtension,
    fetchExtensionByFormerCode = getCourseExtensionByFormerCode,
    fetchCourse = getCourseByCodeInsensitive,
    /**
     * ── THE ADMIN PREVIEW BYPASS, AND THE ONLY THING THAT OPENS IT ───────────
     * `true` resolves a course whose extension says `isPublished: false`.
     *
     * It has exactly ONE caller: `resolveHiddenCourseForAdmin`, which returns
     * null — and therefore never reaches this — unless there is an authenticated
     * admin session. The gate is the session and nothing else. `?preview=1`
     * appears on the URL, but it is not a credential and grants nothing on its
     * own; that module is where the distinction is written down, because it is
     * the one place both halves are visible.
     *
     * A bypass that leaks is worse than the defect it fixes, so the safest
     * bypass is one with nothing to forge. There is no token, no secret and no
     * cookie of our own here — an anonymous request cannot mint a NextAuth
     * session, so it cannot reach a `true` in this parameter by any route.
     *
     * The PUBLIC resolution path never passes it. Both branches below default
     * to false, so forgetting to thread it fails CLOSED — a hidden course stays
     * hidden — which is the direction a mistake here has to fall.
     */
    includeHidden = false,
  } = {}
) {
  if (!slug) return null;
  const seg = String(slug).trim();
  if (!seg) return null;

  // 1) Custom URL alias.
  const alias = seg.startsWith('/') ? seg : `/${seg}`;
  const byAlias = await fetchExtensionByAlias(alias).catch(() => null);
  if (byAlias && (includeHidden || byAlias.isPublished !== false)) {
    /**
     * CASE-TOLERANT, because the stored key can LAG AN UPSTREAM RENAME.
     *
     * This used to be an exact `getCourseByCode`, under a comment asserting
     * that the stored id could not have a casing problem and so needed no
     * fallback. That was false, and it cost a live 404. (Deliberately
     * paraphrased rather than quoted: an fs guard greps for the original
     * sentence, and a verbatim quotation here would trip it.)
     *
     * The casing here is not LOST, it is STALE. `courseId` is a copy of the
     * upstream `course_id`, frozen on the CourseExtension the day an admin last
     * saved that row — upstream is free to rename afterwards and nothing
     * propagates it. Extension `69f87551aac437056dfc02cf` was written
     * 2026-05-04 holding `Power-Apps`; upstream has since become `POWER-APPS`.
     * The exact fetch missed, path 1 fell through, path 2 uppercased the ALIAS
     * to POWER-APPS-FOR-BUSINESS which is not a course either, and
     * /power-apps-for-business-training-course 404'd while
     * /POWER-APPS-training-course served fine.
     *
     * So this is the same permanent condition path 2 already handles, reached
     * by a different route: path 2's id comes from a URL that never had the
     * casing, path 1's comes from a copy that had it and went out of date.
     * Neither is recoverable by exact match, and repairing the row would fix
     * this one URL and none of the next ones — nothing stops upstream renaming
     * again tomorrow.
     */
    const course = await fetchCourse(byAlias.courseId, { includeHidden }).catch(
      () => null
    );
    if (course) {
      return { course, extension: byAlias, mode: 'alias' };
    }

    /**
     * ── FORMER CODES: THE OTHER WAY THE STORED KEY CAN BE AHEAD ────────────
     *
     * The stale-casing case above is the extension LAGGING upstream. This is
     * the reverse and it is deliberate rather than accidental: phase 1 of a
     * course-code rename rewrites every genesis store to the NEW code while
     * MSDB still carries the OLD one, so `byAlias.courseId` resolves to nothing
     * upstream until the tech lead makes the second change.
     *
     * Without this branch the aliased URL 404s for the whole interval — the
     * alias row is found, its courseId misses upstream, path 2 then uppercases
     * the ALIAS (not a code) and misses too. A pretty URL that dies between two
     * halves of a planned migration is exactly the failure the alias exists to
     * prevent.
     *
     * One of exactly two sites that consult `formerCodes`; the other is
     * `/search`'s course haystack. Tried in order, most recent last, and only
     * on a miss — a course whose current code resolves never reaches here.
     */
    for (const former of Array.isArray(byAlias.formerCodes) ? byAlias.formerCodes : []) {
      if (!former) continue;
      const legacy = await fetchCourse(former, { includeHidden }).catch(() => null);
      if (legacy) return { course: legacy, extension: byAlias, mode: 'alias-former-code' };
    }
  }

  // 2) Legacy "<code>-training-course" pattern.
  if (seg.endsWith(SUFFIX)) {
    // Uppercased because that is how the great majority of upstream ids are
    // stored, so it is the casing that hits the direct lookup. The five
    // mixed-case ids miss it and are recovered by the case-insensitive
    // fallback inside the helper — without which /power-apps-training-course
    // and four siblings 404 outright.
    const courseId = seg.slice(0, -SUFFIX.length).toUpperCase();
    if (!courseId) return null;
    const course = await fetchCourse(courseId, { includeHidden }).catch(() => null);
    if (!course) return null;
    // Look up extension by the upstream's canonical course_id (which
    // may differ in case from the URL fragment).
    let extension = await fetchExtension(course.course_id).catch(() => null);
    /**
     * ── THE RENAME INTERVAL, ON THE DERIVED URL ────────────────────────────
     * Phase 1 moves the extension to the NEW code while upstream still serves
     * the OLD one, so this exact lookup misses for the whole window. Without
     * the fallback the page renders with NO extension — losing its SEO, its
     * gallery, and (the one that matters) the `isPublished` gate below, so a
     * HIDDEN course would become publicly visible mid-migration. That is a
     * safety regression, not a cosmetic one.
     */
    if (!extension) {
      extension = await fetchExtensionByFormerCode(course.course_id).catch(() => null);
    }
    /**
     * ── PATH 2 HAD NO isPublished GATE AT ALL, AND THAT WAS HALF THE DEFECT ──
     * Un-publishing a course removed only its PRETTY url. The derived
     * /<code>-training-course kept serving the full page, because this branch
     * read the extension for its SEO and gallery and never looked at the flag.
     * So "hidden" meant one of a course's two public URLs stopped working —
     * which is worse than either outcome on its own, since the admin sees the
     * alias 404 and reasonably concludes the course is gone.
     *
     * The check sits AFTER the extension read rather than before, because the
     * flag lives on the extension and this path arrives holding only a code.
     * `=== false` and not `!isPublished`: a course with no extension row at all
     * has never been hidden by anybody, and must keep resolving.
     */
    if (!includeHidden && extension?.isPublished === false) return null;
    return { course, extension, mode: 'code' };
  }

  return null;
}
