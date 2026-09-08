import { sendTemplateEmail } from '@/lib/email/postmark';
import { buildCareerPathRegistrationModel } from '@/lib/email/models/careerPathRegistrationModel';
import { getCareerPathForRegistration } from '@/lib/actions/career-paths';

/**
 * ONE email per Career Path registration, and it is the FIRST one this flow has
 * ever sent.
 *
 * ══ NO HARD-CODED HTML FALLBACK, AND THAT IS THE DIFFERENCE ════════════════
 *
 * The other three registration senders keep a hand-written HTML body and choose
 * between it and the template through `decideSendPlan`. That machinery exists
 * because those flows were ALREADY mailing customers when the templates arrived:
 * an unset alias there would take away a mail people were receiving, so the
 * fallback is a migration safety net with a real regression to prevent.
 *
 * Career Path sends nothing today. An unset alias is therefore not a regression,
 * it is the status quo — so this path logs and sends nothing, and there is no
 * second body to choose between. `decideSendPlan` is deliberately NOT imported:
 * a planner that picks between two bodies when only one exists would have to
 * invent the second, and the honest way to say "there is exactly one way to send
 * this mail" is for there to be exactly one.
 *
 * That also means the double-send hazard the planner was built for cannot arise
 * here: there is one `sendTemplateEmail` call site and no branch that reaches
 * another send.
 *
 * ══ IT CANNOT FAIL THE REGISTRATION ════════════════════════════════════════
 *
 * By the time this runs the document is written and the customer has already
 * been shown their reference number. Throwing would turn a filed registration
 * into an error message about a registration that exists — the worst of both.
 * So every failure path here is caught and logged: the missing cover, the send
 * itself, and anything unforeseen. The caller is not asked to handle a rejection
 * because this function does not produce one.
 *
 * Errors are logged at ERROR and not swallowed silently: this is the only mail
 * the flow produces, so a failure takes the customer's confirmation and the
 * team's BCC copy together.
 *
 * ══ WHO RECEIVES IT ════════════════════════════════════════════════════════
 *
 * `to` is the contact who submitted. Everyone internal receives the same mail as
 * a BCC merged into every send by `buildBcc()` from POSTMARK_BCC_EMAILS — so
 * nothing here passes a `bcc`, and there is no second admin-only mail. Same
 * design the other three state.
 *
 * @param {object} registration the CareerPathRegistration document, as created
 * @returns {Promise<{sent: boolean, reason?: string}>} never rejects
 */
export async function sendCareerPathRegistrationEmail(registration) {
  try {
    const alias = process.env.POSTMARK_TEMPLATE_ALIAS_REG_CAREERPATH;
    const to = registration?.contactEmail;

    if (!alias) {
      console.info(
        '[careerpath-template] POSTMARK_TEMPLATE_ALIAS_REG_CAREERPATH not set — no mail sent.',
        'careerSlug:', registration?.careerSlug,
      );
      return { sent: false, reason: 'no_alias' };
    }

    if (!to) {
      console.error(
        '[careerpath-template] ❌ registration has no contactEmail — nothing to send to.',
        'careerSlug:', registration?.careerSlug,
      );
      return { sent: false, reason: 'no_recipient' };
    }

    const coverImage = await resolveCoverImage(registration?.careerSlug);

    // SUBJECT COMES FROM THE POSTMARK TEMPLATE — deliberately no subject string
    // here, and no fallback body that would need one.
    const result = await sendTemplateEmail({
      to,
      templateAlias: alias,
      templateModel: buildCareerPathRegistrationModel({ registration, coverImage }),
    });

    if (result?.error || result?.skipped) {
      console.error(
        '[careerpath-template] ❌ send FAILED — the customer received nothing.',
        'alias:', alias,
        '| status:', result?.error ?? result?.reason,
        '| careerSlug:', registration?.careerSlug,
      );
      return { sent: false, reason: 'send_failed' };
    }

    return { sent: true };
  } catch (err) {
    // The registration is already written. Nothing here is allowed to undo that.
    console.error(
      '[careerpath-template] ❌ unexpected failure — the registration is filed and the mail is not.',
      err,
    );
    return { sent: false, reason: 'threw' };
  }
}

/**
 * The Career Path's registration banner, or `''`.
 *
 * ── RESOLVED HERE, NOT IN THE MODEL ────────────────────────────────────────
 * The builder is pure and does no I/O — the same division the bundle and course
 * models state for their own images. This is the one value the mail needs that
 * the registration document does not carry, so the one read lives at the send
 * boundary where a failure can be absorbed.
 *
 * `careerSlug` is stored with the `-career-path` suffix stripped and
 * `getCareerPathForRegistration` matches either spelling, so no suffix is
 * reattached here — doing so would be a second place that knows how the slug is
 * shaped.
 *
 * A missing path, a missing banner or a failed read all produce `''`, which the
 * builder turns into an OMITTED `course_image` and the template into no <img>.
 * A picture is not what the customer came for.
 */
async function resolveCoverImage(careerSlug) {
  if (!careerSlug) return '';
  try {
    const cp = await getCareerPathForRegistration(careerSlug);
    return cp?.registerBannerUrl ?? '';
  } catch (err) {
    console.error('[careerpath-template] cover lookup failed — sending without it.', err);
    return '';
  }
}
