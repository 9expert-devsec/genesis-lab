/**
 * Ordering and list-mutation helpers for ONE course's LocalFaq list.
 *
 * WHY THIS EXISTS AS A MODULE. CourseFaqManager holds its rows in client state
 * and must place a newly created or edited row where the SERVER would place it
 * — otherwise the row is in the right list at the wrong index, correct until
 * the next load and then silently moving. That means the optimistic splice and
 * the server read have to agree on one comparator, so there is exactly one
 * here and both sides call it.
 *
 * THE SERVER'S ORDER, verified rather than assumed:
 *   getLocalFaqsForCourse / getAllLocalFaqsForCourse in
 *   src/lib/local-faqs/getLocalFaqs.js read with
 *     .sort({ display_order: 1, createdAt: 1 })
 *
 * The `createdAt: 1` half is a DELIBERATE DIVERGENCE from the featured-*
 * family, which resolves ties with `createdAt: -1` (newest to the top of its
 * tie group). The full reasoning lives next to the query in getLocalFaqs.js;
 * the short version is that a FAQ list is a hand-ordered document read top to
 * bottom, so a new question must not jump above questions an admin already
 * placed. Two tie rules in one admin is fine when each is chosen; it is not
 * fine when it happens by accident, which is why both are written down.
 *
 * TIES ARE REACHABLE TODAY, and that is a separate defect, reported not fixed:
 * `deleteLocalFaq` removes a row without renumbering the survivors, and
 * CourseFaqManager creates with `display_order: rows.length`. Delete a middle
 * row from [0,1,2] and the next create gets 2, colliding with the surviving 2.
 * Assigning `max(display_order) + 1` would make collisions unreachable, but it
 * changes ordering semantics on a write path.
 */

/** The one comparator. Mirrors `.sort({ display_order: 1, createdAt: 1 })`. */
export function compareLocalFaqs(a, b) {
  const da = Number(a?.display_order ?? 0);
  const db = Number(b?.display_order ?? 0);
  const na = Number.isFinite(da) ? da : 0;
  const nb = Number.isFinite(db) ? db : 0;
  if (na !== nb) return na - nb;
  return toTime(a?.createdAt) - toTime(b?.createdAt); // ASC — oldest first
}

/** Milliseconds for a createdAt that may be a Date, an ISO string, or absent. */
function toTime(value) {
  if (!value) return 0;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Order a list the way the server would. Copies first — callers pass React
 * state and must not mutate it.
 */
export function sortLocalFaqs(rows) {
  return [...(rows ?? [])].sort(compareLocalFaqs);
}

/** Insert a newly created row at the position its `display_order` implies. */
export function insertLocalFaq(rows, doc) {
  if (!doc) return sortLocalFaqs(rows);
  return sortLocalFaqs([...(rows ?? []), doc]);
}

/**
 * Replace an edited row in place, then re-order — an edit can change
 * `display_order`, so replacing without re-sorting would leave the list in an
 * order the next load will not reproduce.
 */
export function replaceLocalFaq(rows, doc) {
  const id = String(doc?._id ?? '');
  if (!id) return sortLocalFaqs(rows);
  let found = false;
  const next = (rows ?? []).map((r) => {
    if (String(r?._id ?? '') !== id) return r;
    found = true;
    return doc;
  });
  // An edit to a row this client does not know about (another tab added it)
  // is an insert, not a silent no-op.
  return sortLocalFaqs(found ? next : [...next, doc]);
}

/** Drop a deleted row. */
export function removeLocalFaq(rows, id) {
  const key = String(id ?? '');
  return (rows ?? []).filter((r) => String(r?._id ?? '') !== key);
}
