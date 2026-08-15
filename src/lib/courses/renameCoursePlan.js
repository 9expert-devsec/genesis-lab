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
export function detectPartialRename({ oldCounts = {}, newCounts = {} } = {}) {
  const oldStores = RENAME_WRITE_STORES.filter((k) => (oldCounts[k] ?? 0) > 0);
  const newStores = RENAME_WRITE_STORES.filter((k) => (newCounts[k] ?? 0) > 0);

  let state;
  if (oldStores.length && newStores.length) state = 'partial';
  else if (oldStores.length) state = 'not-started';
  else if (newStores.length) state = 'complete';
  else state = 'empty';

  return {
    state,
    partial: state === 'partial',
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
