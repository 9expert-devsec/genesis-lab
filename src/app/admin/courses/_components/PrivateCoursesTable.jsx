'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deletePrivateCourse } from '@/lib/actions/courses';
import { withListQuery } from '@/lib/courses/adminListQuery';

/**
 * The genesis-only PRIVATE courses on /admin/courses.
 *
 * Its own section rather than rows inside CoursesAdminClient: that table is
 * grouped by MSDB program and drag-reordered into MSDB's course order, and a
 * private course belongs to neither. Each row carries a Private badge and
 * links to the private editor — never the MSDB-`_id` one, which would 404.
 *
 * `rows` arrive already filtered by the page (search + type), as plain objects.
 */
export function PrivateCoursesTable({ rows = [], listQuery = '' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function remove(row) {
    const ok = window.confirm(
      `ลบ Private Course "${row.course_id} — ${row.course_name}" ?\n`
        + 'ข้อมูลหลักสูตร และ URL alias / SEO / แกลเลอรีของหลักสูตรนี้จะถูกลบทั้งหมด และกู้คืนไม่ได้'
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const res = await deletePrivateCourse(row._id).catch((err) => ({
        ok: false, error: err?.message ?? 'ลบไม่สำเร็จ',
      }));
      if (res?.ok !== true) setError(res?.error ?? 'ลบไม่สำเร็จ');
      router.refresh();
    });
  }

  return (
    <section className="mt-10" aria-labelledby="private-courses-heading">
      <h2 id="private-courses-heading" className="mb-1 text-lg font-bold text-[var(--text-primary)]">
        Private Courses
      </h2>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        เก็บใน Genesis เท่านั้น — ไม่ส่งไป MSDB และไม่แสดงในหน้ารายการสาธารณะ ·{' '}
        <Link href="/admin/courses/private-taxonomy" className="text-9e-action hover:underline">
          จัดการโปรแกรม / Skill แบบ Private
        </Link>
      </p>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">ยังไม่มี Private Course</p>
      ) : (
        <div className="overflow-x-auto rounded-9e-md border border-[var(--surface-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted,#f8fafc)] text-left text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">Course ID</th>
                <th className="px-3 py-2">ชื่อหลักสูตร</th>
                <th className="px-3 py-2">URL Alias</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-t border-[var(--surface-border)]">
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                      Private
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{row.course_id}</td>
                  <td className="px-3 py-2">{row.course_name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.urlAlias || '—'}</td>
                  <td className="px-3 py-2">{row.isPublished === false ? 'ซ่อน' : 'เผยแพร่'}</td>
                  <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                    <Link
                      href={withListQuery(`/admin/courses/private/${encodeURIComponent(row._id)}/edit`, listQuery)}
                      className="rounded-9e-md border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-navy hover:bg-9e-ice dark:text-white"
                    >
                      แก้ไข
                    </Link>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(row)}
                      className="rounded-9e-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
