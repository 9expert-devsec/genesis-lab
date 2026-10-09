import { resolveScheduleStatusBatch } from '@/lib/schedule-status';

/**
 * ── THE LIVE STATUS OF EVERY ROUND A BUNDLE OFFERS ─────────────────────────
 *
 * Flattens the resolver's per-item rounds into the `{ roundId: {status, dates} }`
 * map `bundleRoundChoice` takes, with the admin override layer applied.
 *
 * ── WHY THIS MODULE EXISTS: TWO CALLERS THAT MUST NOT DISAGREE ────────────
 * The wizard decides what an applicant may pick; the registration route decides
 * what it will accept. If those two assemble the status map differently, the
 * wizard offers a round the server refuses — a dead end the applicant cannot
 * get out of, created entirely by us. One function, called by both.
 *
 * ── THE OVERRIDE LAYER WAS MISSING, AND THAT WAS A REAL GAP ──────────────
 * `bundleRoundChoice`'s own docstring said its statuses arrive "already through
 * `resolveScheduleStatusBatch`". Nothing in the bundle path did that. MEASURED
 * by grep across `lib/pageBuilder`, the wizard and the route: zero callers. So
 * an admin who closed a round through `ScheduleStatus` — the override the
 * course detail page and the public registration action both honour — changed
 * nothing for a bundle. The round stayed pickable and the quotation went
 * through.
 *
 * That is exactly what R4 forbids ("closed/cancelled … not pickable, live
 * status only"), so the claim is made true here rather than deleted from the
 * docstring.
 *
 * ── IT FAILS OPEN ON THE OVERRIDE LOOKUP, DELIBERATELY ───────────────────
 * `resolveScheduleStatusBatch` touches Mongo. If that read throws, the upstream
 * statuses are used unchanged rather than the whole bundle being refused: an
 * override is a NARROWING of what MSDB already said, so losing it leaves the
 * site exactly as correct as it was before overrides existed — whereas failing
 * closed would take a working promotion offline because a secondary collection
 * was briefly unreachable. The server still re-checks at submit, so the worst
 * case is an applicant told at submit rather than at pick.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 * It does not read a stored `roundSnapshot`. The snapshot carries no status by
 * design, and a round MSDB no longer returns must read as `closed` rather than
 * as whatever it was when the author picked it — which is what
 * `bundleRoundChoice` does for an id that is absent from this map.
 *
 * @param {Array<object>} resolved `resolveSectionData`'s slice for the section:
 *   one entry per item, each with a `rounds` array of live MSDB rows.
 * @returns {Promise<Record<string, {status: string|undefined, dates: Array}>>}
 */
export async function bundleLiveStatusById(resolved) {
  const rows = [];
  const seen = new Set();
  for (const entry of Array.isArray(resolved) ? resolved : []) {
    for (const row of Array.isArray(entry?.rounds) ? entry.rounds : []) {
      const id = String(row?._id ?? '').trim();
      // De-duped: one course may legitimately appear in two bundles on a page,
      // and `resolveScheduleStatusBatch` would otherwise be handed the same id
      // twice. First writer wins, the same rule `liveById` uses.
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  if (!rows.length) return {};

  let effective = rows;
  try {
    effective = await resolveScheduleStatusBatch(rows);
  } catch {
    // See the note above: an override is a narrowing, so its absence is the
    // pre-override behaviour and not a reason to refuse the bundle.
    effective = rows;
  }

  const out = {};
  for (const row of Array.isArray(effective) ? effective : rows) {
    const id = String(row?._id ?? '').trim();
    if (id) out[id] = { status: row?.status, dates: row?.dates };
  }
  return out;
}
