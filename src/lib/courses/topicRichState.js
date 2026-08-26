import { htmlToProjection, projectionEquals } from '@/lib/courses/topicHtml';

/**
 * THE ONE STALENESS RULE for rich training_topics. Pure; no I/O, no React.
 *
 * ══ WHY THIS EXISTS BEFORE ANYTHING CALLS IT ═══════════════════════════════
 *
 * Two surfaces have to make the same decision: the PUBLIC RENDERER (B2) asks
 * "may I render the rich copy?" and the ADMIN EDITOR SEED (B3) asks "may I open
 * the rich copy for editing?". If those two ever disagree, an admin edits
 * formatting the visitor cannot see, or the visitor sees formatting the admin
 * cannot reach. One function, built once, wired to nothing yet.
 *
 * ══ THE STORAGE SHAPE, AND HOW IT WAS DERIVED ══════════════════════════════
 *
 * `CourseExtension.trainingTopicsRich` is a `[String]`, one entry PER ROW,
 * index-aligned with MSDB's `training_topics`. That the unit is a ROW rather
 * than the whole section is not a preference — it is what the pure core already
 * commits to:
 *
 *   · `plainBulletsToHtml(bullets)` takes ONE ROW's bullets and returns ONE
 *     `<ul>` (topicHtml.js:194).
 *   · `htmlToProjection(html)` returns a `string[]` — ONE ROW's bullets
 *     (topicHtml.js:233).
 *
 * So the field is a per-row array of HTML strings, index-aligned with MSDB's
 * `training_topics` — stored as a real [String] on CourseExtension:
 *
 *     ['<ul><li>a</li></ul>', '', '<ul><li>b</li></ul>']
 *
 * An empty string at index i means "row i has no rich copy" and is perfectly
 * normal — 125 of the 829 live rows carry no bullets at all.
 *
 * ROW TITLES ARE NOT IN HERE. They stay plain and MSDB-owned; only bullets
 * become rich. The rebuilt projection therefore takes every `title` from the
 * MSDB row and only the `bullets` from the rich copy.
 *
 * ── WHICH MEANS A RENAME DOES NOT INVALIDATE, AND THAT IS DELIBERATE ───────
 * Both sides of the comparison take their titles from the same MSDB rows, so
 * titles cannot discriminate: `projectionEquals` compares them, but they are
 * equal by construction. The discriminating power is entirely in the BULLETS
 * and the LENGTH.
 *
 * That is the correct behaviour, not a gap. The rich copy is per-row bullet
 * formatting; renaming a heading leaves every bullet under it untouched, so the
 * formatting still describes exactly the bullets it was authored for. What
 * genuinely invalidates is anything that changes WHICH BULLETS SIT AT INDEX i —
 * insert, append, delete, reorder — and all four are caught.
 *
 * (Recorded because the first draft of the test asserted the opposite and went
 * red. Chasing that red would have meant storing titles in the rich field to
 * make them discriminate — fixing the code to match a wrong expectation.)
 *
 * ══ THE COMPARISON IS WHOLE-ARRAY. THIS IS THE WHOLE POINT. ════════════════
 *
 * MSDB's own admin form can insert, append, delete or reorder rows
 * (PublicCourseForm.jsx:1235-1241), and genesis learns about it only by
 * comparing. Matching row-by-row and keeping the rows that still agree is the
 * tempting cheaper version and it is WRONG IN THE DIRECTION THAT CORRUPTS: an
 * inserted row shifts everything after it, so row 3's formatting would be
 * applied to row 4's text, silently, with nothing red anywhere.
 *
 * All-or-nothing degrades to plain text instead, which is the state every
 * consumer already handles and every one of the 79 courses is in today.
 *
 * ══ EVERY UNCERTAINTY RESOLVES TO PLAIN ════════════════════════════════════
 *
 * A non-array, a length mismatch, a value that is not a string — all of it lands
 * on `plain`. There is no path through this module that renders a rich copy it
 * is not sure about. "I cannot tell" and "they match" must never be the same
 * answer when the difference decides whose formatting lands on whose sentence.
 */

/** What the caller should render. */
export const TOPIC_SOURCE = Object.freeze({ PLAIN: 'plain', RICH: 'rich' });

/**
 * Read the stored field as per-row HTML strings.
 *
 * Returns `[]` for anything it cannot use — absent, a non-array, or an array
 * holding something that is not a string. `[]` means "no usable rich copy",
 * which the resolver turns into `plain`. It never throws: a corrupt field must
 * degrade a course's formatting, never break its page.
 *
 * ── THE FIELD IS A REAL [String]. IT WAS BRIEFLY A JSON STRING. ────────────
 * The first draft of this module decoded `JSON.parse(raw)`, on the reasoning
 * that a single String column had to encode the array somehow. The schema was
 * then ruled to be a real `[String]` instead, which removes the parse failure
 * mode entirely — there is no longer a way for this field to be syntactically
 * broken, only structurally wrong.
 *
 * A non-array is still handled rather than assumed away. Mongo hands back what
 * is in the document, and a hand-edited row or a future migration can put
 * anything there; `[]` is the safe reading of all of it.
 */
export function parseTopicRich(raw) {
  if (!Array.isArray(raw)) return [];
  if (!raw.every((v) => typeof v === 'string')) return [];
  return raw;
}

/**
 * Rebuild the plain projection THE RICH COPY WOULD PRODUCE.
 *
 * Titles come from the MSDB rows — they are MSDB-owned and are not encoded in
 * the rich copy at all. Bullets come from flattening each row's HTML through
 * `htmlToProjection`, WHICH IS THE SAME FUNCTION THE SAVE PATH USES to produce
 * what it sends upstream. That identity is the reason this comparison means
 * anything: if the two ever became different functions, "the rich copy still
 * matches MSDB" would be a claim about one flattener while the bytes upstream
 * came from another.
 *
 * Returns null when the two sides cannot be aligned at all — different lengths,
 * or plain rows that are not an array. Null is "not comparable", which the
 * resolver reads as stale.
 */
export function richToProjection(richRows, plainRows) {
  if (!Array.isArray(richRows) || !Array.isArray(plainRows)) return null;

  /**
   * ── WHAT THIS LENGTH CHECK ACTUALLY CATCHES, MEASURED BY REVERTING IT ─────
   * Deleting it reddens exactly TWO tests — "a DELETED row makes it stale" and
   * this function's own unit test. Insert and append survive it, and that is
   * not a weak test: the rebuild is indexed by `plainRows`, so a SHORT
   * `richRows` yields `undefined` -> `htmlToProjection(undefined)` -> `[]`,
   * which then fails the content comparison anyway, and `projectionEquals`
   * carries its own length check on top.
   *
   * So this is defence in depth for insert/append, and the ONLY thing standing
   * up for DELETE: with rows removed upstream, every surviving row still lines
   * up and the orphaned rich entries are silently ignored, so the comparison
   * would pass on a copy that describes a course that no longer exists.
   *
   * Said plainly rather than implied, because the shape "three mechanisms, one
   * rule" is how a control comes to fire nothing and gets mistaken for a weak
   * assertion.
   */
  if (richRows.length !== plainRows.length) return null;

  return plainRows.map((row, i) => ({
    title: String(row?.title ?? ''),
    bullets: htmlToProjection(richRows[i]),
  }));
}

/** The MSDB rows, coerced to the exact shape `projectionEquals` compares. */
function plainProjection(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => ({
    title: String(row?.title ?? ''),
    bullets: Array.isArray(row?.bullets)
      ? row.bullets.map((b) => String(b ?? ''))
      : [],
  }));
}

/**
 * THE DECISION. Given MSDB's rows and the stored rich field, what renders?
 *
 * @param {object}   input
 * @param {Array}    input.rows  MSDB `training_topics` — [{ title, bullets[] }]
 * @param {string[]} input.rich  the stored `trainingTopicsRich` array
 *
 * @returns {{ source: string, stale: boolean, richRows: string[], rows: Array }}
 *   source   TOPIC_SOURCE.RICH only when the rich copy provably still describes
 *            these exact rows; TOPIC_SOURCE.PLAIN otherwise.
 *   stale    true ONLY for the third case — a rich copy EXISTS but no longer
 *            matches. An absent rich copy is not stale, it is simply absent,
 *            and conflating the two would light a warning on all 79 courses
 *            that have never been touched.
 *   richRows the decoded per-row HTML, or [] — handed back so a caller does not
 *            decode a second time and reach a different answer.
 *   rows     the MSDB rows, unchanged, so `plain` callers have one thing to read.
 */
export function resolveTopicRich({ rows, rich } = {}) {
  const plainRows = Array.isArray(rows) ? rows : [];
  const richRows = parseTopicRich(rich);

  // ── 1. no rich copy. Every course is here today. ──────────────────────────
  if (richRows.length === 0) {
    return { source: TOPIC_SOURCE.PLAIN, stale: false, richRows: [], rows: plainRows };
  }

  // ── 2. does the rich copy still describe these exact rows? ────────────────
  const rebuilt = richToProjection(richRows, plainRows);
  const plain = plainProjection(plainRows);
  if (rebuilt && plain && projectionEquals(rebuilt, plain)) {
    return { source: TOPIC_SOURCE.RICH, stale: false, richRows, rows: plainRows };
  }

  // ── 3. it exists and it does not match. Upstream moved. ───────────────────
  return { source: TOPIC_SOURCE.PLAIN, stale: true, richRows, rows: plainRows };
}
