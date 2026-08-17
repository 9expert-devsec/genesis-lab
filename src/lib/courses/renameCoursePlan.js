/**
 * The rename's DECISIONS: may it run, does it still agree with the preview, and
 * is a previous attempt half-finished.
 *
 * Pure — no model, no database, no cache API, and (the one that matters this
 * round) NO UPSTREAM CLIENT. Phase 1 writes Mongo and nothing else; the tech
 * lead changes `course_id` in MSDB himself afterwards. That property is
 * asserted structurally over the whole import closure in
 * test/fs/renameNoUpstreamWrite, not promised here.
 */

import { normalizeCourseCode } from './courseOrder';
import { RENAME_STORES } from './renameCoursePreview';

/** Stores phase 1 writes — everything the preview lists that is not historical. */
export const RENAME_WRITE_STORES = Object.freeze(
  RENAME_STORES.filter((s) => !s.historical).map((s) => s.key)
);

const clean = (v) => String(v ?? '').trim();

/**
 * ── THE PREVIEW TOKEN — HOW "PREVIEW FIRST" IS ENFORCED ────────────────────
 *
 * A boolean flag (`confirmed: true`) enforces nothing: a caller who never
 * previewed can pass it. A nonce handed out by the preview and stored
 * server-side would work but needs a store and an expiry for a two-step flow
 * that already has both sides in one request path.
 *
 * So the token is a FINGERPRINT OF THE PREVIEW'S MATERIAL FACTS — the two
 * codes and the per-store row counts the preview reported. The action
 * recomputes the preview from live data, derives the fingerprint itself, and
 * refuses unless the caller's matches.
 *
 * That single mechanism does BOTH jobs the round asks for:
 *
 *   · PREVIEW FIRST. The fingerprint cannot be produced without the counts,
 *     and the counts cannot be produced without reading every store — which is
 *     what the preview is. There is no constant to guess and no flag to set.
 *   · COMPARE AGAINST THE PREVIEW. If anything moved between the preview and
 *     the write — a course added to the group, an article pinned, a promo link
 *     created — the recomputed fingerprint differs and the write STOPS. Not a
 *     warning: the admin agreed to a specific blast radius and the radius
 *     changed.
 *
 * Deliberately NOT a cryptographic signature. There is no secret to protect:
 * the guard is against acting on stale or absent information, not against a
 * forger — and every caller is already an authenticated admin. A hash that
 * looked cryptographic would invite someone to trust it as one.
 */
export function previewFingerprint({ oldCode, newCode, counts } = {}) {
  const from = normalizeCourseCode(oldCode);
  const to = normalizeCourseCode(newCode);
  // Sorted by key so the fingerprint is stable regardless of read order, and
  // EVERY write store appears — a store missing from `counts` contributes
  // 'null', which is distinct from '0'. "Nobody looked" must not fingerprint
  // the same as "nothing to change".
  const body = RENAME_WRITE_STORES
    .slice()
    .sort()
    .map((key) => `${key}=${counts?.[key] ?? 'null'}`)
    .join('&');
  return `${from}>${to}|${body}`;
}

/** The counts a preview reports, keyed for the fingerprint. */
export function countsFromPreview(preview) {
  const out = {};
  for (const store of preview?.stores ?? []) out[store.key] = store.count;
  return out;
}

/**
 * Is `code` taken — by a live code, or by a code somebody used to have?
 *
 * ── FORMER CODES COUNT AS TAKEN, AND THAT IS THE POINT ─────────────────────
 * Reusing a retired code resurrects an ambiguity that is still reachable: an
 * old link, an old quotation, and `/search`'s formerCodes match would now
 * point at a DIFFERENT course than the one the customer meant. The whole
 * reason formerCodes exists is that the old code still means something.
 *
 * Case-insensitive, because upstream `course_id` has no canonical casing.
 * Returns the STORED spelling so a refusal can name what it hit.
 *
 * @returns {{taken: boolean, where: string|null, matched: string|null}}
 */
export function codeTaken(code, { liveCodes = [], formerCodes = [], exceptCode = '' } = {}) {
  const wanted = clean(code).toLowerCase();
  if (!wanted) return { taken: false, where: null, matched: null };
  const self = clean(exceptCode).toLowerCase();

  for (const c of liveCodes) {
    const v = clean(c);
    if (v.toLowerCase() === wanted && v.toLowerCase() !== self) {
      return { taken: true, where: 'live', matched: v };
    }
  }
  for (const c of formerCodes) {
    const v = clean(c);
    // A course's OWN former code is not a collision — renaming back to a code
    // this same course used to hold is a legitimate undo.
    if (v.toLowerCase() === wanted && v.toLowerCase() !== self) {
      return { taken: true, where: 'former', matched: v };
    }
  }
  return { taken: false, where: null, matched: null };
}

/**
 * Is a rename half-finished?
 *
 * ── THE PART THAT MATTERS, BECAUSE NOBODY RESUMES WHAT THEY CANNOT SEE ─────
 * Every step below is idempotent, so re-running an interrupted rename is safe.
 * That is worth nothing if the interruption is invisible — the admin sees a
 * failed request and has no way to tell whether it wrote nothing, everything,
 * or the first four stores.
 *
 * Detection needs no bookkeeping table: run the preview TWICE, once for the old
 * code and once for the new, and compare.
 *
 *   old has rows, new has none   → not started
 *   old has none, new has rows   → complete (for genesis; MSDB is phase 2)
 *   BOTH have rows               → HALF FINISHED, and the stores that still
 *                                  hold the old code are named
 *   neither has rows             → nothing keyed on either code at all
 *
 * The named list is what makes it resumable in practice: re-running the rename
 * moves exactly those and no-ops the rest.
 */
/**
 * Every state the two sides can be in together.
 *
 * ── WHY THE UPSTREAM AXIS EXISTS ───────────────────────────────────────────
 * The genesis counts alone cannot tell `complete` from the interval: both look
 * like "every genesis row is on the new code". Before upstream was consulted
 * this function returned `complete` for a rename whose MSDB half had never
 * happened — the screen reporting success on exactly the failure it exists to
 * catch.
 */
export const RENAME_STATE = Object.freeze({
  /** Nothing has moved. Both sides on the old code. */
  NOT_STARTED: 'not-started',
  /** Phase 1 was interrupted — genesis rows on BOTH codes. */
  GENESIS_PARTIAL: 'genesis-partial',
  /** THE NORMAL INTERVAL: genesis done, MSDB still on the old code. */
  UPSTREAM_PENDING: 'genesis-done-upstream-pending',
  /** Both sides agree. This is the only state that means finished. */
  COMPLETE: 'complete',
  /** Upstream renamed, genesis untouched — the reverse of the interval. */
  UPSTREAM_ONLY: 'upstream-only',
  /** Upstream holds BOTH codes, as two different courses. The new one is taken. */
  UPSTREAM_CONFLICT: 'upstream-conflict',
  /** Upstream holds neither code. Nothing here can be reasoned about. */
  UNKNOWN: 'unknown',
});

/**
 * Which side, if either, has moved — and whether it can still be undone.
 *
 * ── THE REVERSIBILITY RULE, ESTABLISHED BY EXPERIMENT ──────────────────────
 * ZZTEST-EXCEL-01 was renamed to EXCEL-HR-01 in MSDB alone and back again on
 * 2026-08-16. Every predicted consequence occurred — the extension detached so
 * URL Alias, Tags and Gallery rendered empty, the course fell to the unlisted
 * tier and sorted first, and the rest of its group began numbering at 2
 * because position comes from the stored array, which still held the old code
 * at index 0 — and renaming MSDB back restored all of it instantly.
 *
 * So: WHILE GENESIS HAS NOT MOVED, THE DIVERGENCE IS FULLY REVERSIBLE by
 * touching MSDB alone. Once genesis has written, it is not — the reverse
 * rename is refused by its own collision and formerCodes guards.
 *
 * That is the single fact an admin needs to decide whether to go forward or
 * back, so it is part of the RETURN VALUE rather than something the reader is
 * left to infer from the state name.
 *
 * @param {object} input
 * @param {object} input.oldCounts genesis rows still on the old code, by store
 * @param {object} input.newCounts genesis rows already on the new code
 * @param {object} input.upstream  `preview.upstream` — `{hasOldCode, hasNewCode}`
 */
export function detectRenameState({ oldCounts = {}, newCounts = {}, upstream = null } = {}) {
  const oldStores = RENAME_WRITE_STORES.filter((k) => (oldCounts[k] ?? 0) > 0);
  const newStores = RENAME_WRITE_STORES.filter((k) => (newCounts[k] ?? 0) > 0);

  /** 'old' | 'new' | 'mixed' | 'none' — where the genesis rows are. */
  let genesis;
  if (oldStores.length && newStores.length) genesis = 'mixed';
  else if (oldStores.length) genesis = 'old';
  else if (newStores.length) genesis = 'new';
  else genesis = 'none';

  const hasOld = Boolean(upstream?.hasOldCode);
  const hasNew = Boolean(upstream?.hasNewCode);

  let state;
  if (hasOld && hasNew) {
    // Two different courses. Whatever genesis is doing, the target is taken.
    state = RENAME_STATE.UPSTREAM_CONFLICT;
  } else if (!hasOld && !hasNew) {
    state = RENAME_STATE.UNKNOWN;
  } else if (genesis === 'mixed') {
    // Reported ahead of the upstream axis: an interrupted phase 1 is the most
    // actionable thing on screen, and the fix is the same either way.
    state = RENAME_STATE.GENESIS_PARTIAL;
  } else if (hasNew) {
    // Upstream is already on the new code.
    state = genesis === 'new' ? RENAME_STATE.COMPLETE : RENAME_STATE.UPSTREAM_ONLY;
  } else {
    // Upstream still on the old code.
    state = genesis === 'new' ? RENAME_STATE.UPSTREAM_PENDING : RENAME_STATE.NOT_STARTED;
  }

  return {
    state,
    genesis,
    upstream: {
      hasOldCode: hasOld,
      hasNewCode: hasNew,
      // `null` and not `false`: nobody asked upstream, which is a different
      // claim from "upstream does not have it".
      read: upstream != null,
    },
    /**
     * Undoable by touching MSDB alone. True exactly while genesis has not
     * written — see the note above.
     */
    reversible: genesis === 'old' || genesis === 'none',
    partial: state === RENAME_STATE.GENESIS_PARTIAL,
    stillOnOldCode: oldStores,
    alreadyOnNewCode: newStores,
  };
}

/**
 * What actually got written, against what the preview promised.
 *
 * A divergence is a HARD STOP with the difference named — not a warning
 * appended to a success. The admin consented to a specific set of rows; if the
 * write touched a different number, the thing they agreed to is not the thing
 * that happened, and the only honest report is which store disagreed and by
 * how much.
 *
 * `expected` is the preview's counts; `actual` is what each step reported
 * modifying. A store the preview said was empty and the write also skipped
 * agrees at 0.
 */
export function diffAgainstPreview(expected = {}, actual = {}) {
  const divergences = [];
  for (const key of RENAME_WRITE_STORES) {
    const want = expected[key] ?? 0;
    const got = actual[key] ?? 0;
    if (want !== got) divergences.push({ store: key, expected: want, actual: got });
  }
  return { ok: divergences.length === 0, divergences };
}
