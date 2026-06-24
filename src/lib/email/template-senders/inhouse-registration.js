import { sendEmail } from '@/lib/email/postmark';
import { inhouseUserConfirmationEmail } from '@/lib/email/templates/registration-inhouse-user';
import { inhouseAdminNotificationEmail } from '@/lib/email/templates/registration-inhouse-admin';

/**
 * Send the in-house registration emails (customer + admin).
 *
 * In-house intentionally stays on hard-coded HTML. This sender warns if a
 * Postmark Template alias is configured and continues using hard-coded HTML
 * until a template sender is actually implemented.
 */
export async function sendInhouseRegistrationEmails({
  data,
  referenceNumber,
  quotationAddress,
  adminDashboardUrl,
  adminEmail,
}) {
  const userAlias = process.env.POSTMARK_TEMPLATE_ALIAS_INHOUSE_USER;
  if (userAlias) {
    console.warn('[inhouse-template] POSTMARK_TEMPLATE_ALIAS_INHOUSE_USER is set but template sender not yet implemented. Falling back to hard-coded HTML.');
  }

  const userMsg = inhouseUserConfirmationEmail({
    referenceNumber,
    contactFirstName: data.contactFirstName,
    companyName:      data.companyName,
    data,
    quotationAddress,
  });

  const adminMsg = inhouseAdminNotificationEmail({
    referenceNumber,
    data,
    quotationAddress,
    adminDashboardUrl,
  });

  const emailPromises = [
    sendEmail({
      to: data.contactEmail,
      bcc: process.env.POSTMARK_ADMIN_EMAIL,
      subject: `ได้รับคำขอใบเสนอราคา In-house ${data.companyName} - ${referenceNumber}`,
      html: userMsg.html,
      text: userMsg.text,
    }),
  ];
  if (adminEmail) {
    emailPromises.push(
      sendEmail({
        to: adminEmail,
        bcc: process.env.POSTMARK_ADMIN_EMAIL,
        subject: `In-house Request ใหม่ ${data.companyName} - ${referenceNumber}`,
        html: adminMsg.html,
        text: adminMsg.text,
      })
    );
  }
  await Promise.allSettled(emailPromises);

  return { ok: true };
}
