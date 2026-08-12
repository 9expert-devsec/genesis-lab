/**
 * THE DOWNGRADE GUARD — on the write path, not on a button.
 *
 * A sync that would replace a stored snapshot with a materially smaller one
 * does not write. It records what it refused, with both counts, and leaves the
 * stored snapshot exactly as it was.
 *
 * ── WHY THE WRITE PATH AND NOT THE CALLERS ──────────────────────────────────
 * The invariant belongs to the write. `syncLandingData` has four callers — the
 * cron route, the admin sync route, the trigger wrapper, and the webhook's
 * background resync — and b10bd54 is the standing evidence for what happens
 * when an invariant is spread across call sites instead: `revalidatePath`
 * ended up in one writer of four and the other three shipped stale pages for
 * months. Putting the guard in the sync means every caller gets it and there is
 * no third site to forget.
 *
 * ── GROWTH ALWAYS WRITES, AND THAT IS LOAD-BEARING ──────────────────────────
 * The guard only ever blocks SHRINKAGE. A run that grows a section, or matches
 * it, writes normally. That is not leniency — it is the repair path. A bad
 * snapshot republishes itself every cycle, so the only thing that can fix one
 * is a fully healthy run, and a guard that blocked writes generally would lock
 * the bad snapshot in permanently.
 *
 * ── COUNTS COME FROM THE PAYLOAD, NEVER FROM THE STORED `sections` ──────────
 * MEASURED, and it is a live inconsistency in the current writer: on a total
 * failure syncLandingData sets `dataToWrite = previousDoc.data` (preserving the
 * last-known-good payload) but still writes the NEW, zeroed `sections` counters
 * alongside it. So a stored snapshot can hold 27 programs while its own
 * `sections.programs` says 0.
 *
 * A guard reading `sections` would therefore compare against zeros, conclude
 * nothing could shrink, and wave through exactly the run it exists to stop.
 * `sectionCountsOf` counts the arrays in `data` because `data` is what the home
 * page renders and is the only description of the snapshot that cannot be out
 * of step with itself.
 */

/**
 * ── THE THRESHOLD, AND WHY IT IS NOT ROUND 3'S 20% ──────────────────────────
 *
 * Round 3's COLLAPSE_SHRINK_RATIO governs MIRROR ROW COUNTS — collections of
 * 10 to 31 rows that change only when a record is created or deleted upstream.
 * 20% there is 2 to 6 rows, which is comfortably more than routine churn.
 *
 * Snapshot SECTIONS are a different kind of quantity and reusing the number
 * because it exists would be the mistake. They are small (banners 3-5, skills
 * ~9, newCourses 8) and they are edited constantly and legitimately: an admin
 * deactivating one banner moves a 5-item section by 20% on its own. At round
 * 3's threshold this guard would refuse the sync after an ordinary content
 * edit, and a guard that refuses constantly gets its threshold raised until it
 * does nothing.
 *
 * 50% is where "an editor changed something" stops being a plausible
 * explanation. Half a section disappearing is not a toggle. The incident this
 * exists for — 22 of 27 programs, 81% — clears it comfortably, and so does any
 * section collapsing to empty, which is 100% by construction and is the shape
 * that puts `ไม่สามารถโหลดรายการได้ในขณะนี้` on a live public page.
 *
 * ONE named constant, distinct from round 3's, so the two can be argued with
 * separately — which is the point, since they are not the same quantity.
 */
export const SNAPSHOT_SECTION_SHRINK_RATIO = 0.5;

export const DOWNGRADE_VERDICT = Object.freeze({
  OK: 'ok',
  REFUSE_DOWNGRADE: 'refuse-downgrade',
});

/**
 * Count every array-valued section of a snapshot payload.
 *
 * Shape-agnostic on purpose: it counts whatever arrays the payload holds rather
 * than naming landing_cache's six sections, so the same guard serves
 * nav_menu_cache — whose payload is two maps of groups — without a second
 * implementation that could drift. A non-array value is not a section and is
 * skipped rather than counted as 1.
 */
export function sectionCountsOf(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) out[key] = value.length;
    // nav_menu_cache stores `{ [id]: {...} }` maps rather than arrays; the
    // number of groups is the comparable quantity.
    else if (value && typeof value === 'object') out[key] = Object.keys(value).length;
  }
  return out;
}

/**
 * Would writing `incoming` over `stored` be a material downgrade?
 *
 * @param {object} storedCounts   sections of the snapshot currently stored
 * @param {object} incomingCounts sections of the snapshot about to be written
 * @param {boolean} allowShrink   an admin override, explicitly confirmed
 *
 * ── NO STORED SNAPSHOT MEANS NO REFUSAL ─────────────────────────────────────
 * The first run on an empty database, or after the document was lost, has
 * nothing to protect and everything to establish. Refusing there would leave
 * the site with no snapshot, which Ruling 1 forbids outright.
 *
 * ── A SECTION MISSING FROM `incoming` IS NOT A SHRINK TO ZERO ───────────────
 * It is a shape change, and treating an absent key as 0 would refuse every run
 * after a section is legitimately renamed or removed from the payload. Only
 * sections present on BOTH sides are compared; a section that vanishes from the
 * shape is reported separately so it is visible rather than silently ignored.
 */
export function assessDowngrade({ storedCounts, incomingCounts, allowShrink = false } = {}) {
  const stored = storedCounts ?? {};
  const incoming = incomingCounts ?? {};

  const storedKeys = Object.keys(stored);
  if (storedKeys.length === 0) {
    return {
      verdict: DOWNGRADE_VERDICT.OK,
      shrunk: [],
      vanished: [],
      reason: '',
      hadStoredSnapshot: false,
    };
  }

  const shrunk = [];
  const vanished = [];

  for (const key of storedKeys) {
    const before = Number(stored[key]) || 0;
    if (!(key in incoming)) {
      if (before > 0) vanished.push(key);
      continue;
    }
    const after = Number(incoming[key]) || 0;
    // `before <= 0` only — the growth case needs no clause of its own. A
    // section that grew or matched yields a zero-or-negative ratio, which no
    // positive threshold can exceed, so an explicit `after >= before` guard
    // would be a SECOND expression of one rule. Removing a redundant guard was
    // verified to redden nothing, and the runner's own note on that says to
    // single-source the rule rather than manufacture a test that can see the
    // difference. What "growth always writes" rests on is the sign of this
    // ratio, and that is asserted directly.
    if (before <= 0) continue;
    const ratio = (before - after) / before;
    if (ratio > SNAPSHOT_SECTION_SHRINK_RATIO) {
      shrunk.push({ section: key, before, after, lost: before - after, ratio });
    }
  }

  if (shrunk.length === 0) {
    return {
      verdict: DOWNGRADE_VERDICT.OK, shrunk, vanished, reason: '', hadStoredSnapshot: true,
    };
  }

  const detail = shrunk
    .map((s) => `${s.section} ${s.before} → ${s.after} (-${Math.round(s.ratio * 100)}%)`)
    .join(', ');

  if (allowShrink) {
    return {
      verdict: DOWNGRADE_VERDICT.OK,
      shrunk,
      vanished,
      reason: '',
      hadStoredSnapshot: true,
      overridden: true,
    };
  }

  return {
    verdict: DOWNGRADE_VERDICT.REFUSE_DOWNGRADE,
    shrunk,
    vanished,
    hadStoredSnapshot: true,
    reason:
      `สแนปช็อตใหม่เล็กลงมากเกินเกณฑ์ ${Math.round(SNAPSHOT_SECTION_SHRINK_RATIO * 100)}% `
      + `จึงไม่เขียนทับของเดิม: ${detail} `
      + '(refused: the incoming snapshot is materially smaller; the stored one is untouched)',
  };
}

/** Does this verdict permit the snapshot write? */
export function permitsSnapshotWrite(verdict) {
  return verdict === DOWNGRADE_VERDICT.OK;
}

/**
 * The record a refusal leaves behind, for the console to render and the admin
 * to override from.
 *
 * ── THE ANSWER TO "WHAT HAPPENS ON THE NEXT RUN" ────────────────────────────
 * This is written with `$set` on a single `lastRefusal` field, so a refusal is
 * REPLACED rather than appended. The chosen behaviour, stated so it is a
 * decision rather than an emergent property:
 *
 *   A refusal PERSISTS and is RE-EVALUATED every run. It never expires on a
 *   timer and never auto-clears. Each subsequent run that would still shrink
 *   refuses again and overwrites this record, so the console shows one current
 *   refusal rather than a growing list and the cron log does not flood.
 *
 *   It clears in exactly two ways:
 *     · a run whose snapshot is NOT materially smaller writes normally, and
 *       writing clears it — the world recovered on its own;
 *     · an admin overrides from /admin/cache, which writes once with the guard
 *       bypassed — the shrinkage was legitimate.
 *
 * The alternative — auto-expiring after N runs — was rejected: it would let the
 * bad snapshot land on the second attempt, which is the guard defeating itself
 * on a timer. The cost of the chosen behaviour is that a LEGITIMATE shrinkage
 * blocks the sync until someone clicks, and that cost is the override's whole
 * reason for existing.
 */
export function buildRefusalRecord({ assessment, incomingCounts, at, actor = 'system:cron' }) {
  return {
    at,
    actor,
    storedSections: undefined, // set by the caller from the payload it read
    incomingSections: incomingCounts,
    shrunk: assessment.shrunk,
    vanished: assessment.vanished,
    reason: assessment.reason,
  };
}
