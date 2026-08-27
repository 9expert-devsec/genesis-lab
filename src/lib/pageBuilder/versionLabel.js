/**
 * How a version is NAMED — one definition, round 35.
 *
 * PURE: no db, no models, no React, no next/*. Two callers already need the
 * identical answer (the history list and its restore confirmation) and step 5's
 * published-version view will be a third, so the decision below is made once
 * rather than re-made per surface.
 *
 * ── THE UNNUMBERED ROW IS THE NORMAL CASE, NOT AN ERROR ───────────────────
 * `versionNumber` is null on every row written before round 35, and stays null
 * until scripts/backfill-page-version-numbers.mjs runs. On a database where the
 * backfill has NOT been run, that is EVERY row.
 *
 * So the fallback is not a corner: it is the default state, and it decides what
 * an un-migrated deployment looks like. Three candidates were considered:
 *
 *   · "เวอร์ชัน undefined" — the bug this module exists to make unrepresentable.
 *   · "เวอร์ชัน —" on every row — reads as data that failed to load. On a
 *     partially-backfilled page it is worse still: some rows numbered, some
 *     dashed, and nothing says the dash means "older than the feature".
 *   · OMIT the segment — the row keeps its date, its label and its actor, which
 *     is exactly what it showed before this round. An un-migrated deployment
 *     therefore degrades to round 34's rendering rather than to a broken one.
 *
 * The third is taken. A number that does not exist is not displayed as a blank
 * number; it is simply not displayed.
 *
 * ── WHAT COUNTS AS A NUMBER ───────────────────────────────────────────────
 * `Number.isInteger` and `> 0`, not a truthiness test. Three values must all
 * fall to the fallback and a truthy check gets one of them wrong: `null` and
 * `undefined` (unnumbered), and `0` — which no publish can mint, because the
 * counter is `$inc`-ed BEFORE it is stamped, so the first version is 1. A `0`
 * in the data means something upstream is broken, and rendering "เวอร์ชัน 0"
 * would present that as a fact.
 */

/** Is this a version number the UI may show? */
export function hasVersionNumber(version) {
  const n = version?.versionNumber;
  return Number.isInteger(n) && n > 0;
}

/**
 * The version's name, or '' when it has none.
 *
 * Thai, to match every other string on this surface. The requirement's mockup
 * writes "Version 8"; the surrounding UI is Thai-first throughout — the status
 * badge, the draft chip, the restore button, the empty-history sentence — so
 * an English label here would be the only one, for the one element an author
 * reads most often. "เวอร์ชัน" is the same word the requirement's own Thai
 * prose uses.
 */
export function versionName(version) {
  return hasVersionNumber(version) ? `เวอร์ชัน ${version.versionNumber}` : '';
}
