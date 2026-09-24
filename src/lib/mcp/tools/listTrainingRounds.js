/**
 * Tool 4 — `list_training_rounds`.
 *
 * This file carries more trap logic than the rest of the server put together,
 * and every rule in it was measured in round 1 rather than assumed.
 *
 * ── (1) `status=all` IS ALWAYS SENT ────────────────────────────────────────
 * With no `status` param `/schedules` applies its own public filter,
 * `{ $in: ['open','nearly_full'] }`, and SILENTLY DROPS every `full` round —
 * 8 of 85 future rounds on the day it was measured. A sold-out round is a fact
 * a customer needs ("that one is full, the next is in March"), and a tool that
 * cannot see it reports the course as unscheduled. So this always widens the
 * request and does its own narrowing below.
 *
 * ── (2) STATUS IS NOT A LIFECYCLE FIELD, AND IS NEVER EMITTED FOR A ROUND
 *        THAT HAS STARTED ──────────────────────────────────────────────────
 * Nothing upstream transitions a round when it ends. Measured across 278 rows:
 * 193 finished rounds still carried a live-looking status — 149 `full`, 41
 * `open`, 3 `nearly_full`. `status` records what an editor last typed, not
 * whether anyone can still register. So:
 *   · a finished round is never returned at all;
 *   · a round that has started emits `in_progress: true` and
 *     `registration_open: false`, and NO status — its stored value is stale by
 *     construction and a model handed `"open"` would invite a customer to book
 *     a class that is already half-taught;
 *   · only a not-yet-started round's status is trusted, and then only as the
 *     site's own three words via lib/scheduleStatus.
 *
 * ── (3) DATES DECIDE, IN BANGKOK ───────────────────────────────────────────
 * `roundHasStarted` / `roundHasEnded` (lib/schedule/roundHasStarted.js) are the
 * site's own predicates and the asymmetry between them is load-bearing: a round
 * whose first day IS today has started (`<=`), a round whose last day IS today
 * has NOT ended (`<`). Trainees are in the room on the last day. `siteTodayKey`
 * owns the zone; this module never calls `new Date()` for a comparison.
 *
 * ── (4) ORPHANS ARE DROPPED, AND LOGGED — NOT REPORTED TO THE MODEL ────────
 * 12 of 77 rows came back with `course: null` — the populate found no course
 * document. They cannot be attributed and must not be rendered with a blank
 * name. Round 2 surfaced the count in the output as `dropped_orphan_rounds`;
 * live testing showed the model relaying it to sales staff as "some rounds may
 * be missing", which undermines every answer. The count now goes to the
 * server log only (`deps.warn`, console.warn in production), where the people
 * who can fix the data will see it.
 *
 * ── (5) THERE ARE NO SEAT COUNTS ANYWHERE ──────────────────────────────────
 * Not `seats`, not `capacity`, not `remaining`. `status` is the only liveness
 * signal upstream publishes and it is the one above. Nothing in this file may
 * emit a number of places. The description tells the model this TOOL has no
 * seat data — a fact about the tool, never phrased as company policy.
 *
 * ── (6) THE REGISTRATION LINK IS THE SITE'S OWN, NOT THE RAW `signup_url` ──
 * `registration_url` is built by lib/schedule/scheduleRegistrationHref — the
 * one builder every public round list (/schedule, /search, course cards)
 * uses — so the model hands out exactly the link the website renders. That
 * helper returns null for a full round, and when the round has no `_id` or
 * the course no id it falls back to the raw upstream `signup_url` — some of
 * which point at http://localhost:3000. So only a site-relative
 * `/registration/` path is accepted and made absolute on SITE_ORIGIN; any
 * other result means the round is emitted WITHOUT `registration_url`. A round
 * that has started gets no registration link: registration is closed.
 *
 * ── (7) EVERY ROUND CARRIES ITS COURSE PAGE AS `course_url` ────────────────
 * Built by shape.js `publicCourseUrl`, the same helper get_course_detail uses,
 * so a round with no registration_url (full, started, or a fallback that was
 * omitted) still gives the model a real link rather than one it would guess.
 * The course a round is populated with carries no `urlAlias`, so an aliased
 * course gets its derived `/<id>-training-course` path here — a URL
 * `resolveCourse` also serves, though not the canonical one.
 */

import { siteTodayKey } from '@/lib/articlePublishTime';
import { McpToolError, SITE_ORIGIN, dropEmpty, publicCourseUrl } from '@/lib/mcp/shape';
import { roundHasEnded, roundHasStarted, roundFirstDayKey, roundLastDayKey } from '@/lib/schedule/roundHasStarted';
import { scheduleRegistrationHref } from '@/lib/schedule/scheduleRegistrationHref';
import { scheduleStatusLabel } from '@/lib/scheduleStatus';

export const LIST_TRAINING_ROUNDS_DESCRIPTION =
  'List scheduled classroom and hybrid training rounds for 9Expert courses, optionally ' +
  'filtered by course and by date range. Each round gives its course, its training days, ' +
  'its delivery type, its course_url — the course page on the 9Expert website — and, ' +
  'while it can still be booked, its registration_url — the registration page on the ' +
  '9Expert website. Registration closes when a round starts: by ' +
  'default only rounds that have not yet begun are returned, and those carry a status in ' +
  'the words the website uses — เปิดรับ (open), ใกล้เต็ม (nearly full), เต็ม (full). A full ' +
  'round has no registration_url. When a round has no registration_url, point the user to ' +
  'that round\'s course_url instead, and never construct or guess a link. To see rounds ' +
  'that are currently running, set ' +
  'include_in_progress to true; those are reported with in_progress true and ' +
  'registration_open false, and carry no status and no registration_url — do not quote a ' +
  'status for them. Rounds that have finished are never returned. Dates are individual ' +
  'training days in Asia/Bangkok, not a start and end range. This tool has no ' +
  'seat-availability data. If the user asks how many seats remain, say that information is ' +
  'not available here and point them to the round\'s registration_url from the results, or ' +
  'to its course_url when there is none. ' +
  'Do not describe this as a company policy. Do not tell the user how rounds are ' +
  'filtered, dropped, or sourced; just answer with the rounds returned.';

export const LIST_TRAINING_ROUNDS_LIMIT_DEFAULT = 20;
export const LIST_TRAINING_ROUNDS_LIMIT_MAX = 50;

/** What we always ask MSDB for. See (1) above — never the bare default. */
export const UPSTREAM_STATUS_ALL = 'all';

/** The only registration link shape emitted — see (6). Made absolute on SITE_ORIGIN. */
const REGISTRATION_PATH_PREFIX = '/registration/';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function assertDay(label, value) {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value).trim();
  if (!ISO_DAY.test(s)) {
    throw new McpToolError(`${label} must be a date in YYYY-MM-DD form; received "${value}".`);
  }
  return s;
}

/** Every training day as `YYYY-MM-DD`, sorted. Upstream order is not guaranteed. */
function dayKeys(dates) {
  if (!Array.isArray(dates)) return [];
  return dates
    .map((d) => {
      const s = typeof d === 'string' ? d : d instanceof Date ? d.toISOString() : '';
      return s.slice(0, 10);
    })
    .filter((s) => ISO_DAY.test(s))
    .sort();
}

/**
 * @param {object} input
 * @param {string}  [input.course_id]            resolved case-insensitively
 * @param {string}  [input.from]                 YYYY-MM-DD
 * @param {string}  [input.to]                   YYYY-MM-DD
 * @param {boolean} [input.include_in_progress]
 * @param {number}  [input.limit]
 * @param {object} deps
 * @param {Function} deps.listSchedules                ({ from, to, courses, status }) → { items }
 * @param {Function} deps.getCourseByCodeInsensitive   (code) → course|null
 * @param {Function} [deps.todayKey]                   () → 'YYYY-MM-DD' in Asia/Bangkok
 * @param {Function} [deps.warn]                       server-side log; defaults to console.warn
 */
export async function listTrainingRounds(input, deps) {
  const {
    course_id: courseId = null,
    from = undefined,
    to = undefined,
    include_in_progress: includeInProgress = false,
    limit = LIST_TRAINING_ROUNDS_LIMIT_DEFAULT,
  } = input ?? {};

  const capped = Math.max(1, Math.min(Number(limit) || LIST_TRAINING_ROUNDS_LIMIT_DEFAULT, LIST_TRAINING_ROUNDS_LIMIT_MAX));
  const fromDay = assertDay('from', from);
  const toDay = assertDay('to', to);
  const today = (deps.todayKey ?? siteTodayKey)();

  /**
   * The course filter is an ObjectId upstream, never the code — `/schedules`
   * matches `course` against the Mongo `_id`. Resolving through the repo's
   * case-insensitive resolver is what makes a mixed-case id work here too.
   */
  let courses;
  let resolvedCourseId = null;
  if (courseId) {
    const course = await deps.getCourseByCodeInsensitive(String(courseId).trim());
    if (!course?._id) {
      throw new McpToolError(
        `course not found: "${courseId}". No rounds were looked up. ` +
          `Use search_courses to find the correct course id.`
      );
    }
    courses = String(course._id);
    resolvedCourseId = course.course_id ?? null;
  }

  const res = await deps.listSchedules({
    from: fromDay,
    to: toDay,
    courses,
    // (1) — always. MSDB's default filter hides every `full` round.
    status: UPSTREAM_STATUS_ALL,
  });

  let droppedOrphans = 0;
  const rounds = [];

  for (const row of res?.items ?? []) {
    // (4) — an orphan cannot be named, so it is dropped and counted for the log.
    if (!row?.course) {
      droppedOrphans += 1;
      continue;
    }

    const days = dayKeys(row.dates);
    // A round with no usable date is a data fault, not a round. It cannot be
    // placed on either side of today, so it is dropped rather than guessed at.
    if (days.length === 0) continue;

    // (3) — finished rounds never come back, regardless of any input.
    if (roundHasEnded(row.dates, today)) continue;

    const started = roundHasStarted(row.dates, today);
    if (started && !includeInProgress) continue;

    // (6) — the site's own builder, and only its site-relative `/registration/`
    // form. Anything else is its raw-`signup_url` fallback (some of which point
    // at http://localhost:3000) and is omitted, never emitted. Never for a
    // round whose registration has closed.
    const courseCode = row.course.course_id ?? null;
    const built = started ? null : scheduleRegistrationHref(row, courseCode);
    const href = typeof built === 'string' && built.startsWith(REGISTRATION_PATH_PREFIX) ? built : null;

    rounds.push(
      dropEmpty({
        course_id: courseCode,
        course_name: row.course.course_name ?? null,
        dates: days,
        first_day: roundFirstDayKey(row.dates),
        last_day: roundLastDayKey(row.dates),
        delivery: row.type ?? null,
        in_progress: started,
        registration_open: started ? false : row.status !== 'full',
        // (2) — a started round's stored status is stale by construction and is
        // never emitted. Only a future round's status is worth a word.
        status: started ? null : scheduleStatusLabel(row.status),
        registration_url: href ? `${SITE_ORIGIN}${href}` : null,
        // (7) — always present, so a round with no registration_url still has
        // a real link to hand out.
        course_url: publicCourseUrl(row.course),
      })
    );
  }

  if (droppedOrphans > 0) {
    (deps.warn ?? console.warn)('[mcp] list_training_rounds dropped orphan rounds', { count: droppedOrphans });
  }

  rounds.sort((a, b) => String(a.first_day).localeCompare(String(b.first_day)));

  // NOT `dropEmpty` — the envelope's empty cases are load-bearing. `rounds: []`
  // says "we looked and there are none", which is a different answer from a
  // missing key, and it is the answer a model most needs to be able to give.
  return {
    today,
    ...(resolvedCourseId ? { course_id: resolvedCourseId } : {}),
    total_matched: rounds.length,
    returned: Math.min(rounds.length, capped),
    rounds: rounds.slice(0, capped),
  };
}
