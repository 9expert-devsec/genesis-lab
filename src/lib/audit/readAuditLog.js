/**
 * The audit-log reading surface (Phase 3a) — the part that touches the database.
 *
 * Thin on purpose. Every rule worth getting wrong lives in `auditQuery.js`,
 * which is pure and tested without a connection; this file connects, finds,
 * sorts and limits. If you are about to add a condition here, it probably
 * belongs in the builder.
 *
 * Nothing here writes. Nothing here is cached: rows change constantly and a
 * stale audit log is worse than a slow one.
 */

import { dbConnect } from '@/lib/db/connect';
import AdminAuditLog from '@/models/AdminAuditLog';
import {
  buildAuditQuery,
  AUDIT_SORT,
  AUDIT_PAGE_SIZE,
  ACTION_FACET_LIMIT,
  encodeCursor,
  buildRecordHistoryQuery,
  buildLastEditedQuery,
  newestPerRecord,
  HISTORY_STATE,
  RECORD_HISTORY_PREVIEW,
  RECORD_HISTORY_SORT,
} from '@/lib/audit/auditQuery';

export { AUDIT_PAGE_SIZE, HISTORY_STATE, RECORD_HISTORY_PREVIEW } from '@/lib/audit/auditQuery';

/**
 * Run one page of the audit log.
 *
 * Fetches `limit + 1` rows to learn whether a next page exists without a second
 * count query — `countDocuments` on a growing append-only collection is the
 * thing cursor pagination exists to avoid.
 */
export async function readAuditLog({ user, filters = {}, cursor, limit = AUDIT_PAGE_SIZE } = {}) {
  const { filter, clampedTo, isEmptyClamp } = buildAuditQuery({ user, filters, cursor });

  if (isEmptyClamp) {
    // Short-circuit: `$in: []` returns nothing anyway, but saying so here lets
    // the page distinguish "you hold no menus" from "no rows matched".
    return { rows: [], nextCursor: null, clampedTo, isEmptyClamp: true };
  }

  await dbConnect();
  const docs = await AdminAuditLog.find(filter)
    .sort(AUDIT_SORT)
    .limit(limit + 1)
    .lean();

  const hasMore = docs.length > limit;
  const rows = hasMore ? docs.slice(0, limit) : docs;

  return {
    rows: JSON.parse(JSON.stringify(rows)),
    nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
    clampedTo,
    isEmptyClamp: false,
  };
}

/**
 * Distinct `action` values visible to this user, for the filter dropdown.
 *
 * Read from the DATA, never a hardcoded list — the field is free-form by design
 * and a fixed list would silently hide every verb invented after it was written.
 * Clamped exactly like the row query, so the dropdown cannot leak the existence
 * of actions in menus the user cannot see.
 */
export async function readAuditActions({ user } = {}) {
  const { filter, isEmptyClamp } = buildAuditQuery({ user });
  if (isEmptyClamp) return [];
  await dbConnect();
  const values = await AdminAuditLog.distinct('action', filter);
  return values.filter(Boolean).sort().slice(0, ACTION_FACET_LIMIT);
}

/**
 * Which `(menu, entity)` pairs have produced rows, for the coverage panel.
 * Returns the set that HAS rows; the page diffs it against the contract.
 */
export async function readPairsWithRows({ user } = {}) {
  const { filter, isEmptyClamp } = buildAuditQuery({ user });
  if (isEmptyClamp) return [];
  await dbConnect();
  const rows = await AdminAuditLog.aggregate([
    { $match: filter },
    { $group: { _id: { menu: '$menu', entity: '$entity' }, n: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({ menu: r._id.menu, entity: r._id.entity, count: r.n }));
}

/** Total rows visible to this user — for the "no rows at all yet" empty state. */
export async function countVisibleRows({ user } = {}) {
  const { filter, isEmptyClamp } = buildAuditQuery({ user });
  if (isEmptyClamp) return 0;
  await dbConnect();
  return AdminAuditLog.countDocuments(filter);
}

/**
 * One record's history, for the inline widget.
 *
 * Returns `{ state, rows, total }`. `state` distinguishes the three empty
 * cases the widget must render differently — see HISTORY_STATE.
 *
 * `menu` comes from the MOUNT POINT. It is never read from client input, and
 * the builder re-checks `canAccess` against the session regardless.
 */
export async function readRecordHistory({
  user, menu, entity, recordId, limit = RECORD_HISTORY_PREVIEW,
} = {}) {
  const { state, filter } = buildRecordHistoryQuery({ user, menu, entity, recordId });
  if (state !== HISTORY_STATE.OK || !filter) return { state, rows: [], total: 0 };

  await dbConnect();
  const [docs, total] = await Promise.all([
    AdminAuditLog.find(filter).sort(RECORD_HISTORY_SORT).limit(limit).lean(),
    AdminAuditLog.countDocuments(filter),
  ]);

  return { state, rows: JSON.parse(JSON.stringify(docs)), total };
}

/**
 * "Who edited this last" for a whole list page — ONE query, never one per row.
 *
 * Returns a plain object keyed by `recordId`. Records with no history are
 * ABSENT rather than null: the UI renders nothing for them, because most rows
 * predate the log and a list full of "ไม่ทราบ" reads as data loss.
 */
export async function readLastEditedMap({ user, menu, entity, recordIds = [] } = {}) {
  const { state, filter, sort } = buildLastEditedQuery({ user, menu, entity, recordIds });
  if (state !== HISTORY_STATE.OK || !filter) return {};

  await dbConnect();
  const docs = await AdminAuditLog.find(filter)
    .sort(sort)
    .select('recordId createdAt action actor')
    .lean();

  const newest = newestPerRecord(docs);
  return Object.fromEntries(
    [...newest.entries()].map(([id, row]) => [id, {
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      action: row.action ?? '',
      actorName: row.actor?.name ?? '',
    }])
  );
}
