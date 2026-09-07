import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import { publicRegistrationSchema } from '@/lib/schemas/register-public';
import { sendPublicRegistrationEmails } from '@/lib/email/template-senders/public-registration';
import { resolveScheduleStatus } from '@/lib/schedule-status';
import { getCourseByCode } from '@/lib/api/public-courses';
import { buildAttendees, buildQuoteRegistration } from '@/lib/registration/build-public';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The Early Bird tag is DERIVED HERE, at submit, from the
// server's own read — never from the request body.
import { buildEarlyBirdTag } from '@/lib/registration/build-public';
import { getEarlyBirdByCourse } from '@/lib/actions/course-promos';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { refNo } from '@/lib/refNo';

/**
 * The course cover for the confirmation email, or '' — NEVER a throw.
 *
 * The email model is pure, so the I/O happens here. This is on the critical
 * path of a request that has ALREADY WRITTEN THE REGISTRATION, so an upstream
 * hiccup must cost the customer a picture and nothing else: a decorative image
 * is not worth a failed confirmation, and it is certainly not worth a 500 on a
 * registration that is already in Mongo.
 *
 * `getCourseByCode` filters on `course_id`, and both `courseCode` and
 * `courseId` hold that short code here (RegisterWizard sets both from
 * `course.course_id`), so either spelling resolves correctly.
 */
async function courseCoverUrl(code) {
  try {
    const course = await getCourseByCode(code);
    return course?.course_cover_url ?? '';
  } catch (err) {
    console.warn('[reg-route] course cover lookup failed — sending without it.', err?.message);
    return '';
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const parsed = publicRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Respect admin-set status override. Upstream already filters for
  // open/nearly_full, so the only blocking case is an explicit 'closed'.
  const status = await resolveScheduleStatus(data.classId, 'open');
  if (status === 'closed') {
    return NextResponse.json(
      { error: 'schedule_closed', message: 'รอบนี้ปิดรับสมัครแล้ว' },
      { status: 409 }
    );
  }

  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headersList.get('x-real-ip') ||
    null;

  // When the coordinator is also an attendee, they fill the first
  // attendee slot server-side so the attendees[] array always matches
  // the attendeesCount count the user selected.
  const attendees = buildAttendees(data);

  await dbConnect();

  /**
   * ── THE EARLY BIRD DECISION, AND IT IS MADE HERE ─────────────────────────
   *
   * WHY AT SUBMIT AND NOT ON THE FORM. The form renders once and the customer
   * then types for several minutes. If the deadline passes in between, a flag
   * decided at render would file a discount that had already expired — and
   * nothing downstream could tell, because an admin issues the quotation by
   * hand from this document. `getEarlyBirdByCourse` is the authority and it
   * answers as of NOW: it returns null for an inactive config and null once
   * `deadline < new Date()`. A submit one second late is handed nothing.
   *
   * It sits beside `resolveScheduleStatus` above deliberately — that is the
   * other thing this route re-decides server-side at submit rather than
   * trusting from a page that may be minutes stale.
   *
   * `buildEarlyBirdTag` applies the round gate: an Early Bird belongs to ONE
   * round, so booking a different round of the same course picks up nothing.
   *
   * ── IT NEVER FAILS THE REGISTRATION ──────────────────────────────────────
   * `.catch(() => null)` because a promotion is not what the customer came for.
   * If this read fails, the registration is still filed — untagged, which an
   * admin can correct — rather than 500ing a form the customer has just spent
   * five minutes on. Same posture as `courseCoverUrl` below, and for a stronger
   * reason: that one costs a picture, this one costs a customer.
   */
  const earlyBirdConfig = await getEarlyBirdByCourse(
    data.courseCode || data.courseId
  ).catch(() => null);
  const earlyBird = buildEarlyBirdTag(earlyBirdConfig, { classId: data.classId });

  // Step 2 shows a consent checkbox on the quote path too, so the acceptance
  // is recorded here rather than being displayed and thrown away.
  const doc = await RegisterPublic.create(
    buildQuoteRegistration({ data, attendees, ipAddress, earlyBird })
  );

  const referenceNumber = refNo(doc._id);

  // Pre-compute flat invoice display strings for email templates.
  // These are derived from the nested invoice sub-document so the
  // templates stay logic-free.
  const invoiceCountry = data.invoice?.country ?? 'TH';
  // The shared formatter, not a local join: it takes the WHOLE invoice because
  // it reads invoice.country to pick the Thai vs international branch, and it
  // is the only thing that applies the แขวง/เขต vs ตำบล/อำเภอ/จังหวัด prefixes.
  // Hand-rolling this here is what put a prefix-less address on customer mail.
  const invoiceAddress = formatBillingAddress(data.invoice);

  // AWAITED, deliberately: the model is built synchronously inside the sender,
  // so a pending promise here would reach the template as `undefined` and the
  // <img> would silently vanish. The cost is one upstream call before the
  // response — bounded by fetchWithTimeout inside aiFetch, and ISR-cached for
  // an hour per course, so the common case is a cache read.
  const courseImage = await courseCoverUrl(data.courseCode || data.courseId);

  await sendPublicRegistrationEmails({
    data,
    referenceNumber,
    attendees,
    invoiceCountry,
    invoiceAddress,
    courseImage,
  });

  return NextResponse.json({
    ok: true,
    referenceNumber,
    registrationId: String(doc._id),
  });
}
