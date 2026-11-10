/**
 * Is the round a public registration names still REGISTRABLE upstream?
 *
 * The ONE server-side guard both public submit paths call before anything is
 * written or charged:
 *   · app/api/registration/public/route.js         (quotation submit)
 *   · app/api/registration/public/charge/route.js  (Omise card / PromptPay)
 *
 * ── WHY A FRESH READ, AT SUBMIT ─────────────────────────────────────────────
 * The registration page is ISR-cached and the visitor may arrive on an old
 * `?class=` link from an email or a bookmark. A round an admin CANCELLED
 * (MSDB `closed`) must be refused even then, so the round is fetched here with
 * `status: 'all'` (so a closed round is SEEN, not merely absent) and
 * `revalidate: 0` (so no cached copy can vouch for it). Nothing from the client
 * is trusted beyond the two ids it names.
 *
 * ── THREE REFUSALS, AND NONE OF THEM FALLS BACK ─────────────────────────────
 *   closed      the round exists and is cancelled            → 409
 *   not found   the course has no such round (or no course)  → 404
 *   fetch error MSDB could not be asked                      → 503, logged
 * A failed read FAILS CLOSED: a registration for a round nobody could check is
 * worse than asking the visitor to retry. And no refusal ever substitutes
 * another round or the upstream `signup_url`.
 *
 * Deliberately NOT a rule about `full` (out of scope; unchanged) nor about
 * DATES: a round that has started, or even ended, is found and judged only on
 * whether it exists and is closed (`includeStarted: true` plus an early `from`;
 * see ROUND_LOOKUP_FROM). Hiding started rounds stays where it already lives,
 * on the registration page. The local `schedule_status`
 * override check stays in each route, before this.
 *
 * The real readers are the defaults; `deps` overrides them, so the `pure` test
 * tier exercises every branch with injected stubs and no network.
 */

import { isClosedRound } from '@/lib/scheduleStatus';
import { getCourseByCodeInsensitive } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';

export const ROUND_GUARD_MESSAGES = Object.freeze({
  closed: 'รอบอบรมนี้ถูกยกเลิกแล้ว กรุณาเลือกรอบอื่น',
  notFound: 'ไม่พบรอบอบรมนี้ กรุณาเลือกรอบอื่น',
  unavailable: 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
});

/**
 * ── THE LOOKUP MUST SEE EVERY ROUND OF THE COURSE, WHATEVER ITS DATES ───────
 * "Not found" has to mean the round does not EXIST — never "it fell outside the
 * read". Two things could make it fall outside:
 *
 *   · DATES. With no `from`, `/schedules` keeps only rounds with a day
 *     `>= today`, so a round whose days are all past came back absent and was
 *     refused as not found. Reachable through the charge route's QR
 *     regenerate (a new row per POST) and through a form opened before the
 *     round's last day and submitted after. Neither route had a date rule
 *     before this guard, and this guard must not invent one. So `from` is the
 *     earliest possible date.
 *   · POSITION. `limit` is set far above any course's round count (17 max on
 *     2026-11-09, across all statuses and dates). MSDB was measured to ignore
 *     `limit` on this read anyway (limit=2 still returned 17); the large value
 *     only matters if it ever starts honouring it.
 *
 * There is no by-id read to use instead (`GET /schedules/{id}` is 405).
 */
export const ROUND_LOOKUP_FROM = '2000-01-01';
export const ROUND_LOOKUP_LIMIT = 1000;

const DEFAULT_DEPS = Object.freeze({
  getCourse: (code) => getCourseByCodeInsensitive(code),
  listRounds: (oid, opts) => listSchedulesByCourse(oid, opts),
});

/**
 * @param {{ courseCode?: string, courseId?: string, classId: string }} input
 *   the parsed registration body; `courseCode || courseId` is the short code
 * @param {object} [deps]
 * @param {Function} [deps.getCourse]   (code) → course with `_id`, or null
 * @param {Function} [deps.listRounds]  (courseOid, opts) → { items }
 * @param {Function} [deps.logError]    server log; defaults to console.error
 * @returns {Promise<{ ok: true, round: object } |
 *   { ok: false, status: number, body: { error: string, message: string } }>}
 */
export async function checkRegistrableRound(input, deps) {
  const d = { ...DEFAULT_DEPS, ...(deps ?? {}) };
  const logError = d.logError ?? console.error;
  const code = String(input?.courseCode || input?.courseId || '').trim();
  const classId = String(input?.classId ?? '').trim();

  const refuse = (status, error, message) => ({ ok: false, status, body: { error, message } });
  const notFound = () => refuse(404, 'round_not_found', ROUND_GUARD_MESSAGES.notFound);

  if (!code || !classId) return notFound();

  let items;
  try {
    const course = await d.getCourse(code);
    if (!course?._id) return notFound();
    const res = await d.listRounds(String(course._id), {
      status: 'all',
      revalidate: 0,
      includeStarted: true,
      from: ROUND_LOOKUP_FROM,
      limit: ROUND_LOOKUP_LIMIT,
    });
    items = Array.isArray(res?.items) ? res.items : [];
  } catch (err) {
    logError('[roundGuard] round lookup failed — refusing the registration', {
      course: code,
      classId,
      error: err?.message,
    });
    return refuse(503, 'round_check_failed', ROUND_GUARD_MESSAGES.unavailable);
  }

  const round = items.find((r) => String(r?._id ?? '') === classId);
  if (!round) return notFound();
  if (isClosedRound(round)) return refuse(409, 'round_cancelled', ROUND_GUARD_MESSAGES.closed);
  return { ok: true, round };
}
