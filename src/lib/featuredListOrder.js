/**
 * The ordering rule shared by the five "sibling add-form + drag-reorder list"
 * admin menus: featured-courses, featured-online-courses,
 * nav-featured-online-courses, featured-reviews and tnhs-courses.
 *
 * All five read with the SAME comparator, verified in their action files:
 *   .sort({ sort_order: 1, createdAt: -1 })
 *
 * The `createdAt: -1` half is the part that is easy to get wrong and easy to
 * miss. It is DESCENDING, so within a group of rows sharing a `sort_order` the
 * NEWEST sorts FIRST. A newly created row that collides therefore lands at the
 * TOP of its tie group, not the bottom — which is the opposite of what both
 * "append to the end" and a plain stable sort produce.
 *
 * Collisions are not hypothetical here:
 *   - four of the five assign `sort_order: await Model.countDocuments()` on
 *     create, and delete does not renumber the survivors. Delete a middle row
 *     from [0,1,2] and the next create gets 2, colliding with the surviving 2.
 *   - tnhs-courses takes `sort_order` straight from a form field, so any value
 *     an admin types can collide with anything.
 *
 * Unlike the LocalFaq list (see localFaqList.js), the tie here IS defined by
 * the server, so the client can and must reproduce it exactly.
 */

/** Milliseconds for a createdAt that may be a Date, an ISO string, or absent. */
function toTime(value) {
  if (!value) return 0;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/** The one comparator. Mirrors `.sort({ sort_order: 1, createdAt: -1 })`. */
export function compareFeaturedRows(a, b) {
  const sa = Number(a?.sort_order ?? 0);
  const sb = Number(b?.sort_order ?? 0);
  // NaN would make every comparison false and scatter the list; treat it as 0,
  // which is what a missing field reads as on the server too.
  const na = Number.isFinite(sa) ? sa : 0;
  const nb = Number.isFinite(sb) ? sb : 0;
  if (na !== nb) return na - nb;
  return toTime(b?.createdAt) - toTime(a?.createdAt); // DESC — newest first
}

/** Order a list the way the server would. Copies — callers pass React state. */
export function sortFeaturedRows(rows) {
  return [...(rows ?? [])].sort(compareFeaturedRows);
}

/** Place a newly created row where the server's next read will put it. */
export function insertFeaturedRow(rows, doc) {
  if (!doc) return sortFeaturedRows(rows);
  return sortFeaturedRows([...(rows ?? []), doc]);
}
