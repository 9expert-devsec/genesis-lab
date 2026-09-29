/**
 * /schedule's `@graph` — CollectionPage + ItemList + BreadcrumbList, where each
 * listed course carries its upcoming rounds as `hasCourseInstance`.
 *
 * ══ THE SELECTION IS BORROWED, NOT REBUILT ══════════════════════════════════
 * The rounds described here must be EXACTLY the rounds the page renders. That is
 * not a re-derivable rule: it is three decisions that already live in three
 * modules, and this builder reaches for all three rather than restating any.
 *
 *   · WHICH ROUNDS EXIST AT ALL — decided server-side before this is called.
 *     app/(public)/schedule/page.jsx fetches getAllSchedules({ status:
 *     PUBLIC_SCHEDULE_STATUSES }), i.e. open + nearly_full + full (cancelled and
 *     closed never arrive), with `from = today` and then excludeStartedRounds,
 *     so a round vanishes the moment its first training day arrives. Courses
 *     with zero rounds are dropped by joinCourseSchedules. This builder takes
 *     that output as given and narrows no further on status or recency.
 *
 *   · THE MONTH WINDOW — lib/schedule/scheduleFilters' defaultScheduleFilters()
 *     and lib/schedule/monthWindow's windowBetween(). The page opens on a
 *     ROLLING six-month window from the current month
 *     (PUBLIC_SCHEDULE_DEFAULT_MONTHS), and this asks those same functions for
 *     it. Hand-writing "six months from now" here would be the exact defect
 *     monthWindow.js exists to remove — a window that silently meant something
 *     else — wearing a different hat.
 *
 *   · WHETHER A ROUND IS IN THAT WINDOW — lib/schedule/monthLanes'
 *     roundInWindow(), which its own docstring calls "THE ONE ANSWER" and which
 *     the table's lanes, `filteredCourses` and the mobile card all share. A round
 *     is in view when ANY month of its span is visible, not merely the month of
 *     its first date; that distinction is a fixed bug (a 30 ก.ย. – 1 ต.ค. round
 *     used to vanish from an October view, taking its course row with it) and
 *     re-deriving it here would reintroduce it in a place nobody would look.
 *
 * ── WHAT IT CANNOT BORROW, AND WHY THAT IS HONEST ───────────────────────────
 * ScheduleClient exports `courseRounds(schedules, visibleMonths, matches)`,
 * which is precisely this composition. It is NOT imported: that module is
 * `'use client'` and pulls React hooks in at its top, so importing it from a
 * server builder would drag the client graph into the server bundle. This
 * composes the same two primitives in the same order instead — `matchesSession`
 * then `roundInWindow` — and the RULES both live in the shared pure modules, so
 * what is duplicated is two lines of glue rather than any decision.
 *
 * THE FILTER STATE IS THE DEFAULT ONE, necessarily. /schedule's filters are
 * client `useState` (program / type / status / month range), so a visitor who
 * narrows the window sees fewer rounds than this graph lists. That is the same
 * situation /training-course is in and the same answer: the server describes
 * what the canonical URL serves, which is the page as it first paints. Every
 * filter defaults to SCHEDULE_FILTER_ALL, so `matchesSession` admits every
 * round and only the month window narrows anything.
 *
 * ══ WHY ONLY DATES AND MODE, AND NEVER AVAILABILITY ═════════════════════════
 * /schedule is STATIC with `export const revalidate = 1800`, so what a crawler
 * reads can be up to THIRTY MINUTES behind the source. That bounds what may
 * honestly be asserted:
 *
 *   · a round's DATES and its DELIVERY MODE are stable facts — they are set when
 *     the round is created and an admin changing them is a rare, deliberate act.
 *     Thirty minutes of lag on a date is a non-event.
 *   · SEATS, STATUS and PRICE are not. `full` is exactly the field that flips
 *     without warning, and it is the one a buyer acts on. Emitting
 *     `CourseInstance.offers.availability` from a 30-minute-old snapshot would
 *     publish a machine-readable claim that seats are available for a round that
 *     sold out twenty-nine minutes ago — worse than saying nothing, because a
 *     crawler has no way to know it is stale.
 *
 * So `hasCourseInstance` carries startDate, endDate and courseMode, and nothing
 * else. Not an oversight, and not a TODO: adding availability here requires
 * making this page dynamic first, which is a separate decision about a page that
 * is currently cheap to serve. The page's own visible table shows เต็ม on a full
 * round, which is where a human learns it.
 *
 * PURE: no I/O, no database, no env, no React. `now` is a parameter so the
 * rolling window is testable and so one render reads the clock once.
 */

import { siteConfig } from '@/config/site';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { homeGraphIds } from '@/lib/seo/homeJsonLd';
import { courseListNode } from '@/lib/seo/courseNode';
import { windowBetween } from '@/lib/schedule/monthWindow';
import { defaultScheduleFilters, matchesSession } from '@/lib/schedule/scheduleFilters';
import { roundInWindow } from '@/lib/schedule/monthLanes';
import { calendarDays } from '@/lib/schedule/roundDateLabel';

/** The route this graph describes. One spelling, for the URL and the ids. */
const PATH = '/schedule';

/**
 * The `%s` half of this page's `<title>`, and the CollectionPage's `name`.
 *
 * Read by app/(public)/schedule/page.jsx's `metadata.title`, so the tag and the
 * graph are one value. Lives here rather than in the page for the reason
 * lib/seo/homeMeta.js exists: this module is imported BY the page, so a constant
 * defined there would make this module import its own consumer.
 *
 * NOT the page's `<h1>`, which is `ตารางฝึกอบรม <br /> (Public Training)` —
 * two lines with a break in the middle. A breadcrumb label and a WebPage name
 * are single-line text, and flattening that heading would invent a string no
 * surface actually shows. The `<title>` is the page's own one-line name and is
 * what both uses want.
 */
export const SCHEDULE_TITLE = 'ตารางฝึกอบรม';

/**
 * The breadcrumb label for the site root. Second copy in the tree — the course
 * detail page's trail spells the same literal inline at
 * app/(public)/[...slug]/page.jsx:841. Single-sourcing it means editing that
 * route, which is out of this round's scope; named here so the next reader finds
 * the other copy rather than discovering it.
 */
export const HOME_BREADCRUMB_LABEL = 'หน้าแรก';

/**
 * schema.org `courseMode` for each delivery type this repo knows about.
 *
 * ── THE UNKNOWN VALUE IS OMITTED, NOT GUESSED ───────────────────────────────
 * `schedule.type` is upstream's field and upstream can add to it. The values
 * observed in production on 2026-09-29 were `hybrid` (49 rounds) and `classroom`
 * (16); lib/schedule/trainingTypeLabel.js also knows `online`, which no live
 * round currently uses. `online` IS DELIBERATELY ABSENT FROM THIS MAP: a
 * plausible mapping exists ("online"), and mapping it anyway would be this
 * module guessing at a vocabulary it does not own. An unmapped type therefore
 * omits `courseMode` entirely rather than asserting a mode that might be wrong —
 * the same reasoning trainingTypeLabel gives for showing the raw type instead of
 * silently relabelling an unknown value as Classroom, and the same
 * omit-rather-than-assert rule the description field follows in courseNode.js.
 *
 * A round with no `courseMode` is still a valid CourseInstance with real dates.
 */
const COURSE_MODE = Object.freeze({
  classroom: 'onsite',
  hybrid: 'blended',
});

/**
 * `YYYY-MM-DD` from a Date's LOCAL calendar fields.
 *
 * ── NEVER toISOString(), AND THIS IS NOT A TIMEZONE GUESS ───────────────────
 * Upstream sends each day as UTC midnight (`2026-10-08T00:00:00.000Z`).
 * `toISOString().slice(0, 10)` would look correct and be correct only by
 * accident: it re-reads the instant in UTC, so any round whose day was stored
 * at a local midnight instead — or any runtime west of UTC — would slide a day
 * earlier. `calendarDays` has already normalised each day to LOCAL midnight, the
 * same normalisation the table's own label uses (lib/schedule/roundDateLabel),
 * so reading the local fields back out is what keeps the emitted date and the
 * date a visitor reads in the table the same day by construction.
 *
 * Local time is the established convention for this page and is documented as
 * such at lib/schedule/monthWindow.js's `monthKey`, which buckets columns the
 * same way for the same reason. There is exactly one timezone in play here and
 * it is the runtime's, consistently, on both sides of the comparison.
 *
 * Date only — no time, no offset. A training day is a calendar day, not an
 * instant, and schema.org accepts a bare Date for startDate/endDate.
 */
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * One round as a `CourseInstance`, or null when it has no usable date.
 *
 * ── A NON-CONTIGUOUS ROUND COLLAPSES TO ITS OUTER BOUNDS, KNOWINGLY ─────────
 * A round is an ARRAY of days and they need not be adjacent — roundDateLabel's
 * `consecutiveRuns` exists precisely because `[[8], [10], [12]]` is a real
 * shape, and the table renders such a round as `8, 10, 12 ต.ค.`. schema.org's
 * CourseInstance has no vocabulary for "these three days and not the two
 * between", so startDate/endDate here are the FIRST and LAST day and the gap is
 * not expressible. That over-states a gapped round's span, and the alternative —
 * one CourseInstance per run, which would multiply one bookable round into three
 * bookable-looking entities — over-states something worse. Measured on the live
 * feed 2026-09-29: 0 of 65 rounds were non-contiguous, so nothing currently
 * relies on this, and it is written down so the next reader knows it was a
 * choice rather than an oversight.
 *
 * A single-day round has startDate === endDate. That is correct, not degenerate:
 * schema.org treats an instance ending the day it starts as a one-day course.
 */
function courseInstance(round) {
  const days = calendarDays(round?.dates);
  // OMITTED, NOT DATED FROM NOTHING. A round whose `dates` are absent, empty or
  // all unparseable cannot say when it runs, and a CourseInstance with no dates
  // is not a weaker claim — it is an assertion that a round exists with no way
  // to attend it.
  if (days.length === 0) return null;

  const mode = COURSE_MODE[round?.type];

  return {
    '@type': 'CourseInstance',
    startDate: ymd(days[0]),
    endDate: ymd(days[days.length - 1]),
    ...(mode ? { courseMode: mode } : {}),
  };
}

/**
 * The rows this builder describes: the joined rows, plus the one field the
 * client row deliberately does not carry.
 *
 * ── WHY THIS EXISTS RATHER THAN A WIDER joinCourseSchedules ─────────────────
 * The shared Course node carries a `description`, read from `course_teaser`.
 * `joinCourseSchedules` STRIPS that field on purpose — it projects to a
 * whitelist as a payload-size guarantee for the client bundle, and its test
 * asserts by name that `course_teaser` does not survive. Widening the whitelist
 * would ship 44 teasers into the RSC flight to serve a `<script>` the client
 * never reads, which is the exact cost that projection exists to avoid.
 *
 * So the teaser is re-attached HERE, for the graph only. The graph is
 * stringified into a script tag server-side and never becomes a client prop, so
 * this costs nothing on the wire.
 *
 * WITHOUT IT THE TWO PAGES DISAGREE, and that was measured rather than
 * predicted: on a production build 2026-09-29 the first attempt emitted 44
 * Course nodes on /schedule with no `description` while /training-course's had
 * one, so the "shared" node was shared in every field but that one. A hand-built
 * test fixture carrying `course_teaser` passed while production did not, which
 * is why the parity test now drives the real join through this function.
 *
 * Keyed on `_id`, the same key joinCourseSchedules joins on.
 *
 * @param {object[]} joinedRows joinCourseSchedules' `rows`
 * @param {object[]} upstreamCourses the /public-course items those rows came
 *   from — the only place `course_teaser` still exists at this point
 * @returns {object[]} the rows, each with `course_teaser` restored when upstream
 *   had one, in the order given
 */
export function scheduleGraphRows(joinedRows, upstreamCourses) {
  const rows = Array.isArray(joinedRows) ? joinedRows : [];
  const teaserById = new Map(
    (Array.isArray(upstreamCourses) ? upstreamCourses : [])
      .filter((c) => c && c._id !== undefined && c._id !== null)
      .map((c) => [String(c._id), c.course_teaser])
  );
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const teaser = teaserById.get(String(row._id));
    return teaser === undefined ? row : { ...row, course_teaser: teaser };
  });
}

/**
 * Build /schedule's `@graph`.
 *
 * @param {object[]} courses joinCourseSchedules' `rows` — courses that have at
 *   least one upcoming round, each with a `schedules` array, in the order the
 *   page renders them (listPublicCourses' admin-set order).
 * @param {object} [opts]
 * @param {string} [opts.siteUrl] origin without a trailing slash. Defaults to
 *   the site's one origin; pass a different one only from a test, which is what
 *   proves the URLs are composed rather than restated.
 * @param {Date} [opts.now] the instant the rolling month window starts from.
 *   Defaults to the current time; passed explicitly by tests so a window that
 *   depends on the clock can be asserted at all.
 * @returns {object|null} the `@graph` document, or null when no course has a
 *   round in the window.
 */
export function buildScheduleJsonLd(courses, { siteUrl = SITE_URL, now = new Date() } = {}) {
  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  const canonicalUrl = `${base}${PATH}`;

  const webPageId = `${canonicalUrl}#webpage`;
  const itemListId = `${canonicalUrl}#schedulelist`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;

  // The site-wide entities Home DECLARES. Read from homeJsonLd's own exported
  // construction, never spelled here.
  const { website: websiteId, organization: organizationId } = homeGraphIds(base);

  // The page's opening filter state, and the window it implies — both from the
  // modules the client component uses, so this cannot drift from what renders.
  const defaults = defaultScheduleFilters(now);
  const visibleMonths = windowBetween(defaults.monthFrom, defaults.monthTo);

  const listItems = [];
  for (const course of Array.isArray(courses) ? courses : []) {
    if (!course || typeof course !== 'object') continue;

    // The same two primitives, in the same order, that ScheduleClient's
    // `courseRounds` applies — see this module's docblock for why they are
    // composed here rather than imported from that client module.
    const rounds = (Array.isArray(course.schedules) ? course.schedules : []).filter(
      (s) => matchesSession(defaults, s) && roundInWindow(s?.dates, visibleMonths)
    );
    if (rounds.length === 0) continue;

    const instances = rounds.map(courseInstance).filter(Boolean);
    // Every round in the window failed to yield a date. The course is listed on
    // the page (its row renders) but there is nothing machine-readable to say
    // about when it runs, and a Course node with an empty hasCourseInstance
    // asserts a course with no sessions. Omitted rather than half-described.
    if (instances.length === 0) continue;

    // THE SHARED NODE — byte-identical to the one /training-course emits for
    // this course, so the two pages reference one entity. Null when the row
    // cannot be named or has no name; skipped, not guessed.
    const item = courseListNode(course, base, organizationId);
    if (!item) continue;

    listItems.push({
      '@type': 'ListItem',
      position: listItems.length + 1,
      url: item.url,
      item: { ...item, hasCourseInstance: instances },
    });
  }

  // Nothing to describe → no graph, and the caller emits no script tag. An
  // ItemList with an empty itemListElement is a positive assertion that nothing
  // is scheduled, which is not what an empty window or a failed fetch means.
  // Same contract, and the same reasoning, as lib/articles/buildListJsonLd.js.
  if (listItems.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': webPageId,
        url: canonicalUrl,
        // The page's ACTUAL rendered <title>, composed from the same constant
        // page.jsx puts in `metadata.title` and the root layout's template.
        name: `${SCHEDULE_TITLE} | ${siteConfig.name}`,
        inLanguage: 'th',
        isPartOf: { '@id': websiteId },
        about: { '@id': organizationId },
        mainEntity: { '@id': itemListId },
        breadcrumb: { '@id': breadcrumbId },
      },
      {
        '@type': 'ItemList',
        '@id': itemListId,
        url: canonicalUrl,
        // The count of what is ACTUALLY listed. An ItemList whose numberOfItems
        // disagrees with its own itemListElement is a defect regardless of which
        // number is the more flattering one.
        numberOfItems: listItems.length,
        itemListElement: listItems,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: HOME_BREADCRUMB_LABEL,
            item: base,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: SCHEDULE_TITLE,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}
