/**
 * The audit-log query builder — PURE.
 *
 * Its own module, not just its own export, and that distinction is the whole
 * point: `readAuditLog.js` imports `dbConnect`, which throws at module load
 * without `MONGODB_URI`, and a mongoose model, which would run `createIndexes`
 * on first use. Either import makes this file unreachable from the pure test
 * tier. Splitting the export was not enough — the split has to be the file.
 *
 * Every rule that must never be got wrong lives here: the permission clamp, the
 * refusal to widen, and the cursor shape. All three fail SILENTLY when broken —
 * a widened clamp shows rows nobody should see, a non-unique cursor drops rows
 * at page boundaries and the page still looks fine — so all three are tested
 * with no database and no session.
 *
 * Imports nothing but the pure RBAC predicate. Client-safe.
 */

import { menusForUser, canAccess } from '@/lib/rbac/access';
import { isDualKeySpace } from '@/lib/audit/auditContract';
import { isMenuSwept } from '@/lib/audit/sweptMenus';

/** Rows per page. Cursor-paginated, so this is a page size, not a ceiling. */
export const AUDIT_PAGE_SIZE = 50;

/**
 * How many distinct `action` values the filter dropdown will show.
 *
 * The field is free-form by design, so this set grows with the admin and cannot
 * be hardcoded — live data already contains `preview.enable`, which appears in
 * neither model docstring's suggested vocabulary.
 */
export const ACTION_FACET_LIMIT = 100;

/**
 * The sort every audit query uses.
 *
 * ── MEASURED, NOT ASSUMED — explain() against production, 2026-07-31 ────────
 * AdminAuditLog.js asks for confirmation that the non-superadmin query plans a
 * SORT_MERGE rather than a blocking in-memory sort. IT DOES NOT, and the reason
 * is the `_id` key right here:
 *
 *   sort({createdAt:-1})           → LIMIT ← FETCH ← SORT_MERGE ← 6× IXSCAN   ✅
 *   sort({createdAt:-1, _id:-1})   → SORT ← FETCH ← IXSCAN [menu_1_createdAt_-1]
 *
 * The declared index is `{menu:1, createdAt:-1}`. It can order rows by
 * createdAt within each menu and merge those streams, but it carries no `_id`
 * component, so the tie-break has to be applied by a sort stage.
 *
 * ── WHY `_id` STAYS ANYWAY ──────────────────────────────────────────────────
 * The cursor and the sort are not independent. The cursor excludes
 * `_id >= last` at the boundary millisecond; if the sort does not also order by
 * `_id`, a tied row can be ordered *after* the page boundary on one request and
 * then be excluded forever by the next cursor. That is a SKIPPED ROW in an
 * audit trail — invisible, and precisely the row someone was looking for.
 * Dropping `_id` here would buy SORT_MERGE at the cost of correctness.
 *
 * ── WHAT IT ACTUALLY COSTS TODAY ────────────────────────────────────────────
 * The SORT stage reports `limitAmount: 50` — a BOUNDED top-K sort, not an
 * unbounded one — with `memLimit: 33554432`. Documents are still narrowed by
 * the index first (indexBounds show the six menu values), so the sort sees only
 * matching rows, and only ever holds 50. It is fine now and stays fine while
 * the per-menu result set is small.
 *
 * ── WHEN TO REVISIT, AND WHAT IT WOULD TAKE ─────────────────────────────────
 * The fix is an index carrying the tie-break — `{menu:1, createdAt:-1, _id:-1}`
 * and `{createdAt:-1, _id:-1}`. That is a FIFTH and SIXTH index on an
 * append-only collection, which §8.6 rejected on cost grounds; reopening it is
 * a decision, not a patch, so it has NOT been done here. Revisit when the
 * §8.3 tripwires fire, or when a single menu's history passes roughly 100k
 * rows and the top-K sort starts examining materially more than it returns.
 */
export const AUDIT_SORT = Object.freeze({ createdAt: -1, _id: -1 });

/**
 * Parse the opaque cursor the page passes around.
 *
 * Format: `<iso>|<objectId>`. Both halves are required — see buildAuditQuery
 * for why a timestamp alone is not enough.
 */
export function parseCursor(raw) {
  if (typeof raw !== 'string' || !raw.includes('|')) return null;
  const [iso, id] = raw.split('|');
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || !id) return null;
  return { createdAt: at, id };
}

/** Build the cursor for the row after `row`. */
export function encodeCursor(row) {
  if (!row?.createdAt || !row?._id) return null;
  return `${new Date(row.createdAt).toISOString()}|${String(row._id)}`;
}

/**
 * Build the Mongo filter for one audit-log request. PURE.
 *
 * ── THE CLAMP ───────────────────────────────────────────────────────────────
 * `menusForUser(user)` is recomputed here from the SESSION on every call.
 * Nothing about the permission boundary is ever taken from `filters`: not a
 * menu list, not an actor id, not a clamp. In a `'use server'` module every
 * export is a POST endpoint, so a menu list arriving in the payload is an
 * attacker-supplied menu list.
 *
 * UI filters narrow WITHIN the clamp and can never widen it. Asking for a menu
 * the user does not hold yields the intersection — which is empty — rather than
 * the requested menu. An intersection, not a validation error: a shared link to
 * a menu you cannot see should show you nothing, not an error that confirms the
 * menu exists.
 *
 * An EMPTY clamp stays `{ $in: [] }`, which matches nothing. It must never
 * collapse to "no filter": `[]` and `null` mean opposite things here, and
 * conflating them turns a page-less admin into a superadmin.
 *
 * ── THE CURSOR ──────────────────────────────────────────────────────────────
 * On `(createdAt, _id)`, never `createdAt` alone. Same-millisecond rows are
 * likely rather than theoretical: one human action can now write two rows
 * (setPromotionPageLink), and `after()` runs scheduled writes back to back. A
 * cursor on a non-unique key silently skips or repeats rows at page boundaries
 * — the worst kind of bug in an audit trail, because the page looks fine and
 * the missing row is the one you were looking for.
 *
 * @param {object} args
 * @param {object} args.user      the SESSION user — the only source of authority
 * @param {object} [args.filters] UI filters: menu, entity, action, actor, from, to
 * @param {string} [args.cursor]  opaque cursor from encodeCursor()
 * @returns {{filter: object, clampedTo: string[]|null, isEmptyClamp: boolean}}
 */
export function buildAuditQuery({ user, filters = {}, cursor } = {}) {
  const allowed = menusForUser(user);
  const filter = {};

  // ── menu: the clamp, then the UI filter INSIDE it ──────────────
  if (allowed === null) {
    // Superadmin. No clamp — a requested menu is applied on its own.
    if (filters.menu) filter.menu = filters.menu;
  } else if (filters.menu) {
    // Intersection. Requesting a menu you do not hold yields nothing, silently.
    filter.menu = allowed.includes(filters.menu) ? filters.menu : { $in: [] };
  } else {
    filter.menu = { $in: allowed };
  }

  // ── the rest narrow further; none of them touch authority ──────
  if (filters.entity) filter.entity = filters.entity;
  if (filters.action) filter.action = filters.action;
  if (filters.actor)  filter['actor.id'] = filters.actor;

  const from = filters.from ? new Date(filters.from) : null;
  const to   = filters.to   ? new Date(filters.to)   : null;
  const range = {};
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime()))     range.$lte = to;

  // ── the cursor, on the compound key ────────────────────────────
  const c = parseCursor(cursor);
  if (c) {
    // The cursor's own createdAt bound lives inside the $or, so it cannot be
    // flattened into `range` — a single `$lt` there would drop the tie-break.
    const after = [
      { createdAt: { $lt: c.createdAt } },
      { createdAt: c.createdAt, _id: { $lt: c.id } },
    ];
    if (Object.keys(range).length) filter.$and = [{ createdAt: range }, { $or: after }];
    else filter.$or = after;
  } else if (Object.keys(range).length) {
    filter.createdAt = range;
  }

  return {
    filter,
    clampedTo: allowed,
    isEmptyClamp: Array.isArray(allowed) && allowed.length === 0,
  };
}

/**
 * How many rows the inline widget shows before the "ดูทั้งหมด" modal.
 */
export const RECORD_HISTORY_PREVIEW = 5;

/**
 * The inline widget's sort — `createdAt` ONLY, deliberately not AUDIT_SORT.
 *
 * ── MEASURED, explain() against production 2026-07-31 ───────────────────────
 *   sort({createdAt:-1, _id:-1})  → SORT ← FETCH ← IXSCAN [menu_1_createdAt_-1]
 *   sort({createdAt:-1})          → LIMIT ← FETCH ← IXSCAN [menu_1_createdAt_-1]
 *
 * Dropping the tie-break removes the blocking sort stage entirely.
 *
 * ── WHY IT IS SAFE HERE AND NOT ON THE CENTRAL PAGE ─────────────────────────
 * The `_id` key exists for CURSOR PAGINATION: without it, a row sharing the
 * boundary millisecond can be ordered past the page edge on one request and
 * then excluded forever by the next cursor. The widget has no cursor. It takes
 * the newest N and a total count, so nothing depends on a stable order across
 * requests, and two same-millisecond rows may appear in either order within the
 * five shown.
 *
 * Same reasoning, opposite conclusion, because the requirement differs — which
 * is why this is a separate constant rather than a reuse of AUDIT_SORT.
 */
export const RECORD_HISTORY_SORT = Object.freeze({ createdAt: -1 });

/** Why a record-history request produced nothing. */
export const HISTORY_STATE = Object.freeze({
  OK:               'ok',                // rows, or a genuinely empty record
  DENIED:           'denied',            // the user may not see this menu
  NOT_INSTRUMENTED: 'not_instrumented',  // the sweep has not reached this menu
});

/**
 * Build the query for ONE record's history. PURE.
 *
 * ── PERMISSION IS CHECKED HERE, NOT INHERITED ───────────────────────────────
 * The widget renders inside a screen the user already passed `requirePage` for,
 * and that is NOT sufficient. Every export in a `'use server'` module is a POST
 * endpoint, and this one returns other people's activity — so the menu is
 * re-checked with `canAccess` against the SESSION on every call.
 *
 * The menu is a parameter of the mount point, never of the request payload: a
 * caller who could choose it could read any menu's history by asking.
 *
 * ── THE DUAL KEY SPACE ──────────────────────────────────────────────────────
 * `courses` records two kinds of `recordId`: an MSDB ObjectId for the course
 * itself, and the `course_id` CODE for its extension and early-bird rows
 * (§8.7 ruling (e), accepted rather than normalised). A course screen holds
 * both values, so it passes both and the query becomes an `$in` — served by the
 * existing `{recordId:1, createdAt:-1}` index, no new index needed.
 *
 * Whether a menu is dual-key is READ FROM THE CONTRACT (`isDualKeySpace`), not
 * hardcoded here. This is that flag's first consumer; a second dual-key menu
 * should need no change to this file.
 *
 * @param {object} args
 * @param {object} args.user       the SESSION user
 * @param {string} args.menu       from the MOUNT POINT, never from client input
 * @param {string} [args.entity]   narrows to one record kind when a menu holds several
 * @param {string|string[]} args.recordId  one id, or every key space's id for a dual-key menu
 * @returns {{state: string, filter: object|null}}
 */
export function buildRecordHistoryQuery({ user, menu, entity, recordId } = {}) {
  if (!menu || !canAccess(user, menu)) {
    return { state: HISTORY_STATE.DENIED, filter: null };
  }
  if (!isMenuSwept(menu)) {
    // NOT the same as "no rows". During the sweep most screens are here, and a
    // widget that says "no history" when it means "not wired up yet" teaches
    // people the feature is broken.
    return { state: HISTORY_STATE.NOT_INSTRUMENTED, filter: null };
  }

  const ids = (Array.isArray(recordId) ? recordId : [recordId])
    .filter((v) => v !== null && v !== undefined && String(v) !== '')
    .map(String);

  if (ids.length === 0) return { state: HISTORY_STATE.OK, filter: null };

  const filter = { menu };
  // A single id stays an equality — `$in` with one element plans the same, but
  // an equality is what a reader expects to see in a log.
  filter.recordId = ids.length === 1 && !isDualKeySpace(menu) ? ids[0] : { $in: ids };
  if (entity) filter.entity = entity;

  return { state: HISTORY_STATE.OK, filter };
}

/**
 * Build the "who edited this last" query for a whole list page. PURE.
 *
 * ONE query per page render, never one per row. The sort is
 * `{recordId: 1, createdAt: -1}` so every record's rows arrive together with
 * the newest first — the caller then keeps the first row it sees per
 * `recordId`, which is a single pass and no per-row round trip.
 *
 * @returns {{state: string, filter: object|null, sort: object}}
 */
export function buildLastEditedQuery({ user, menu, entity, recordIds = [] } = {}) {
  if (!menu || !canAccess(user, menu)) {
    return { state: HISTORY_STATE.DENIED, filter: null, sort: LAST_EDITED_SORT };
  }
  if (!isMenuSwept(menu)) {
    return { state: HISTORY_STATE.NOT_INSTRUMENTED, filter: null, sort: LAST_EDITED_SORT };
  }

  const ids = (Array.isArray(recordIds) ? recordIds : [])
    .filter((v) => v !== null && v !== undefined && String(v) !== '')
    .map(String);

  if (ids.length === 0) return { state: HISTORY_STATE.OK, filter: null, sort: LAST_EDITED_SORT };

  const filter = { menu, recordId: { $in: ids } };
  if (entity) filter.entity = entity;
  return { state: HISTORY_STATE.OK, filter, sort: LAST_EDITED_SORT };
}

/** Groups each record's rows together, newest first. */
export const LAST_EDITED_SORT = Object.freeze({ recordId: 1, createdAt: -1 });

/**
 * Keep the newest row per `recordId` from a `LAST_EDITED_SORT`-ordered list.
 *
 * Records with NO row are simply absent from the result. That is deliberate and
 * the UI depends on it: most rows predate the log, and rendering "ไม่ทราบ" for
 * them reads as data loss rather than as a feature that started recording last
 * week. Absent means "render nothing".
 */
export function newestPerRecord(rows = []) {
  const out = new Map();
  for (const row of rows) {
    const key = String(row?.recordId ?? '');
    if (!key || out.has(key)) continue;
    out.set(key, row);
  }
  return out;
}
