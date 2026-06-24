import { sendEmail } from '@/lib/email/postmark';
import { userConfirmationEmail } from '@/lib/email/templates/registration-user';
import { adminNotificationEmail } from '@/lib/email/templates/registration-admin';
import { sendPaidReceipt } from '@/lib/registration/send-receipt';

/**
 * Send the public-registration confirmation emails (customer + admin).
 *
 * Public registration intentionally stays on hard-coded HTML. This sender
 * exists only so the route can call one place; when a Postmark Template
 * alias is configured we warn and continue using the hard-coded HTML until
 * a template sender is actually implemented.
 */
export async function sendPublicRegistrationEmails({
  data,
  referenceNumber,
  attendees,
  invoiceCountry,
  invoiceAddress,
  adminDashboardUrl,
  adminEmail,
}) {
  const userAlias = process.env.POSTMARK_TEMPLATE_ALIAS_REG_USER;
  if (userAlias) {
    console.warn('[reg-template] POSTMARK_TEMPLATE_ALIAS_REG_USER is set but template sender not yet implemented. Falling back to hard-coded HTML.');
  }

  const userMsg = userConfirmationEmail({
    referenceNumber,
    firstName: data.coordinator.firstName,
    courseName: data.courseName || data.courseId,
    classDate: data.classDate,
    attendanceMode: data.attendanceMode ?? 'classroom',
    scheduleType: data.scheduleType,
    requestInvoice: Boolean(data.requestInvoice),
    invoice: data.invoice ?? null,
    invoiceCountry,
    invoiceAddress,
    attendeesListProvided: data.attendeesListProvided,
    attendees,
    coordinatorIsAttending: data.coordinator.isAttending,
    attendeesCount: data.attendeesCount,
  });

  const adminMsg = adminNotificationEmail({
    referenceNumber,
    data: {
      ...data,
      firstName: data.coordinator.firstName,
      lastName: data.coordinator.lastName,
      email: data.coordinator.email,
      phone: data.coordinator.phone,
      lineId: data.coordinator.lineId,
      requestInvoice: Boolean(data.requestInvoice),
      attendanceMode: data.attendanceMode ?? 'classroom',
      invoiceCountry,
      invoiceAddress,
      attendees,
      coordinatorIsAttending: data.coordinator.isAttending,
    },
    adminDashboardUrl,
  });

  const emailPromises = [
    sendEmail({
      to: data.coordinator.email,
      bcc: process.env.POSTMARK_ADMIN_EMAIL,
      subject: `ยืนยันการสมัครอบรม ${data.courseName || ''} - ${referenceNumber}`,
      html: userMsg.html,
      text: userMsg.text,
    }),
  ];
  if (adminEmail) {
    emailPromises.push(
      sendEmail({
        to: adminEmail,
        bcc: process.env.POSTMARK_ADMIN_EMAIL,
        subject: `ใบสมัครใหม่ ${data.courseName || data.courseId} - ${referenceNumber}`,
        html: adminMsg.html,
        text: adminMsg.text,
      })
    );
  }
  await Promise.allSettled(emailPromises);

  return { ok: true };
}

/**
 * Send the public paid-receipt email. Stays on hard-coded HTML via
 * sendPaidReceipt(); warns if a template alias is configured.
 */
export async function sendPublicPaidReceiptEmail({ doc }) {
  const paidAlias = process.env.POSTMARK_TEMPLATE_ALIAS_PAID_USER;
  if (paidAlias) {
    console.warn('[reg-template] POSTMARK_TEMPLATE_ALIAS_PAID_USER is set but template sender not yet implemented. Falling back to hard-coded HTML.');
  }
  return sendPaidReceipt(doc);
}
