import { sendEmail } from '@/lib/email/postmark';
import { paidReceiptEmail } from '@/lib/email/templates/registration-paid';
import { buildInvoiceDisplay } from '@/lib/registration/create-public';

/**
 * Idempotently send the paid-receipt emails (customer + admin) for a
 * registration. Guards on a `payment.receiptSentAt` flag so retries and
 * the webhook-vs-charge-route race never double-send. Pass the
 * already-loaded mongoose doc.
 */
export async function sendPaidReceipt(doc) {
  if (!doc || doc.payment?.receiptSentAt) return { skipped: true };

  const { invoiceCountry, invoiceAddress } = buildInvoiceDisplay({
    invoice: doc.invoice,
  });

  const refNo = String(doc._id).slice(-8).toUpperCase();

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

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  const tasks = [
    sendEmail({
      to: doc.coordinator.email,
      bcc: adminEmail,
      subject: `ชำระเงินสำเร็จ ${doc.courseName || ''} - ${refNo}`,
      html: msg.html,
      text: msg.text,
    }),
  ];

  // Admin notification with consent details as audit trail.
  if (adminEmail) {
    const method =
      doc.payment?.method === 'credit_card' ? 'บัตรเครดิต/เดบิต' : 'QR PromptPay';
    const consentLines = [
      `ตรวจสอบข้อมูลแล้ว: ${doc.consent?.dataChecked ? '✓' : '—'}`,
      `รับทราบไม่คืนเงิน: ${doc.consent?.noRefund ? '✓' : '—'}`,
      `เงื่อนไขเปลี่ยน/เลื่อน/ยกเลิก: ${doc.consent?.changePolicy ? '✓' : '—'}`,
      `ยินยอมเงื่อนไขอบรม: ${doc.consent?.termsAccepted ? '✓' : '—'}`,
    ].join('<br>');
    tasks.push(
      sendEmail({
        to: adminEmail,
        subject: `[ชำระแล้ว] ${doc.courseName || doc.courseId} - ${refNo} (${method})`,
        html: `<p>มีการชำระเงินสำเร็จ</p>
<p>เลขอ้างอิง: <b>${refNo}</b><br>วิธีชำระ: ${method}<br>ยอด: ${doc.pricing?.total} บาท<br>Omise charge: ${doc.payment?.omiseChargeId || '-'}</p>
<p><b>การยอมรับเงื่อนไข (consent):</b><br>${consentLines}<br>เวลา: ${doc.consent?.acceptedAt || '-'}<br>IP: ${doc.consent?.ipAddress || '-'}</p>`,
        text: `ชำระเงินสำเร็จ ${refNo} (${method}) ยอด ${doc.pricing?.total} บาท`,
      })
    );
  }

  await Promise.allSettled(tasks);
  doc.payment.receiptSentAt = new Date();
  await doc.save();
  return { ok: true };
}
