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
import { getCourseByCode } from '@/lib/api/public-courses';
import { getCourseExtension } from '@/lib/actions/course-extensions';
import { ExtensionEditor } from './_components/ExtensionEditor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { courseId } = await params;
  return {
    title: `แก้ไข ${courseId}`,
    robots: { index: false, follow: false },
  };
}

export default async function AdminCourseExtensionPage({ params }) {
  const { courseId: rawCourseId } = await params;
  const courseId = decodeURIComponent(rawCourseId);

  // Don't 404 if the upstream call fails — let the editor still work
  // so admins can fix data even when the API is down. We just won't
  // show the friendly course name.
  const [courseResult, extension] = await Promise.allSettled([
    getCourseByCode(courseId),
    getCourseExtension(courseId),
  ]).then((results) => results.map((r) => (r.status === 'fulfilled' ? r.value : null)));

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
      <div className="mb-6">
        <Link
          href="/admin/courses"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-9e-action"
        >
          <ChevronLeft className="h-4 w-4" />
          กลับไปยังรายการหลักสูตร
        </Link>
      </div>

      <ExtensionEditor
        courseId={courseId}
        courseName={courseName}
        initialData={extension}
      />
    </div>
  );
}
