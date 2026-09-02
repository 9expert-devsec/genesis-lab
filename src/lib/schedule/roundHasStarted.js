/**
 * "Has this round already begun?" — THE one answer, for every public surface.
 *
 * Dependency-free ON PURPOSE — no `next/*`, no db, no models, no React — the
 * same rule as monthWindow.js, roundDateLabel.js and monthLanes.js beside it, so
 * the boundary can be exercised in the `pure` tier at a pinned date without a
 * DOM or a clock.
 *
 * ── THE RULE, AS THE ADMIN TEAM STATED IT ───────────────────────────────────
 * A round disappears from the PUBLIC schedule the moment its FIRST training day
 * arrives. Not when it ends — when it STARTS. A 28–29 ส.ค. round is gone on
 * 28 ส.ค.; a 30 ต.ค. – 2 พ.ย. round is gone on 30 ต.ค. Multi-day and
 * cross-month rounds are not exceptions, they are the cases that make the rule
 * worth writing down.
 *
 * ── WHY THE UPSTREAM FILTER CANNOT DO THIS ──────────────────────────────────
 * `/schedules` filters `dates: {$elemMatch: {$gte: from}}` — "keep the round if
 * ANY of its days is today or later". A 13–14 ส.ค. round on 13 ส.ค. matches on
 * its own first day and survives, which is the defect this module removes: on
 * 13 ส.ค. 2026 the public table still listed it. The bound is applied
 * unconditionally by an endpoint this repo does not own, so the narrowing has to
 * happen on this side of the wire.
 *
 * ── AND WHY THE FIRST DAY IS A `min`, NEVER `dates[0]` ──────────────────────
 * `dates` is NOT guaranteed sorted in storage. Rounds written by this app are
 * (the schedule editor sorts on save), but rounds arrive from MSDB, which this
 * repo does not own — and `roundDateLabel`'s own contract says so in as many
 * words: `@param dates the round's dates, in any order`. Every module here that
 * has to know when a round begins already derives it rather than indexing:
 * `roundDateLabel.calendarDays` sorts, `monthLanes.startTime` takes a
 * `Math.min`. The places that DID trust `dates[0]` are the places that produced
 * defects — see gridWindowWarning's docstring for the dated incident where one
 * stray earlier date moved a whole round out of the admin table.
 *
 * Trusting `dates[0]` here would be worse than any of those: a round whose array
 * happens to start with its LAST day would read as starting later than it does
 * and would linger on the public site for the length of the round.
 */

/**
 * A date-ish value as a `'YYYY-MM-DD'` key in LOCAL calendar terms, or `null`.
 *
 * ── IT ACCEPTS ONLY A `Date` OR A NON-EMPTY STRING, AND THAT IS DELIBERATE ──
 * Everything else — `null`, `undefined`, `''`, `0`, `false`, a bare number — is
 * rejected outright rather than handed to `new Date()`. The reason is that
 * `new Date(x)` is NOT reliably invalid for those: `null`, `0` and `false` all
 * coerce to 0 and yield the UNIX EPOCH, which as a round's "first day" reads as
 * a round that started fifty-six years ago — hidden from the site forever, with
 * nothing to show for it. Only `undefined` and `''` produce a genuine Invalid
 * Date, so a falsy-value filter alone does NOT cover the falsy values it looks
 * like it covers.
 *
 * A type check does. Upstream sends these arrays straight from Mongo as ISO
 * strings and a null in one is entirely ordinary; a numeric timestamp is not a
 * shape `dates` has ever carried, so refusing it costs nothing and removes the
 * epoch trap completely.
 *
 * (`roundDateLabel.calendarDays` filters the same idea by value —
 * `d !== null && d !== undefined && d !== ''` — and its docstring claims `0`
 * and `false` are covered. They are not: both survive that filter and render as
 * 1 ม.ค. 13. Deliberately NOT fixed from here, since the round label is out of
 * scope for this change, but it is the same trap one module along.)
 */
function dayKey(value) {
  if (!(value instanceof Date) && (typeof value !== 'string' || value === '')) {
    return null;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The round's EARLIEST day, as `'YYYY-MM-DD'`, or `null` when it has none.
 *
 * By `min` over every usable date — see the note above on why not `dates[0]`.
 * The comparison is lexicographic on the key rather than numeric on a
 * timestamp, which is exact for this shape (fixed-width, zero-padded, most
 * significant field first) and keeps the whole module working in one currency.
 *
 * @param {Array<string|Date>} dates
 * @returns {string|null}
 */
export function roundFirstDayKey(dates) {
  const list = Array.isArray(dates) ? dates : [];
  let earliest = null;
  for (const value of list) {
    const key = dayKey(value);
    if (key === null) continue;
    if (earliest === null || key < earliest) earliest = key;
  }
  return earliest;
}

/**
 * Has the round begun, as of `todayKey`?
 *
 * @param {Array<string|Date>} dates the round's dates, in any order
 * @param {string} todayKey today in Asia/Bangkok, `'YYYY-MM-DD'` — from
 *   `siteTodayKey()` in lib/articlePublishTime, which owns this site's zone.
 * @returns {boolean} `true` when the round's first day is today or earlier.
 *
 * ── `<=`, AND THE `=` IS THE ENTIRE POINT ───────────────────────────────────
 * A round whose first day IS today is started. That equality is the difference
 * between this rule and the upstream `>= today` bound it corrects; writing `<`
 * here would reimplement the defect exactly.
 *
 * ── A ROUND WITH NO USABLE DATE IS NOT "STARTED" ────────────────────────────
 * It returns `false`, so such a round is KEPT rather than hidden. Both answers
 * are defensible and this one is chosen deliberately: hiding is silent and
 * unrecoverable from the visitor's side, while keeping leaves a visible,
 * reportable row. A round with no dates is a data fault to be fixed upstream,
 * not a round to be quietly deleted from the site. The same instinct as
 * `joinCourseSchedules` reporting what it drops rather than dropping silently.
 *
 * A missing or malformed `todayKey` also returns `false` — a caller that cannot
 * say what day it is must not be allowed to empty the schedule page.
 */
export function roundHasStarted(dates, todayKey) {
  if (typeof todayKey !== 'string' || todayKey === '') return false;
  const first = roundFirstDayKey(dates);
  if (first === null) return false;
  return first <= todayKey;
}

/**
 * Drop every round that has already begun.
 *
 * @param {Array<{dates?: Array<string|Date>}>} items schedule rows
 * @param {string} todayKey today in Asia/Bangkok, `'YYYY-MM-DD'`
 * @returns {Array} a NEW array; the input is never mutated
 *
 * Non-array input returns `[]` rather than throwing: this sits directly in the
 * fetch path of every public surface, and an upstream shape change must degrade
 * to an empty schedule table rather than a 500 on the home page.
 */
export function excludeStartedRounds(items, todayKey) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !roundHasStarted(item?.dates, todayKey));
}

/**
 * The rounds that HAVE begun — the complement of `excludeStartedRounds`.
 *
 * Exported for exactly one caller: the public registration page, which has to
 * tell "your `?class=` link points at a round that started this morning" apart
 * from "your `?class=` link is stale or bogus". Those two have different
 * remedies and must not collapse into one message, so the page partitions the
 * fetch with BOTH halves of this pair and hands the wizard two named lists.
 *
 * Deriving the complement here rather than at the call site is what keeps the
 * two halves from drifting: one predicate, negated in one place.
 */
export function startedRounds(items, todayKey) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => roundHasStarted(item?.dates, todayKey));
}

/**
 * ── THE OTHER BOUNDARY: HAS THE ROUND FINISHED? ─────────────────────────────
 *
 * Added for /admin/schedules, which since MSDB began returning fully-past rounds
 * must draw them as จบไปแล้ว rather than as live rounds taking bookings.
 *
 * ── WHY IT LIVES IN THIS MODULE AND NOT A NEW ONE ───────────────────────────
 * `dayKey` above. A round's two boundaries MUST read its dates through one
 * parser: if "started" and "ended" each had their own, a timezone or an
 * epoch-trap fix applied to one would leave the other answering about a
 * different calendar, and a round could report itself simultaneously not-started
 * and ended. `dayKey` is deliberately module-private — the only way to share it
 * is to sit beside it. The file is named for the first predicate written into
 * it; its subject has always been where a round's dates begin and end.
 *
 * ── DERIVED FROM THE DATES, NEVER FROM `status` ─────────────────────────────
 * A finished round's stored `status` is whatever it was on its last selling day
 * and nothing ever updates it: measured 2026-09-02, of 172 fully-past rounds
 * upstream, 40 still say `open` and 2 say `nearly_full`. Reading `status` to
 * decide whether a round is over would therefore mark a quarter of history as
 * still taking registrations. The dates are the only field that tells the truth
 * about time.
 */

/**
 * The round's LATEST day, as `'YYYY-MM-DD'`, or `null` when it has none.
 *
 * By `max` over every usable date, for the same reason `roundFirstDayKey` takes
 * a `min`: `dates` is not guaranteed sorted, so `dates[dates.length - 1]` is not
 * the last day — it is merely the last element. A round whose array happens to
 * end with its FIRST day would read as finishing early and would be greyed out
 * while it was still running.
 *
 * @param {Array<string|Date>} dates the round's dates, in any order
 * @returns {string|null}
 */
export function roundLastDayKey(dates) {
  const list = Array.isArray(dates) ? dates : [];
  let latest = null;
  for (const value of list) {
    const key = dayKey(value);
    if (key === null) continue;
    if (latest === null || key > latest) latest = key;
  }
  return latest;
}

/**
 * Has the round finished, as of `todayKey`?
 *
 * @param {Array<string|Date>} dates the round's dates, in any order
 * @param {string} todayKey today in Asia/Bangkok, `'YYYY-MM-DD'` — from
 *   `siteTodayKey()` in lib/articlePublishTime, which owns this site's zone.
 * @returns {boolean} `true` when the round's LAST day is strictly before today.
 *
 * ── `<`, NOT `<=`, AND THAT ASYMMETRY WITH `roundHasStarted` IS THE POINT ───
 * A round whose last day IS today is STILL RUNNING — trainees are in the room.
 * It must keep its real status and its แก้ไข/ลบ controls, because today is
 * exactly when an admin still needs to correct it. `roundHasStarted` uses `<=`
 * because a round that begins today has begun; this uses `<` because a round
 * that ends today has not yet ended. The two predicates are not complements and
 * must not be refactored into one: between a round's first and last day BOTH
 * are false-then-true in different ways, and a round running today is started
 * AND not ended, which is precisely the state the grid needs to name.
 *
 * ── THE DEGENERATE CASES RETURN `false`, MATCHING `roundHasStarted` ─────────
 * A round with no usable date, or a caller that cannot say what day it is, is
 * NOT ended. On this screen `false` is the conservative answer: the round keeps
 * its normal treatment and stays editable, rather than a data fault silently
 * locking a live round into a read-only historical state an admin cannot undo.
 */
export function roundHasEnded(dates, todayKey) {
  if (typeof todayKey !== 'string' || todayKey === '') return false;
  const last = roundLastDayKey(dates);
  if (last === null) return false;
  return last < todayKey;
}
