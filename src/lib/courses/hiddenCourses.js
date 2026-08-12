/**
 * "Hidden" courses — `CourseExtension.isPublished === false` — and the one
 * batched read that answers which they are.
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 * `isPublished` used to gate exactly one thing: pretty-URL resolution in
 * resolveCourse. Every LISTING surface is fed by upstream `/public-course`,
 * which has never heard of this collection — so unpublishing a course left it
 * in the mega menu, in /training-course, in /schedule and in /search, every
 * entry now linking at a 404. Measured on COPILOT-STU. The ruling is that
 * hidden means GONE FROM EVERYWHERE, not merely un-routable.
 *
 * ── WHY THIS IS A READ-TIME FILTER AND NOT A SYNC-WRITER ONE ────────────────
 * The mega menu and the home page do not read upstream at request time; they
 * read snapshots that a Vercel Cron writes into `nav_menu_cache` /
 * `landing_cache`. That cron runs on the PRODUCTION deployment, which builds
 * `main`, while the site people actually look at is served from `dev`. A filter
 * written into syncNavMenuData/syncLandingData therefore does nothing on UAT
 * until main carries it — on the exact two surfaces the defect was found on.
 *
 * So the rule is: SNAPSHOTS STORE THE SUPERSET, READS FILTER. The sync writers
 * pass `includeHidden: true` deliberately (see their call sites) and the
 * snapshot READ paths — getNavMenuData, getLandingData — drop hidden courses on
 * the way out. That also means re-publishing a course brings it back
 * immediately, instead of waiting for the next 3-hour sync to re-add a row a
 * write-time filter had deleted.
 *
 * ── THE COST, MEASURED ──────────────────────────────────────────────────────
 * One query: `find({ isPublished: false }, { courseId: 1 })`. Warm, 10
 * iterations against the live cluster: median 38.7 ms returning 0 rows. Reading
 * all 78 flags instead measured 46.2 ms, so the hidden-only query is the cheaper
 * of the two AND the payload does not grow with the catalog. It is ONE read per
 * request — never one per course — memoised below.
 *
 * ── IT FAILS OPEN, AND THAT IS A DECISION ───────────────────────────────────
 * If the read throws, callers get the UNFILTERED list plus a console.error.
 * Fail-closed would empty every catalog page in the site on a single Mongo blip,
 * which is a far larger outage than the thing being prevented — and during a
 * Mongo outage the course is visible anyway, because resolveCourse needs this
 * same collection to know it is hidden. Loud, not silent, so the degradation is
 * visible in logs rather than inferred from a menu that looks fine.
 */

import * as React from 'react';

/**
 * React's per-request memo, WHEN IT EXISTS. `cache` ships only in React's
 * `react-server` build; under the verification suite's loader (plain Node,
 * React 18.3) it is undefined, and an unguarded `React.cache(...)` would throw
 * at module load for every test that imports anything downstream of this file.
 * Falling through to the raw function is correct there — those tests inject
 * their own reader and never touch this path.
 */
const perRequest = typeof React.cache === 'function' ? React.cache : (fn) => fn;

/**
 * Codes are compared UPPERCASED on both sides.
 *
 * `course_id` has no canonical casing (see getCourseByCodeInsensitive), and the
 * stored `CourseExtension.courseId` is a copy that can lag an upstream rename.
 * Matching case-sensitively here would mean a course hidden as `Power-Apps`
 * stays visible everywhere the moment upstream renames it `POWER-APPS` — the
 * hiding silently stops working, which is the one failure mode this whole
 * change exists to remove. The nav-menu sync already keys its alias map the
 * same way, for the same reason.
 */
export function normaliseCourseKey(courseId) {
  return String(courseId ?? '').trim().toUpperCase();
}

/** The `courseId`s of a set of extension rows, as a lookup Set. */
export function hiddenIdSet(rows) {
  return new Set(
    (rows ?? []).map((r) => normaliseCourseKey(r?.courseId)).filter(Boolean)
  );
}

/** Is this upstream `course_id` hidden? Tolerates a null/absent set. */
export function isHiddenCourse(hidden, courseId) {
  if (!hidden || hidden.size === 0) return false;
  const key = normaliseCourseKey(courseId);
  return key !== '' && hidden.has(key);
}

/**
 * Drop hidden entries from a list of anything that carries a course code.
 *
 * `getId` exists because the shape differs by surface: upstream list rows use
 * `course_id`, the nav snapshot's rows use the same key, and a schedule row
 * reaches its code through `course_ref`. A non-array in returns an empty array
 * rather than throwing — every caller here is already on a degraded-but-
 * rendering path when that happens.
 */
export function dropHiddenCourses(items, hidden, getId = (c) => c?.course_id) {
  if (!Array.isArray(items)) return [];
  if (!hidden || hidden.size === 0) return items;
  return items.filter((item) => !isHiddenCourse(hidden, getId(item)));
}

/**
 * The nav-menu snapshot's `programs` / `skills` maps, with hidden courses gone.
 *
 * Three things happen, and the second two are the ones that would be missed:
 *
 *   · hidden rows leave `items`;
 *   · `firstCover` is CLEARED when it points at a hidden course — it is a
 *     separate copy of one course, so filtering `items` alone would leave the
 *     hidden course's name and cover art rendered in column 4;
 *   · a group whose `items` empties is DROPPED ENTIRELY, matching the rule
 *     syncNavMenuData already applies at write time ("a program with no public
 *     courses has nothing to show and must not appear"). Without this, hiding a
 *     one-course program leaves a dead menu entry behind.
 */
export function filterNavMenuGroups(groups, hidden) {
  const out = {};
  for (const [key, entry] of Object.entries(groups ?? {})) {
    const items = dropHiddenCourses(entry?.items, hidden);
    if (items.length === 0) continue;
    const cover = entry?.firstCover ?? null;
    out[key] = {
      ...entry,
      items,
      firstCover: cover && isHiddenCourse(hidden, cover.course_id) ? null : cover,
    };
  }
  return out;
}

const SUFFIX = '-training-course';

/**
 * Does this public slug belong to a HIDDEN course? The `courseId`, or null.
 *
 * ── WHY THIS PROBE EXISTS RATHER THAN JUST RESOLVING THE COURSE ─────────────
 * The catch-all route is ISR-cached (revalidate 3600). The admin preview needs
 * `cookies()`, and reading a dynamic API anywhere in a render takes that render
 * out of the full-route cache — so a preview check placed on the ordinary path
 * would make all 78 course pages, plus every custom and builder page, render
 * dynamically. This answers "is there even anything here to preview?" using
 * nothing dynamic, so the cookie read happens ONLY on the handful of URLs that
 * belong to a course an admin has hidden.
 *
 * ── AND WHY IT IS ALMOST FREE ───────────────────────────────────────────────
 * It starts from `loadHiddenCourseIds()`, which the public header has already
 * called this request (getNavMenuData), so the memo usually answers it. With
 * nothing hidden — the production state as measured, 0 of 78 — it returns on
 * that set being empty and issues no query at all. Only when something IS
 * hidden does the alias branch cost one indexed findOne.
 *
 * Both URL shapes are checked, because a course has two and un-publishing has
 * to govern both: the stored `urlAlias`, and the derived
 * `/<code>-training-course`.
 */
export async function findHiddenCourseForSlug(
  slug,
  { hidden, findByAlias } = {}
) {
  const seg = String(slug ?? '').trim();
  if (!seg) return null;

  const set = hidden ?? (await loadHiddenCourseIds());
  if (set.size === 0) return null;

  // Legacy shape — decidable from the string alone, no query.
  if (seg.endsWith(SUFFIX)) {
    const code = seg.slice(0, -SUFFIX.length);
    if (isHiddenCourse(set, code)) return normaliseCourseKey(code);
  }

  // Alias shape — one indexed lookup, scoped to hidden rows.
  const alias = seg.startsWith('/') ? seg : `/${seg}`;
  const lookup = findByAlias ?? defaultFindHiddenByAlias;
  const doc = await lookup(alias).catch(() => null);
  return doc?.courseId ? normaliseCourseKey(doc.courseId) : null;
}

async function defaultFindHiddenByAlias(alias) {
  const { dbConnect } = await import('@/lib/db/connect');
  await dbConnect();
  const { default: CourseExtension } = await import('@/models/CourseExtension');
  return CourseExtension.findOne({ urlAlias: alias, isPublished: false })
    .select('courseId')
    .lean();
}

/**
 * The set of hidden course codes. ONE indexed read, memoised per request.
 *
 * `deps` so the pure tier can drive both the hit and the failure path without a
 * database — the same reasoning as resolveCourse's and
 * getCourseByCodeInsensitive's own `deps`. Production callers pass nothing.
 *
 * ── THE DATABASE IMPORTS ARE DEFERRED TO THE FIRST REAL CALL, ON PURPOSE ────
 * `@/lib/db/connect` THROWS AT MODULE LOAD when MONGODB_URI is unset. This
 * module is imported by lib/api/public-courses, which is imported by most of
 * src/app — so a static import here would make the upstream adapter unloadable
 * anywhere there is no database configured, which is every file in the pure and
 * render test tiers and the smoke tier's network-only run. Deferring costs one
 * already-resolved dynamic import per call and keeps the adapter's dependency
 * on Mongo where it belongs: at the moment it actually reads.
 */
export const loadHiddenCourseIds = perRequest(async function loadHiddenCourseIds(
  deps = {}
) {
  const { error = console.error } = deps;
  try {
    const connect = deps.connect ?? (await import('@/lib/db/connect')).dbConnect;
    await connect();
    const model = deps.model ?? (await import('@/models/CourseExtension')).default;
    // Only an EXPLICIT false hides a course. A row with the field absent is
    // published — same reading as the schema default and as resolveCourse's
    // `isPublished !== false`, so the three cannot drift into disagreeing.
    const rows = await model
      .find({ isPublished: false }, { courseId: 1, _id: 0 })
      .lean();
    return hiddenIdSet(rows);
  } catch (err) {
    error(
      '[hiddenCourses] could not read the hidden-course set — listings are '
        + `serving UNFILTERED, so an unpublished course may be visible (${err?.message ?? err})`
    );
    return new Set();
  }
});
