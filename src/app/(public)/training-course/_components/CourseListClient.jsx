'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { findSkillBySlug } from '@/config/site';
import { HeroSearch } from './HeroSearch';
import { FilterBar } from './FilterBar';
import { ViewToggle } from './ViewToggle';
import { CourseCardGroup } from './CourseCardGroup';
import { CourseTableGroup } from './CourseTableGroup';
import { EmptyState } from './EmptyState';

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
  const programRank = useMemo(() => {
    const map = new Map();
    programOrder.forEach((name, idx) => map.set(name, idx));
    return map;
  }, [programOrder]);

  // Distinct program list for the select. Sort by admin-set order
  // first; everything outside the order map falls to the bottom and
  // sorts alphabetically among itself.
  const programOptions = useMemo(() => {
    const distinct = Array.from(
      new Set(items.map((c) => c?.program?.program_name).filter(Boolean))
    );
    return distinct.sort((a, b) => {
      const ra = programRank.has(a) ? programRank.get(a) : Infinity;
      const rb = programRank.has(b) ? programRank.get(b) : Infinity;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, 'th');
    });
  }, [items, programRank]);

  const skillIdForSlug = useMemo(() => {
    const s = skillSlug ? findSkillBySlug(skillSlug) : null;
    return s?.upstreamId ?? null;
  }, [skillSlug]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (q) {
        const name = String(c.course_name ?? '').toLowerCase();
        const code = String(c.course_id ?? '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      if (skillIdForSlug) {
        // After detail enrichment c.skills is an array of objects
        // ({_id, skill_name, ...}); pre-enrichment it's bare ObjectId
        // strings. Match either shape.
        const arr = Array.isArray(c.skills) ? c.skills : [];
        const hit = arr.some((s) =>
          typeof s === 'string'
            ? s === skillIdForSlug
            : s?._id === skillIdForSlug || s?.skill_id === skillIdForSlug
        );
        if (!hit) return false;
      }
      if (programName) {
        if (c.program?.program_name !== programName) return false;
      }
      return true;
    });
  }, [items, search, skillIdForSlug, programName]);

  // Group by program name, then sort groups by the admin-set order so
  // the page hierarchy mirrors the same sequence as the home page and
  // the filter dropdown.
  const groups = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = c?.program?.program_name ?? 'อื่นๆ';
      if (!map.has(key)) {
        map.set(key, { program: c.program, courses: [] });
      }
      map.get(key).courses.push(c);
    }
    return Array.from(map.values()).sort((a, b) => {
      const an = a.program?.program_name ?? 'อื่นๆ';
      const bn = b.program?.program_name ?? 'อื่นๆ';
      const ra = programRank.has(an) ? programRank.get(an) : Infinity;
      const rb = programRank.has(bn) ? programRank.get(bn) : Infinity;
      if (ra !== rb) return ra - rb;
      return an.localeCompare(bn, 'th');
    });
  }, [filtered, programRank]);

  const handleSearch = useCallback((v) => setSearch(v), []);

  return (
    <div className="min-h-screen bg-9e-ice pb-16 dark:bg-9e-border">
      <HeroSearch onDebouncedChange={handleSearch} />

      {/*
        Both selects already hand back `null` when cleared, which is exactly
        what `setOrDelete` treats as "remove the key" — so choosing
        ทักษะทั้งหมด deletes `skill` rather than writing an empty one.
      */}
      <FilterBar
        skillSlug={skillSlug}
        onSkillChange={(v) => applyFilter({ skill: v })}
        programName={programName}
        onProgramChange={(v) => applyFilter({ program: v })}
        programOptions={programOptions}
      />

      {/*
        THE MOBILE EDGE INSET, AND WHY IT SITS HERE RATHER THAN INSIDE THE
        TABLE'S SCROLL TRACK.

        `px-4 lg:px-6` is read off this route's own siblings — FilterBar's
        1200px container directly above uses exactly this pair, and HeroSearch
        above that uses it too — so all three blocks on the route now line up
        instead of the results column alone running to the edge. It is the same
        4-unit inset the course detail page and CustomPageView apply at the
        identical 1200px box. Not a new token.

        This wrapper is the parent of BOTH view modes, so the one class fixes
        the cards, the grids and the program group headers together. In table
        mode it also insets the `overflow-x-auto` track in CourseTableGroup,
        which is a real cost: the visible window over a 744px table drops from
        ~358px to ~326px at 360px wide, and the clipped right edge — the "there
        is more to the right" cue — moves 16px away from the thumb.

        THAT IS THE OPPOSITE OF THE RULING IN CourseSectionTabs, AND THE TWO DO
        NOT CONFLICT. Read the header of
        src/app/(public)/[...slug]/_components/CourseSectionTabs.jsx before
        "harmonising" them: that strip is CHROME — a sticky bar that has to read
        as continuous with the full-width header — and its scroll container is a
        flex `ul`, which honours inline-END padding at the scroll end. This is
        CONTENT: a bordered, rounded, shadowed card in a stack of sibling cards,
        whose scroll container's child is a `table`. Chrome and Safari drop the
        end padding of a scroll container with a block-level child, so the
        full-bleed shape here would give a 16px inset on the left that never
        reappears on the right — asymmetric — and would double-inset the first
        column on top of the `px-4` every cell in CourseTableGroup already
        carries. The group header above each table is outside the track too, so
        it would need its own inset regardless.

        Same question, different element class, opposite answer. Both are right.
      */}
      <div className="mx-auto max-w-[1200px] px-4 py-8 lg:px-6 lg:py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ผลลัพธ์การค้นหา{' '}
            <span className="font-bold text-9e-action dark:text-9e-air">
              {filtered.length}
            </span>{' '}
            หลักสูตร
          </p>
          {/*
            THE DEFAULT IS REMOVED, NOT WRITTEN — the ACTION half of the rule in
            the header. Choosing ตาราง writes `view=table`; choosing การ์ด
            deletes the key rather than writing `view=card`, so the default view
            keeps the one canonical URL the sitemap lists. Arrival is handled
            elsewhere: a `?view=card` somebody was linked is read above and left
            in place.
          */}
          <ViewToggle
            view={view}
            onChange={(v) => applyFilter({ view: v === 'table' ? 'table' : null })}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState />
        ) : view === 'card' ? (
          groups.map((g) => (
            <CourseCardGroup
              key={g.program?._id ?? g.program?.program_name ?? 'other'}
              program={g.program}
              courses={g.courses}
              earlyBirdMap={earlyBirdMap}
              currentYear={currentYear}
              skillSlugs={skillSlugs}
            />
          ))
        ) : (
          groups.map((g) => (
            <CourseTableGroup
              key={g.program?._id ?? g.program?.program_name ?? 'other'}
              program={g.program}
              courses={g.courses}
            />
          ))
        )}
      </div>
    </div>
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
