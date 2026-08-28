/**
 * What a publish-window date INPUT means — one definition, round 42.
 *
 * ── THE BUG THIS MODULE EXISTS FOR ──────────────────────────────────────────
 * An author set วันสิ้นสุด to today and the page stopped being visible today.
 * They meant "visible through today"; they got "expired since 00:00".
 *
 * The whole defect was one line in PublishDialog:
 *
 *     const fromInput = (v) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);
 *
 * and it was wrong TWICE, in ways that hide each other:
 *
 *   1. START OF DAY FOR AN END DATE. `isPubliclyVisible` expires a page when
 *      `now > end`. With `end` pinned to 00:00 of the named day, the page is
 *      expired for the entire day the author named. The rule is right; the
 *      value it was handed did not mean what the author meant.
 *
 *   2. THE RUNTIME'S ZONE, WHICHEVER THAT IS. A date-time string with no zone
 *      designator is parsed in the LOCAL zone — the same defect
 *      lib/articlePublishTime.js was written for, on the sibling surface. So
 *      the instant stored for one typed date depended on whose machine saved
 *      it (measured, `2026-08-28`):
 *
 *        Asia/Bangkok        → 2026-08-27T17:00:00.000Z
 *        UTC (Vercel)        → 2026-08-28T00:00:00.000Z
 *        America/Los_Angeles → 2026-08-28T07:00:00.000Z
 *
 *      And the READ side compounded it. `toInput = v => String(v).slice(0,10)`
 *      takes the UTC calendar date, so the Bangkok-saved value above came back
 *      into the date box as `2026-08-27` — a day EARLIER than what was typed.
 *      Every round-trip through the dialog walked both dates backwards one day.
 *      Both stored pages in the database show exactly this: the box read a day
 *      early on each of them (scripts/_probe-round42-publish-window.mjs).
 *
 * ── THE DECISION: THE DAY IS A DAY IN Asia/Bangkok ─────────────────────────
 * "End of day" has to mean end of day SOMEWHERE, and this is a product call
 * rather than a technical one. It is Asia/Bangkok, for three reasons and the
 * first is decisive:
 *
 *   · THE REPO ALREADY DECIDED. lib/articlePublishTime.js pins the site's
 *     publishing timezone to Asia/Bangkok, with a literal offset, and states
 *     why. A second answer here would be precisely the drift that module's
 *     header exists to prevent — so the zone is IMPORTED from it and never
 *     restated. One constant, two surfaces.
 *   · The authors are in Thailand and so is the audience. An author who types
 *     28 Aug means the Thai calendar day, not a UTC one.
 *   · UTC end-of-day would keep a "finished" campaign live until 07:00 the next
 *     Bangkok morning — visibly wrong to the author AND to the visitor, and
 *     wrong in the direction that leaks a page past its window.
 *
 * WHAT THAT MEANS AT MIDNIGHT. The boundary IS Bangkok midnight, by
 * construction: an end date of 28 Aug stores 2026-08-28T16:59:59.999Z, so the
 * last visible instant is 28 Aug 23:59:59.999 in Bangkok and the first
 * invisible one is 29 Aug 00:00:00.000. Nothing is half-visible across it. What
 * DOES straddle two calendar dates is the UTC day — one Bangkok publish-day
 * spans two of them — which is exactly why reading the UTC slice back was wrong.
 *
 * ── AND NOT IN `isPubliclyVisible` ────────────────────────────────────────
 * The rule `now > end` is correct once `end` means what an author means, and
 * visibility.js's own header says it exists so the route and the dialog cannot
 * drift. Moving the fix into the comparison would make the STORED VALUE and the
 * RULE disagree — every consumer of a stored instant (the promotions grid, the
 * admin list, any future export) would still read 00:00 while one function
 * privately knew better. Fixing the conversion fixes the value for all of them.
 *
 * Pure and dependency-free — no db, no models, no next/* — so the client may
 * import it and the `pure` tier can call the real code.
 */

// The zone is IMPORTED, never restated. lib/articlePublishTime.js owns
// SITE_UTC_OFFSET (for wall-clock → instant, which needs no timezone database)
// and siteDateParts (for instant → wall clock, which Intl does natively). This
// module is the second caller of both, and that is the point.
import { SITE_UTC_OFFSET, siteDateParts } from '@/lib/articlePublishTime';

/**
 * `<input type="date">` emits exactly `YYYY-MM-DD` and nothing else — no time,
 * no zone. Anchored at both ends: a prefix match would also accept a full ISO
 * instant and then re-interpret something that already carries a zone as if it
 * were a bare Bangkok date.
 */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The two wall-clock instants a named day can mean, as constants rather than
 * literals at two call sites.
 *
 * `23:59:59.999` and not the next day's `00:00` because `isPubliclyVisible`
 * expires on `now > end`, which makes `end` the LAST VISIBLE INSTANT. Storing
 * the next midnight would need the comparison to become `>=` — a change to the
 * rule, which round 42 item C rules out and which would put the stored value
 * and the rule back into disagreement. The 1ms is unobservable; the ownership
 * is not.
 */
export const WINDOW_START_WALL = '00:00:00.000';
export const WINDOW_END_WALL = '23:59:59.999';

const pad = (n) => String(n).padStart(2, '0');

/**
 * `YYYY-MM-DD` + a wall time → an ISO instant anchored to the site's zone.
 *
 * Returns null for anything that is not exactly a valid calendar date, so a
 * cleared box degrades to "no bound" rather than to a bound matching nothing.
 *
 * ── THE ROUND TRIP IS NOT DECORATION ──────────────────────────────────────
 * `new Date('2026-02-31T00:00:00.000+07:00')` is NOT Invalid Date — V8 rolls it
 * into 3 March and hands back a perfectly usable timestamp (measured). Only a
 * bad MONTH (`2026-13-01`) gives NaN. So a shape check plus a NaN check would
 * silently accept 31 February and store a window three days past what anybody
 * typed. Reading the instant back in Bangkok and requiring the same calendar
 * date is what closes it — and it is the same guard lib/registrations/listFilter
 * `parseDateInput` reaches for, for the same reason.
 *
 * (That function is NOT reused: it builds a BROWSER-local Date, which is the
 * exact ambient-zone dependency this module exists to remove. Same guard, two
 * different zone policies, and the policies are the whole subject here.)
 */
function anchoredInstant(value, wallTime) {
  const s = String(value ?? '').trim();
  if (!DATE_ONLY_RE.test(s)) return null;

  const d = new Date(`${s}T${wallTime}${SITE_UTC_OFFSET}`);
  if (Number.isNaN(d.getTime())) return null;

  const back = siteDateParts(d);
  if (!back) return null;
  if (`${back.year}-${pad(back.month)}-${pad(back.day)}` !== s) return null;

  return d.toISOString();
}

/**
 * วันเริ่ม → the FIRST instant of that day in Asia/Bangkok.
 *
 * ── START-OF-DAY IS RIGHT FOR A START, AND IT IS NOT SYMMETRIC WITH THE END ─
 * An author naming a start day means "from that day", so the window opens as
 * the day opens. It reads the same as the end date and it is the opposite
 * anchor, which is why they are two named functions rather than one with a
 * boolean: a caller that passes the wrong flag gets a silently wrong window,
 * while a caller that calls the wrong function is reading the wrong verb.
 *
 * It had the SAME ambient-zone defect as the end date and was never wrong in
 * the way the end date was wrong — 00:00 is what a start should be, so the bug
 * was invisible on a Bangkok laptop and would have appeared the first time a
 * page was saved from anywhere else. It is pinned here for that reason, not
 * because a reported symptom demanded it.
 */
export function windowStartFromInput(value) {
  return anchoredInstant(value, WINDOW_START_WALL);
}

/**
 * วันสิ้นสุด → the LAST instant of that day in Asia/Bangkok.
 *
 * This is the reported bug's fix, in one line: the day the author names is a
 * day the page is visible, all of it.
 */
export function windowEndFromInput(value) {
  return anchoredInstant(value, WINDOW_END_WALL);
}

/**
 * A stored instant → the `YYYY-MM-DD` the date box should show, in Bangkok.
 *
 * Replaces `String(v).slice(0, 10)`, which read the UTC calendar date and so
 * showed the previous day for every value a Bangkok browser had written.
 *
 * IT DOES NOT GUESS WHICH CONVENTION WROTE THE VALUE, and that is deliberate.
 * A pre-fix end date (Bangkok midnight) and a post-fix one (Bangkok
 * 23:59:59.999) fall on different days, and both are answered the same way:
 * the Bangkok calendar day this instant is in. A heuristic that tried to
 * recognise "this looks like an old midnight value, so subtract a day" would be
 * a second rule about stored data, it would be wrong for any page whose window
 * genuinely ends at midnight, and nothing could tell the two apart. The box
 * says what the stored instant actually means; re-saving then writes what the
 * box says.
 */
export function toDateInput(iso) {
  const p = siteDateParts(iso);
  if (!p) return '';
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
