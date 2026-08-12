import { findHiddenCourseForSlug } from '@/lib/courses/hiddenCourses';
import { resolveCourse } from '@/lib/resolveCourse';

/**
 * Admin preview of a HIDDEN course, on the course's own public URL.
 *
 * ── WHAT GRANTS ACCESS, AND WHAT DOES NOT ───────────────────────────────────
 * THE ADMIN SESSION GRANTS. `?preview=1` GRANTS NOTHING. It is not a token and
 * must never be read as one: it carries no secret, it is trivially guessable,
 * and on its own it produces exactly the 404 an anonymous visitor already gets.
 * It buys two things, neither of them access:
 *
 *   · AN ADMIN'S VIEW OF THE PUBLIC SITE MATCHES THE PUBLIC'S BY DEFAULT.
 *     Without it, anyone logged in browses a different site from everyone else
 *     — hidden courses silently present for them, 404 for visitors — and the
 *     admin least able to notice the difference is the one who hid the course.
 *     Previewing is then something you ASK for, once, on one URL.
 *   · `auth()` is not run on every request to this route. It is the site's
 *     whole public URL space; a session read per request buys nothing on the
 *     overwhelming majority of them.
 *
 * ── A CORRECTION, KEPT RATHER THAN QUIETLY REWRITTEN ────────────────────────
 * The first version of this comment justified the parameter by Next's
 * full-route cache: that `auth()` would take these renders out of it and make
 * all 78 course pages dynamic. THAT WAS WRONG, and it was asserted rather than
 * measured. `next build` reports `/[...slug]` as ƒ (Dynamic) — and did so at
 * c5f4ad6, before any of this work — because it is a catch-all with no
 * generateStaticParams, and because both `generateMetadata` and the custom-page
 * resolver already await `searchParams`. There was no static render on this
 * route to protect. The route table is byte-identical before and after this
 * change; the surrounding pages that ARE static (`/` 1h, `/training-course`
 * 30m, `/schedule` 30m, `/promotions` 1h) do not render this gate.
 *
 * The design did not change when the reason did, which is worth being explicit
 * about: the two benefits above are real on a dynamic route, and the ordering
 * below still avoids per-request work. But the number that would have made the
 * cache argument true was never taken, and a comment that sounds measured while
 * being a guess is worse than no comment.
 *
 * This is the one place it differs from the custom-page bypass on the same
 * route, whose `?preview=<token>` IS the credential, compared against a
 * per-document `previewToken`. A course has no such per-record secret, and
 * inventing one would mean a second thing that can leak. An admin session is
 * already the strongest credential in this application and an anonymous request
 * cannot mint one, so there is nothing here to forge.
 *
 * ── THE ORDER OF THE THREE CHECKS IS THE WHOLE DESIGN ───────────────────────
 *   1. is this slug even a hidden course — and free when nothing is hidden
 *      (0 of 78 rows, measured 2026-08-12), because it starts from a set the
 *      public header has already loaded this request. Every published course,
 *      custom page and builder page returns here having done no extra work.
 *   2. did the request ask to preview — reachable only on a URL belonging to a
 *      course an admin has hidden.
 *   3. is there an admin session — the actual gate.
 *
 * Reversing 1 and 2 costs a session read on every request to the site's entire
 * public URL space. Reversing 2 and 3 is harmless but pointless. Removing 3 is
 * the leak, and is what the tests around this function exist to make impossible
 * to do quietly.
 *
 * ── WHY IT LIVES HERE AND NOT IN THE ROUTE ──────────────────────────────────
 * A page file cannot export anything but Next's own contract, so a gate written
 * inside it can only ever be checked by grepping its source — and "the source
 * contains an auth call" is not the same claim as "no session means no course".
 * The one that matters is the second, and it needs a callable function.
 *
 * `deps` is how the pure tier drives all four outcomes without a database, a
 * network or a Next request context. Production callers pass nothing.
 */
export async function resolveHiddenCourseForAdmin(
  segment,
  searchParams,
  {
    findHidden = findHiddenCourseForSlug,
    resolve = resolveCourse,
    getSession,
  } = {}
) {
  const hiddenCourseId = await findHidden(segment).catch(() => null);
  if (!hiddenCourseId) return null;

  const sp = await Promise.resolve(searchParams).catch(() => null);
  if (String(sp?.preview ?? '') !== '1') return null;

  /**
   * Imported lazily so this module can be loaded — and therefore tested —
   * outside a Next request context: `@/lib/auth/options` reaches next-auth →
   * next/headers, which does not resolve under plain Node. Same reasoning as
   * the deferred database imports in hiddenCourses.js.
   */
  const readSession = getSession ?? (await import('@/lib/auth/options')).auth;

  // A FAILED session read is NOT a session. Same rule as the duplicate-code
  // guard and the alias check: refusing to answer is not the same as answering
  // yes, and here guessing yes publishes a page an admin took down.
  const session = await readSession().catch(() => null);
  if (!session?.user) return null;

  return resolve(segment, { includeHidden: true });
}
