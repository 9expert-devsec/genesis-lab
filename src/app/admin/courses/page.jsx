/**
 * /admin/courses — list every upstream course with the join state of
 * its CourseExtension document. Lets admins create new courses (POST
 * to MSDB), edit basic info, or jump into the SEO/Gallery extension.
 */

import Link from 'next/link';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listPrograms } from '@/lib/api/programs';
import { listCourseExtensions } from '@/lib/actions/course-extensions';
import { CoursesAdminClient } from './_components/CoursesAdminClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'จัดการหลักสูตร',
  robots: { index: false, follow: false },
};

export default async function AdminCoursesPage() {
  const [coursesRes, extensionsRes, programsRes] = await Promise.allSettled([
    listPublicCourses(),
    listCourseExtensions(),
    listPrograms(),
  ]);

  const courses =
    coursesRes.status === 'fulfilled' ? (coursesRes.value.items ?? []) : [];
  const extensions =
    extensionsRes.status === 'fulfilled' ? extensionsRes.value : [];
  const programs =
    programsRes.status === 'fulfilled' ? (programsRes.value.items ?? []) : [];

  const extByCourseId = Object.fromEntries(
    extensions.map((ext) => [ext.courseId, ext])
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            จัดการหลักสูตร
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            สร้าง/แก้ไขหลักสูตรในต้นทาง (MSDB) — ระบบสร้าง URL alias, SEO และ
            gallery ในแท็บแยก (กดปุ่ม SEO/Gallery)
          </p>
        </div>
        <Link
          href="/admin/courses/new"
          className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          + สร้างหลักสูตร
        </Link>
      </div>

      <CoursesAdminClient
        courses={courses}
        extensions={extByCourseId}
        programs={programs}
      />
    </div>
  );
}
