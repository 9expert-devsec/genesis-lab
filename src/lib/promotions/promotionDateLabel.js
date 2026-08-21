/**
 * The promotion grid's date label — one definition, pinned to the site's zone.
 *
 * ── THE BUG THIS MODULE EXISTS FOR, MEASURED ──────────────────────────────
 * These two functions lived inside src/app/(public)/promotions/page.jsx and
 * read the calendar off the RUNTIME:
 *
 *     const year = d.getFullYear() + 543;
 *     return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${year}`;
 *
 * That page is a SERVER component with `revalidate = 3600`, so there is no
 * SSR/hydration divergence to chase — exactly one zone decides, and on Vercel
 * it is UTC (nothing in this repo sets TZ; see lib/articlePublishTime's
 * header). The label therefore named a UTC day to an audience reading it in
 * Bangkok.
 *
 * Measured against every end date that actually reaches this label — 23 of
 * them, 2 from builder pages and 21 from MSDB
 * (scripts/_probe-round43-promotion-label.mjs, run with TZ=UTC):
 *
 *   · the 21 MSDB rows are stored at 16:59Z, which is 23:59 Bangkok. The UTC
 *     day and the Bangkok day are the same, and the ambient label was right.
 *   · BOTH builder rows disagreed, and the ambient label was WRONG on both:
 *       /expo002   showed 28 ส.ค. 2569, last visible day 29 ส.ค. 2569
 *       /ex-pro-1  showed 20 ก.ค. 2569, last visible day 21 ก.ค. 2569
 *
 * "Last visible day" there is not this module's opinion: it is computed from
 * `isPubliclyVisible`, which expires a page on `now > end` and therefore makes
 * the stored instant the LAST VISIBLE one. A promotion stored to end at
 * 2026-08-28T17:00:00.000Z is readable up to and including 29 Aug 00:00:00.000
 * Bangkok, so 29 ส.ค. is the honest last day and 28 ส.ค. under-states it.
 *
 * Scored against that reference, the pinned reading is wrong on 0 of 2 and the
 * ambient one on 2 of 2. So this is a fix, not a tidy-up.
 *
 * ── WHY IT MOVED OUT OF THE PAGE ──────────────────────────────────────────
 * A route file's exports are constrained by the framework, so nothing in the
 * suite could reach these functions to assert what they RENDER — only that the
 * file imported the right helper, which is a much weaker claim than "this
 * instant produces this string". The defect was a wrong string; the guard has
 * to be about strings. Same shape as lib/schedule/roundDateLabel.js, which is
 * this repo's existing home for a date label with a zone opinion.
 *
 * ── THE ZONE IS IMPORTED, NEVER RESTATED ──────────────────────────────────
 * lib/articlePublishTime.js owns Asia/Bangkok and states why; this is its
 * third caller after lib/pageBuilder/publishWindow.js. A local copy of the
 * offset would agree with the others right up until the day it did not.
 *
 * ── TWO OTHER COPIES OF THIS MONTH ARRAY EXIST, AND ARE NOT TOUCHED ───────
 * `src/app/(public)/promotions/[slug]/page.jsx` (full month names, a different
 * list) and `src/app/(public)/career-path-register/[slug]/_components/
 * CareerPathRegisterClient.jsx` (the same abbreviations). The career-path one
 * carries the SAME ambient-zone defect this module was written to remove —
 * `start.getDate()` / `start.getMonth()` on a public surface. Consolidating
 * the three is its own change on its own data, and folding it in here would
 * mean deciding the zone policy for a surface this round has not measured.
 *
 * Pure and dependency-free (no next/*, no db, no models) so the `pure` tier can
 * call the real code instead of a fixture that drifts from it.
 */

// The zone comes from the module that owns it. This file names no offset.
import { siteDateParts } from '@/lib/articlePublishTime';

/** Abbreviated Thai months, indexed 0-11. */
const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/**
 * One instant as the Thai calendar day it falls on IN BANGKOK.
 *
 * Returns null for a missing or unparseable value, which is what the caller
 * turns into "no range shown" — the same totality the page-local version had,
 * reached through `siteDateParts` rather than through two separate guards.
 *
 * `p.month` is 1-12, NOT a JS 0-11 index — siteDateParts says so in its own
 * doc and test/pure/articlePublishTime pins it. The `- 1` here is the whole
 * reason that pin matters.
 */
export function formatThaiDate(value) {
  const p = siteDateParts(value);
  if (!p) return null;
  // Buddhist year (พ.ศ. = ค.ศ. + 543)
  return `${p.day} ${THAI_MONTHS[p.month - 1]} ${p.year + 543}`;
}

/**
 * The card's range line. Unchanged in shape: the START is deliberately not
 * shown — a promotion the grid is listing is one that is running now, so the
 * only fact worth the space is when it stops.
 */
export function dateRangeLabel(startISO, endISO) {
  const end = formatThaiDate(endISO);
  if (!end) return null;
  return `วันนี้ - ${end}`;
}
