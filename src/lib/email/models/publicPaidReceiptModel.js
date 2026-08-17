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
