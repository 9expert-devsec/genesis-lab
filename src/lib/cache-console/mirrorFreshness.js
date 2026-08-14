/**
 * Freshness arithmetic for the four row-level mirror collections
 * (career_paths, faqs, instructors, promotions).
 *
 * Dependency-free so it is unit-testable without Mongo. The reader passes in
 * whatever `synced_at` values it read; this decides what they mean.
 *
 * ── WHAT `synced_at` CAN AND CANNOT SAY ─────────────────────────────────────
 * Each sync stamps `synced_at` on every row it touches (syncCareerPaths.js:84,
 * syncFaqs.js:51, syncInstructors.js:37, syncPromotions.js:94). There is no
 * per-collection status document anywhere, and no cron route writes any model —
 * so a run that FAILED leaves the collection exactly as a run that never
 * happened left it. `newest` is therefore "when a sync last succeeded at
 * touching at least one row", and nothing stronger. The console must say that
 * in words; it is classified INFERRED in the inventory for exactly this reason.
 *
 * ── WHY "OLDER THAN NEWEST" IS THE USEFUL NUMBER ────────────────────────────
 * None of the four syncs deletes: verified across all four files, there is no
 * deleteMany, no deleteOne, no findOneAndDelete, and no "mark inactive" pass.
 * A record removed upstream keeps its row forever with a frozen `synced_at`.
 * Since a healthy sync stamps every row it saw with the SAME timestamp, a row
 * carrying an older one is a row the last sync did not see — which is the only
 * signal available that it may no longer exist upstream.
 *
 * It is a signal, not a verdict, and the UI must not present it as one. A row
 * can also lag because the sync partially failed, or because it was written by
 * an admin action rather than a sync. `staleRows` counts rows, it does not
 * diagnose them.
 */

/** Milliseconds of clock skew tolerated when grouping rows into one "run". */
const RUN_TOLERANCE_MS = 1000;

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * @param {Array<{synced_at?: Date|string|null}>} rows
 * @returns {{
 *   count: number,
 *   newest: string|null,
 *   staleRows: number,
 *   neverSynced: number,
 * }}
 */
export function summariseMirror(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const count = list.length;

  const times = list.map((r) => toTime(r?.synced_at));
  // A row with no parseable `synced_at` is counted separately rather than
  // folded into `staleRows`: "never stamped" and "stamped by an older run" are
  // different facts, and only the second one implies a sync ran without it.
  const neverSynced = times.filter((t) => t === null).length;
  const stamped = times.filter((t) => t !== null);

  if (stamped.length === 0) {
    return { count, newest: null, staleRows: 0, neverSynced };
  }

  const max = Math.max(...stamped);
  // Tolerance, because one sync writes its rows in a loop and the timestamps
  // can differ by a few milliseconds even though they belong to one run — the
  // shaped payloads take a single `syncedAt` per run (e.g. syncFaqs.js:36), but
  // reading them back through Mongo's date precision is not worth trusting to
  // the millisecond.
  const staleRows = stamped.filter((t) => max - t > RUN_TOLERANCE_MS).length;

  return {
    count,
    newest: new Date(max).toISOString(),
    staleRows,
    neverSynced,
  };
}
