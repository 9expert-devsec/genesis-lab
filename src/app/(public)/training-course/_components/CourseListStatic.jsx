'use client';

import { useMemo } from 'react';
import {
  buildProgramRank,
  groupCoursesByProgram,
  sortProgramOptions,
} from '@/lib/courses/courseListGrouping';
import { CourseListView } from './CourseListView';

const noop = () => {};

/**
 * The Suspense fallback for /training-course — and therefore what the SERVER
 * HTML carries.
 *
 * CourseListClient reads useSearchParams, so at prerender its boundary bails
 * out to client rendering. With `fallback={null}` that left the served page
 * with no H1, not one course link, and the footer directly under the header
 * until hydration pushed it ~38,000px down. This renders the UNFILTERED
 * catalog (card view, no search) through the same CourseListView and the same
 * grouping functions, so on the bare URL the hydrated list replaces it with
 * identical cards in identical order.
 *
 * It must not read the URL — that is the whole point. On `?skill=…` /
 * `?program=…` links the visitor sees the full catalog until hydration narrows
 * it; accepted, because the alternative (reading `searchParams` in page.jsx)
 * turns this static/ISR route into a per-request render.
 *
 * The handlers are no-ops: this markup is only on screen until the client
 * boundary resolves, and a control used in that window does nothing rather
 * than half-applying a filter.
 */
export function CourseListStatic({
  items,
  programOrder = [],
  earlyBirdMap = {},
  currentYear,
  skillSlugs = {},
}) {
  const programRank = useMemo(() => buildProgramRank(programOrder), [programOrder]);
  const programOptions = useMemo(
    () => sortProgramOptions(items, programRank),
    [items, programRank]
  );
  const groups = useMemo(
    () => groupCoursesByProgram(items, programRank),
    [items, programRank]
  );

  return (
    <CourseListView
      groups={groups}
      resultCount={items.length}
      view="card"
      skillSlug={null}
      programName={null}
      programOptions={programOptions}
      onSearch={noop}
      onSkillChange={noop}
      onProgramChange={noop}
      onViewChange={noop}
      earlyBirdMap={earlyBirdMap}
      currentYear={currentYear}
      skillSlugs={skillSlugs}
    />
  );
}
