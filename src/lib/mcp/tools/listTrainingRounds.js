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
 * ── (4) ORPHANS ARE DROPPED, AND COUNTED ───────────────────────────────────
 * 12 of 77 rows came back with `course: null` — the populate found no course
 * document. They cannot be attributed and must not be rendered with a blank
 * name, but dropping them silently would let a model conclude the course has
 * fewer rounds than it does. `dropped_orphan_rounds` makes the loss visible,
 * the same instinct as `joinCourseSchedules` reporting what it drops.
 *
 * ── (5) THERE ARE NO SEAT COUNTS ANYWHERE ──────────────────────────────────
 * Not `seats`, not `capacity`, not `remaining`. `status` is the only liveness
 * signal upstream publishes and it is the one above. Nothing in this file may
 * emit a number of places, and the description says so to the model as well.
 */

import { siteTodayKey } from '@/lib/articlePublishTime';
import { McpToolError, dropEmpty } from '@/lib/mcp/shape';
import { roundHasEnded, roundHasStarted, roundFirstDayKey, roundLastDayKey } from '@/lib/schedule/roundHasStarted';
import { scheduleStatusLabel } from '@/lib/scheduleStatus';

export const LIST_TRAINING_ROUNDS_DESCRIPTION =
  'List scheduled classroom and hybrid training rounds for 9Expert courses, optionally ' +
  'filtered by course and by date range. Each round gives its course, its training days, ' +
  'its delivery type and its official sign-up URL. Registration closes when a round ' +
  'starts: by default only rounds that have not yet begun are returned, and those carry a ' +
  'status in the words the website uses — เปิดรับ (open), ใกล้เต็ม (nearly full), เต็ม ' +
  '(full). To see rounds that are currently running, set include_in_progress to true; ' +
  'those are reported with in_progress true and registration_open false, and deliberately ' +
  'carry no status, because the upstream status of a round that has already begun is stale ' +
  'and must not be quoted. Rounds that have finished are never returned. 9Expert publishes ' +
  'no seat counts at all, so never state or estimate how many places remain — to check ' +
  'availability or to book, direct the person to the round\'s sign_up_url. A few rounds ' +
  'whose course record is missing upstream are omitted and counted in ' +
  'dropped_orphan_rounds. Dates are individual training days in Asia/Bangkok, not a start ' +
  'and end range.';

export const LIST_TRAINING_ROUNDS_LIMIT_DEFAULT = 20;
export const LIST_TRAINING_ROUNDS_LIMIT_MAX = 50;

/** What we always ask MSDB for. See (1) above — never the bare default. */
export const UPSTREAM_STATUS_ALL = 'all';

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
    // (4) — an orphan cannot be named, so it is dropped and counted.
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

    rounds.push(
      dropEmpty({
        course_id: row.course.course_id ?? null,
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
        // Passed through verbatim: two URL generations coexist upstream (a
        // modern slug form and a legacy numeric-id form) and parsing either
        // would break the other.
        sign_up_url: row.signup_url ?? null,
      })
    );
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
    dropped_orphan_rounds: droppedOrphans,
    rounds: rounds.slice(0, capped),
  };
}
