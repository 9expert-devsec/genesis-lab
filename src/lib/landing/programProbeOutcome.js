/**
 * Which programs the home page's Programs tab should list, and — crucially —
 * which ones we simply do not know about.
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 * The sync probed upstream once per program and kept those with ≥1 public
 * course. Everything else was dropped, and "everything else" quietly merged two
 * different facts:
 *
 *   "this program has no public courses"   confirmed — correctly excluded
 *   "the probe did not tell us"            unknown   — ALSO excluded, which is
 *                                                      data loss wearing the
 *                                                      costume of a result
 *
 * A tab that went empty therefore looked exactly like a tab that was supposed
 * to be empty. Observed: the snapshot held 25 programs at 10:00 and 8 at 08:36,
 * from the same upstream, with `syncErrors` empty on both runs.
 *
 * ── THERE ARE TWO WAYS TO NOT KNOW, AND ONLY ONE THROWS ─────────────────────
 * The obvious one is a REJECTED probe — a timeout or a non-2xx, which `aiFetch`
 * turns into a throw. That was at least recorded.
 *
 * The other one is silent, and is the more likely cause of what was seen:
 * `unwrap()` (lib/api/client.js:95) returns `{ items: [] }` for ANY response it
 * cannot read — a null body, a changed envelope, anything where `response.items`
 * is not an array. Nothing rejects. The probe reports zero courses, the program
 * is dropped as "confirmed empty", and no error is recorded anywhere. That is
 * why the runs that lost 17 programs still wrote `syncErrors: []`.
 *
 * So a zero is only trustworthy if a SECOND signal agrees. The full public
 * course list is already fetched in the same sync; if it contains a course
 * belonging to a program whose probe said zero, the two disagree and the answer
 * is UNKNOWN, not empty. Measured against live data: the course list yields
 * exactly the same 25 programs the probes do, so the cross-check costs nothing
 * and no extra request.
 *
 * ── WHAT UNKNOWN MEANS, AND WHAT IT DOES NOT ────────────────────────────────
 * Unknown falls back to the LAST KNOWN GOOD answer for that program: if the
 * previous snapshot listed it, it stays listed; if it did not, it stays out.
 *
 * NOT fail-open. A program whose courses are unknown is never included on the
 * strength of not knowing — that ships a card leading to an empty page, which
 * is worse than one missing card. Unknown only ever preserves what was already
 * true.
 */

/** @typedef {'has'|'empty'|'unknown'} ProbeOutcome */

export const PROBE_HAS = 'has';
export const PROBE_EMPTY = 'empty';
export const PROBE_UNKNOWN = 'unknown';

/**
 * What one probe actually established.
 *
 * @param {object}  probe
 * @param {boolean} probe.rejected            the call threw
 * @param {number}  [probe.itemCount]         courses it reported
 * @param {boolean} [probe.referencedByCourses] the full course list shows this
 *        program owning at least one course — the second opinion on a zero
 * @returns {ProbeOutcome}
 */
export function classifyProbe({ rejected, itemCount = 0, referencedByCourses = false }) {
  if (rejected) return PROBE_UNKNOWN;
  if (itemCount > 0) return PROBE_HAS;
  // A zero contradicted by the course list is not a zero we can act on.
  return referencedByCourses ? PROBE_UNKNOWN : PROBE_EMPTY;
}

/**
 * The program list to publish, plus what to say about the gaps.
 *
 * @param {object} input
 * @param {Array<{id:string, program:object, outcome:ProbeOutcome, reason?:string}>} input.rows
 * @param {string[]} [input.previousIds] program ids the PREVIOUS snapshot published
 * @returns {{ programs:object[], errors:string[], allUnknown:boolean, counts:object }}
 */
export function composeProgramList({ rows = [], previousIds = [] } = {}) {
  const previous = new Set(previousIds.map(String));
  const programs = [];
  const errors = [];
  const counts = { has: 0, empty: 0, unknown: 0, restored: 0 };

  for (const row of rows) {
    if (row.outcome === PROBE_HAS) {
      counts.has += 1;
      programs.push(row.program);
      continue;
    }
    if (row.outcome === PROBE_EMPTY) {
      counts.empty += 1;
      continue;
    }

    // Unknown. Say so on every run — a run that drops programs while reporting
    // nothing is what made this invisible for hours.
    counts.unknown += 1;
    const kept = previous.has(String(row.id));
    if (kept) {
      counts.restored += 1;
      programs.push(row.program);
    }
    errors.push(
      `programProbeUnknown:${row.id}: ${row.reason ?? 'unknown'}`
      + ` — ${kept ? 'kept from previous snapshot' : 'not in previous snapshot, omitted'}`
    );
  }

  return {
    programs,
    errors,
    // Only meaningful when there was something to probe.
    allUnknown: rows.length > 0 && counts.unknown === rows.length,
    counts,
  };
}
