/**
 * THE ACTION QUEUE — the five states an admin actually has to act on.
 *
 * ══ WHERE THESE FIVE CAME FROM, AND WHAT WAS LEFT OUT ═══════════════════════
 *
 * Not from the Figma mockup. Round E1 measured that mockup's queue and found
 * four of its five cards need data this system does not collect, and its "Live"
 * strip was the existing system cards relabelled — a count of open training
 * rounds captioned ผู้ใช้งานออนไลน์. These five are what the collections
 * actually hold, measured on 2026-09-05.
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
 * ══ THE FIVE, AS DATA ═══════════════════════════════════════════════════════
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
 * course, page (lib/registrations/filterScope PER_SOURCE_PARAMS). It has NO
 * filter for payment state, for receipt state, or for "older than N days" as a
 * rolling threshold — `from`/`to` take calendar dates, which cannot express a
 * bound that moves with the clock. Masterclass reads status/q/range/courseId/
 * batchId/licenseScope; webhook-logs reads page/event/status.
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
    href: '/admin/registrations?status=pending',
    linkFiltered: false,
    linkNote: 'รายการทั้งหมดที่รอดำเนินการ',
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
 * The four registration-scope counts, as one parallel wave.
 *
 * Three read `register_public` and one reads `masterclass_registrations`.
 *
 * ── INDEX USE, MEASURED WITH explain() RATHER THAN ASSUMED ──────────────────
 * Both collections carry `{createdAt: -1, status: 1}`, and three of the four
 * queries use it (IXSCAN): (a) and (c) on register_public and (d) on
 * masterclass_registrations all bound `createdAt`, which is the index's leading
 * field.
 *
 * (b) IS A COLLSCAN, and that is not an oversight to fix silently. It has NO
 * createdAt predicate — an unsent receipt is overdue regardless of age — so the
 * leading field is unconstrained, and there is no index on
 * `payment.receiptSentAt` at all. Over 41 production documents this is free.
 * The honest options if register_public ever grows are a partial index on
 * `{status: 1, 'payment.receiptSentAt': 1}` or accepting the scan; adding an
 * age bound to make the existing index apply would change what the card MEANS,
 * which is the wrong reason to change a query.
 */
export async function readRegistrationQueue({ RegisterPublic, MasterclassRegistration }, now = new Date()) {
  const stalePayment = daysAgo(STALLED_PAYMENT_DAYS, now);
  const stalePending = daysAgo(STALE_PENDING_DAYS, now);

  const [stalledPayments, receiptsNotSent, stalePublicPending, staleMasterclassPending] =
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
      // (c) Nobody has moved this in a fortnight.
      RegisterPublic.countDocuments({
        status: 'pending',
        createdAt: { $lt: stalePending },
      }),
      // (d) The same question of masterclass — the largest queue in the system,
      // and the first masterclass figure ever to reach this page.
      MasterclassRegistration.countDocuments({
        status: 'pending',
        createdAt: { $lt: stalePending },
      }),
    ]);

  return { stalledPayments, receiptsNotSent, stalePublicPending, staleMasterclassPending };
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
