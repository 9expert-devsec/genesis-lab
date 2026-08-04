import { sendEmail, sendTemplateEmail } from '@/lib/email/postmark';
import { userConfirmationEmail } from '@/lib/email/templates/registration-user';
import { buildPublicRegistrationModel } from '@/lib/email/models/publicRegistrationModel';
import { decideSendPlan } from '@/lib/email/sendPlan';

/**
 * ONE email: the public-registration confirmation, to the registrant.
 *
 * Everyone internal who needs to know receives that same mail as a BCC copy —
 * there is no second, admin-only email any more, and the admin template it used
 * to render is deleted rather than migrated.
 *
 * ── WHERE THE INTERNAL RECIPIENTS WENT ──────────────────────────────────────
 * Nothing below passes a `bcc`, and that is the design, not an omission.
 * `buildBcc()` in src/lib/email/postmark.js merges POSTMARK_BCC_EMAILS into
 * EVERY send, so the internal list is configured in one env var instead of once
 * per call site. A per-call `bcc: process.env.POSTMARK_ADMIN_EMAIL` (which is
 * what used to be here) means two places to edit and one of them gets missed.
 *
 * And it has to live in this repo at all because a Postmark Template stores
 * Subject + HTML + Text and NOTHING ELSE — there is no Cc/Bcc field in the
 * dashboard to look for. Recipient routing is ours by necessity.
 *
 * ── FALLBACK POLICY, ASYMMETRIC ON PURPOSE ──────────────────────────────────
 * This is where we deliberately diverge from the masterclass senders, which
 * throw when their alias is missing.
 *
 *   alias UNSET        → send the hard-coded HTML, log at INFO. This is the
 *                        per-template rollout switch, not a failure. A blank
 *                        alias in Vercel is someone saying "not yet".
 *   alias SET, send FAILS (non-2xx — a 422 for an alias that does not exist on
 *                        the server is the likely one)
 *                      → console.ERROR naming the alias and the status, THEN
 *                        fall back to the HTML so the registrant still gets
 *                        their confirmation.
 *
 * The error level is the whole point. A mistyped alias in Vercel would
 * otherwise ship the old HTML forever with nothing louder than a shrug in the
 * logs, and since this is now the ONLY mail this flow sends, a silent failure
 * is a total one — the customer's mail, the team's notification and the audit
 * trail all vanish together.
 *
 * ── ONE SEND, DECIDED AS A VALUE ────────────────────────────────────────────
 * The branch is `decideSendPlan(…)` and a switch on `plan.via`, not a mutable
 * `sentViaTemplate` boolean. That boolean was the whole double-send hazard:
 * dropping the `if` that read it, or failing to set it on some path, sent the
 * customer BOTH mails, and a call-site count cannot tell that apart from a
 * correct send. See src/lib/email/sendPlan.js.
 */
export async function sendPublicRegistrationEmails({
  data,
  referenceNumber,
  attendees,
  invoiceCountry,
  invoiceAddress,
  // Fetched by the route — the model is pure and does no I/O. Absent or '' is
  // a supported state: the template hides the <img> entirely.
  courseImage = '',
}) {
  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_REG_USER;
  const to = data.coordinator.email;

  // SUBJECT COMES FROM THE POSTMARK TEMPLATE on this path — there is
  // deliberately no subject string here. See the fallback below for the one the
  // hard-coded HTML still needs.
  const templateResult = alias
    ? await sendTemplateEmail({
        to,
        templateAlias: alias,
        templateModel: buildPublicRegistrationModel({
          referenceNumber,
          data,
          attendees,
          invoiceCountry,
          invoiceAddress,
          courseImage,
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
        '[reg-template] ❌ template send FAILED — falling back to hard-coded HTML.',
        'alias:', alias,
        '| status:', templateResult?.error,
        '| ref:', referenceNumber
      );
    } else {
      console.info(
        '[reg-template] POSTMARK_TEMPLATE_ALIAS_REG_USER not set — sending hard-coded HTML.',
        'ref:', referenceNumber
      );
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

    await sendEmail({
      to,
      subject: `ยืนยันการสมัครอบรม ${data.courseName || ''} - ${referenceNumber}`,
      html: userMsg.html,
      text: userMsg.text,
    });
  }

  return { ok: true, ...plan };
}
