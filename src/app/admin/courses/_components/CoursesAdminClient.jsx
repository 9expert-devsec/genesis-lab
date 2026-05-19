'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { deleteCourse } from '@/lib/actions/courses';

const TYPE_OPTIONS = [
  { value: '',         label: 'ทุกประเภท' },
  { value: 'public',   label: 'Public' },
  { value: 'inhouse',  label: 'In-house' },
];

export function CoursesAdminClient({
  courses,
  extensions,
  programs = [],
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [, startTransition] = useTransition();

  const [search, setSearch]               = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterType, setFilterType]       = useState('');

  // Match against program either as a populated object (`program._id`)
  // or as a bare ObjectId string. Genesis sees both depending on the
  // upstream populate level.
  function programIdOf(course) {
    const p = course?.program;
    if (!p) return '';
    return String(p?._id ?? p);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      const matchSearch =
        !q ||
        (c.course_name || '').toLowerCase().includes(q) ||
        (c.course_name_th || '').toLowerCase().includes(q) ||
        (c.course_id || '').toLowerCase().includes(q);
      const matchProgram = !filterProgram || programIdOf(c) === filterProgram;
      const matchType =
        !filterType ||
        (filterType === 'public'  && c.course_type_public) ||
        (filterType === 'inhouse' && c.course_type_inhouse);
      return matchSearch && matchProgram && matchType;
    });
  }, [courses, search, filterProgram, filterType]);

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
      {/* ── Filter bar ────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อหลักสูตรหรือ Course ID..."
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white pl-8 pr-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>

        <select
          value={filterProgram}
          onChange={(e) => setFilterProgram(e.target.value)}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          <option value="">ทุกโปรแกรม</option>
          {programs.map((p) => {
            const id = String(p._id ?? p.program_id ?? '');
            const label =
              p.program_name ?? p.name ?? p.label ?? id;
            return (
              <option key={id} value={id}>{label}</option>
            );
          })}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {filtered.length} / {courses.length} หลักสูตร
        </span>
      </div>

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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    {courses.length === 0
                      ? 'ไม่สามารถโหลดรายการหลักสูตรได้ — ลองรีเฟรช หรือดู console log'
                      : 'ไม่พบหลักสูตรที่ตรงกับตัวกรอง'}
                  </td>
                </tr>
              )}
              {filtered.map((course) => {
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
