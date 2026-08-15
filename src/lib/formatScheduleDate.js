import { normalizeScheduleStatus } from '@/lib/scheduleStatus';

/**
 * ── `formatScheduleDate` HAS BEEN RETIRED ───────────────────────────────────
 *
 * It formatted a round's `dates` into a two-line `"17\nOCT"` label for
 * <ScheduleCard />, and it had exactly one consumer (training-course/CourseCard).
 * It is replaced by `formatRoundDays` from @/lib/schedule/roundDateLabel.
 *
 * WHY IT COULD NOT SIMPLY BE FIXED IN PLACE: it did not merely disagree with
 * the other four round formatters, it LOST DAYS. Its same-month branch printed
 * `${startDay} & ${endDay}` for anything non-consecutive, so a round on 8, 10
 * and 12 ต.ค. rendered as `8 & 12` — the 10th, a day the customer is paying to
 * attend, simply absent from the card they book from. Its sibling formatters
 * erred the other way and INVENTED days (`8-12`). One shared implementation is
 * the only arrangement in which neither can happen.
 *
 * `formatStatusFromAPI` stays. It is a separate concern (status vocabulary, not
 * dates), it is imported by test/pure/scheduleStatus, and it is already a thin
 * delegation to the one status policy.
 */

/**
 * Canonicalise an upstream status for <ScheduleCard />.
 *
 * This used to keep its own table — `{open, nearly_full→nearFull, full}` with
 * `?? "open"` — which made it a SECOND fallback policy sitting upstream of the
 * shared one. Two problems, both silent: it did not know `closed`, and its
 * default laundered every unrecognised value into green "open" before
 * lib/scheduleStatus was ever consulted. There is now one policy: delegate,
 * and pass anything unrecognised through UNCHANGED so the renderer can show it
 * neutrally instead of guessing.
 *
 * Kept as a named export because <ScheduleCard /> is fed through it from
 * CourseCard; it is now a thin alias of normalizeScheduleStatus.
 */
export function formatStatusFromAPI(apiStatus) {
  return normalizeScheduleStatus(apiStatus) ?? apiStatus;
}
