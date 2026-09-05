import { sendEmail, sendTemplateEmail } from '@/lib/email/postmark';
import { bundleConfirmationEmail } from '@/lib/email/templates/registration-bundle-user';
import { buildBundleRegistrationModel } from '@/lib/email/models/bundleRegistrationModel';
import { decideSendPlan } from '@/lib/email/sendPlan';
import { scheduleTypeLabel } from '@/lib/email/models/labels';

/**
 * ONE email per bundle QUOTATION REQUEST — not one per leg.
 *
 * ══ THE COUNT IS THE POINT ═════════════════════════════════════════════════
 *
 * A three-course bundle writes THREE RegisterPublic rows, because that is the
 * shape every reader of that collection can live with (see the `bundle` field
 * on the model). It is still ONE request, made once, by one person — so it gets
 * ONE confirmation, quoting ONE reference number, listing all three courses.
 *
 * Three mails would be the storage shape leaking out to the customer: they did
 * not make three requests and would have no way to tell whether they had
 * accidentally submitted three times. This sender is called ONCE, after the
 * whole set has committed, and it takes the courses as a list rather than being
 * called per leg — there is no shape in which it can send N.
 *
 * ══ A NEW ALIAS, THE SAME FALLBACK POLICY ══════════════════════════════════
 *
 * POSTMARK_TEMPLATE_ALIAS_REG_BUNDLE, not a variant of the course alias — see
 * the model for why one template cannot serve both without editing a template
 * that is currently delivering real registrations.
 *
 * The policy is `sendPublicRegistrationEmails`' exactly, and asymmetric for its
 * stated reasons:
 *
 *   alias UNSET   → the hard-coded HTML, logged at INFO. A blank alias is the
 *                   per-template rollout switch, not a failure.
 *   alias SET but the send FAILS → console.ERROR naming the alias and the
 *                   status, THEN the HTML, so the customer still gets their
 *                   confirmation.
 *
 * The error level matters more here than it does there: this is the ONLY mail a
 * bundle request produces, so a silent failure takes the customer's
 * confirmation, the team's BCC copy and the trail together.
 *
 * ══ ONE SEND, DECIDED AS A VALUE ═══════════════════════════════════════════
 *
 * `decideSendPlan` and a switch on `plan.via`, never a mutable
 * `sentViaTemplate` boolean — that boolean is the documented double-send
 * hazard, and a call-site count cannot tell a double send from a correct one.
 *
 * ══ WHO RECEIVES IT ════════════════════════════════════════════════════════
 *
 * `to` is the coordinator. Everyone internal receives the same mail as a BCC,
 * merged into EVERY send by `buildBcc()` from POSTMARK_BCC_EMAILS — so nothing
 * here passes a `bcc`, and there is no second admin-only mail. That is the
 * design the public sender already states: one env var instead of one per call
 * site, and it has to live in this repo at all because a Postmark Template
 * stores Subject + HTML + Text and has no Cc/Bcc field.
 */
export async function sendBundleRegistrationEmail({
  referenceNumber,
  bundleName = '',
  courses = [],
  discount = null,
  priceLabelNet = '',
  priceLabelList = '',
  data,
  attendees = [],
  invoiceCountry = 'TH',
  invoiceAddress = '',
}) {
  const alias = process.env.POSTMARK_TEMPLATE_ALIAS_REG_BUNDLE;
  const to = data.coordinator.email;

  // SUBJECT COMES FROM THE POSTMARK TEMPLATE on this path — deliberately no
  // subject string here. The fallback below carries the one the HTML needs.
  const templateResult = alias
    ? await sendTemplateEmail({
        to,
        templateAlias: alias,
        templateModel: buildBundleRegistrationModel({
          referenceNumber,
          bundleName,
          courses,
          discount,
          priceLabelNet,
          priceLabelList,
          data,
          attendees,
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
        '[bundle-template] ❌ template send FAILED — falling back to hard-coded HTML.',
        'alias:', alias,
        '| status:', templateResult?.error,
        '| ref:', referenceNumber,
      );
    } else {
      console.info(
        '[bundle-template] POSTMARK_TEMPLATE_ALIAS_REG_BUNDLE not set — sending hard-coded HTML.',
        'ref:', referenceNumber,
      );
    }

    const msg = bundleConfirmationEmail({
      referenceNumber,
      firstName: data.coordinator.firstName,
      bundleName,
      // The SAME label function the TemplateModel uses, so the two bodies
      // cannot describe one round two ways.
      courses: courses.map((c) => ({
        courseName: c.courseName || c.courseId || '',
        dates: c.dates || 'ตามรอบที่กำหนด',
        typeLabel: scheduleTypeLabel(c.type),
      })),
      priceLabelNet,
      priceLabelList,
      discount,
      notes: data.notes ?? '',
    });

    await sendEmail({
      to,
      subject: `ได้รับคำขอใบเสนอราคา ${bundleName || 'แพ็กเกจอบรม'} - ${referenceNumber}`,
      html: msg.html,
      text: msg.text,
    });
  }

  return { ok: true, ...plan };
}
