/**
 * /admin/courses — list every upstream course with the join state of
 * its CourseExtension document. Click a row to open the editor.
 */

import Link from 'next/link';
import { listPublicCourses } from '@/lib/api/public-courses';
import { listCourseExtensions } from '@/lib/actions/course-extensions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'จัดการหลักสูตร',
  robots: { index: false, follow: false },
};

export default async function AdminCoursesPage() {
  const [coursesRes, extensionsRes] = await Promise.allSettled([
    listPublicCourses(),
    listCourseExtensions(),
  ]);

  const courses =
    coursesRes.status === 'fulfilled' ? (coursesRes.value.items ?? []) : [];
  const extensions =
    extensionsRes.status === 'fulfilled' ? extensionsRes.value : [];

  // courseId → extension document, for the join column on each row.
  const extByCourseId = new Map(
    extensions.map((ext) => [ext.courseId, ext])
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          จัดการหลักสูตร — SEO &amp; Gallery
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          ทุกหลักสูตรจาก API ของ 9Expert — กดเข้าหน้าใดก็ได้เพื่อตั้ง URL,
          meta tags, tags, และเพิ่มรูป/วิดีโอ YouTube
        </p>
      </div>

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--surface-muted)]">
              <tr className="border-b border-[var(--surface-border)] text-left">
                <th className="px-4 py-3 font-medium text-[var(--text-secondary)]">Course ID</th>
                <th className="px-4 py-3 font-medium text-[var(--text-secondary)]">ชื่อหลักสูตร</th>
                <th className="px-4 py-3 font-medium text-[var(--text-secondary)]">URL Alias</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">Tags</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">Gallery</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const ext = extByCourseId.get(course.course_id);
                return (
                  <tr
                    key={course.course_id}
                    className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                      {course.course_id}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      {course.course_name_th || course.course_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                      {ext?.urlAlias || (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
                      {ext?.tags?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
                      {ext?.gallery?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/courses/${encodeURIComponent(
                          course.course_id
                        )}`}
                        className="text-sm font-medium text-9e-primary hover:underline"
                      >
                        แก้ไข →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {courses.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-[var(--text-muted)]"
                  >
                    ไม่สามารถโหลดรายการหลักสูตรได้ — ลองรีเฟรช หรือดู console log
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
