/**
 * How much of a collection an admin list can actually get the user to.
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
 * is that place.
 *
 * Dependency-free (no next/*, no db, no models) so the `pure` tier can run it.
 */

/** Coerce to a finite, non-negative integer. Junk counts as zero, never NaN. */
function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * THE CONTRACT, IN ONE SENTENCE: `reachable` is how many of `total` rows this
 * surface can get the user to using the controls it actually has — not how many
 * are painted on screen right now.
 *
 * ── WHAT EACH CALLER PASSES ─────────────────────────────────────────────────
 *   today (single-window fetch, no pager)  → `items.length`
 *       200 rows are fetched, all 200 are rendered, and the search box filters
 *       those 200. Painted and reachable are the same number, which is why the
 *       distinction looks academic here. It is not.
 *
 *   once a pager exists (commit 3)         → `total`
 *       Page 1 paints 12 rows, but every one of the 484 is one click away, so
 *       nothing is hidden and the banner goes SILENT. A pager makes rows
 *       reachable; it does not make them missing.
 *
 * ── TWO ESCAPES THAT WERE CONSIDERED AND REJECTED ───────────────────────────
 *   1. Keep the parameter named `shown` (rows painted). Under pagination
 *      `total > shown` is true on EVERY page, forever, so the banner would
 *      announce 472 hidden articles that are one click away. A banner that is
 *      wrong on every page gets deleted — and deleting it removes the only
 *      guard this whole commit exists to install.
 *   2. Keep `shown` and have the paginated caller pass `shown: total`. That
 *      produces the right boolean by making the parameter name a lie: 12 rows
 *      are painted, not 484. This module exists to stop a surface reporting
 *      numbers that are not what they claim, so it does not get to do that
 *      itself.
 *
 * There is deliberately NO `shown` alias. A deprecated alias is precisely how
 * the paginated caller ends up passing the wrong one.
 *
 * `limit` is not a parameter either. It was one, and it decided nothing: the
 * predicate is `total > reachable`, never `total > limit`. The two agree only
 * while `reachable === min(total, limit)` — i.e. only while there is no pager
 * and no server-side filter — and one control below pins the case where they
 * part company. Nothing renders the window size, so there is nothing left for
 * `limit` to be.
 *
 * @param {{reachable?: number, total?: number}} input
 * @returns {{reachable: number, total: number, hidden: number, truncated: boolean}}
 */
export function describeListWindow({ reachable, total } = {}) {
  const within = count(reachable);
  const all = count(total);

  // `Math.max(0, …)` guards two real cases: a client that has locally removed
  // rows (a delete) before `total` is decremented, and a caller that can reach
  // more rows than the collection holds. A NEGATIVE hidden would render as
  // "ซ่อนอยู่ -3 บทความ", which is worse than showing nothing.
  const hidden = Math.max(0, all - within);

  return { reachable: within, total: all, hidden, truncated: hidden > 0 };
}
