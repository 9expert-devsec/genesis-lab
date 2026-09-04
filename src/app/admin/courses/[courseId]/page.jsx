/**
 * /admin/courses/[courseId] — extension editor for a single course.
 *
 * Server shell: fetches the upstream course (so we can show a real
 * name) plus any existing CourseExtension. Hands the snapshot to the
 * client editor, which owns the form and calls `saveCourseExtension`
 * on submit.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePage } from '@/lib/rbac/guard';
import { getCourseByCode } from '@/lib/api/public-courses';
import { getCourseExtension } from '@/lib/actions/course-extensions';
import { courseListQuery, withListQuery } from '@/lib/courses/adminListQuery';
import {
  getAllCoursePromoLinks,
  getEarlyBirdAdminByCourse,
  getEarlyBirdClaim,
} from '@/lib/actions/course-promos';
import { getActivePromotionsForAdmin } from '@/lib/actions/promotions';
import { getAllLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { ExtensionEditor } from './_components/ExtensionEditor';
import { RecordHistory } from '@/components/audit/RecordHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { courseId } = await params;
  return {
    title: `แก้ไข ${courseId}`,
    robots: { index: false, follow: false },
  };
}

export default async function AdminCourseExtensionPage({ params, searchParams }) {
  await requirePage('courses');

  const { courseId: rawCourseId } = await params;
  const courseId = decodeURIComponent(rawCourseId);
  const listQuery = courseListQuery(await searchParams);

  // Don't 404 if the upstream call fails — let the editor still work
  // so admins can fix data even when the API is down. We just won't
  // show the friendly course name.
  const [courseResult, extension, promoLinks, earlyBirdAdmin, earlyBirdClaim, activePromos, faqs] =
    await Promise.allSettled([
      getCourseByCode(courseId),
      getCourseExtension(courseId),
      getAllCoursePromoLinks(courseId),
      getEarlyBirdAdminByCourse(courseId),
      getEarlyBirdClaim(courseId),
      getActivePromotionsForAdmin(),
      getAllLocalFaqsForCourse('public', courseId),
    ]).then((results) =>
      results.map((r) => (r.status === 'fulfilled' ? r.value : null))
    );

  // If the upstream returned a course that doesn't match by id (older
  // upstream IDs sometimes drift), fall back to the courseId param.
  const courseName =
    courseResult?.course_name_th ||
    courseResult?.course_name ||
    courseId;

  // Hard 404 only when neither upstream nor an existing extension knows
  // about this id — saves admins from creating extensions for typos.
  if (!courseResult && !extension) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* BACK TO THE EDIT PAGE, which is where the only link here comes from.
          The target is derived from the FETCHED COURSE's `_id`, never from this
          route's param: this page is keyed by the course_id CODE and /edit is
          keyed by the MSDB ObjectId (the trap recorded in 1da69ce), so treating
          them as interchangeable produces a 404 that looks like a missing
          course.

          Upstream can be down — this page deliberately still renders when
          `getCourseByCode` fails, and then there is no `_id` to build an edit
          URL from. Rather than emit a link that 404s, it falls back to the list
          and says so, which is also the right target for someone who arrived
          here by typed URL or bookmark rather than from the editor. */}
      <div className="mb-6">
        <Link
          href={withListQuery(
            courseResult?._id ? `/admin/courses/${courseResult._id}/edit` : '/admin/courses',
            listQuery
          )}
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-9e-action"
        >
          <ChevronLeft className="h-4 w-4" />
          {courseResult?._id ? 'กลับไปยังหน้าแก้ไขหลักสูตร' : 'กลับไปยังรายการหลักสูตร'}
        </Link>
      </div>

      <ExtensionEditor
        courseId={courseId}
        courseName={courseName}
        initialData={extension}
        initialPromoLinks={promoLinks ?? []}
        initialEarlyBird={earlyBirdAdmin ?? null}
        initialEarlyBirdClaim={earlyBirdClaim ?? null}
        initialPromos={activePromos ?? []}
        initialFaqs={faqs ?? []}
      />

      {/* THE DUAL KEY SPACE, first real consumer. `courses|course` rows carry
          the MSDB ObjectId; `courses|extension` and `courses|early_bird` carry
          the course_id CODE. This screen holds both, so both are passed and the
          reader builds one $in — served by {recordId:1, createdAt:-1}.

          No `entity` is passed on purpose: this page edits the extension, the
          promo links and the early-bird price, and the course itself is edited
          one level up. Narrowing to a single entity here would hide half of
          what a reader means by "what happened to this course". */}
      <RecordHistory
        menu="courses"
        recordId={[courseResult?._id, courseId].filter(Boolean).map(String)}
        title="ประวัติการแก้ไขหลักสูตรนี้"
      />
    </div>
  );
}
