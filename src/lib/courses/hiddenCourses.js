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
 * ── THE COST, MEASURED — AND THE TRADE THAT WAS TAKEN LATER ─────────────────
 * This used to read `find({ isPublished: false }, { courseId: 1 })`. Warm, 10
 * iterations against the live cluster: median 38.7 ms returning 0 rows, against
 * 46.2 ms for reading all 78 flags — so the hidden-only query was the cheaper of
 * the two AND its payload did not grow with the catalog.
 *
 * ROUND U3 TOOK THE MORE EXPENSIVE ONE ON PURPOSE, and the ~7.5 ms is the whole
 * price. Internal links have to emit the admin's `urlAlias` so every href
 * matches the canonical URL the page declares, and the alias lives in this
 * collection while every course list comes from upstream's HTTP API. The
 * alternative to widening this read was a lookup at each of ten call sites, or
 * a second collection-wide read beside this one. One read that returns 81 small
 * rows instead of 0 is the cheapest join available.
 *
 * It is still ONE read per request — never one per course — memoised below, and
 * both derived structures (the hidden set and the alias map) come out of it.
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
 * It answers "is there even anything here to preview?" cheaply enough to run
 * first, so the session read and the full course resolution happen ONLY on the
 * handful of URLs that belong to a course an admin has hidden — rather than on
 * every request to the catch-all route, which is the site's entire public URL
 * space.
 *
 * An earlier version of this note justified the ordering by Next's full-route
 * cache, claiming a cookie read here would make 78 static course pages dynamic.
 * That was asserted rather than measured, and `next build` says otherwise:
 * `/[...slug]` is ƒ (Dynamic), and already was at c5f4ad6. The ordering is
 * still right — it is per-request work, not cache loss, and the correction is
 * left visible rather than swapped for a second unverified reason.
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
 * Copy each course's stored `urlAlias` onto its list row.
 *
 * ONE PLACE, so every surface fed by `listPublicCourses` gets it without any of
 * them knowing the map exists. A course with no extension row, or with an empty
 * alias, gets `urlAlias: null` rather than an absent key — an absent key and a
 * null read the same to `courseCanonicalPath`, but a consistent shape is what
 * lets a test assert the field is THERE and thereby catch the plumbing being
 * dropped, which is the failure this round is about.
 *
 * NON-MUTATING: a new object per row. The upstream rows are memoised by
 * `aiFetch`'s cache and shared across requests — writing onto them would leak
 * one request's aliases into the next, and would survive a later read that was
 * supposed to see a renamed alias.
 */
export function attachAliases(items, aliasByCode) {
  if (!Array.isArray(items)) return items;
  if (!aliasByCode || aliasByCode.size === 0) {
    return items.map((c) => ({ ...c, urlAlias: null }));
  }
  return items.map((c) => ({
    ...c,
    urlAlias: aliasByCode.get(normaliseCourseKey(c?.course_id)) ?? null,
  }));
}

/** The `courseId` → `urlAlias` map of a set of extension rows, keys uppercased. */
export function aliasMapFromRows(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const key = normaliseCourseKey(row?.courseId);
    const alias = typeof row?.urlAlias === 'string' ? row.urlAlias.trim() : '';
    if (key && alias) map.set(key, alias);
  }
  return map;
}

/**
 * ONE read of course_extensions per request, feeding BOTH derived structures.
 *
 * ══ WHY THE READ WIDENED RATHER THAN A SECOND ONE BEING ADDED ═══════════════
 * ROUND U3. Internal links needed the admin's `urlAlias` so every href could be
 * the same canonical path the page's own <link rel="canonical"> declares. The
 * alias lives here, in Mongo; every course list in the app comes from upstream's
 * HTTP API. So something had to join them, and the choice was between a new
 * query per surface — ten of them — and widening the one read that was already
 * happening on every request.
 *
 * This function is that read. `loadHiddenCourseIds` used to BE it, fetching
 * `{ isPublished: false }` and projecting `courseId`; it is now a thin accessor
 * over this, so its signature, its contract and its callers are untouched.
 *
 * ── WHAT IT COSTS, STATED HONESTLY ──────────────────────────────────────────
 * The QUERY COUNT IS UNCHANGED — one, memoised per request by React.cache, so
 * the catalogue, the schedule page, the search corpus and the nav menu all
 * share it within a render. What changed is the filter: it used to match only
 * hidden rows (0 of 81 in production, measured) and now matches all 81, three
 * small fields each. That is a few kilobytes more per request, once, in
 * exchange for not issuing ten lookups.
 *
 * ── `deps` AND THE DEFERRED IMPORTS ARE INHERITED, NOT NEW ──────────────────
 * `deps` so the pure tier can drive both the hit and the failure path without a
 * database — the same reasoning as resolveCourse's and
 * getCourseByCodeInsensitive's own. Production callers pass nothing.
 *
 * `@/lib/db/connect` THROWS AT MODULE LOAD when MONGODB_URI is unset. This
 * module is imported by lib/api/public-courses, which is imported by most of
 * src/app — so a static import here would make the upstream adapter unloadable
 * anywhere there is no database configured, which is every file in the pure and
 * render test tiers and the smoke tier's network-only run. Deferring costs one
 * already-resolved dynamic import per call and keeps the adapter's dependency
 * on Mongo where it belongs: at the moment it actually reads.
 *
 * ── FAILING OPEN, IN BOTH DIRECTIONS, AND WHY THAT IS RIGHT ─────────────────
 * On a read failure the hidden set is empty (listings serve UNFILTERED, which
 * is loud in the log and was the pre-existing behaviour) and the alias map is
 * empty (links fall back to the derived `/<code>-training-course`, which still
 * resolves — resolveCourse serves both forms). Neither degradation is silent
 * breakage: the first is logged, and the second produces a working URL that is
 * merely not the canonical one.
 */
export const loadCourseExtensionIndex = perRequest(
  async function loadCourseExtensionIndex(deps = {}) {
    const { error = console.error } = deps;
    try {
      const connect = deps.connect ?? (await import('@/lib/db/connect')).dbConnect;
      await connect();
      const model = deps.model ?? (await import('@/models/CourseExtension')).default;
      // ALL rows now, not just the hidden ones — the alias map needs the
      // published majority. `isPublished` comes back so the hidden set can
      // still be derived here rather than by a second query.
      const rows = await model
        .find({}, { courseId: 1, urlAlias: 1, isPublished: 1, _id: 0 })
        .lean();
      // Only an EXPLICIT false hides a course. A row with the field absent is
      // published — same reading as the schema default and as resolveCourse's
      // `isPublished !== false`, so the three cannot drift into disagreeing.
      return {
        hidden: hiddenIdSet(rows.filter((r) => r?.isPublished === false)),
        aliasByCode: aliasMapFromRows(rows),
      };
    } catch (err) {
      error(
        '[hiddenCourses] could not read the hidden-course set — listings are '
          + `serving UNFILTERED, so an unpublished course may be visible (${err?.message ?? err})`
      );
      return { hidden: new Set(), aliasByCode: new Map() };
    }
  }
);

/**
 * The set of hidden course codes.
 *
 * UNCHANGED SIGNATURE AND UNCHANGED CONTRACT — it returns the same Set it
 * always did, and `deps` still reaches the same reader. It is a projection of
 * loadCourseExtensionIndex above rather than its own query, so the two can
 * never disagree about which rows are hidden and the request still issues one
 * read whichever of them is called first.
 */
export async function loadHiddenCourseIds(deps = {}) {
  return (await loadCourseExtensionIndex(deps)).hidden;
}

/**
 * `courseId` (uppercased) → the admin's stored `urlAlias`, for a whole request.
 *
 * The map carries the alias EXACTLY as stored — with its leading slash, because
 * that is what `normaliseAlias` writes and what `courseCanonicalPath` expects.
 * Nothing here strips or re-adds one: every previous attempt to normalise a
 * slash at a call site is how `//alias` got shipped twice.
 */
export async function loadCourseAliasMap(deps = {}) {
  return (await loadCourseExtensionIndex(deps)).aliasByCode;
}
