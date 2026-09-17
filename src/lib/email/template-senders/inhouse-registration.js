import { sendEmail, sendTemplateEmail } from '@/lib/email/postmark';
import { inhouseUserConfirmationEmail } from '@/lib/email/templates/registration-inhouse-user';
import { buildInhouseRegistrationModel } from '@/lib/email/models/inhouseRegistrationModel';
import { decideSendPlan } from '@/lib/email/sendPlan';
import { resolveRecipients } from '@/lib/email/recipients';

/**
 * ONE email: the in-house enquiry acknowledgement, to the person who submitted
 * it. Internal staff receive that same mail as a BCC copy; the admin-only
 * notification and its template are deleted, not migrated.
 *
 * ── WHERE THE INTERNAL RECIPIENTS COME FROM ─────────────────────────────────
 * `resolveRecipients('inhouse', { kind: 'quote' })` — POSTMARK_CC_INHOUSE_EMAILS
 * / POSTMARK_BCC_INHOUSE_EMAILS, resolved once and handed to BOTH the template
 * send and the HTML fallback, so the two branches copy the same people. The
 * app-wide pair postmark.js used to merge into every send is retired (see
 * src/lib/email/recipients.js). It cannot be configured on the Postmark side
 * either: a Template holds Subject + HTML + Text and has no Cc/Bcc field, so
 * recipient routing stays in this repo by necessity.
 *
 * ── WHAT THE TEAM LOSES, SAID OUT LOUD ──────────────────────────────────────
 * The deleted admin template carried the enquiry DETAIL — objective, skill
 * level, courses of interest, the free-text message, onsite/online specifics.
 * The BCC copy of this mail carries the summary only. That detail is in the
 * admin dashboard, where the person answering the enquiry already has to be.
 * See src/lib/email/models/inhouseRegistrationModel.js for the full list.
 *
 * ── FALLBACK POLICY ─────────────────────────────────────────────────────────
 *   alias UNSET → hard-coded HTML, logged at INFO. The rollout switch.
 *   alias SET but the send fails → console.ERROR with the alias and the status,
 *     then the HTML anyway so the customer still gets an acknowledgement.
 *
 * A mistyped alias must be loud: this is the only mail this flow sends, so a
 * quiet failure loses the customer's copy and the team's notification at once.
 *
 * ── ONE SEND, DECIDED AS A VALUE ────────────────────────────────────────────
 * The branch is `decideSendPlan(…)` and a switch on `plan.via`, not a mutable
 * boolean that any edit could desynchronise from the sends it governs — which
 * was the double-send hazard a call-site count cannot see. See
 * src/lib/email/sendPlan.js.
 */
export async function sendInhouseRegistrationEmails({
  data,
  referenceNumber,
  quotationAddress,
  // Both fetched by the route — the model is pure and does no I/O. '' is a
  // supported state for each: the template hides the <img> entirely, and the
  // model falls back from an empty title to the course code.
  courseImage = '',
  courseName = '',
}) {
  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_INHOUSE_USER;
  const to = data.contactEmail;
  const { cc, bcc } = resolveRecipients('inhouse', { kind: 'quote' });

  // SUBJECT COMES FROM THE POSTMARK TEMPLATE on this path.
  const templateResult = alias
    ? await sendTemplateEmail({
        to,
        cc,
        bcc,
        templateAlias: alias,
        templateModel: buildInhouseRegistrationModel({
          referenceNumber,
          data,
          quotationAddress,
          courseImage,
          courseName,
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
        '[inhouse-template] ❌ template send FAILED — falling back to hard-coded HTML.',
        'alias:', alias,
        '| status:', templateResult?.error,
        '| ref:', referenceNumber
      );
    } else {
      console.info(
        '[inhouse-template] POSTMARK_TEMPLATE_ALIAS_INHOUSE_USER not set — sending hard-coded HTML.',
        'ref:', referenceNumber
      );
    }

    // `quotationCompany`, NOT `companyName`. The form stopped asking for the
    // company twice; `companyName` is no longer on the zod schema, so reading
    // it here would put the literal 'undefined' in the subject line of every
    // fallback send. The Mongoose path still exists — the API route mirrors
    // this same value onto it — but `data` is the PARSED form payload.
    const userMsg = inhouseUserConfirmationEmail({
      referenceNumber,
      contactFirstName: data.contactFirstName,
      companyName: data.quotationCompany,
      data,
      quotationAddress,
    });

    await sendEmail({
      to,
      cc,
      bcc,
      subject: `ได้รับคำขอใบเสนอราคา In-house ${data.quotationCompany} - ${referenceNumber}`,
      html: userMsg.html,
      text: userMsg.text,
    });
  }

  return { ok: true, ...plan };
}
