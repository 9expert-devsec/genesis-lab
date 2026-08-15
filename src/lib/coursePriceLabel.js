/**
 * THE price label for a course. Worded here and nowhere else.
 *
 * ── WHY THIS MODULE EXISTS ──────────────────────────────────────────────────
 * A course with no public price is inhouse-only, and seven surfaces each
 * decided independently how to say so. Every one of them had its own copy of
 * the same ternary, and four of them had their own copy of the currency suffix
 * glued onto the end of it:
 *
 *   training-course/CourseCard      "Call .-"
 *   [...slug]/CareerPathDetail      "Call .-"
 *   articles/ArticleDetailClient    "Call .-"
 *   search/SearchClient             "Call .-"
 *   training-course/CourseTableGroup     "Call"
 *   [...slug]/CourseHero                 "Call"
 *   schedule/ScheduleClient              "Call"
 *
 * That is the same shape the five duplicated schedule-status maps had before
 * lib/scheduleStatus collapsed them, and it failed the same way: renaming the
 * word means finding all seven, and the four with a suffix silently produce
 * "<label> .-" — a currency unit attached to a phrase that is not a price.
 *
 * ── THE SUFFIX IS A PROPERTY OF NUMBERS, NOT OF THE SLOT ────────────────────
 * `.-` (and `฿` on /schedule's mobile card) means "baht". It belongs to a
 * numeral and to nothing else. The old code appended it to whatever the ternary
 * returned, so the label inherited it by accident. Here the suffix is applied
 * INSIDE the numeric branch only, which makes "Inhouse Only .-" unrepresentable
 * rather than merely fixed — a caller cannot opt back into the defect, because
 * there is no longer a code path that concatenates onto the label.
 */

/**
 * The words. One export, so the next rename is one edit.
 *
 * Deliberately not localised alongside the Thai copy around it: this is the
 * wording the business uses on the price line in both languages, and the detail
 * hero pairs it with its own Thai gloss (*รับเฉพาะ InHouse Training เท่านั้น)
 * rather than translating the label itself.
 */
export const INHOUSE_ONLY_LABEL = 'Inhouse Only';

/**
 * True when the course has no public price and must show the label instead.
 *
 * Absent, zero, and non-numeric all mean the same thing — there is no public
 * seat price — and they were spelled three different ways across the call sites
 * (`!price`, `!price || Number(price) === 0`, `!raw || Number.isNaN(n)`).
 * Collapsed here so a surface cannot disagree with its neighbour about what
 * counts as priceless.
 *
 * Exported because two surfaces need the BRANCH without the string: the
 * all-courses table greys the cell, and the detail hero swaps the footnote line
 * underneath the price.
 */
export function isInhouseOnlyPrice(price) {
  if (price === null || price === undefined || price === '') return true;
  const n = Number(price);
  return Number.isNaN(n) || n === 0;
}

/**
 * `'8,500'`, `'8,500 .-'`, or `'Inhouse Only'` — never `'Inhouse Only .-'`.
 *
 * @param {number|string|null|undefined} price
 * @param {object}  [options]
 * @param {string}  [options.suffix] — currency unit for the NUMERIC branch only
 *                                     ('.-' on the cards, '฿' on /schedule's
 *                                     mobile card). Ignored when there is no
 *                                     price, which is the whole point.
 */
export function coursePriceLabel(price, { suffix = '' } = {}) {
  if (isInhouseOnlyPrice(price)) return INHOUSE_ONLY_LABEL;
  const text = Number(price).toLocaleString('th-TH');
  return suffix ? `${text} ${suffix}` : text;
}
