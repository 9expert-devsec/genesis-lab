/**
 * The Mongo filter for the registrations list — ONE builder, so the table and
 * the summary cards cannot answer to different questions.
 *
 * ── THE DEFECT THIS FILE EXISTS TO FIX ──────────────────────────────────────
 * The date range was computed inside `getRegistrationStatusCounts` and nowhere
 * else. `listRegistrations` never received it and never applied it. So selecting
 * วันนี้ produced a screen where the cards read ทั้งหมด 1, the table listed every
 * row regardless of date, and the header said `7 รายการทั้งหมด` — three numbers,
 * one filter, two of them ignoring it.
 *
 * The range now lives here and BOTH callers derive from it. A range that reaches
 * one query and not the other is no longer expressible: there is one function
 * that turns `range` into a `createdAt` clause, and the counts action and the
 * list action both call it.
 *
 * ── WHY `now` IS A PARAMETER ────────────────────────────────────────────────
 * `new Date()` inside a filter builder makes the builder untestable — "today"
 * moves while the suite runs, and an assertion about a boundary can only be
 * written against a clock it controls. Every caller in the app omits it and gets
 * the real clock; the tests pass a fixed instant and assert the exact boundary.
 *
 * ── LOCAL MIDNIGHT, NOT UTC MIDNIGHT ────────────────────────────────────────
 * `setHours(0,0,0,0)` is deliberate and is carried over unchanged from the
 * counts action. The server runs on the deployment's timezone and the staff
 * reading this screen are in Bangkok; "วันนี้" has to mean the day they are
 * having, not the day UTC is having. Changing this to `setUTCHours` would move
 * every boundary by seven hours and silently reclassify evening enquiries — the
 * 19:27 in-house enquiry this screen was recently audited over would land on the
 * previous day.
 *
 * Pure: no db, no env, no imports.
 */

/** The ranges the UI offers. `all` is the absence of a date clause. */
export const RANGE_VALUES = ['all', 'today', 'week', 'month'];

/**
 * A range name → the `createdAt` clause for it, as a spreadable object.
 *
 * Returns `{}` — not `{ createdAt: undefined }` — for `all` and for anything
 * unrecognised, so a caller can spread it unconditionally and an unknown value
 * degrades to "no date filter" rather than to a clause matching nothing.
 *
 * @param {string} range
 * @param {Date} [now]
 * @returns {{ createdAt?: { $gte: Date } }}
 */
export function rangeToDateFilter(range, now = new Date()) {
  let from = null;

  if (range === 'today') {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    // Six days back INCLUSIVE of today — a seven-day window, matching the
    // '7 วัน' chip. Carried over from the counts action unchanged.
    from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (range === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  return from ? { createdAt: { $gte: from } } : {};
}

/**
 * The search `$or` for a source.
 *
 * The two sources search DIFFERENT fields and that is not an oversight: an
 * in-house enquiry has no `courseName` and no `coordinator`, and a public
 * registration has no `companyName`. `coursesInterested` is deliberately absent
 * from the in-house clause — it holds course CODES, so matching a typed course
 * name against it would return nothing while looking like it should work. The
 * placeholder text on the search box names the fields that are actually here.
 *
 * @param {string} source
 * @param {string} term already trimmed and known non-empty
 */
function searchClauses(source, term) {
  const rx = { $regex: term, $options: 'i' };
  return source === 'inhouse'
    ? [
        { companyName:      rx },
        { contactFirstName: rx },
        { contactLastName:  rx },
        { contactEmail:     rx },
      ]
    : [
        { courseName:              rx },
        { 'coordinator.firstName': rx },
        { 'coordinator.lastName':  rx },
        { 'coordinator.email':     rx },
      ];
}

/**
 * The complete filter for one list query.
 *
 * `source` is NOT a filter field — it selects the COLLECTION, and the two
 * collections are separate. It is a parameter here only because it decides which
 * fields the search clause names.
 *
 * @param {object} input
 * @param {string} [input.status] a status value, or 'all' for no status clause
 * @param {string} [input.q] free-text search
 * @param {string} [input.source] 'public' | 'inhouse'
 * @param {string} [input.range] see RANGE_VALUES
 * @param {Date} [input.now] injected clock; omit in production
 * @returns {object} a Mongo filter document
 */
export function buildRegistrationFilter({
  status = 'all',
  q = '',
  source = 'public',
  range = 'all',
  now,
} = {}) {
  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }

  const term = String(q ?? '').trim();
  if (term) {
    filter.$or = searchClauses(source, term);
  }

  // Spread, not assign: `rangeToDateFilter` returns {} for 'all', so this adds
  // nothing rather than adding an undefined key that Mongo would reject.
  Object.assign(filter, rangeToDateFilter(range, now));

  return filter;
}
