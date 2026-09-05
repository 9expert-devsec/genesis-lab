import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';
import { roundFieldsFor } from '@/lib/registrations/roundSelection';
// The SAME consent builder the quote route and the charge route write through.
// Not `consent: data.consent`: that would store the four raw booleans without
// `accepted`, `acceptedAt` or the ip, so a bundle's audit record would be a
// different shape from every other registration's — and `accepted` is derived
// from the four rather than assumed, which is the property that keeps the
// record from claiming an acceptance the customer did not give.
import { buildConsentRecord } from '@/lib/registration/build-public';

/**
 * ONE BUNDLE REQUEST → N LEG PAYLOADS. Pure.
 *
 * Each leg is an ordinary single-course, single-round public registration:
 * the customer's own fields (coordinator, attendees, invoice, notes, consent)
 * repeated verbatim, plus THIS item's course and round. That repetition is the
 * point rather than a cost — it is what makes every existing reader of
 * `register_public` work on a leg without knowing bundles exist. See the
 * `bundle` field on models/RegisterPublic for the argument.
 *
 * ── THE ROUND FIELDS COME FROM `roundFieldsFor`, NOT FROM HERE ────────────
 * That function is "the ONE function both call sites share" — the wizard
 * spreads it into `setValue`, `updateRegistrationRound` spreads it into a
 * `$set`, and this spreads it into a create. A local `{classId: round._id,
 * classDate: …}` here would be a fourth place deciding what a round means, and
 * the one most likely to drift: it would have to re-derive `classDate`'s
 * formatting and re-decide the `scheduleType ?? 'classroom'` fallback that
 * keeps the detail screen's label honest.
 *
 * ── ONE PERSON ATTENDS EVERY COURSE, SO EVERY LEG CARRIES THE SAME PEOPLE ─
 * Decided for this round: the form asks what the ordinary public form asks and
 * there is no per-course attendee UI. So `attendeesCount`, `attendees` and the
 * coordinator are identical across the legs, and the seat accounting counts
 * that person in each round — which is correct, because they are expected in
 * each room.
 *
 * ── attendanceMode ────────────────────────────────────────────────────────
 * A bundle's rounds are chosen by the AUTHOR, and the form asks the customer
 * for nothing round-shaped, so there is no hybrid choice to carry. A hybrid
 * round therefore has no chosen mode and `roundFieldsFor` returns null for it —
 * which surfaces here as a refusal rather than a guess, matching the rule
 * `attendanceModeFor` states: substituting `classroom` for someone who meant
 * Teams sends them to a building on the day.
 *
 * In practice this is unreachable through the form, because `resolveBundleRequest`
 * has already refused any item whose round is not `live`, and a live hybrid
 * round would be caught HERE rather than silently defaulted. It is written as a
 * refusal, not an assertion, because the two guards run over data fetched at
 * different moments.
 */

/**
 * Build the legs, or say which item stopped it.
 *
 * @param {object}   p
 * @param {Array<object>} p.items     `content.items`, as authored
 * @param {Array<object>} p.resolved  parallel entries from `assembleResolved`
 * @param {string}   p.todayKey       Asia/Bangkok `YYYY-MM-DD`
 * @param {object}   p.data           the validated customer payload
 * @param {Array<object>} p.attendees the merged attendee list
 * @param {object}   p.bundle         the tag, already built and complete
 * @param {string|null} p.ipAddress
 * @returns {{ok: true, legs: Array<object>} | {ok: false, index: number, courseId: string}}
 */
export function buildBundleLegs({ items, resolved, todayKey, data, attendees, bundle, ipAddress = null }) {
  const list = Array.isArray(items) ? items : [];
  const entries = Array.isArray(resolved) ? resolved : [];
  const legs = [];

  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    const entry = entries[index] ?? null;
    const course = entry?.course ?? null;
    const courseId = String(entry?.courseId ?? item?.courseId ?? '').trim();

    const round = chooseItemRound(entry?.rounds, item, todayKey);
    // `live` only: a snapshot can draw a date but cannot hold a seat, and a
    // round nobody can fetch has no `_id` to book against. resolveBundleRequest
    // has already refused these; this is the second reader of the same fact,
    // and it refuses rather than assuming its sibling ran.
    if (!course || !round || round.state !== 'live') {
      return { ok: false, index, courseId };
    }

    const roundFields = roundFieldsFor(round.live);
    if (!roundFields) return { ok: false, index, courseId };

    legs.push({
      // The course, from what RESOLVED — not from the stored item. `courseId`
      // and `courseCode` both hold the short code, matching what RegisterWizard
      // writes (it sets both from `course.course_id`), so `courseClause`'s
      // `$or` and the rename preview's exact match both find a leg.
      courseId,
      courseCode: courseId,
      courseName: String(course.course_name ?? '').trim(),
      ...roundFields,

      coordinator: data.coordinator,
      attendeesCount: data.attendeesCount,
      attendeesListProvided: data.attendeesListProvided,
      attendees,
      requestInvoice: Boolean(data.requestInvoice),
      invoice: data.invoice ?? null,
      notes: data.notes || undefined,
      consent: buildConsentRecord(data.consent, ipAddress),
      // Spelled out rather than left to the Mongoose defaults, so a leg and an
      // ordinary quote registration are the same document to a reader of this
      // file as well as to the database. `baseRegistration` writes both.
      status: 'pending',
      source: 'web',
      ipAddress,
      bundle,
    });
  }

  if (!legs.length) return { ok: false, index: -1, courseId: '' };
  return { ok: true, legs };
}

/**
 * ══ THE MARKER LEG, AND THE ORDER THE WRITE USES ═══════════════════════════
 *
 * The legs are written with the MARKER LAST. The marker is the one leg whose
 * `_id` IS the request's `requestId`, so:
 *
 *     a request is COMPLETE  ⟺  a row exists with _id === bundle.requestId
 *
 * and the query that answers it for one request is
 *
 *     db.register_public.findOne({ _id: ObjectId(<requestId>) })
 *
 * while the sweep for every incomplete request in the collection is
 *
 *     db.register_public.aggregate([
 *       { $match: { bundle: { $exists: true } } },
 *       { $group: { _id: '$bundle.requestId',
 *                   legs: { $sum: 1 },
 *                   marker: { $sum: { $cond: [{ $eq: ['$_id', { $toObjectId: '$bundle.requestId' }] }, 1, 0] } } } },
 *       { $match: { marker: 0 } },
 *     ])
 *
 * ── WHY THIS EXISTS BESIDE A TRANSACTION THAT ALREADY GUARANTEES IT ───────
 *
 * It is the same shape as `writeEarlyBird`'s pre-read beside its E11000, and
 * that comparison is written here because the next reader will otherwise delete
 * this as redundant — which is exactly what its note warns about: "that looks
 * like redundancy and is not, because they fail in different worlds."
 *
 *   · the TRANSACTION is the guarantee, and it is the only thing that prevents
 *     a partial write while it is available;
 *   · the ORDERING is the only thing that leaves the broken state with a NAME
 *     if the transaction is ever absent.
 *
 * A transaction needs a replica set or a sharded cluster. Verified read-only on
 * 2026-09-05 — `hello` reports `setName: atlas-jckskf-shard-0`,
 * `logicalSessionTimeoutMinutes: 30`, MongoDB 8.0.30 — so it holds TODAY. It is
 * not guaranteed to hold after a host move, a cluster change, or someone
 * removing the wrapper without knowing what it was load-bearing for. Inert
 * while it works is the correct price for that.
 *
 * PREMISE, to re-read if it changes: "the deployment is a replica set and the
 * write is wrapped in a transaction". If either stops being true, this ordering
 * stops being insurance and becomes the only thing standing between a failed
 * request and an unnameable collection.
 *
 * @param {Array<object>} legs from `buildBundleLegs`
 * @param {string} requestId the minted id, which is also the marker's `_id`
 * @returns {Array<object>} the same legs, marker last, each with its `_id` set
 *   where it is the marker
 */
export function orderLegsMarkerLast(legs, requestId) {
  const rows = Array.isArray(legs) ? legs : [];
  if (!rows.length) return [];
  // The FIRST authored item is the marker — the author's order is the
  // customer's order, and the first course of the package is the one a person
  // would name. It is written LAST.
  const [marker, ...rest] = rows;
  return [...rest, { ...marker, _id: requestId }];
}
