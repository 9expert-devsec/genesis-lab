/**
 * The site's publishing timezone — one place, one answer.
 *
 * ── THE BUG THIS MODULE EXISTS FOR ──────────────────────────────────────────
 * `<input type="datetime-local">` emits a WALL-CLOCK string with no offset:
 * `YYYY-MM-DDTHH:mm`. Per ECMAScript, a date-time form without a zone
 * designator is interpreted in the RUNTIME's local timezone. The old parser
 * ran `new Date(raw).toISOString()` inside `'use server'` — i.e. on Vercel,
 * where `TZ` is UTC and nothing in this repo sets it (verified: no TZ in
 * .env.example, next.config.mjs, or vercel.json). So an admin in Bangkok who
 * picked 18:00 stored 18:00 UTC:
 *
 *   TZ=UTC          → 2026-07-30T18:00:00.000Z → reads back in Bangkok as 31 Jul 01:00
 *   TZ=Asia/Bangkok → 2026-07-30T11:00:00.000Z → reads back in Bangkok as 30 Jul 18:00
 *
 * +7h every save, and for any picked time >= 17:00 the CALENDAR DATE rolls
 * forward a day. The read side was broken the other way: the admin list and the
 * form both formatted with BROWSER-local time inside client components that are
 * SSR'd first, so the first paint showed UTC and hydration silently rewrote it.
 * Round-tripping through the form therefore drifted +7h per save.
 *
 * The fix is not "pick a better default timezone" — it is to stop asking the
 * runtime at all. Both directions are pinned to the constants below, so the
 * answer is identical on a Bangkok laptop, a UTC Vercel lambda, and a
 * Los Angeles CI box. test/pure/articlePublishTime.test.mjs asserts exactly
 * that by forcing `process.env.TZ` to each of the three.
 *
 * ── WHY BOTH A ZONE NAME AND A LITERAL OFFSET ───────────────────────────────
 * They are used in opposite directions and neither can do the other's job well:
 *
 *   fromLocalInput (wall clock → instant) uses SITE_UTC_OFFSET, because
 *     inverting a wall-clock time through `Intl` means guessing-and-checking an
 *     offset. String concatenation with a fixed offset is deterministic and
 *     needs no timezone database at all.
 *
 *   toLocalInput / formatSiteDateTime (instant → wall clock) use
 *     SITE_TIME_ZONE, because `Intl` does that direction natively and correctly.
 *
 * They agree because Thailand has never observed DST — ICT has been a flat
 * UTC+7 since 1920. If that ever stops being true, the round-trip tests go red
 * at the first affected date rather than drifting silently.
 *
 * Pure and dependency-free (no next/*, no db, no models) so the `pure` tier can
 * call the real code instead of a fixture that drifts from it.
 */

export const SITE_TIME_ZONE = 'Asia/Bangkok';
export const SITE_UTC_OFFSET = '+07:00'; // Thailand has never observed DST

/**
 * A bare wall-clock string, FULLY ANCHORED.
 *
 * The anchoring is load-bearing: a prefix match would also accept
 * `2026-07-30T18:00:00.000Z` and then re-interpret an instant that already
 * carries a zone as if it were Bangkok wall time, shifting it by another 7h.
 * Anything with a `Z` or an offset fails this and takes the absolute branch.
 * Seconds/fractions are optional because a `step` attribute on the input makes
 * the browser emit them.
 */
const WALL_CLOCK_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** Numeric parts of an instant AS SEEN IN Asia/Bangkok. */
const PARTS_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: SITE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** `iso` may be an ISO string, a Date, or falsy. → Date, or null if unusable. */
function toDate(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(String(iso));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Break an instant into the calendar fields a reader in Bangkok would see.
 *
 * @param {string|Date} iso
 * @returns {{year:number, month:number, day:number, hour:number, minute:number,
 *   second:number}|null} `month` is 1-12, NOT a JS 0-11 month index.
 */
export function siteDateParts(iso) {
  const d = toDate(iso);
  if (!d) return null;

  const out = {};
  for (const p of PARTS_FORMAT.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }

  // Some ICU builds render midnight in the h24 cycle, i.e. `24:00`, rather than
  // `00:00`. Normalise it. Node 22 emits `00` here, so this branch is defensive
  // — and if an ICU ever emits `24` while ALSO reporting the preceding day (the
  // other half of the h24 convention), the midnight round-trip test in
  // test/pure/articlePublishTime.test.mjs is what goes red.
  const hour = out.hour === '24' ? 0 : Number(out.hour);

  return {
    year:   Number(out.year),
    month:  Number(out.month),
    day:    Number(out.day),
    hour,
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/**
 * The current year AS SEEN IN BANGKOK. Gregorian, e.g. 2026.
 *
 * ── WHY IT LIVES HERE AND WHY IT IS CALLED ON THE SERVER ────────────────────
 * `formatRoundDays(..., { showYear: 'auto' })` needs to know what year it is and
 * REFUSES to find out for itself (see lib/schedule/roundDateLabel). Something
 * has to read the clock, and the read has to be zone-pinned for the same reason
 * everything else in this module is: Vercel runs in UTC, so between 17:00 and
 * midnight Bangkok on 31 December `new Date().getFullYear()` gives one answer on
 * the server and another in the browser. A course card holding a next-year round
 * would render without its year on the server and with it after hydration — a
 * mismatch on the one night of the year when the year is the question.
 *
 * So the SERVER page calls this once and passes the number down as a prop. The
 * client components never call it; they are handed an answer that was already
 * fixed when the HTML was built, which is what makes server and client agree by
 * construction rather than by luck.
 *
 * It is the only function in this module that reads the clock, which is why it
 * is the only one a test cannot pin to a fixture — every consumer takes the year
 * as an argument precisely so the test can supply its own.
 *
 * @returns {number}
 */
export function siteCurrentYear() {
  return siteDateParts(new Date()).year;
}

/**
 * `<input type="datetime-local">` value → an ISO instant string.
 *
 * The wall-clock time is read as Asia/Bangkok, never as the runtime's zone.
 * Returns `''` for empty or unparseable input — the empty case must stay
 * falsy all the way to `buildModelData` in src/lib/actions/articles.js, which
 * writes `publishedAt: null` for a draft so the index sort behaves.
 *
 * @param {string} value e.g. '2026-07-30T18:00'
 * @returns {string} e.g. '2026-07-30T11:00:00.000Z', or ''
 */
export function fromLocalInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const m = WALL_CLOCK_RE.exec(raw);
  if (m) {
    const [, date, hhmm, ss] = m;
    const d = new Date(`${date}T${hhmm}:${ss ?? '00'}.000${SITE_UTC_OFFSET}`);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }

  // Already an absolute instant (carries `Z` or an explicit offset), or junk.
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * ISO instant → the `YYYY-MM-DDTHH:mm` an `<input type="datetime-local">` wants,
 * expressed in the site's timezone rather than the browser's or the server's.
 *
 * @param {string|Date} iso
 * @returns {string} '' when there is nothing to show
 */
export function toLocalInput(iso) {
  const p = siteDateParts(iso);
  if (!p) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Human-readable date/time, pinned to the site timezone.
 *
 * Every surface that shows `publishedAt` goes through here. The `timeZone` is
 * NOT a caller option: leaving it to the caller is what produced the SSR/
 * hydration divergence in the first place — the server renders in UTC, the
 * browser re-renders in whatever the visitor's machine says, and React patches
 * the difference in without a warning.
 *
 * @param {string|Date} iso
 * @param {Intl.DateTimeFormatOptions & {locale?: string}} [opts]
 * @returns {string} '' when there is nothing to show
 */
export function formatSiteDateTime(iso, opts = {}) {
  const d = toDate(iso);
  if (!d) return '';
  const { locale = 'th-TH', ...rest } = opts;
  return new Intl.DateTimeFormat(locale, {
    ...rest,
    timeZone: SITE_TIME_ZONE,
  }).format(d);
}
