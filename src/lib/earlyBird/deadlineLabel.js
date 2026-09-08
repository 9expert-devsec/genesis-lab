import { formatThaiDate } from '@/lib/promotions/promotionDateLabel';

/**
 * The Early Bird banner's deadline, as words.
 *
 * ── WHY THIS IS A MODULE AND NOT A LINE IN THE BANNER ───────────────────
 * `EarlyBirdBanner` is `'use client'`. A date formatted inside it is formatted
 * TWICE — once on the server during SSR, once in the visitor's browser during
 * hydration — against two different local timezones. A deadline near midnight
 * then renders one calendar day on the server and another in the browser, which
 * React reports as a hydration mismatch and which this repo has already
 * recorded as a live hazard (see lib/articlePublishTime.js's header: nothing
 * sets `TZ`, so on Vercel the server is UTC while the reader is in Bangkok).
 *
 * So the formatting happens ONCE, on the server, and the banner receives a
 * finished string it renders verbatim. The component does no date arithmetic at
 * all, which is a property that can be checked by reading it rather than
 * reasoned about.
 *
 * ── AND THE FORMATTER IS ZONE-PINNED, WHICH IS A SECOND THING ───────────
 * Server-side alone is not enough. `formatScheduleRange` in the banner reads
 * `getDate()` / `getMonth()` / `getFullYear()` off the RUNTIME, so moving that
 * shape to the server would only mean one machine got it wrong instead of two
 * disagreeing. `formatThaiDate` reads the Bangkok calendar through
 * `siteDateParts`, so the answer does not depend on which machine asked —
 * which is exactly what the timezone control in this round's test asserts.
 *
 * ── THE ABBREVIATIONS ARE THE SAME ONES, NOT A FOURTH COPY ──────────────
 * The banner's local `MONTHS_TH` and `promotionDateLabel`'s `THAI_MONTHS` are
 * character-identical, and both add 543 for the Buddhist year — so this
 * produces exactly the convention `formatScheduleRange` already uses on the
 * same card, while reusing the module that owns the zone. Restating the array
 * here would have been the fourth copy in the repo; `promotionDateLabel`'s own
 * header names the other two and explains why consolidating them is its own
 * change on its own data.
 *
 * ── THE END ONLY, NEVER A RANGE ─────────────────────────────────────────
 * DECIDED, and the reasoning belongs here because the alternative is the
 * obvious one. A `today – deadline` range would have to name a start, and
 * `EarlyBirdConfig` stores none. Deriving one from "now" would print
 * `ตั้งแต่วันนี้` on a page that has been cached for up to an hour (the course
 * route is `revalidate = 3600`), and would claim the offer began today when it
 * began whenever it began. The deadline is the fact the reader needs and the
 * only one the data actually holds.
 *
 * `dateRangeLabel` next door does render `วันนี้ - <end>` and is NOT wrong to:
 * the /promotions grid is a list of promotions that are running right now, so
 * "from today" is a statement about the grid rather than about a stored start.
 * A banner is one offer, and the same phrase there would be a claim about it.
 *
 * Pure — no React, no DB, no `next/*` — so the `pure` tier calls the real code.
 */

/** The word before the date. One constant, so the test and the UI share it. */
export const DEADLINE_PREFIX = 'หมดเขต';

/**
 * `หมดเขต 10 ก.ย. 2569`, or `null` when there is no honest label to render.
 *
 * `null` for a missing, empty or unparseable deadline — `formatThaiDate`
 * already folds those three into one answer — and the banner renders nothing
 * at all for it rather than a prefix with a blank after it. That is what keeps
 * a row with no deadline byte-identical to what it rendered before this round,
 * which is every row whose countdown is absent for the same reason.
 */
export function earlyBirdDeadlineLabel(deadline) {
  const day = formatThaiDate(deadline);
  return day ? `${DEADLINE_PREFIX} ${day}` : null;
}
