/**
 * THE ACTION QUEUE — the six states an admin actually has to act on.
 *
 * ══ WHERE THESE CAME FROM, AND WHAT WAS LEFT OUT ════════════════════════════
 *
 * Not from the Figma mockup. Round E1 measured that mockup's queue and found
 * four of its five cards need data this system does not collect, and its "Live"
 * strip was the existing system cards relabelled — a count of open training
 * rounds captioned ผู้ใช้งานออนไลน์. FIVE OF THE SIX are what the collections
 * actually hold, measured on 2026-09-05.
 *
 * THE SIXTH — `legacyImportPending` — was added when the Drupal import gave
 * register_public a kind of row it had never held. It is the one card here
 * counting a state that did not exist when the other five were measured, and it
 * renders 0 until the import runs. Nothing in the exclusion list below is
 * reopened by it: those four were excluded because the DATA does not exist, and
 * this one's data is about to, in a collection this file already reads.
 *
 * DELIBERATELY ABSENT, each with the measurement that excluded it:
 *
 *   · รออนุมัติคอร์สใหม่ — there is NO approval workflow anywhere. Every model
 *     was grepped: the only publish-ish flags are three plain booleans defaulting
 *     to true, with no pending state, no reviewer and no submitted-at. 0 of 81
 *     course_extensions have isPublished:false. Mapping this onto isPublished
 *     would assert a review that never happens.
 *   · ตารางอบรมใกล้เต็ม — MSDB's /schedules exposes no seat, capacity or
 *     registered field at all (row keys: _id, course, dates, status, type,
 *     signup_url, createdAt, updatedAt). Genesis's `max_seats` is set on 9 of 57
 *     sidecars, only 4 of which are upcoming rounds, and joining register_public
 *     by classId finds 0 signups on every one of them because public signups land
 *     upstream. A "< 10 seats" number computed here would be near-meaningless.
 *   · รีวิวที่ยังไม่ได้เผยแพร่ — featured_reviews stores {review_id, sort_order,
 *     active}; 7 rows, all active, 0 inactive. The bodies live in a third system
 *     whose endpoint is /api/public/reviews and already returns only published
 *     rows, with no approval key on any of them.
 *   · Anything counting people, streams or classrooms — nothing in this system
 *     records a session, a stream or a room.
 *
 * ALSO NOT HERE, and this one is a judgement call worth stating: round E1 found
 * ONE registration whose PromptPay charge FAILED and which is still sitting at
 * `status: pending`. It is a different condition from (a) with a different
 * remedy, so folding it into (a) would change what that card means, and giving
 * it a card of its own would make six. It stays unsurfaced, and that is a gap.
 *
 * ── THE QUEUE IS NOT RANGE-DEPENDENT, ON PURPOSE ────────────────────────────
 * These are absolute operational states, not measurements of a period. "Three
 * receipts were never sent" does not become untrue because the reader selected
 * วันนี้, and a queue that emptied itself when you narrowed the range would be
 * the most dangerous kind of dashboard — one that hides work by being filtered.
 * The range control drives the registration CARDS and the chart; it does not
 * reach here, and a test pins that.
 */

import {
  STALE_PENDING_DAYS,
  STALLED_PAYMENT_DAYS,
  THRESHOLD_LABEL,
  WEBHOOK_ERROR_WINDOW_HOURS,
  daysAgo,
  hoursAgo,
} from '@/lib/dashboard/queueThresholds';

/**
 * ══ THE CARDS, AS DATA ══════════════════════════════════════════════════════
 *
 * Each entry owns its id, its Thai label, the threshold phrase it is counted
 * under, and its link — so a card cannot be rendered without the rule that
 * produced it.
 *
 * ── `linkFiltered` IS THE HONEST BIT ────────────────────────────────────────
 * `true` means the destination list, given that href, shows THE SAME SET this
 * card counted. `false` means the list cannot express the condition and the
 * href is the closest thing it can express — so the card's number and the
 * list's number will differ, and the UI says so rather than letting the reader
 * discover it.
 *
 * The registrations list reads exactly: source, status, q, range, from, to,
 * course, page, legacy (lib/registrations/filterScope PER_SOURCE_PARAMS). It has
 * NO filter for payment state, for receipt state, or for "older than N days" as
 * a rolling threshold — `from`/`to` take calendar dates, which cannot express a
 * bound that moves with the clock. Masterclass reads status/q/range/courseId/
 * batchId/licenseScope; webhook-logs reads page/event/status.
 *
 * ── `legacy` WAS ADDED FOR THESE CARDS, AND ONLY AFTER THE LIST COULD APPLY IT ─
 * (c) and (f) partition register_public's pending rows between them, so each
 * one's link has to be able to say which half it means. The alternative — two
 * cards both linking to `?status=pending` and each quietly showing the other's
 * rows — is the failure this whole block exists to prevent, so the parameter was
 * threaded through the list, the counts and the badge FIRST and the hrefs point
 * at it second. It is not an invented parameter; see `legacyClause`.
 *
 * NOT ONE query parameter below is invented. A card that navigates to a list
 * showing something else is worse than a card with no link at all.
 */
export const QUEUE_CARDS = Object.freeze([
  {
    id: 'stalledPayments',
    scope: 'registrations',
    label: 'รอชำระเงิน (PromptPay ค้าง)',
    threshold: THRESHOLD_LABEL.stalledPayment,
    href: '/admin/registrations?status=pending',
    // The list can say `status=pending`. It cannot say
    // `payment.omiseStatus=pending`, and it cannot say "older than two days".
    linkFiltered: false,
    linkNote: 'รายการทั้งหมดที่รอดำเนินการ',
  },
  {
    id: 'receiptsNotSent',
    scope: 'registrations',
    label: 'ชำระแล้วแต่ยังไม่ได้ส่งใบเสร็จ',
    threshold: null, // no age rule — an unsent receipt is overdue immediately
    href: '/admin/registrations?status=paid',
    // `status=paid` is exact; `payment.receiptSentAt: null` is not expressible.
    linkFiltered: false,
    linkNote: 'รายการที่ชำระแล้วทั้งหมด',
  },
  {
    id: 'stalePublicPending',
    scope: 'registrations',
    label: 'ลงทะเบียน Public ค้างนาน',
    threshold: THRESHOLD_LABEL.stalePending,
    /**
     * ── `legacy=exclude`, AND IT IS THE SAME PREDICATE THE COUNT USES ───────
     * The query below excludes imported rows, so the link must too, or this card
     * would send an admin to a list holding the ~460 rows the card deliberately
     * did not count. See the reasoning at query (c).
     */
    href: '/admin/registrations?status=pending&legacy=exclude',
    /**
     * STILL `false`, AND THE REMAINING GAP IS THE AGE — NOT THE IMPORT.
     *
     * Two of this card's three conditions are now expressible and are expressed:
     * `status=pending` and `legacy=exclude`. The third is not, and cannot be —
     * `from`/`to` take CALENDAR DATES and this threshold is a rolling
     * "older than 14 days" that moves with the clock. So the destination shows
     * every non-imported pending registration, including the ones inside the
     * fortnight, and the note says so rather than leaving the reader to discover
     * it by counting rows.
     *
     * Encoding the age as a computed `to=<14 days ago>` was considered and
     * rejected: the href is a static string, and making it a function of `now`
     * would buy a boundary that is CLOSE to the query's but not equal to it —
     * local end-of-day against an exact 14×24h — which is a subtler wrongness
     * than the one it replaces.
     */
    linkFiltered: false,
    linkNote: 'รายการที่รอดำเนินการ (ไม่รวมข้อมูลนำเข้า) — ทุกช่วงอายุ',
  },
  {
    /**
     * ══ THE REGISTRATIONS CARRIED ACROSS FROM THE OLD SITE ══════════════════
     *
     * 2,427 Drupal registrations land in register_public / register_inhouse with
     * a `legacy.sid` stamp. They arrive at `status: 'pending'` and every one of
     * them needs a human to place it, so this is a queue in exactly the sense
     * the other five are: a state an admin has to act on.
     *
     * ── `threshold: null`, AND THAT IS A DECISION RATHER THAN AN OMISSION ───
     * Every imported row is OLD BY DEFINITION — its createdAt is whatever Drupal
     * recorded, all of it before cutover. An age rule would therefore filter
     * NOTHING, and worse, it would imply the existence of imported rows that are
     * "not yet due", which is a state that cannot occur. `receiptsNotSent`
     * carries a null threshold for the neighbouring reason: inventing a rule
     * nobody decided is not caution.
     *
     * ── IT RENDERS 0 BEFORE THE IMPORT RUNS, AND MUST ───────────────────────
     * Today this is zero: nothing has been imported yet. Same rule the webhook
     * card is held to — an admin who cannot tell "nothing imported yet" from
     * "the card is broken" has learned nothing, and a card that appeared out of
     * nowhere on cutover night would be indistinguishable from a bug on the one
     * night nobody can afford to debug it.
     *
     * ── SIXTH CARD, AND THE HEADER'S LIST OF EXCLUSIONS IS UNAFFECTED ───────
     * The four cards that header names as absent were each excluded because the
     * data does not exist. This one is the opposite case: the data is about to
     * exist, in a collection this file already reads, under a predicate the same
     * file already uses. Nothing in that list is reopened by it.
     */
    id: 'legacyImportPending',
    scope: 'registrations',
    label: 'ข้อมูลลูกค้าจากเว็บเก่า',
    threshold: null,
    href: '/admin/registrations?status=pending&legacy=only',
    /**
     * ── `true`, AND IT IS THE FIRST CARD THAT CAN HONESTLY SAY SO ───────────
     * The count is `status: 'pending'` AND `legacy.sid` exists. The list reads
     * `status` and now reads `legacy`, and `legacyClause('only')` is the SAME
     * predicate this file's query uses, not an approximation of it. So it shows
     * exactly the set this number counted, and the "เปิดรายการ:" caveat line is
     * correctly absent from the card.
     *
     * That flag is what makes the `legacy` parameter worth adding at all. A card
     * linking to a list that silently held the other card's rows too is the
     * failure the header calls "a dashboard that hides work", one screen later.
     */
    linkFiltered: true,
    linkNote: 'รายการนำเข้าที่รอดำเนินการ',
  },
  {
    id: 'staleMasterclassPending',
    scope: 'registrations',
    label: 'Masterclass ค้างนาน',
    threshold: THRESHOLD_LABEL.stalePending,
    href: '/admin/masterclass/registrations?status=pending',
    linkFiltered: false,
    linkNote: 'รายการทั้งหมดที่รอดำเนินการ',
  },
  {
    id: 'webhookErrors',
    /**
     * SYSTEM scope, not registration. It is operational rather than commercial,
     * and Webhook Logs already lives under ระบบ in the page registry — so the
     * admin who can act on this is the one who can already open that screen.
     */
    scope: 'system',
    label: 'Webhook ผิดพลาด',
    threshold: THRESHOLD_LABEL.webhookWindow,
    href: '/admin/webhook-logs?status=error',
    // The ONE card whose status filter is exact. The 24-hour window is not
    // expressible — that page reads page/event/status and no date at all — so
    // the list shows every error ever, which for this collection means every
    // error inside the 30-day TTL.
    linkFiltered: false,
    linkNote: 'ข้อผิดพลาดทั้งหมดที่ยังเก็บอยู่',
  },
]);

/** The ids belonging to one scope, in card order. */
export function queueIdsForScope(scope) {
  return QUEUE_CARDS.filter((c) => c.scope === scope).map((c) => c.id);
}

/**
 * The five registration-scope counts, as one parallel wave.
 *
 * Four read `register_public` and one reads `masterclass_registrations`.
 *
 * ── INDEX USE, MEASURED WITH explain() RATHER THAN ASSUMED ──────────────────
 * Both collections carry `{createdAt: -1, status: 1}`, and three of the five
 * queries use it (IXSCAN): (a) and (c) on register_public and (d) on
 * masterclass_registrations all bound `createdAt`, which is the index's leading
 * field. (c) additionally filters on `legacy.sid` OVER THAT SAME SCAN — a
 * predicate, not a second access path — so its plan is unchanged by this round.
 *
 * (b) AND (f) ARE COLLSCANS, and neither is an oversight to fix silently. Both
 * have NO createdAt predicate — an unsent receipt is overdue regardless of age,
 * and every imported row is old by definition — so the leading field is
 * unconstrained for both, and there is no index on `payment.receiptSentAt` at
 * all. Over 41 production documents this is free.
 *
 * (f) IS THE FIRST QUERY HERE WHOSE COST GROWS WITH THE IMPORT: register_public
 * goes from 41 documents to roughly 2,470. That is still nothing, and it is
 * written down because it is the number that changes. The honest options if
 * register_public ever genuinely grows are a partial index — on
 * `{status: 1, 'payment.receiptSentAt': 1}` for (b), on
 * `{status: 1, 'legacy.sid': 1}` for (f) — or accepting the scan. Adding an age
 * bound to either, to make the existing index apply, would change what the card
 * MEANS, which is the wrong reason to change a query.
 *
 * The unique partial index on `legacy.sid` serves NEITHER of the new predicates:
 * it exists for the import's dedup guarantee, it is restricted to documents
 * where the key exists, and a `$exists: false` cannot be answered from it at all.
 */
export async function readRegistrationQueue({ RegisterPublic, MasterclassRegistration }, now = new Date()) {
  const stalePayment = daysAgo(STALLED_PAYMENT_DAYS, now);
  const stalePending = daysAgo(STALE_PENDING_DAYS, now);

  const [stalledPayments, receiptsNotSent, stalePublicPending, staleMasterclassPending, legacyImportPending] =
    await Promise.all([
      /**
       * (a) A PromptPay charge created and never settled.
       *
       * BOTH halves are required. `payment.omiseStatus: 'pending'` alone would
       * count a charge whose webhook has since moved the registration to `paid`
       * but left the sub-document behind; `status: 'pending'` alone would count
       * every quote-flow registration, which is 23 of the 41 in production and
       * has no charge at all.
       */
      RegisterPublic.countDocuments({
        'payment.omiseStatus': 'pending',
        status: 'pending',
        createdAt: { $lt: stalePayment },
      }),
      /**
       * (b) Money arrived and the receipt was never recorded as sent.
       *
       * `$in: [null]` matches BOTH an explicit null and a missing field, which
       * matters because the field defaults to null on new documents and is
       * simply absent on every one written before it existed. `$eq: null` would
       * do the same, but the array form says the intent out loud.
       *
       * No age threshold: an unsent receipt is overdue the moment it is unsent.
       */
      RegisterPublic.countDocuments({
        status: 'paid',
        'payment.receiptSentAt': { $in: [null] },
      }),
      /**
       * (c) Nobody has moved this in a fortnight.
       *
       * ══ IMPORTED ROWS ARE EXCLUDED, AND THAT IS THE WHOLE OF (f) ═══════════
       *
       * `legacy.sid` absent — i.e. this registration was taken by THIS system,
       * not carried across from Drupal.
       *
       * ── WHY, AND IT IS THE HEADER'S OWN RULE ONE SCREEN LATER ────────────
       * Every one of the ~2,427 imported rows arrives `pending` with a createdAt
       * from before cutover, so all of them clear a 14-day threshold on day one.
       * Folded in here, this card would read ~460 the morning after the import
       * and the 3 or 4 GENUINELY STALE registrations — the ones a human has
       * actually failed to move — would be invisible inside it. That is exactly
       * what the header means by "a dashboard that hides work by being
       * filtered", except the filter would be the arithmetic rather than the
       * range control.
       *
       * ── THEY ARE DIFFERENT WORK WITH DIFFERENT REMEDIES ─────────────────
       * (c) is "chase this customer, or close it" — a stalled conversation. (f)
       * is "place this record" — a bulk clerical pass over history that has
       * nothing to chase. One person can clear the whole of (f) in an afternoon
       * and it tells you nothing about (c). Two conditions with two remedies are
       * two cards; that is the same argument the header makes for leaving the
       * one failed-PromptPay registration out of (a).
       *
       * ── INDEX ────────────────────────────────────────────────────────────
       * Unchanged. `createdAt` still leads, so `{createdAt: -1, status: 1}` still
       * serves this as an IXSCAN; the `legacy.sid` predicate is a filter applied
       * over that scan, not a new access path. The unique partial index on
       * `legacy.sid` cannot serve a `$exists: false`, and is not meant to.
       */
      RegisterPublic.countDocuments({
        status: 'pending',
        createdAt: { $lt: stalePending },
        'legacy.sid': { $exists: false },
      }),
      // (d) The same question of masterclass — the largest queue in the system,
      // and the first masterclass figure ever to reach this page.
      MasterclassRegistration.countDocuments({
        status: 'pending',
        createdAt: { $lt: stalePending },
      }),
      /**
       * (f) Carried across from Drupal, and still nobody has placed it.
       *
       * `legacy.sid` present is the whole of "imported" — see the shared
       * models/legacyImportSchema and the unique partial index built from the
       * same predicate, so the card and the constraint agree by construction.
       *
       * ── NO createdAt BOUND, DELIBERATELY ────────────────────────────────
       * Every imported row is old by definition; an age rule would filter
       * nothing and would imply that some imported rows are "not yet due", a
       * state that cannot occur. See the card's `threshold: null`.
       *
       * ── THIS IS A COLLSCAN TODAY, AND SAYING SO IS THE POINT ────────────
       * No `createdAt` predicate means the `{createdAt: -1, status: 1}` index's
       * leading field is unconstrained, exactly as query (b) is and for the same
       * structural reason. Over today's 41 documents it is free. AFTER THE
       * IMPORT IT IS ~2,470, which is still nothing, but it is the first query
       * here whose cost grows with the import — so if this page ever slows, the
       * honest fix is a partial index on `{status: 1, 'legacy.sid': 1}`, not an
       * age bound bolted on to make an existing index apply. Adding one would
       * change what the card MEANS, which is the wrong reason to change a query.
       */
      RegisterPublic.countDocuments({
        status: 'pending',
        'legacy.sid': { $exists: true },
      }),
    ]);

  return {
    stalledPayments,
    receiptsNotSent,
    stalePublicPending,
    staleMasterclassPending,
    legacyImportPending,
  };
}

/**
 * (e) Webhook deliveries that failed inside the window.
 *
 * Served by the `{status: 1, processed_at: -1}` compound index the model
 * declares — an equality then a range, which is the shape that index is for.
 * Round E1 measured it at 253 ms.
 *
 * TODAY THIS IS ZERO, and it must render as zero rather than vanish: all 987
 * logs are `ok` and none has ever been an error. An admin who cannot tell "no
 * errors" from "the card is broken" has learned nothing.
 */
export async function readSystemQueue({ WebhookLog }, now = new Date()) {
  const since = hoursAgo(WEBHOOK_ERROR_WINDOW_HOURS, now);
  const webhookErrors = await WebhookLog.countDocuments({
    status: 'error',
    processed_at: { $gte: since },
  });
  return { webhookErrors };
}
