import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { dbConnect } from '@/lib/db/connect';
import RegisterInhouse from '@/models/RegisterInhouse';
import { inhouseRegistrationSchema } from '@/lib/schemas/register-inhouse';
import { sendInhouseRegistrationEmails } from '@/lib/email/template-senders/inhouse-registration';
import { getCourseByCode } from '@/lib/api/public-courses';

/**
 * Cover image AND display title for the first course of interest, from ONE
 * upstream call — NEVER a throw.
 *
 * `coursesInterested` holds `course_id` CODES (InhousePageContent maps upstream
 * with `id: c.course_id`), which is exactly what `getCourseByCode` filters on.
 * The form is a single-select that wraps one value in an array, so the first
 * entry is the course; see the model docstring for what happens to a second.
 *
 * ONE FETCH, TWO VALUES, deliberately. The title and the cover come off the
 * same response, and a second `getCourseByCode` for a field already in hand
 * would double the upstream cost of every in-house submission for nothing.
 *
 * The registration row is already written by the time this runs, so an upstream
 * failure must cost a picture and a nicer title — never the email itself. Both
 * fall back to '', and the MODEL turns an empty title back into the course
 * code, because a blank course name on a quote-request confirmation leaves the
 * customer with no idea what they asked about.
 */
async function firstCourseSummary(coursesInterested) {
  const code = Array.isArray(coursesInterested) ? coursesInterested[0] : undefined;
  if (!code) return { courseImage: '', courseName: '' };
  try {
    const course = await getCourseByCode(code);
    return {
      courseImage: course?.course_cover_url ?? '',
      courseName: course?.course_name ?? '',
    };
  } catch (err) {
    console.warn('[inhouse-route] course lookup failed — sending with the code.', err?.message);
    return { courseImage: '', courseName: '' };
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const parsed = inhouseRegistrationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const headersList = await headers();
  const ipAddress =
    headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headersList.get('x-real-ip') ||
    null;

  await dbConnect();
  const doc = await RegisterInhouse.create({
    ...data,
    /**
     * THE ONE PLACE `companyName` IS EVER WRITTEN.
     *
     * The form stopped asking for a company twice — the ผู้ประสานงาน section's
     * บริษัท / องค์กร field is gone and `companyName` is no longer on the zod
     * schema, so it is absent from `data` above. But the path has three live
     * readers that would go blank without it: the admin list projection AND its
     * $regex search (listRegistrations in src/lib/actions/registrations.js),
     * the admin detail row, and the confirmation email.
     *
     * So it is a MIRROR of `quotationCompany`, derived here and nowhere else.
     * A second writer is how the two representations start disagreeing; an fs
     * guard pins that this is the only one.
     */
    companyName: data.quotationCompany,
    status: 'new',
    source: 'inhouse',
    ipAddress,
  });

  const referenceNumber = refNo(doc._id);

  // Pre-compute address string so templates stay logic-free
  const quotationAddress =
    data.quotationCountry === 'OTHER'
      ? [
          data.internationalAddress?.line1,
          data.internationalAddress?.line2,
          data.internationalAddress?.city,
          data.internationalAddress?.state,
          data.internationalAddress?.postalCode,
          data.internationalAddress?.country,
        ].filter(Boolean).join(', ')
      : [
          data.thaiAddress?.addressLine,
          data.thaiAddress?.subDistrict,
          data.thaiAddress?.district,
          data.thaiAddress?.province,
          data.thaiAddress?.postalCode,
        ].filter(Boolean).join(' ');

  // AWAITED for the same reason as the public route: the model is built
  // synchronously, so an unresolved promise would reach the template as
  // `undefined` — the <img> would quietly disappear and the course name would
  // render as the string "undefined".
  const { courseImage, courseName } = await firstCourseSummary(data.coursesInterested);

  await sendInhouseRegistrationEmails({
    data,
    referenceNumber,
    quotationAddress,
    courseImage,
    courseName,
  });

  return NextResponse.json({
    ok: true,
    referenceNumber,
    registrationId: String(doc._id),
  });
}