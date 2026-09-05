/**
 * ONE ROW PER REQUEST. The grouping key, and the assembly. Pure.
 *
 * ══ WHAT CHANGED, AND WHAT DID NOT ═════════════════════════════════════════
 *
 * THE STORAGE IS UNTOUCHED. `register_public` still holds one row per
 * course+round, each with its own real `classId`, because nine of the fourteen
 * readers of that collection read a scalar course or round field and six of
 * them break SILENTLY if a row holds several — the seat accounting, the rename
 * preview, the course filter, the search, the course options. See the `bundle`
 * note on models/RegisterPublic, which is still the ruling.
 *
 * WHAT CHANGED IS THE SCREEN. The admin's job with these rows is to produce ONE
 * quotation from ONE form, and three rows for one customer made them reassemble
 * by hand what arrived as a single request. So the list folds.
 *
 * ══ THE FOLD IS A GROUPING IN THE QUERY, NEVER A FOLD AFTER THE FETCH ══════
 *
 * This is the load-bearing decision and it is about PAGINATION.
 *
 * `skip` and `limit` are applied by Mongo over LEGS. Folding a fetched page of
 * twenty legs down to fourteen rows in JavaScript gives:
 *
 *   · a page whose size varies with how many bundles happen to land in it,
 *   · a `pageCount` computed from a leg total that no longer describes the rows,
 *   · and — the part that is not merely cosmetic — A REQUEST STRADDLING A PAGE
 *     BOUNDARY RENDERED TWICE, once on each page, incomplete both times.
 *
 * So the grouping happens FIRST and `$skip`/`$limit` are applied to the GROUPED
 * keys. A page of twenty is twenty requests, and no request can appear on two
 * pages. That is a property of the pipeline order, not of any check.
 *
 * ══ AND WHY THE LEGS ARE FETCHED IN A SECOND QUERY ═════════════════════════
 *
 * The scope matches LEGS. Under a course filter or a search term it matches ONE
 * leg of a three-leg request — that is correct and must stay correct, because a
 * filter that hides a matching request is worse than one that shows a bundle
 * row. But it means the grouped result knows only the legs that MATCHED.
 *
 * A row built from those alone would render a three-course package as a
 * one-course row: the screen quietly lying about the size of the request, which
 * is the same class of defect as a count that disagrees with its table. So the
 * second query re-fetches every leg of the selected requests, unfiltered, and
 * the row always shows the request whole regardless of why it matched.
 *
 * Cost: two aggregations and one find per page, up from one count and one find.
 * The second query is bounded by page-size × legs-per-request.
 *
 * ── `bundle.requestId` IS NOT INDEXED, AND THAT IS WRITTEN DOWN RATHER THAN
 *    ASSUMED ──────────────────────────────────────────────────────────────
 * Measured 2026-09-05 on the live collection: `register_public` carries
 * `_id_`, `createdAt_-1_status_1`, `email_1`, `coordinator.email_1` and
 * `payment.method_1_status_1`. Nothing on `bundle.requestId`. At the collection
 * sizes this screen has seen that is a scan of nothing, and it runs once per
 * page render. THAT IS A FACT ABOUT TODAY'S SIZE, NOT A PROPERTY OF THE DESIGN
 * — the same caveat `getRegistrationCourseOptions` records about its `distinct`.
 * At ten thousand registrations this wants an index on `bundle.requestId`.
 *
 * Pure: no db, no clock, no React. The `pure` tier exercises it with nothing
 * stubbed.
 */

import { requestStatusOf } from './requestStatus';

/**
 * THE GROUPING KEY, AS A MONGO EXPRESSION. One definition, three consumers.
 *
 * `listRegistrations`, `getRegistrationTotal` and `getRegistrationStatusCounts`
 * all group by this. A second spelling in any one of them is how the header
 * comes to count a different set from the rows — the exact defect
 * lib/registrations/listFilter.js was created to end, and which this screen has
 * shipped twice.
 *
 * An ordinary registration keys on its OWN `_id`, so it is a group of one and
 * every row on the screen goes through the same path. There is no branch for
 * "is this a bundle", which is what makes the folded and unfolded cases
 * impossible to get inconsistently wrong.
 *
 * `$toString` so the two kinds of key are the same TYPE. `bundle.requestId` is
 * stored as a string (deliberately — see the model: the type makes `.populate()`
 * impossible so the pointer cannot quietly become a lookup), while `_id` is an
 * ObjectId. Grouping a mixture would produce keys that compare unequal to
 * themselves across the two branches.
 */
export const REQUEST_KEY_EXPR = Object.freeze({
  $ifNull: ['$bundle.requestId', { $toString: '$_id' }],
});

/**
 * The same key for a document already in hand. The JS half of the pair above.
 *
 * Used to bucket the legs the second query returned. It must agree with
 * `REQUEST_KEY_EXPR` or a leg lands in a bucket no row is looking for and
 * silently disappears from its request.
 */
export function requestKeyOf(doc) {
  const tagged = doc?.bundle?.requestId;
  const key = tagged == null ? '' : String(tagged).trim();
  return key || String(doc?._id ?? '');
}

/**
 * Is this leg the MARKER — the one whose `_id` IS the request's `requestId`?
 *
 * The marker is written LAST by `orderLegsMarkerLast`, so its existence is what
 * makes a request complete, and it is the FIRST authored item — the course a
 * person would name the package by. It leads the row, and its `_id` is the
 * request's canonical URL and reference number.
 */
export function isMarkerLeg(doc) {
  const requestId = String(doc?.bundle?.requestId ?? '').trim();
  return Boolean(requestId) && requestId === String(doc?._id ?? '');
}

/**
 * THE DISPLAY ORDER OF ONE REQUEST'S LEGS. Marker first, then by `_id`.
 *
 * The marker is the FIRST AUTHORED ITEM — the author's order is the customer's
 * order, and the first course of the package is the one a person would name it
 * by. It is written LAST (see `orderLegsMarkerLast`) and read FIRST.
 *
 * ── ONE FUNCTION, TWO CALLERS, AND THAT IS THE POINT ──────────────────────
 * The folded list row and the detail screen's sibling lookup both order the
 * same legs. Two sort comparators would put the same request in two different
 * orders on two screens — the row saying "Claude AI, Vibe L1, Vibe L2" and the
 * detail page saying something else, for no reason a reader could discover.
 *
 * Returns a NEW array; the input is not mutated, because callers hand it
 * straight from a query result they may also be reading elsewhere.
 */
export function orderLegsForDisplay(legs) {
  return [...(Array.isArray(legs) ? legs : [])].sort((a, b) => {
    const am = isMarkerLeg(a) ? 0 : 1;
    const bm = isMarkerLeg(b) ? 0 : 1;
    if (am !== bm) return am - bm;
    return String(a?._id ?? '').localeCompare(String(b?._id ?? ''));
  });
}

/**
 * ASSEMBLE THE ROWS. Pure.
 *
 * @param {string[]} keys the request keys for THIS PAGE, in the order the
 *   grouped query returned them. The page order is decided by Mongo and
 *   preserved here exactly — re-sorting in JavaScript would be a second opinion
 *   about the order, and the one that disagrees with `pageCount`.
 * @param {Array<object>} legs every leg of those requests, unfiltered.
 * @returns {Array<object>} one row per key, in `keys` order. A key with no legs
 *   is DROPPED rather than rendered empty — it can only mean the second query
 *   raced a delete, and a row with no course is not a row.
 *
 * ── THE ROW KEEPS THE SCALAR FIELDS, AND THAT IS DELIBERATE ───────────────
 * `courseName`, `classDate`, `scheduleType` and `attendanceMode` are carried at
 * the top level from the PRIMARY leg, beside the full `legs` array. A one-leg
 * row is then byte-identical to what this table rendered before the fold, so
 * every existing cell, and every render assertion over it, is untouched; the
 * multi-leg case is additive. A row shape that only spoke `legs` would have
 * meant rewriting all six cells to gain nothing on the 41-in-46 rows that have
 * exactly one leg.
 */
export function foldLegsIntoRows(keys, legs) {
  const buckets = new Map();
  for (const leg of Array.isArray(legs) ? legs : []) {
    const key = requestKeyOf(leg);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(leg);
  }

  const rows = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    const group = buckets.get(String(key));
    if (!group || !group.length) continue;

    // Marker first — the shared rule, so this row and the detail screen show
    // the same request's courses in the same order.
    const ordered = orderLegsForDisplay(group);

    const primary = ordered[0];
    const { status, mixed, statuses: legStatuses } = requestStatusOf(ordered.map((l) => l?.status));

    rows.push({
      /**
       * THE LINK TARGET AND THE ROW IDENTITY: the marker leg where there is one.
       * `refNo(marker._id)` is the reference number the customer's confirmation
       * email quotes, so the row, its URL and the number on the customer's
       * screen are the same value.
       */
      _id: primary?._id,
      createdAt: ordered.reduce(
        (min, l) => (min && new Date(min) <= new Date(l?.createdAt ?? 0) ? min : l?.createdAt),
        primary?.createdAt,
      ),
      coordinator:    primary?.coordinator,
      attendeesCount: primary?.attendeesCount,
      courseName:     primary?.courseName,
      classDate:      primary?.classDate,
      scheduleType:   primary?.scheduleType,
      attendanceMode: primary?.attendanceMode,
      status,
      bundle:         primary?.bundle,

      /**
       * EVERY LEG, for the multi-course cell. Only the fields the table draws —
       * this is a list query and the projection rule that governs it is that the
       * projection equals the render.
       */
      legs: ordered.map((l) => ({
        _id:            l?._id,
        courseName:     l?.courseName,
        classDate:      l?.classDate,
        scheduleType:   l?.scheduleType,
        attendanceMode: l?.attendanceMode,
        status:         l?.status,
      })),
      legCount: ordered.length,
      /**
       * DIVERGENCE IS NEVER HIDDEN. A request filed under one status whose other
       * legs are elsewhere says so — see the status cell. `requestStatusOf`
       * decides the single word; this is the flag that stops it being a lie.
       */
      mixedStatus: mixed,
      /**
       * Written as an explicit key rather than the `statuses,` shorthand, so
       * test/fs/registrationsRowLink can SEE it. That guard exempts the derived
       * row fields from the projection rule and then proves each exempted name
       * is really produced here — a shorthand property is invisible to it, and
       * an exemption nothing can verify is how an unprojected read gets in.
       */
      statuses: legStatuses,
    });
  }

  return rows;
}
