'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteCourse } from '@/lib/actions/courses';

export function CoursesAdminClient({ courses, extensions }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [, startTransition] = useTransition();

  async function handleDelete(course) {
    const ok = window.confirm(
      `ลบหลักสูตร "${course.course_name_th || course.course_name}" ?\nการลบจะไม่สามารถย้อนกลับได้`
    );
    if (!ok) return;

    setBusyId(course._id);
    setMsg(null);
    try {
      const res = await deleteCourse(course._id);
      if (res?.ok) {
        setMsg({ type: 'ok', text: 'ลบสำเร็จ' });
        startTransition(() => router.refresh());
      } else {
        setMsg({ type: 'err', text: res?.error ?? 'ลบไม่สำเร็จ' });
      }
    } catch (err) {
      setMsg({ type: 'err', text: err?.message ?? 'ลบไม่สำเร็จ' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {msg && (
        <div
          className={
            'mb-3 rounded-9e-md px-3 py-2 text-sm ' +
            (msg.type === 'ok'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700')
          }
        >
          {msg.text}
        </div>
      )}

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
              {courses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    ไม่สามารถโหลดรายการหลักสูตรได้ — ลองรีเฟรช หรือดู console log
                  </td>
                </tr>
              )}
              {courses.map((course) => {
                const ext = extensions[course.course_id];
                const busy = busyId === course._id;
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
                      <div className="inline-flex gap-1">
                        <Link
                          href={`/admin/courses/${encodeURIComponent(course._id)}/edit`}
                          className="rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                        >
                          แก้ไข
                        </Link>
                        <Link
                          href={`/admin/courses/${encodeURIComponent(course.course_id)}`}
                          className="rounded border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-action hover:bg-9e-ice"
                        >
                          SEO/Gallery
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(course)}
                          disabled={busy}
                          className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {busy ? '…' : 'ลบ'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
