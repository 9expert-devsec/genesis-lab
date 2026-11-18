'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  buildProgramRank,
  filterCourses,
  groupCoursesByProgram,
  skillIdForSlug as resolveSkillId,
  sortProgramOptions,
} from '@/lib/courses/courseListGrouping';
import { CourseListView } from './CourseListView';

/**
 * Client-side list view for /training-course.
 *
 * ── THE URL IS THE FILTER. NOTHING HERE MIRRORS IT INTO STATE. ──────────────
 * `skill`, `program` and `view` are read from `searchParams` on every render.
 * A control writes the URL; the URL decides what renders. There is no second
 * copy and therefore nothing that can disagree with the address bar.
 *
 * WHAT THIS REPLACES, because the shape mattered. The three filters were
 * `useState` seeded from `searchParams`, kept in step by an effect that
 * re-derived the URL from that state — and that effect listed `searchParams` in
 * its own dependencies. So a navigation to the same route with different
 * parameters re-ran it with the OLD state and wrote the old values back:
 *
 *   · /training-course → /training-course?skill=excel  (a client-side nav, the
 *     component instance survives) — `skillSlug` was still null, so the effect
 *     DELETED `skill` from the address bar and rendered the unfiltered catalog;
 *   · ?skill=excel → ?skill=powerbi — worse, the stale value was written back,
 *     so the URL REVERTED to the previous filter.
 *
 * A first load was always correct, which is why this survived: the state was
 * seeded from the URL it was about to be compared against. Only a surviving
 * instance could go stale. Same defect as the admin registration screens, same
 * conformance target — AuditLogClient holds its filters as props and
 * re-serialises from them, and this is that rule on a public page.
 *
 * ── ARRIVAL NEVER REWRITES THE URL. AN ACTION DOES. ─────────────────────────
 * READ THIS BEFORE "TIDYING" THE ASYMMETRY BELOW. It is deliberate and the two
 * halves are not the same operation:
 *
 *   ARRIVAL  — whatever the URL says is respected and left exactly as it is.
 *              `?view=card` stays `?view=card`. The old effect normalised it
 *              away on load, because it only ever persisted 'table', so a
 *              shared link quietly lost a parameter it had been given.
 *   ACTION   — a control writes the parameter when the value is NON-DEFAULT and
 *              REMOVES it when the value is the default. That is the shape
 *              `setOrDelete` has always had, and it is what keeps ONE canonical
 *              URL for default content.
 *
 * The canonical-URL half is not cosmetic: src/app/sitemap.js lists
 * /training-course BARE, so a page that appended `?view=card` to everyone's URL
 * the moment they touched a control would spawn a second address for the same
 * content, competing with the one that is actually indexed.
 *
 * So: arrival is not an action. Preserving what you were handed and not
 * emitting a default you were not handed are both "leave it alone" — they only
 * look asymmetric if you read the two branches without reading this.
 *
 * ── WHAT STAYS LOCAL, AND WHY IT IS NOT AN EXCEPTION TO THE RULE ────────────
 * `search` is the hero search box. It is local-only ON PURPOSE — search terms
 * are noisy for URL history, and it has never been a URL parameter. The rule
 * above is about filters that exist in two places at once; a value that lives
 * in exactly one place is already conformant.
 *
 * Filtering is client-side over the full items array passed from the server
 * page — the list endpoint returns ~73 courses, well within the size where a
 * client-side filter is simpler than refetching.
 *
 * ── THE SERVER HTML IS CourseListStatic, NOT THIS ───────────────────────────
 * useSearchParams makes the Suspense boundary around this component bail out
 * to client rendering at prerender. Its fallback, CourseListStatic, renders the
 * unfiltered catalog through the same CourseListView and the same pure
 * grouping (lib/courses/courseListGrouping), so the served HTML has the H1 and
 * every course link while the route stays static. Change the grouping there,
 * never here, or the two renders drift apart.
 */
// `skillSlugs` (plural) is the id → catalog-URL map for the capsules and is
// unrelated to the `skillSlug` (singular) filter value read from the query
// string below. Two names one letter apart in one file is a hazard, so: the
// singular one selects which courses to SHOW, the plural one decides where a
// capsule LINKS.
export function CourseListClient({
  items,
  programOrder = [],
  earlyBirdMap = {},
  currentYear,
  skillSlugs = {},
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // DERIVED EVERY RENDER — never copied into state. See the header.
  const skillSlug = searchParams.get('skill');
  const programName = searchParams.get('program');
  const view = searchParams.get('view') === 'table' ? 'table' : 'card';

  const [search, setSearch] = useState('');

  /**
   * A control action → the next URL. The ONLY writer of these parameters.
   *
   * `searchParams` is read live here rather than closed over from a render that
   * may be stale, and every key not named in `changes` is carried through
   * untouched — a filter must not drop an unrelated parameter somebody linked
   * with. `replace`, not `push`, so filtering does not fill the back button
   * with intermediate states; that was true of the effect this replaces and is
   * kept.
   */
  const applyFilter = useCallback((changes) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      setOrDelete(next, key, value);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // Program → admin-set rank lookup. Programs not in the order map
  // fall to the bottom (sorted alphabetically among themselves).
  const programRank = useMemo(() => buildProgramRank(programOrder), [programOrder]);

  const programOptions = useMemo(
    () => sortProgramOptions(items, programRank),
    [items, programRank]
  );

  const skillId = useMemo(() => resolveSkillId(skillSlug), [skillSlug]);

  const filtered = useMemo(
    () => filterCourses(items, { search, skillId, programName }),
    [items, search, skillId, programName]
  );

  const groups = useMemo(
    () => groupCoursesByProgram(filtered, programRank),
    [filtered, programRank]
  );

  const handleSearch = useCallback((v) => setSearch(v), []);

  return (
    <CourseListView
      groups={groups}
      resultCount={filtered.length}
      view={view}
      skillSlug={skillSlug}
      programName={programName}
      programOptions={programOptions}
      onSearch={handleSearch}
      onSkillChange={(v) => applyFilter({ skill: v })}
      onProgramChange={(v) => applyFilter({ program: v })}
      // THE DEFAULT IS REMOVED, NOT WRITTEN — the ACTION half of the rule in
      // the header: ตาราง writes `view=table`, การ์ด deletes the key.
      onViewChange={(v) => applyFilter({ view: v === 'table' ? 'table' : null })}
      earlyBirdMap={earlyBirdMap}
      currentYear={currentYear}
      skillSlugs={skillSlugs}
    />
  );
}

/**
 * Write a parameter, or remove it when the value is empty/default.
 *
 * The falsy test is the whole rule: `null` from a cleared select, `null` from
 * the card view, and `''` all mean "this key should not be in the URL". Kept
 * exactly as it was — the defect was never in this function, it was in what
 * called it and with which values.
 */
function setOrDelete(params, key, value) {
  if (value) params.set(key, value);
  else params.delete(key);
}
