import { sendEmail } from '@/lib/email/postmark';
import { formatTHB } from '@/lib/pricing';

/**
 * Idempotently send the paid-receipt email for a Masterclass registration.
 * Guards on `payment.receiptSentAt` to prevent double-send.
 * Pass the already-loaded mongoose doc.
 */
export async function sendMasterclassReceipt(doc) {
  if (!doc || doc.payment?.receiptSentAt) return { skipped: true };

  const refNo = String(doc._id).slice(-8).toUpperCase();
  const to    = doc.attendee?.email;
  if (!to) return { skipped: true, reason: 'no_email' };

  const subject = `[9Expert Masterclass] ยืนยันการชำระเงิน ${refNo} — ${doc.course_title}`;

  const body = `
สวัสดีคุณ ${doc.attendee.firstName} ${doc.attendee.lastName},

ยืนยันการชำระเงินสำเร็จ 🎉

รหัสอ้างอิง : ${refNo}
หลักสูตร   : ${doc.course_title}
รุ่น        : ${doc.batch_label}
วันที่      : ${doc.batch_date_label}
สถานที่    : ${doc.venue_name}
ยอดชำระ   : ${formatTHB(doc.pricing?.total)} บาท (รวม VAT 7%)

ทีมงาน 9Expert จะส่งรายละเอียดเพิ่มเติมและ e-Certificate หลังจากการอบรมเสร็จสิ้น

หากมีข้อสงสัย กรุณาติดต่อ training@9expert.co.th หรือโทร 02-294-9355

ขอบคุณที่ไว้วางใจ 9Expert Training
  `.trim();

  const adminEmail = process.env.POSTMARK_ADMIN_EMAIL;

  await Promise.allSettled([
    sendEmail({ to, subject, text: body }),
    adminEmail
      ? sendEmail({
          to: adminEmail,
          subject: `[Admin] Masterclass ชำระเงินแล้ว ${refNo} — ${doc.course_title}`,
          text: `${subject}\n\nTo: ${to}\nPhone: ${doc.attendee.phone}\nLine: ${doc.attendee.lineId || '-'}`,
        })
      : Promise.resolve(),
  ]);

  await doc.constructor.findByIdAndUpdate(doc._id, {
    $set: { 'payment.receiptSentAt': new Date() },
  });

  return { ok: true };
}
