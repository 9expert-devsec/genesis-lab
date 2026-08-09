/**
 * Row-level health checks for the audit log — PURE.
 *
 * ── WHY THESE LIVE ON THE PAGE AND NOT IN A SCRIPT ──────────────────────────
 * Every check here is one that would otherwise have been a throwaway
 * verification script: run once, pass, never run again. Instead they run every
 * time anyone opens the page, forever, against whatever the sweep has written
 * since. A script nobody runs verifies nothing.
 *
 * Two of them cannot be a unit test at all, which is the point:
 *
 *   · SAME_BEFORE_AFTER is the `new: false` → `new: true` defect. Four status
 *     actions depend on that flag to capture the PREVIOUS value; flipping any
 *     back makes `before` the post-update document, so every row reads X → X.
 *     Reverting the flag was verified to redden NOTHING in the suite — it is
 *     invisible to a text guard by construction. §8.7 specifies this tripwire.
 *
 *   · POLICY_VIOLATION is the only continuous check that round 2's PII
 *     reduction actually holds against real writes. A unit test proves
 *     `reducePayload` is correct; only this proves nothing bypassed it.
 *
 * Levels: 'red' = something is wrong now. 'amber' = something to look at, and
 * possibly a legitimate no-op.
 */

import { pairContract, DIFF_POLICY_RANK, ORDERED_IDS_POLICY } from '@/lib/audit/auditContract';

export const HEALTH = Object.freeze({
  BAD_MENU:          'bad_menu',
  SAME_BEFORE_AFTER: 'same_before_after',
  POLICY_VIOLATION:  'policy_violation',
  LABEL_READ_FAILED: 'label_read_failed',
  ORPHAN_SIDECAR:    'orphan_sidecar',
});

export const HEALTH_LEVEL = Object.freeze({
  [HEALTH.BAD_MENU]:          'red',
  [HEALTH.SAME_BEFORE_AFTER]: 'amber',
  [HEALTH.POLICY_VIOLATION]:  'red',
  [HEALTH.LABEL_READ_FAILED]: 'amber',
  [HEALTH.ORPHAN_SIDECAR]:    'amber',
});

/** Thai, like every other label on this surface. */
export const HEALTH_LABEL = Object.freeze({
  [HEALTH.BAD_MENU]:          'เมนูไม่รู้จัก — call site ส่ง key ผิด',
  [HEALTH.SAME_BEFORE_AFTER]: 'ก่อน/หลัง เหมือนกัน — แถวนี้บอกว่าไม่มีอะไรเปลี่ยน',
  [HEALTH.POLICY_VIOLATION]:  'payload เกินนโยบาย diff ของคู่นี้',
  [HEALTH.LABEL_READ_FAILED]: 'อ่าน label ไม่สำเร็จตอนลบ',
  [HEALTH.ORPHAN_SIDECAR]:    'ScheduleLocal ตกค้าง (ลบไม่สำเร็จ)',
});

/**
 * Order-insensitive structural equality, on values that have already been
 * through JSON — which everything read from Mongo has.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/**
 * What shape does this payload actually carry?
 *
 * Mirrors `reducePayload` in reverse: given a stored `before`/`after`, work out
 * the most permissive policy that could have produced it. A row carrying more
 * than its pair permits means the reduction was bypassed.
 */
function observedShape(value) {
  if (value === null || value === undefined) return 'act_only';
  if (typeof value !== 'object' || Array.isArray(value)) return 'full';
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === 'status') return 'status_only';
  if (keys.length === 1 && keys[0] === 'orderedIds') return ORDERED_IDS_POLICY;
  return 'full';
}

/**
 * Does this row's payload exceed what its (menu, entity) pair permits?
 *
 * An UNREGISTERED pair is capped at act_only by the writer's fail-closed
 * branch, so any payload on one is a violation — and a visible one, which is
 * the symptom a typo'd free-form `entity` otherwise never gets.
 */
function exceedsPolicy(row) {
  const contract = pairContract(row?.menu, row?.entity);
  const policy = contract?.diff ?? 'act_only';

  for (const field of ['before', 'after']) {
    const shape = observedShape(row?.[field]);
    if (shape === 'act_only') continue; // carries nothing; always permitted

    if (policy === ORDERED_IDS_POLICY) {
      if (shape !== ORDERED_IDS_POLICY) return true;
      continue;
    }
    if (shape === ORDERED_IDS_POLICY) return true; // an ordering under a ranked policy

    const allowed = DIFF_POLICY_RANK[policy];
    const carried = DIFF_POLICY_RANK[shape];
    if (allowed === undefined || carried === undefined) return true;
    if (carried > allowed) return true;
  }
  return false;
}

/**
 * Every health flag on one row. Returns an array of HEALTH keys, empty when the
 * row is fine.
 */
export function rowHealth(row) {
  const flags = [];
  if (!row) return flags;

  // A call site passed a menu key the registry does not know. `menuRaw` holds
  // what it passed, so the offending caller is findable by query.
  if (row.menu === 'unknown' || (row.menuRaw ?? '') !== '') flags.push(HEALTH.BAD_MENU);

  // Nothing changed — see the header. Only meaningful when the row claims to
  // carry a diff at all; two nulls are an act_only row doing its job.
  if (row.before != null && row.after != null && deepEqual(row.before, row.after)) {
    flags.push(HEALTH.SAME_BEFORE_AFTER);
  }

  if (exceedsPolicy(row)) flags.push(HEALTH.POLICY_VIOLATION);

  if (row.meta?.labelReadFailed === true) flags.push(HEALTH.LABEL_READ_FAILED);
  if (row.meta?.sidecarDeleted === false) flags.push(HEALTH.ORPHAN_SIDECAR);

  return flags;
}

/** Count each flag across a page of rows, for the summary strip. */
export function summariseHealth(rows = []) {
  const counts = Object.fromEntries(Object.values(HEALTH).map((k) => [k, 0]));
  let flaggedRows = 0;
  for (const row of rows) {
    const flags = rowHealth(row);
    if (flags.length) flaggedRows += 1;
    for (const f of flags) counts[f] += 1;
  }
  return { counts, flaggedRows, total: rows.length };
}
