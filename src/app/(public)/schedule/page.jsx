import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { PUBLIC_SCHEDULE_STATUSES, getAllSchedules } from '@/lib/api/schedules';
import { getOrderedPrograms } from '@/lib/actions/program-order';
import { getSchedulePDF } from '@/lib/actions/schedule-pdf';
import { getAllActiveEarlyBirdMap } from '@/lib/actions/course-promos';
import { joinCourseSchedules } from '@/lib/schedule/joinCourseSchedules';
import { scheduleWindowEnd } from '@/lib/schedule/monthWindow';
import { siteMonthKey } from '@/lib/articlePublishTime';
import { SITE_URL } from '@/lib/seo/siteUrl';
import {
  SCHEDULE_TITLE,
  buildScheduleJsonLd,
  scheduleGraphRows,
} from '@/lib/seo/scheduleJsonLd';
import { ScheduleClient } from './_components/ScheduleClient';

/**
 * The canonical URL of this page. ONE expression of the origin, shared with the
 * JSON-LD below.
 *
 * ── WHY SITE_URL AND NOT process.env.NEXT_PUBLIC_SITE_URL ───────────────────
 * This line used to read the env var directly. SITE_URL *is* that env var, read
 * through siteConfig (`process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.9experttraining.com'`),
 * so the PRODUCTION VALUE IS UNCHANGED — but it was a second EXPRESSION of the
 * same value on the page whose structured data is built from the first, and two
 * ways of spelling one host is how they eventually become two hosts. Same change,
 * for the same reason, as app/(public)/training-course/page.jsx.
 *
 * It also gains the fallback the bare env read did not have: on a deployment
 * that forgets NEXT_PUBLIC_SITE_URL, this emitted `undefined/schedule`.
 */
const CANONICAL_URL = `${SITE_URL}/schedule`;

export const metadata = {
  // The `%s` the root layout's template composes into `<title>`. Read from the
  // JSON-LD module so the tag and CollectionPage.name are one value.
  title: SCHEDULE_TITLE,
  description:
    'ตารางการฝึกอบรมหลักสูตรทั้งหมด Public Training — เลือกเดือน ทักษะ และรูปแบบการอบรม',
  alternates: { canonical: CANONICAL_URL },
};

export const revalidate = 1800;

export default async function SchedulePage() {
  const [
    coursesResult,
    programsResult,
    schedulesResult,
    schedulePDF,
    earlyBirdMap,
  ] = await Promise.all([
    listPublicCourses().catch(() => ({ items: [] })),
    listPrograms().catch(() => ({ items: [] })),
    // All three statuses, so a sold-out round renders as เต็ม (unclickable)
    // instead of being absent. A round the user can see is full is strictly
    // more informative than a gap they cannot interpret.
    getAllSchedules({ status: PUBLIC_SCHEDULE_STATUSES }).catch(() => ({
      items: [],
    })),
    getSchedulePDF().catch(() => null),
    getAllActiveEarlyBirdMap().catch(() => ({})),
  ]);

  const courses = coursesResult.items ?? [];
  const rawPrograms = programsResult.items ?? [];
  const schedules = schedulesResult.items ?? [];

  // Apply admin-set program order so the table groups appear in the
  // same sequence as the home page + /training-course filter.
  const programs = await getOrderedPrograms(rawPrograms).catch(
    () => rawPrograms
  );

  // Server-side join schedules → courses by course ObjectId, so the client
  // doesn't have to re-derive the map. Courses with no upcoming schedule are
  // dropped — the schedule page is about "what's actually open."
  const {
    rows: coursesWithSchedules,
    dropped,
    orphans,
  } = joinCourseSchedules(courses, schedules);

  // Reconcile-and-warn. The drop above is correct but lossy and silent: a course
  // missing because upstream filtered its schedule out (empty `signup_url` →
  // excluded from /schedules) is indistinguishable from one correctly absent.
  // ONE line per render, codes capped so the log stays readable.
  if (dropped.length > 0 || orphans.length > 0) {
    const shown = dropped.slice(0, 10).join(', ');
    const more = dropped.length > 10 ? `, +${dropped.length - 10} more` : '';
    const orphanRows = orphans.reduce((n, o) => n + o.count, 0);
    console.warn(
      `[schedule] joined ${coursesWithSchedules.length}/${courses.length} courses ` +
        `from ${schedules.length} schedules — dropped ${dropped.length} with zero ` +
        `upcoming schedules (${shown}${more}), ${orphanRows} orphan schedules`
    );
  }

  /**
   * THE END OF THE MONTH RANGE, decided here and nowhere else.
   *
   * ── WHY ON THE SERVER ───────────────────────────────────────────────────────
   * The rule is data-driven ("does an eligible round reach past this December"),
   * and `coursesWithSchedules` is the data — already fetched, already joined,
   * about to be rendered. Asking it here costs one pass over rows that are
   * already in memory and NO second request. The client cannot compute it
   * without being handed the rounds a second time, and a second fetch to answer
   * a question the server already holds the answer to is the shape of defect
   * this page has paid for before.
   *
   * ── WHAT "ELIGIBLE" MEANS, AND WHY IT CAN ONLY BE DECIDED HERE ─────────────
   * A round counts only if it ACTUALLY REACHES THE PAGE. Three filters stand
   * between the feed and a rendered column, and this is the first point past
   * all of them:
   *
   *   · `excludeStartedRounds` — applied inside getAllSchedules, so `schedules`
   *     already excludes rounds whose first day has arrived.
   *   · `joinCourseSchedules` — drops rows with no resolvable course ref. That
   *     matters concretely: on 2026-10-01 BOTH of the feed's two furthest rounds
   *     (2027-12, i.e. +14) carried `course: null`, so a range derived from the
   *     raw feed would have stretched fifteen months on the strength of two rows
   *     that render nowhere. Reading `coursesWithSchedules` rather than
   *     `schedules` is what makes that impossible.
   *   · the ZZTEST- exclusion below.
   *
   * ── THE ZZTEST- EXCLUSION ──────────────────────────────────────────────────
   * Upstream carries live test rows (8 future ones on 2026-10-01, including a
   * `zztest-canva-01` at 2027-12). They render — nothing here hides them, and
   * that is a separate decision not being made in this commit — but they must
   * not be allowed to MOVE THE RANGE for every real visitor. A test round in
   * the new year would otherwise add twelve columns to everyone's dropdown.
   *
   * Matched on `course_id`, the upstream course CODE, case-insensitively and
   * anchored at the start so a real course merely containing the letters cannot
   * be caught by it.
   */
  const ZZTEST_CODE = /^zztest-/i;
  const eligibleSpans = coursesWithSchedules
    .filter((c) => !ZZTEST_CODE.test(String(c.course_id ?? '')))
    .flatMap((c) => (c.schedules ?? []).map((s) => s.dates ?? []));
  const monthRangeEnd = scheduleWindowEnd(siteMonthKey(), eligibleSpans);

  // Reduce programs payload to what the filter dropdown needs.
  const programsLite = programs.map((p) => ({
    _id: p._id,
    program_id: p.program_id,
    program_name: p.program_name,
  }));

  // The rounds the page opens on, described for readers that never run its
  // JavaScript. `null` when no course has a round in the default window, in
  // which case no script tag is emitted at all — see lib/seo/scheduleJsonLd.js.
  //
  // `scheduleGraphRows` re-attaches `course_teaser` from the upstream rows: the
  // client row drops it as a payload guarantee, and the shared Course node's
  // `description` reads it. Server-only, so it never reaches the browser — see
  // that function for the measurement behind it.
  // `endKey` is the SAME range end the client is handed below, so the graph
  // describes the months the page actually opens on. Deriving it twice is how
  // the ld+json and the table come to disagree about what "the default view" is.
  const scheduleJsonLd = buildScheduleJsonLd(
    scheduleGraphRows(coursesWithSchedules, courses),
    { endKey: monthRangeEnd }
  );

  return (
    <>
      {/* Same pattern and placement as /training-course: a plain ld+json script
          guarded on the builder returning null, rendered from server data before
          the client component. ScheduleClient holds every filter in `useState`,
          so what it draws narrows as a visitor filters; this graph describes the
          page as the canonical URL serves it, which is the unfiltered default
          window. */}
      {scheduleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(scheduleJsonLd) }}
        />
      )}
      <ScheduleClient
        courses={coursesWithSchedules}
        programs={programsLite}
        schedulePDF={schedulePDF}
        earlyBirdMap={earlyBirdMap}
        monthRangeEnd={monthRangeEnd}
      />
    </>
  );
}
