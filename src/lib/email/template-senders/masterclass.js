import { sendEmail, sendTemplateEmail } from '@/lib/email/postmark';
import { formatTHB } from '@/lib/pricing';

// ── Helpers (copied inline from src/lib/masterclass/send-receipt.js) ──────────

function buildInvoiceAddress(invoice) {
  if (!invoice) return '';
  if ((invoice.country ?? 'TH') === 'TH') {
    const a = invoice.thaiAddress ?? {};
    return [a.addressLine, a.subDistrict, a.district, a.province, a.postalCode]
      .filter(Boolean).join(' ');
  }
  const a = invoice.internationalAddress ?? {};
  return [a.line1, a.line2, a.city, a.state, a.postalCode, a.country]
    .filter(Boolean).join(', ');
}

/** Prefer coordinator, fall back to attendee (old records). */
function resolveRecipient(doc) {
  const coord = doc.coordinator;
  if (coord?.email) {
    return { to: coord.email, firstName: coord.firstName ?? '', phone: coord.phone ?? '' };
  }
  const att = doc.attendee ?? {};
  return { to: att.email ?? '', firstName: att.firstName ?? '', phone: att.phone ?? '' };
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Paid receipt (Postmark Template) ──────────────────────────────────────────

/**
 * Idempotently send the paid-receipt email for a Masterclass registration
 * using a Postmark Template. Guards on `payment.receiptSentAt`.
 */
export async function sendMasterclassPaidReceipt(doc) {
  if (!doc || doc.payment?.receiptSentAt) return { skipped: true };

  const recipient = resolveRecipient(doc);
  if (!recipient.to) return { skipped: true, reason: 'no_email' };

  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_MC_PAID;
  if (!alias) throw new Error('[mc-template] POSTMARK_TEMPLATE_ALIAS_MC_PAID not set');

  const refNo = String(doc._id).slice(-8).toUpperCase();
  const methodLabel = doc.payment?.method === 'credit_card' ? 'บัตรเครดิต/เดบิต' : 'QR PromptPay';

  const templateModel = {
    first_name:               recipient.firstName,
    ref_no:                   refNo,
    method_label:             methodLabel,
    paid_at_label:            fmtDate(doc.payment?.paidAt),
    course_title:             doc.course_title,
    batch_label:              doc.batch_label,
    batch_date_label:         doc.batch_date_label || 'ตามรอบที่เลือก',
    venue_name:               doc.venue_name || '',
    show_venue:               Boolean(doc.venue_name),
    price_per_seat:           formatTHB(doc.pricing?.pricePerSeat ?? 0),
    seats:                    doc.pricing?.seats ?? doc.attendeesCount ?? 1,
    subtotal:                 formatTHB(doc.pricing?.subtotal ?? 0),
    vat_amount:               formatTHB(doc.pricing?.vatAmount ?? 0),
    total:                    formatTHB(doc.pricing?.total ?? 0),
    show_invoice:             Boolean(doc.request_invoice && doc.invoice),
    invoice_type:             doc.invoice?.type || '',
    invoice_name_line:        doc.invoice?.type === 'corporate' ? (doc.invoice?.companyName || '') : `${doc.invoice?.firstName ?? ''} ${doc.invoice?.lastName ?? ''}`.trim(),
    invoice_tax_id:           doc.invoice?.taxId || '',
    invoice_address:          buildInvoiceAddress(doc.invoice),
    show_attendees:           Boolean(doc.attendeesListProvided) && (doc.attendees ?? []).length > 0,
    attendees_deferred:       doc.attendeesListProvided === false,
    attendees_count:          doc.attendeesCount ?? 1,
    coordinator_is_attending: Boolean(doc.coordinator?.isAttending),
    attendees: (doc.attendees ?? []).map((a, i) => ({
      number:         i + 1,
      first_name:     a.firstName,
      last_name:      a.lastName,
      full_name:      `${a.firstName} ${a.lastName}`.trim(),
      email:          a.email,
      phone:          a.phone,
      is_coordinator: i === 0 && Boolean(doc.coordinator?.isAttending),
    })),
  };

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  await Promise.allSettled([
    sendTemplateEmail({ to: recipient.to, templateAlias: alias, templateModel }),
    adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `[Admin MC ชำระแล้ว] ${refNo} — ${doc.course_title}`,
          text: `เลขอ้างอิง: ${refNo}\nวิธี: ${methodLabel}\nยอด: ${formatTHB(doc.pricing?.total ?? 0)} บาท\nผู้ประสานงาน: ${recipient.firstName} <${recipient.to}>\nเบอร์: ${recipient.phone}`,
        })
      : Promise.resolve(),
  ]);

  await doc.constructor.findByIdAndUpdate(doc._id, {
    $set: { 'payment.receiptSentAt': new Date() },
  });
  console.log('[mc-receipt] ✅ sendMasterclassReceipt complete | receiptSentAt set | docId:', String(doc._id));
  return { ok: true };
}

// ── Quote confirmation (Postmark Template) ────────────────────────────────────

/**
 * Send a quote-request confirmation immediately after registration using a
 * Postmark Template. No payment at this point.
 */
export async function sendMasterclassQuoteConfirmation(doc, referenceNumber) {
  const recipient = resolveRecipient(doc);
  if (!recipient.to) return { skipped: true, reason: 'no_email' };

  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_MC_QUOTE;
  if (!alias) throw new Error('[mc-template] POSTMARK_TEMPLATE_ALIAS_MC_QUOTE not set');

  const refNo = referenceNumber ?? String(doc._id).slice(-8).toUpperCase();
  const attList = doc.attendees ?? [];

  const templateModel = {
    first_name:            recipient.firstName,
    ref_no:                refNo,
    course_title:          doc.course_title,
    batch_label:           doc.batch_label,
    batch_date_label:      doc.batch_date_label || 'ตามรอบที่เลือก',
    venue_name:            doc.venue_name || '',
    show_venue:            Boolean(doc.venue_name),
    attendees_count:       doc.attendeesCount ?? 1,
    total:                 formatTHB(doc.pricing?.total ?? 0),
    show_invoice:          Boolean(doc.request_invoice && doc.invoice),
    invoice_type:          doc.invoice?.type || '',
    invoice_name_line:     doc.invoice?.type === 'corporate' ? (doc.invoice?.companyName || '') : `${doc.invoice?.firstName ?? ''} ${doc.invoice?.lastName ?? ''}`.trim(),
    invoice_tax_id:        doc.invoice?.taxId || '',
    invoice_address:       buildInvoiceAddress(doc.invoice),
    show_attendees:        Boolean(doc.attendeesListProvided) && attList.length > 0,
    attendees_deferred:    doc.attendeesListProvided === false,
    attendees: attList.map((a, i) => ({
      number:     i + 1,
      first_name: a.firstName,
      last_name:  a.lastName,
      full_name:  `${a.firstName} ${a.lastName}`.trim(),
      email:      a.email,
    })),
  };

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  await Promise.allSettled([
    sendTemplateEmail({ to: recipient.to, templateAlias: alias, templateModel }),
    adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `[Admin MC ขอใบเสนอราคา] ${refNo} — ${doc.course_title}`,
          text: `เลขอ้างอิง: ${refNo}\nผู้ประสานงาน: ${recipient.firstName} <${recipient.to}>\nเบอร์: ${recipient.phone}\nจำนวน: ${doc.attendeesCount ?? 1} ท่าน\nยอด: ${formatTHB(doc.pricing?.total ?? 0)} บาท`,
        })
      : Promise.resolve(),
  ]);

  return { ok: true };
}
