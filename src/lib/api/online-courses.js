/**
 * Online Courses adapter.
 *
 * Upstream path: `/online-course` (singular — mirrors `/public-course`
 * naming convention).
 *
 * Online courses are streamed/self-paced from 9Expert Academy and have
 * no schedule rows; consumers should treat `schedules` as empty.
 */

import { aiFetch, unwrap } from './client';

const PATH = '/online-course';

/**
 * List active online courses. Mirrors `listPublicCourses` so the
 * homepage can feed them into the same CourseCarousel/CourseCard.
 *
 * ── THE `program` FILTER, AND WHY IT IS ONE ARGUMENT RATHER THAN A STORE ───
 *
 * Measured 2026-08-31 (docs/audit/program-page-sections.md §2.2): upstream
 * `GET /online-course?program=<id>` ALREADY filters. It was never reachable
 * from here because this function took no arguments — all eight call sites in
 * the repo bottom out in it, so "genesis cannot list a program's online
 * courses" was a missing parameter, not missing data.
 *
 * Verified with controls before this was written, because a filter that
 * returns a plausible number is indistinguishable from one being ignored:
 *
 *   (no param)              → 24 items
 *   ?program=MSE            → 10 items, all program_id=MSE
 *   ?program=<MSE ObjectId> → 10 items      (both spellings accepted)
 *   ?program=ZZZ-BOGUS      →  0 items
 *   ?zzz_not_a_param=MSE    → 24 items      ← unknown params are IGNORED
 *
 * That last line is the load-bearing one: the API does not collapse to zero
 * for anything it fails to understand, so the zero above is the filter working
 * rather than the request failing.
 *
 * ── THE CACHE ENTRY IS TAGGED, AND THAT IS NOT INCIDENTAL ──────────────────
 *
 * `?program=MSE` is a DIFFERENT Data Cache entry from the unfiltered read —
 * Next keys on the full URL. Both carry the same `online-courses` tag, and
 * `revalidateTag` busts every entry under a tag regardless of URL, so
 * `syncLandingData`'s existing `bustUpstream(UPSTREAM_TAGS.ONLINE_COURSES)`
 * already covers every per-program entry this adds. No new bust site, no new
 * tag in the vocabulary.
 *
 * An UNTAGGED entry here would have been the defect this repo already carries
 * once: `lib/api/resolveIds.js:26` caches `/public-course` for 300s with no
 * tag, so a course created in the last five minutes silently resolves to
 * nothing and no bust can reach it. One of those is enough.
 *
 * `program` is passed through verbatim. `aiFetch` drops undefined/null/'' from
 * the query string, so `getOnlineCourses()` and `getOnlineCourses({})` both
 * issue the same unfiltered URL the eight existing callers have always issued.
 *
 * @param {object} [options]
 * @param {string} [options.program] a program `program_id` short code (e.g.
 *   'MSE') or its ObjectId — upstream accepts either. Omit for the full list.
 */
export async function getOnlineCourses({ program } = {}) {
  const raw = await aiFetch(PATH, {
    params: { program },
    tags: ['online-courses'],
  });
  return unwrap(raw);
}
