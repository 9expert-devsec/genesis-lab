'use client';

import { HeroSearch } from './HeroSearch';
import { FilterBar } from './FilterBar';
import { ViewToggle } from './ViewToggle';
import { CourseCardGroup } from './CourseCardGroup';
import { CourseTableGroup } from './CourseTableGroup';
import { EmptyState } from './EmptyState';

/**
 * The /training-course list markup, with every value handed in as a prop.
 *
 * Two callers, one markup — see lib/courses/courseListGrouping:
 *   · CourseListClient derives the props from the URL (useSearchParams) and
 *     the search box;
 *   · CourseListStatic is the Suspense fallback and passes the unfiltered
 *     defaults, so the server HTML carries the H1 (in HeroSearch) and a real
 *     `<a href>` for every course instead of an empty boundary.
 *
 * Nothing in here may read the URL. A router hook in this file would make the
 * fallback bail out to client rendering exactly like the boundary it stands
 * in for, and the server HTML would be empty again.
 */
export function CourseListView({
  groups,
  resultCount,
  view,
  skillSlug,
  programName,
  programOptions,
  onSearch,
  onSkillChange,
  onProgramChange,
  onViewChange,
  earlyBirdMap,
  currentYear,
  skillSlugs,
}) {
  return (
    <div className="min-h-screen bg-9e-ice pb-16 dark:bg-9e-border">
      <HeroSearch onDebouncedChange={onSearch} />

      {/*
        Both selects already hand back `null` when cleared, which is exactly
        what `setOrDelete` treats as "remove the key" — so choosing
        ทักษะทั้งหมด deletes `skill` rather than writing an empty one.
      */}
      <FilterBar
        skillSlug={skillSlug}
        onSkillChange={onSkillChange}
        programName={programName}
        onProgramChange={onProgramChange}
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
              {resultCount}
            </span>{' '}
            หลักสูตร
          </p>
          {/*
            THE DEFAULT IS REMOVED, NOT WRITTEN — the ACTION half of the rule in
            CourseListClient's header. Choosing ตาราง writes `view=table`;
            choosing การ์ด deletes the key rather than writing `view=card`, so
            the default view keeps the one canonical URL the sitemap lists.
            Arrival is handled there: a `?view=card` somebody was linked is read
            and left in place.
          */}
          <ViewToggle view={view} onChange={onViewChange} />
        </div>

        {resultCount === 0 ? (
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
