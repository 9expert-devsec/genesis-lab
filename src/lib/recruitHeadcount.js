/**
 * A job posting's optional headcount — how many people are wanted for it.
 *
 * ══ ONE NORMALISER, AND EVERY PATH GOES THROUGH IT ══════════════════════════
 * The write path (the server action), the admin list row, the public card and
 * the detail dialog all ask the same question: "is there a number here, and
 * what is it?". Written four times that is four chances to disagree about what
 * `0` means, and the disagreement is invisible — a card rendering `จำนวน 0
 * ตำแหน่ง` looks like data entry, not like a bug in a check.
 *
 * So there is one function. It takes whatever actually arrives — a form string,
 * a value out of Mongo, a field that does not exist on a document written
 * before this existed, or a hand-crafted payload — and answers with a positive
 * integer or `null`. There is no third outcome and no throwing: a render site
 * cannot usefully handle an exception, and a write path that throws on bad
 * input turns a typo into a 500.
 *
 * ── UNSET IS NOT ZERO ───────────────────────────────────────────────────────
 * `null` means "no headcount was given" and is the ONLY thing that means it.
 * `0` is not a smaller headcount, it is a posting for nobody — nothing in the
 * UI has a sensible thing to draw for it, and an empty <input type="number">
 * yields `''`, which coerces to 0 through `Number()` and would silently become
 * a real stored value. Both collapse to null here, at the one place that
 * decides.
 *
 * ── REJECT, DO NOT ROUND ────────────────────────────────────────────────────
 * `3.7` is null, not 4 and not 3. Rounding invents a number the admin did not
 * type and then shows it back to them as if they had; the input is `step="1"`,
 * so a fraction only arrives from a payload that bypassed the form, which is
 * exactly when guessing is least appropriate.
 *
 * ── THE CAP IS 999, AND OUT OF RANGE IS null LIKE EVERYTHING ELSE ───────────
 * One rule, one outcome: anything this function cannot represent as a sensible
 * headcount comes back as null. 999 because the meta row it renders into is a
 * single compact line of chips — three digits is what fits without wrapping —
 * and because a training company hiring four figures for ONE posting is a typo
 * or a hostile payload, not a vacancy. It is a display-driven bound, stated
 * here rather than left implicit at the four render sites.
 *
 * PURE: no I/O, no React, no env, no Mongoose. That is what lets the write path
 * and the render sites share it without either dragging the other's world in.
 */

/** The largest headcount a single posting may declare. See the note above. */
export const MAX_HEADCOUNT = 999;

/**
 * @param {unknown} value anything: '', '  ', '3', 3, 3.7, null, undefined, {}
 * @returns {number|null} a positive integer <= MAX_HEADCOUNT, or null
 */
export function normalizeHeadcount(value) {
  // null / undefined / a missing field on a legacy document.
  if (value == null) return null;

  // Strings arrive from the form. Trim first, because '   ' is an empty input
  // that a user tabbed through, and `Number('   ')` is 0 — the exact coercion
  // this function exists to intercept.
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    // Number('') and Number('  ') are 0; Number('abc') is NaN. Both are
    // handled below, but the empty case is caught above so the two reasons
    // stay distinguishable to a reader.
    return normalizeHeadcount(Number(trimmed));
  }

  // Anything that is not a number by now — an object, an array, a boolean —
  // is not a headcount. `Number([])` is 0 and `Number([5])` is 5, so this is
  // checked BEFORE any coercion rather than after.
  if (typeof value !== 'number') return null;

  if (!Number.isFinite(value)) return null;   // NaN, Infinity
  if (!Number.isInteger(value)) return null;  // 3.7 — rejected, never rounded
  if (value < 1) return null;                 // 0 and negatives are "unset"
  if (value > MAX_HEADCOUNT) return null;     // out of range, same outcome

  return value;
}

/**
 * Should a headcount be rendered at all?
 *
 * A one-line wrapper, and it earns its place: every render site needs the
 * BOOLEAN and the VALUE, and the tempting shorthand at a call site is
 * `{recruit.headcount && <span>…</span>}` — which renders a literal `0` into
 * the markup when the field is 0, because `0 && x` is `0` and React prints it.
 * That is the classic version of this bug and it survives every "is it hidden?"
 * check written against the text.
 *
 * @param {unknown} value the raw stored value
 * @returns {boolean}
 */
export function hasHeadcount(value) {
  return normalizeHeadcount(value) !== null;
}

/**
 * The Thai label as it renders in the meta row, or null when there is nothing
 * to say.
 *
 * The STRING lives here, next to the rule that decides whether it appears, so
 * the three surfaces that show it cannot drift into three wordings. Returning
 * null rather than '' is deliberate: '' is falsy but still a string, and a call
 * site that forgot to check would render an empty element — the icon and the
 * gap with no text, which is the defect this feature's brief calls out by name.
 *
 * @param {unknown} value the raw stored value
 * @returns {string|null}
 */
export function headcountLabel(value) {
  const n = normalizeHeadcount(value);
  return n === null ? null : `จำนวน ${n} ตำแหน่ง`;
}
