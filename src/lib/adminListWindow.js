/**
 * How much of a collection an admin list is actually showing.
 *
 * ── THE INCIDENT (b-002 / b-003) ────────────────────────────────────────────
 * /admin/articles fetched `getArticles({ limit: 200 })` and threw `total` away
 * — `countDocuments` had already computed it. The collection holds 484
 * articles, so 284 of them (59%) were not in the list. They were also
 * UNFINDABLE, because the admin search box is a client-side filter over the
 * rows already fetched: typing an exact title of article #300 returned
 * "ไม่พบบทความ", which reads as "this article does not exist".
 *
 * The header made it worse by being confidently wrong — it rendered
 * `ทั้งหมด {rows.length} บทความ`, i.e. it reported the FETCH SIZE as the
 * COLLECTION SIZE. An admin who counted the rows got 200 and had no reason to
 * doubt it.
 *
 * ── WHY THIS IS A MODULE AND NOT AN INLINE `items.length < total` ───────────
 * The bug was not the limit. A limit is a reasonable thing to have; commit 3
 * replaces it with server-side pagination and the limit stops mattering. The
 * bug was that the surface DROPPED ROWS WITHOUT SAYING SO — and a surface can
 * only say so if the arithmetic exists somewhere a test can reach. This module
 * is that place, and the banner it drives is meant to OUTLIVE the limit: any
 * future window (a page size, a filter cap, a fetch that partially failed) that
 * reports fewer rows than the collection holds gets the same loud amber banner
 * rather than a second silent drop.
 *
 * Dependency-free (no next/*, no db, no models) so the `pure` tier can run it.
 */

/** Coerce to a finite, non-negative integer. Junk counts as zero, never NaN. */
function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Describe the window a list is rendering.
 *
 * `truncated` is derived from `total > shown`, NOT from `total > limit`. The
 * two agree in the current admin page (no server-side filter, so
 * `shown === min(total, limit)`), but they come apart the moment a read returns
 * fewer rows than its limit for any other reason — a filter, a projection
 * failure, a partial fetch. Keying the banner off the row count that actually
 * arrived means it stays honest under all of those; keying it off the limit
 * would make it lie again in exactly the way this module exists to prevent.
 *
 * `limit` is therefore an input for validation, not the source of the verdict:
 * a `shown` above it means the caller mismatched its own query, so `shown` is
 * clamped rather than trusted.
 *
 * @param {{shown?: number, total?: number, limit?: number}} input
 * @returns {{shown: number, total: number, hidden: number, truncated: boolean}}
 */
export function describeListWindow({ shown, total, limit } = {}) {
  const lim = count(limit);
  let seen = count(shown);
  if (lim > 0 && seen > lim) seen = lim;

  const all = count(total);

  // `Math.max(0, …)` guards the case where a client has locally removed rows
  // (a delete) but `total` has not been decremented, or a stale payload reports
  // a total below the row count. A NEGATIVE hidden would render as
  // "ซ่อนอยู่ -3 บทความ", which is worse than showing nothing.
  const hidden = Math.max(0, all - seen);

  return { shown: seen, total: all, hidden, truncated: hidden > 0 };
}
