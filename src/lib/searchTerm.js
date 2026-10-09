/**
 * The ONE place a user-typed search term is made safe to put in a regex.
 *
 * ══ THE BUG THIS EXISTS FOR ════════════════════════════════════════════════
 * `https://www.9experttraining.com/articles?q=%28` — a single `(` — rendered
 * the เกิดข้อผิดพลาด error page. Reproduced against this repo before fixing
 * (HTTP 500, `Regular expression is invalid`), and the cause is one line:
 *
 *   filter.$or = [{ title: { $regex: search, $options: 'i' } }, …]
 *
 * `$regex` with a STRING compiles that string as a pattern. `(` is an
 * unterminated group, so the SERVER — not the client, not a validator — throws
 * while building the query, the page has no error boundary that can recover a
 * failed data read, and a visitor who typed a bracket sees the site break.
 *
 * ══ WHY A SHARED MODULE AND NOT A FIX AT THE CRASH SITE ════════════════════
 * Because there were already FIVE hand-written copies of the same escape
 * expression in this repo (`lib/articleViews/queries.js`,
 * `lib/actions/redirects.js` ×2, `lib/actions/course-extensions.js` ×2,
 * `lib/articles/seoTitleCleanup.js`, and the highlighter in
 * `search/_components/SearchClient.jsx`) and TEN sites with none — and the ten
 * are not the ones anybody would guess, which is exactly why copies are the
 * wrong shape for this. One function, imported everywhere user input reaches a
 * pattern, is the only version of this fix that stays fixed.
 *
 * ══ WHAT IT DOES NOT DO ════════════════════════════════════════════════════
 * It does not change what matches. Every call site keeps its own clause —
 * unanchored substring here, `^…$` there, `$options: 'i'` or a `RegExp` flag —
 * because those ARE different questions and flattening them into one helper
 * would silently re-point several screens at a different search. Escaping a
 * term that contains no metacharacter returns the same string, so ordinary
 * text (Thai included — no Thai codepoint is a regex metacharacter) behaves
 * exactly as it does today. A test asserts that identity directly.
 */

/**
 * Every regex metacharacter, escaped.
 *
 * ── THE CLASS IS THE FIVE COPIES' CLASS, PLUS `/` ──────────────────────────
 * Those used `[.*+?^${}()|[\]\\]`. The one addition is `/`: harmless in
 * `new RegExp('…')` and in `$regex`, but NOT in a regex LITERAL — and escaping
 * it costs nothing, because `\/` is the same character everywhere. Cheap
 * insurance against a future call site that builds a literal by interpolation.
 *
 * ── `-` IS DELIBERATELY *NOT* ESCAPED, AND THAT WAS MEASURED ───────────────
 * It was in the first version of this function, on the reasoning that `-` is a
 * RANGE operator inside a character class and no call site puts the term in
 * one *today*. It came straight back out: nothing here puts a term in a class,
 * and escaping it changes the `$regex` STRING that every hyphenated input
 * produces — course codes (`ZZTEST-EXCEL-01`), slugs and dates are mostly
 * hyphens, so `test/pure/registrationRangeFilter` went red on the emitted
 * query, not on a match. `\-` and `-` match identically, so the escape bought
 * nothing and cost the one property this module promises: that ordinary text
 * comes out BYTE-IDENTICAL to what went in. If a call site ever does build a
 * character class from a term, the escape belongs there, with the class.
 *
 * `$&` is the whole match, so each character is replaced by itself preceded by
 * a backslash. Nothing is dropped.
 */
export function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * The longest search term any surface will compile into a pattern.
 *
 * ── WHY 200, MEASURED ─────────────────────────────────────────────────────
 * The cap has to clear the longest thing someone could sensibly paste into a
 * search box and still expect an exact hit. Measured over the real collections
 * (read-only, 2026-10-09):
 *
 *   article.title       median  47, p99  78, max  96
 *   article.slug        median  32, p99  77, max  86
 *   custom_page.title   median  25,        max  47
 *   redirect_rule.source                   max  17
 *
 * So 200 is more than twice the longest article title and comfortably past the
 * longest slug: a visitor or an admin can paste a WHOLE title or a whole slug
 * and still match it in full. It is not a guess at "long enough".
 *
 * ── WHY THERE IS A CAP AT ALL ─────────────────────────────────────────────
 * Not injection — escaping closes that. A pattern's cost grows with its
 * length, and `$regex` without a usable index is a collection scan that
 * compares every document against it; a URL can carry kilobytes, and
 * `?q=<8KB>` repeated is a cheap way to spend the database's time from
 * outside. Truncating is the right failure here rather than refusing: a term
 * this long is already a paste accident, and matching on its first 200
 * characters returns the rows the user was actually looking for instead of an
 * error they cannot act on.
 *
 * ── THE ONE SURFACE WHERE THIS TRUNCATES SOMETHING REAL ───────────────────
 * `not_found_hits.path` runs to 512 characters (p95 234). An admin pasting a
 * full 512-character 404 path gets a substring search on its first 200, which
 * still matches that row — `$regex` is unanchored there. Stated rather than
 * discovered.
 */
export const MAX_SEARCH_TERM = 200;

/**
 * A typed search term, ready to be dropped into a pattern: trimmed, capped at
 * `MAX_SEARCH_TERM` and escaped. `''` when there is nothing left to search for.
 *
 * THE ORDER MATTERS. Truncation happens BEFORE escaping, so the cap counts
 * characters the user typed rather than backslashes this function added —
 * otherwise `((((…` would be cut at 100 real characters and `abc…` at 200, and
 * the limit would mean something different depending on what was typed. It also
 * guarantees the term can never be cut mid-escape, which would leave a trailing
 * lone `\` — itself an invalid pattern, i.e. the original bug with extra steps.
 *
 * Callers keep their own clause: `{ $regex: term, $options: 'i' }`,
 * `` `^${term}$` ``, `new RegExp(term, 'i')`. This decides nothing about
 * matching, only that the term is a literal and bounded.
 *
 * @param {unknown} raw whatever arrived from a URL, a form or a prop
 * @returns {string} the escaped, bounded term — `''` when empty
 */
export function searchTermPattern(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  return escapeRegex(trimmed.slice(0, MAX_SEARCH_TERM));
}
