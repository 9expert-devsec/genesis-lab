'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { deletePrivateCourse } from '@/lib/actions/courses';
import { withListQuery } from '@/lib/courses/adminListQuery';

/**
 * The genesis-only PRIVATE courses — the `?tab=private` tab of /admin/courses.
 *
 * Its own list rather than rows inside CoursesAdminClient: that table is
 * grouped by MSDB program and drag-reordered into MSDB's course order, and a
 * private course belongs to neither. Each row carries a Private badge and
 * links to the private editor — never the MSDB-`_id` one, which would 404.
 *
 * `rows` arrive already filtered by the page (search only), as plain objects.
 * The search box is CoursesAdminClient's pattern: uncontrolled, keyed on the
 * URL's `q`, committing on Enter or blur — and it keeps `tab=private`.
 */
export function PrivateCoursesTable({ rows = [], q = '', listQuery = '' }) {
  const router = useRouter();

  function search(value) {
    const params = new URLSearchParams({ tab: 'private' });
    const term = String(value ?? '').trim();
    if (term) params.set('q', term);
    startTransition(() => router.push(`/admin/courses?${params}`));
  }
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
    <section aria-labelledby="private-courses-heading">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50"
            aria-hidden="true"
          />
          <input
            key={q}
            type="text"
            defaultValue={q}
            aria-label="ค้นหา Private Course"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search(e.currentTarget.value);
              }
            }}
            onBlur={(e) => e.target.value !== q && search(e.target.value)}
            placeholder="ค้นหาชื่อหลักสูตรหรือ Course ID... (Enter เพื่อค้นหา)"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white pl-8 pr-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>
        <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {rows.length} หลักสูตร
        </span>
      </div>

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
        <p className="text-sm text-[var(--text-secondary)]">
          {q ? 'ไม่พบ Private Course ที่ตรงกับคำค้น' : 'ยังไม่มี Private Course'}
        </p>
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
