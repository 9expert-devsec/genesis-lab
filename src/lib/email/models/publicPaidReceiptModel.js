import { formatTHB } from '@/lib/pricing';
import { refNo } from '@/lib/refNo';
import { siteDateParts } from '@/lib/articlePublishTime';
import {
  attendanceModeBlock,
  buildAttendeeBlocks,
  buildDocumentRequestedBlock,
} from './labels';

/**
 * TemplateModel for POSTMARK_TEMPLATE_ALIAS_PAID_USER — the short receipt
 * (ใบเสร็จรับเงินอย่างย่อ) sent once an Omise charge succeeds. NOT a tax
 * invoice; the team issues that separately, which is why the template keeps
 * that sentence and this model keeps `document_requested` as a "what you asked
 * us to bill to" summary rather than as invoice content.
 *
 * Replaces src/lib/email/templates/registration-paid.js, which stays as the
 * fallback while the alias is unset.
 *
 * ── THE ONE PLACE THIS MODEL DIVERGES FROM THE TEMPLATE IT REPLACES ─────────
 * `paid_at_label`. registration-paid.js formats with `d.getHours()` /
 * `d.getMonth()`, i.e. in the RUNTIME's timezone — and nothing in this repo
 * sets TZ, so on Vercel that is UTC and the receipt has always told Thai
 * customers a time seven hours early (an 09:00 payment reads 02:00, and
 * anything paid before 07:00 local reads as the PREVIOUS DAY). That is a
 * pre-existing bug in the fallback, not something introduced here.
 *
 * This model cannot reproduce it even if it wanted to: a pure builder must be
 * deterministic, and a value that changes with the host's TZ is not testable in
 * the pure tier. So it goes through `siteDateParts`, pinned to Asia/Bangkok by
 * src/lib/articlePublishTime.js — the module that exists because this exact
 * class of bug already cost this repo a round of debugging on article
 * timestamps. Wording, Buddhist-era year and `เวลา HH:MM น.` shape are
 * unchanged, so a reader sees the same sentence with the right number in it.
 *
 * CONSEQUENCE, stated so nobody discovers it in a diff: while the alias is
 * unset the fallback still sends the UTC-shifted time. The two paths disagree
 * by 7 hours until the template goes live, and fixing the fallback was not in
 * this change's scope.
 *
 * ── NOT MAPPED, AND WHY ─────────────────────────────────────────────────────
 *   · `omiseChargeId`, the whole `consent` audit block — carried ONLY by the
 *     deleted admin branch of send-receipt.js. Never shown to the customer.
 *   · `location` — masterclass vocabulary; public registrations carry no venue.
 *
 * PURE: no env, no db, no `new Date()` (dates arrive as arguments).
 *
 * @param {object} p
 * @param {object} p.doc   the RegisterPublic mongoose doc (or a plain object)
 * @param {'TH'|'OTHER'} p.invoiceCountry
 * @param {string} p.invoiceAddress
 */
export function buildPublicPaidReceiptModel({
  doc,
  invoiceCountry = 'TH',
  invoiceAddress = '',
}) {
  const coordinator = doc?.coordinator ?? {};
  const pricing = doc?.pricing ?? {};
  const payment = doc?.payment ?? {};

  const { attendee_list, attendee_later } = buildAttendeeBlocks({
    attendeesListProvided: doc?.attendeesListProvided,
    attendees: doc?.attendees,
    attendeesCount: doc?.attendeesCount,
    coordinatorIsAttending: coordinator.isAttending,
  });

  const seats = pricing.seats ?? doc?.attendeesCount ?? 1;

  return {
    ref_no: refNo(doc?._id),

    coordinator_name: `${coordinator.firstName ?? ''} ${coordinator.lastName ?? ''}`.trim(),
    coordinator_first_name: coordinator.firstName ?? '',
    coordinator_email: coordinator.email ?? '',
    coordinator_phone: coordinator.phone ?? '',

    course_name: doc?.courseName || doc?.courseId || '',
    course_date: doc?.classDate || 'ตามรอบที่เลือก',
    attendance_mode: attendanceModeBlock({
      attendanceMode: doc?.attendanceMode,
      scheduleType: doc?.scheduleType,
    }),

    payment_method_label: paymentMethodLabel(payment.method),
    paid_at_label: formatPaidAt(payment.paidAt),

    // Pricing is the snapshot frozen at checkout, never recomputed here.
    price_per_seat: formatTHB(pricing.pricePerSeat ?? 0),
    seats,
    subtotal: formatTHB(pricing.subtotal ?? 0),
    vat_amount: formatTHB(pricing.vatAmount ?? 0),
    total: formatTHB(pricing.total ?? 0),

    /**
     * ══ KNOWN DEFECT: THIS AND `seats` ABOVE CAN DISAGREE, AND BOTH ARE RIGHT ══
     *
     * `seats` (line ~69) is `pricing.seats` — the number the MONEY was computed
     * from, frozen at checkout and never recomputed. `total_participants` is
     * `attendeesCount` — the number the registration currently says are coming.
     *
     * THEY WERE THE SAME NUMBER AT CHARGE TIME and nothing keeps them equal
     * afterwards. So a receipt re-sent for a record whose count changed since
     * payment states a headcount that disagrees with its own total, on the same
     * page, with no explanation.
     *
     * ── THE HISTORY, BECAUSE IT EXPLAINS WHY THE SHAPE LOOKS UNFINISHED ─────
     * Before round 8, `attendeesCount` was editable on ANY status with no gate,
     * so an admin could STUMBLE into this by mistyping a number in a form that
     * also edits phone numbers. Round 8 closed that hole — and then opened a
     * narrow, deliberate one beside it: `updateAttendeesCountPaid`, a panel
     * that stated this exact consequence in words and took the admin's consent
     * to it. For one round, the divergence was a supported outcome.
     *
     * ── THAT DOOR IS NOW GONE, AND THIS DEFECT IS MOSTLY CLOSED WITH IT ──────
     * A paid record's count cannot be changed by any path, in either direction.
     * `pricing.seats` is frozen at charge and `attendeesCount` is frozen by the
     * gate, so on a paid registration the two numbers agree at charge time and
     * NOTHING IN THIS SYSTEM CAN SEPARATE THEM AFTERWARDS. The re-sent receipt
     * that contradicts itself is no longer reachable through the admin screen.
     *
     * ── THE WINDOW THAT REMAINS, STATED RATHER THAN CLAIMED CLOSED ───────────
     * `paid` is written by the Omise webhook, not by checkout. Between the
     * charge being computed into `pricing.seats` and that webhook landing, the
     * record is still `pending`/`confirmed` and the count is still an ordinary
     * editable field. An edit inside that window separates the two numbers
     * permanently, and the gate never sees it because the status has not
     * flipped yet.
     *
     * That is a real race and it is not fixed here. It is much narrower than
     * what round 8 found — seconds to minutes, not the record's whole life —
     * and closing it belongs with the webhook, not with a receipt mapper.
     *
     * STILL NOT PAPERED OVER by making one field read the other: that would
     * silently pick a winner. If the two ever do disagree, the open question is
     * which number a receipt should quote and whether it should show both with
     * a note. That is a decision about documents, not a bug in this mapper.
     */
    total_participants: doc?.attendeesCount ?? seats,
    attendee_list,
    attendee_later,

    document_requested: buildDocumentRequestedBlock({
      requestInvoice: Boolean(doc?.requestInvoice),
      invoice: doc?.invoice ?? null,
      invoiceCountry,
      invoiceAddress,
    }),
  };
}

/** Omise gives us two methods and the receipt names them in Thai. */
function paymentMethodLabel(method) {
  return method === 'credit_card' ? 'บัตรเครดิต/เดบิต' : 'QR PromptPay';
}

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/**
 * `26 กรกฎาคม 2569 เวลา 14:30 น.` — Asia/Bangkok, Buddhist era.
 * Returns the template's own em-dash placeholder for a missing/unparseable
 * instant rather than an empty string, so the receipt never shows a blank row.
 */
function formatPaidAt(value) {
  const p = siteDateParts(value);
  if (!p) return '—';
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${p.day} ${THAI_MONTHS_FULL[p.month - 1]} ${p.year + 543} เวลา ${hh}:${mm} น.`;
}
