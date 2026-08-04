import { sendEmail, sendTemplateEmail } from '@/lib/email/postmark';
import { paidReceiptEmail } from '@/lib/email/templates/registration-paid';
import { buildPublicPaidReceiptModel } from '@/lib/email/models/publicPaidReceiptModel';
import { buildInvoiceDisplay } from '@/lib/registration/create-public';
import { decideSendPlan } from '@/lib/email/sendPlan';

/**
 * Idempotently send THE paid-receipt email — one mail, to the customer.
 *
 * ── WHY THE TEMPLATE WORK LANDS HERE AND NOT IN A template-senders/ FILE ────
 * Because this is the real door. All three paid paths — the charge route, the
 * Omise webhook and dev-mark-paid — import `sendPaidReceipt` from this module
 * directly. A `sendPublicPaidReceiptEmail` wrapper did exist in
 * template-senders/public-registration.js with ZERO callers; it is deleted
 * rather than upgraded, because a second door that looks live is worse than no
 * door at all — the next person migrates the wrapper, watches nothing change,
 * and concludes the template is broken.
 *
 * ── THE ADMIN MAIL IS GONE ──────────────────────────────────────────────────
 * The second `sendEmail` that went to POSTMARK_ADMIN_EMAIL — with the consent
 * audit lines (dataChecked / noRefund / changePolicy / termsAccepted, the
 * accepted-at timestamp and the IP) and the Omise charge id — is DELETED, not
 * migrated. Internal recipients now get a BCC of the customer's mail via
 * POSTMARK_BCC_EMAILS, which `buildBcc()` in src/lib/email/postmark.js merges
 * into every send; that is why nothing below passes a `bcc` argument. It cannot
 * be set on the Postmark side — a Template stores Subject + HTML + Text and has
 * no Cc/Bcc field — so recipient routing stays in this repo by necessity.
 *
 * WHAT THAT COSTS, stated rather than discovered later: the consent block and
 * the charge id were the audit trail, and they now live only in the database
 * (`doc.consent`, `doc.payment.omiseChargeId`) and the admin dashboard, not in
 * anyone's inbox. If that trail is needed in mail, it belongs in the customer's
 * template or in a purpose-built export — not in a resurrected second email.
 *
 * ── FALLBACK POLICY ─────────────────────────────────────────────────────────
 *   alias UNSET → hard-coded HTML, logged at INFO. The per-template rollout
 *     switch, not a failure.
 *   alias SET but the send fails (non-2xx; a 422 for an alias that is not on
 *     the server is the likely one) → console.ERROR naming the alias and the
 *     status, then the HTML anyway so the customer still gets a receipt for
 *     money they have already paid.
 *
 * ── ONE SEND, DECIDED AS A VALUE ────────────────────────────────────────────
 * The branch is `decideSendPlan(…)` and a switch on `plan.via`. It replaced a
 * mutable `sentViaTemplate` boolean, which was the double-send hazard: drop the
 * `if` that reads it and the customer gets BOTH the template receipt and the
 * HTML one for the same payment, with the fs-tier call-site count unable to
 * tell that apart from a correct send. See src/lib/email/sendPlan.js.
 *
 * ── THE IDEMPOTENCY GUARD IS UNCHANGED, DELIBERATELY ────────────────────────
 * `payment.receiptSentAt` is still read at the top, still assigned with
 * `doc.payment.receiptSentAt = new Date()` and still persisted with
 * `doc.save()` AFTER the send resolves — not before, or a Postmark outage would
 * permanently mark the receipt as sent, and not via findByIdAndUpdate, which
 * would write around the in-memory doc the callers keep using. The
 * webhook-vs-charge-route race is what this flag exists for; whichever loses
 * becomes a no-op.
 */
export async function sendPaidReceipt(doc) {
  if (!doc || doc.payment?.receiptSentAt) return { skipped: true };

  const { invoiceCountry, invoiceAddress } = buildInvoiceDisplay({
    invoice: doc.invoice,
  });

  const refNo = String(doc._id).slice(-8).toUpperCase();
  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_PAID_USER;
  const to = doc.coordinator.email;

  // SUBJECT COMES FROM THE POSTMARK TEMPLATE on this path — there is
  // deliberately no subject string here.
  const templateResult = alias
    ? await sendTemplateEmail({
        to,
        templateAlias: alias,
        templateModel: buildPublicPaidReceiptModel({
          doc,
          invoiceCountry,
          invoiceAddress,
        }),
      })
    : undefined;

  const plan = decideSendPlan({
    alias,
    templateOutcome: templateResult?.error ? 'failed' : 'sent',
  });

  if (plan.via === 'html') {
    if (plan.reason === 'template_failed') {
      console.error(
        '[paid-template] ❌ template send FAILED — falling back to hard-coded HTML.',
        'alias:', alias,
        '| status:', templateResult?.error,
        '| ref:', refNo
      );
    } else {
      console.info(
        '[paid-template] POSTMARK_TEMPLATE_ALIAS_PAID_USER not set — sending hard-coded HTML.',
        'ref:', refNo
      );
    }

    const msg = paidReceiptEmail({
      referenceNumber: refNo,
      firstName: doc.coordinator.firstName,
      courseName: doc.courseName || doc.courseId,
      classDate: doc.classDate,
      attendanceMode: doc.attendanceMode,
      scheduleType: doc.scheduleType,
      attendees: doc.attendees,
      attendeesListProvided: doc.attendeesListProvided,
      coordinatorIsAttending: doc.coordinator.isAttending,
      attendeesCount: doc.attendeesCount,
      invoice: doc.invoice,
      invoiceCountry,
      invoiceAddress,
      requestInvoice: doc.requestInvoice,
      pricing: doc.pricing,
      method: doc.payment?.method,
      paidAt: doc.payment?.paidAt,
    });

    await sendEmail({
      to,
      subject: `ชำระเงินสำเร็จ ${doc.courseName || ''} - ${refNo}`,
      html: msg.html,
      text: msg.text,
    });
  }

  doc.payment.receiptSentAt = new Date();
  await doc.save();
  return { ok: true, ...plan };
}
