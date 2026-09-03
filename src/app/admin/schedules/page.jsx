import { ADMIN_SCHEDULE_STATUSES, listSchedules } from '@/lib/api/schedules';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getScheduleLocals } from '@/lib/actions/schedules';
import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { requirePage } from '@/lib/rbac/guard';
import { siteTodayKey } from '@/lib/articlePublishTime';
import {
  adminScheduleWindow,
  resolveAdminScheduleRange,
} from '@/lib/adminScheduleHorizon';
import { SchedulesAdminClient } from './_components/SchedulesAdminClient';

export const metadata = {
  title: 'จัดการตารางอบรม',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Filters — including the month range — live in searchParams, not client
 * state: see SchedulesAdminClient's header note and
 * test/fs/urlFilterNoState.test.mjs, which now guards this screen too.
 */
export default async function AdminSchedulesPage({ searchParams }) {
  await requirePage('schedules');

  const sp = (await searchParams) ?? {};
  const one = (key) => {
    const raw = sp?.[key];
    return (Array.isArray(raw) ? raw[0] : raw ?? '').toString();
  };
  const search = one('search');
  const filterProgram = one('filterProgram');
  const filterStatus = one('filterStatus');

  // `now` is read ONCE and threaded through both calls below, so the
  // resolved range and the fetch bound derived from it cannot disagree by a
  // moment crossed between two separate `new Date()` reads.
  const now = new Date();
  const { from: monthFrom, to: monthTo } = resolveAdminScheduleRange(now, {
    fromKey: one('monthFrom') || undefined,
    toKey: one('monthTo') || undefined,
  });

  // The grid renders one column per month; this window must be the SAME
  // window the admin selected. `adminScheduleWindow` derives `to` from the
  // last rendered column (its last day) rather than adding N months to
  // today, so MSDB cannot return a row that lands outside every column and
  // gets dropped client-side — which is what the old `today + 4 months`
  // bound did to anything dated after the final column. See
  // src/lib/adminScheduleHorizon.js.
  const { from, to } = adminScheduleWindow(now, {
    fromKey: monthFrom,
    toKey: monthTo,
  });

  const [scheduleRes, courseRes, programRes, instructorRes] =
    await Promise.allSettled([
      // revalidate: 0 — admin table must reflect a just-written row
      // immediately after `router.refresh()`. The `schedules` tag is
      // still attached so revalidateTag(...) busts public ISR caches.
      //
      // status: all — the admin table must NEVER read the public-filtered
      // feed. Without this, `/schedules` hands back only the registerable
      // statuses, so an admin who set a round to เต็ม watched it disappear
      // from the very grid they set it in, with no way to set it back. `all`
      // rather than the explicit public trio is deliberate: this is the one
      // surface where a status MSDB adds later must show up unannounced.
      listSchedules({ from, to, status: ADMIN_SCHEDULE_STATUSES, revalidate: 0 }),
      // includeHidden — admin picker AND the name column for existing rounds.
      // A round already scheduled for a course that has since been hidden must
      // still identify itself by name.
      listPublicCourses({ includeHidden: true }),
      listPrograms(),
      listInstructorsForAdmin(),
    ]);

  const schedules =
    scheduleRes.status === 'fulfilled' ? scheduleRes.value.items ?? [] : [];
  const courses =
    courseRes.status === 'fulfilled' ? courseRes.value.items ?? [] : [];
  const rawPrograms =
    programRes.status === 'fulfilled' ? programRes.value.items ?? [] : [];

  /**
   * ── THE SAME PROGRAM ORDER THE PUBLIC /schedule TABLE GROUPS BY ────────────
   *
   * `getOrderedPrograms` is the admin-curated ProgramOrder sort, and it is what
   * `(public)/schedule/page.jsx` already feeds its client (see the identical
   * call there). The admin grid used to sort its groups by `localeCompare`
   * instead, so the two surfaces disagreed about where a programme sits — the
   * public table showing Claude AI above Power BI while the admin listed
   * AI Builder, Canva, Claude AI. The client ranks groups by THIS ARRAY's
   * order, exactly as ScheduleClient's `grouped` does.
   *
   * ── BUT THE HIDDEN ONES ARE APPENDED, NOT DROPPED ─────────────────────────
   * `getOrderedPrograms` also FILTERS OUT programmes flagged `isHidden`, which
   * is right for a public page and wrong here: hiding a programme from the
   * website must not make its courses unmanageable, and this is the screen
   * where their rounds are edited. So the ordered list is the head and every
   * programme it dropped is appended, in upstream order. The client's rank
   * lookup then places hidden programmes last (as an unranked group already
   * was), and the filter dropdown — which reads the same prop — keeps offering
   * every programme it offered before.
   */
  const orderedPrograms = await getOrderedPrograms(rawPrograms).catch(
    () => rawPrograms
  );
  const orderedIds = new Set(orderedPrograms.map((p) => String(p._id ?? p.program_id ?? '')));
  const programs = [
    ...orderedPrograms,
    ...rawPrograms.filter((p) => !orderedIds.has(String(p._id ?? p.program_id ?? ''))),
  ];
  const instructors =
    instructorRes.status === 'fulfilled' ? instructorRes.value : [];

  const scheduleLocals = await getScheduleLocals();

  return (
    <div>
      <SchedulesAdminClient
        schedules={schedules}
        courses={courses}
        programs={programs}
        scheduleLocals={scheduleLocals}
        instructors={instructors}
        search={search}
        filterProgram={filterProgram}
        filterStatus={filterStatus}
        monthFrom={monthFrom}
        monthTo={monthTo}
        /*
         * TODAY, DECIDED ONCE ON THE SERVER AND PASSED DOWN.
         *
         * The grid greys a round out once its last training day has passed, so
         * it needs to know what day it is. It must NOT read the clock itself:
         * SchedulesAdminClient is a client component, so a `new Date()` inside
         * it runs on the server for the HTML and again in the browser for
         * hydration, and the two can straddle midnight — the round that is the
         * whole point of this feature is precisely the one at that boundary.
         *
         * `siteTodayKey` is Asia/Bangkok by construction (fixed offset, not the
         * runtime's zone), which is the same currency `roundHasEnded` compares
         * in and the same one every public surface already uses. Threaded from
         * the `now` read at the top of this function, so the fetch window, the
         * rendered columns and the ended/current line are all one instant's
         * answer rather than three reads that can disagree.
         */
        todayKey={siteTodayKey(now)}
      />
    </div>
  );
}
