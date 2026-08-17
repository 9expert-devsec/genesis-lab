/**
 * /search — the CORPUS. Everything searchable, assembled once and reused.
 *
 * This is the half of the search that touches the world: upstream feeds, Mongo,
 * and the course-detail fan-out. The matching rules live next door in
 * matchSearch.js and know nothing about any of it.
 *
 * ── WHY A CORPUS AT ALL, RATHER THAN A QUERY PER KEYSTROKE ──────────────────
 * The page is a 200ms-debounced type-ahead. A visitor typing "power bi" issues
 * several requests; each one must not become a Mongo scan plus ~N upstream
 * detail fetches. So the expensive part — assembly — happens once per window
 * and every request after that is a substring pass over objects already in
 * memory.
 *
 * ── WHY AN IN-PROCESS TTL AND NOT `unstable_cache` ──────────────────────────
 * The corpus contains every article's BODY as plain text, which is exactly the
 * thing that must not be re-fetched per request and exactly the thing that
 * makes the corpus large. Next's data cache has a per-entry size limit and
 * silently declines to store an entry that exceeds it — so `unstable_cache`
 * would look correct, pass review, and quietly rebuild the corpus on every
 * single keystroke in production. A module-level object has no size limit and
 * fails visibly (memory) rather than invisibly (latency).
 *
 * The trade this accepts: the cache is per server instance, so N instances do N
 * builds. That is the right way round — a rebuild is one cached-upstream sweep
 * plus two Mongo reads, and the alternative failure mode is unbounded.
 *
 * The upstream calls underneath are still `aiFetch`, so they keep their own
 * tags and Next data-cache entries; a rebuild after the TTL is mostly cache
 * hits, not a cold fan-out.
 *
 * ── WHY THE ONLINE FEED NEEDS NO ENRICHMENT ─────────────────────────────────
 * READ THIS BEFORE ADDING A FAN-OUT FOR IT. `/online-course`'s list response
 * ALREADY CARRIES `o_course_teaser`, so online courses are searchable to the
 * same depth for one request. There is no second fan-out to add; adding one
 * would buy nothing and cost a request per course.
 *
 * ── A CORRECTION, MEASURED 2026-08-09 ───────────────────────────────────────
 * This block used to claim that `/public-course`'s LIST response OMITS
 * `course_teaser`, `course_objectives` and `training_topics`, and that they
 * exist only on the detail response. THAT IS NOT TRUE, and it was never
 * measured — it was reasoning about the API written as if it were an
 * observation.
 *
 * Probed directly against the live API: all three fields are present AND
 * populated on 77 of 77 LIST rows, and the LIST row is byte-equivalent to the
 * detail row for the same course — same sorted key set, same values. The two
 * responses did not differ in any field examined.
 *
 * What follows from that is NOT recorded here as fact, because it has not been
 * measured: whether the enrich-courses pass over public courses is therefore
 * redundant depends on what else that pass does, and nobody has checked. The
 * claim above is corrected; the conclusion someone might draw from it is left
 * open deliberately rather than swapped for a second unverified one.
 */

import { listPublicCourses } from '@/lib/api/public-courses';
import { getAllSchedules } from '@/lib/api/schedules';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { enrichCoursesWithDetails } from '@/lib/api/enrich-courses';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { getActivePromotions } from '@/lib/promotions/getPromotions';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import { CourseExtension } from '@/models/CourseExtension';

/**
 * How long a built corpus is reused. Matches /search's own `revalidate = 1800`
 * so the two cadences cannot drift into "the page is 30 minutes stale but the
 * search is 5 minutes fresh".
 */
export const SEARCH_CORPUS_TTL_MS = 1800 * 1000;

const serialize = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/**
 * Build the corpus from scratch. Every source is independently `catch`ed to an
 * empty list: a search that returns five of six types is degraded, a search
 * that 500s because the promotions collection hiccuped is broken.
 */
async function buildSearchCorpus() {
  const [courseList, schedulesResult, onlineResult, careerPaths, promotions] =
    await Promise.all([
      listPublicCourses().catch(() => ({ items: [] })),
      getAllSchedules().catch(() => ({ items: [] })),
      getOnlineCourses().catch(() => ({ items: [] })),
      getActiveCareerPaths().catch(() => []),
      getActivePromotions().catch(() => []),
    ]);

  const listItems = courseList.items ?? [];

  /**
   * The one fan-out. `withSchedules: false` because this corpus already has
   * EVERY schedule from the single `getAllSchedules()` call above — paying for
   * one `listSchedulesByCourse` request per course on top of that would be
   * buying the same rows a second time, N requests at a time.
   *
   * NO `includeDetailFields` any more. It carried `course_objectives` and
   * `training_topics` for the matcher; both left the haystack when matching
   * narrowed to what a card can show, so pulling them here would put two large
   * arrays per course into the corpus for the lifetime of the TTL with no
   * reader. Same rule as the article body: not fetched, not matched, not
   * serialised.
   *
   * `course_teaser` still arrives — it is in enrich-courses' default mapping,
   * and it is both matched and rendered.
   */
  const enriched = await enrichCoursesWithDetails(listItems, {
    withSchedules: false,
  }).catch(() => listItems);

  /**
   * ── RETIRED CODES, ATTACHED SO AN OLD QUOTATION STILL FINDS THE COURSE ────
   *
   * `CourseExtension.formerCodes` is appended by the rename action. The code is
   * customer-facing — it is the first column of /schedule and customers quote
   * courses by it — so after a rename the code on somebody's quotation matches
   * nothing unless it is searchable. `urlAlias` saves the URL; this saves the
   * CODE.
   *
   * ONE query for the whole corpus, not one per course, and only for rows that
   * actually have a former code: the projection is two fields and the filter
   * excludes the empty default, so on a catalogue where nothing has ever been
   * renamed this reads nothing. It is attached rather than fetched at match
   * time because the corpus is built once per TTL and matched per keystroke.
   *
   * Failure is non-fatal: search without retired codes is the behaviour that
   * existed before renaming did, and a search page that 500s because an
   * extension read failed is worse than one that misses an old code.
   */
  let formerByCode = new Map();
  try {
    const rows = await CourseExtension.find(
      { formerCodes: { $exists: true, $ne: [] } },
      { courseId: 1, formerCodes: 1, _id: 0 }
    ).lean();
    formerByCode = new Map(
      rows.map((r) => [String(r.courseId).toUpperCase(), r.formerCodes ?? []])
    );
  } catch {
    formerByCode = new Map();
  }

  const courses = formerByCode.size === 0
    ? enriched
    : enriched.map((c) => {
        const former = formerByCode.get(String(c?.course_id ?? '').toUpperCase());
        return former?.length ? { ...c, formerCodes: former } : c;
      });

  // Resolve each round's course ONCE, here, rather than per keystroke in a
  // courseMap lookup on the client. The card needs the name, the code and the
  // price; nothing else about the course travels with a schedule row.
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  /**
   * ── A ROUND FOR A HIDDEN COURSE IS DROPPED, NOT LEFT UNRESOLVED ────────────
   * `listPublicCourses` above already filtered hidden courses out of the
   * COURSES tab, but /schedules is a separate upstream domain and still returns
   * their rounds. Leaving them in would keep a hidden course in the SCHEDULES
   * tab under its own name: `scheduleHaystack` falls back to the row's raw
   * `course_name` when `course_ref` is null, so the round stays matchable, and
   * it would render as a result whose only link is the 404 the course now is.
   *
   * This is the one place the join is lossy on purpose. A round whose course
   * did not resolve for any OTHER reason (decommissioned upstream, a genuine
   * /schedules ↔ /public-course drift) was already unrenderable — the card
   * reads its title straight off `course_ref` — so nothing that used to display
   * stops displaying here.
   */
  const schedules = (schedulesResult.items ?? [])
    .map((s) => {
      const c = courseById.get(String(s.course?._id ?? s.course ?? ''));
      return {
        ...s,
        course_ref: c
          ? {
              _id: String(c._id),
              course_id: c.course_id ?? null,
              course_name: c.course_name ?? null,
              course_price: c.course_price ?? null,
            }
          : null,
      };
    })
    .filter((s) => s.course_ref !== null);

  await dbConnect();
  /**
   * ── `content` IS NOT SELECTED, AND THAT IS A DELIBERATE REVERSAL ───────────
   * An earlier version of this builder pulled every article body, stripped it
   * to `contentText`, and matched on it. It worked, and the results were bad:
   * long prose is where incidental mentions live, so an article that says
   * "Power BI" once in passing came back as a result about Power BI.
   *
   * The body is removed from the CORPUS rather than merely ignored by the
   * matcher. A field nobody reads is still memory held for the TTL, still a
   * thing the next person will wire up "since it is already here", and still
   * one projection slip away from crossing the wire. Articles match on title,
   * excerpt and tags — the three fields an editor writes to describe the
   * article rather than to be the article.
   */
  const articleDocs = await Article.find({ active: true })
    .sort({ publishedAt: -1 })
    .select('slug title excerpt coverUrl publishedAt tags')
    .lean();

  const articles = serialize(articleDocs);

  return {
    courses,
    onlineCourses: onlineResult.items ?? [],
    careerPaths,
    schedules,
    promotions,
    articles,
  };
}

// Module-level cache. `pending` collapses a burst of concurrent first requests
// into ONE build — without it, the first three keystrokes after a cold start
// each kick off a full fan-out.
let cached = null;
let cachedAt = 0;
let pending = null;

/** The corpus, built at most once per TTL per process. */
export async function getSearchCorpus({ now = Date.now() } = {}) {
  if (cached && now - cachedAt < SEARCH_CORPUS_TTL_MS) return cached;
  if (pending) return pending;
  pending = buildSearchCorpus()
    .then((corpus) => {
      cached = corpus;
      cachedAt = now;
      return corpus;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Test/ops affordance: drop the cache so the next call rebuilds. */
export function resetSearchCorpusCache() {
  cached = null;
  cachedAt = 0;
  pending = null;
}
