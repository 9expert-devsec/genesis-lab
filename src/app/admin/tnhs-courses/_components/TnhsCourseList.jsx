'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import {
  deleteTnhsCourse,
  updateTnhsCourse,
} from '@/lib/actions/tnhs-courses';

export function TnhsCourseList({ courses: initial }) {
  const [courses, setCourses] = useState(initial);
  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

  function handleToggle(course) {
    const fd = new FormData();
    fd.set('active', String(!course.is_active));
    setBusyId(course._id);
    startTransition(async () => {
      await updateTnhsCourse(course._id, fd);
      setCourses((cs) =>
        cs.map((c) =>
          c._id === course._id ? { ...c, is_active: !c.is_active } : c
        )
      );
      setBusyId(null);
    });
  }

  function handleSortChange(course, value) {
    const sort_order = Number(value) || 0;
    setCourses((cs) =>
      cs.map((c) => (c._id === course._id ? { ...c, sort_order } : c))
    );
  }

  function handleSortCommit(course) {
    const fd = new FormData();
    fd.set('sort_order', String(course.sort_order));
    setBusyId(course._id);
    startTransition(async () => {
      await updateTnhsCourse(course._id, fd);
      setBusyId(null);
    });
  }

  function handleDelete(id) {
    if (!confirm('ลบ Course นี้?')) return;
    setBusyId(id);
    startTransition(async () => {
      await deleteTnhsCourse(id);
      setCourses((cs) => cs.filter((c) => c._id !== id));
      setBusyId(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--surface-border)] bg-9e-ice">
            <th className="w-16 px-4 py-3 text-left font-bold text-9e-navy">ปก</th>
            <th className="px-4 py-3 text-left font-bold text-9e-navy">คอร์ส</th>
            <th className="px-4 py-3 text-left font-bold text-9e-navy">Link</th>
            <th className="w-24 px-4 py-3 text-center font-bold text-9e-navy">
              ลำดับ
            </th>
            <th className="w-20 px-4 py-3 text-center font-bold text-9e-navy">
              Active
            </th>
            <th className="w-24 px-4 py-3 text-right font-bold text-9e-navy">
              จัดการ
            </th>
          </tr>
        </thead>
        <tbody>
          {courses.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-9e-slate-dp-50">
                ยังไม่มี Course — เพิ่มด้านบน
              </td>
            </tr>
          )}
          {courses.map((c) => (
            <tr
              key={c._id}
              className={
                'border-b border-[var(--surface-border)] last:border-0 ' +
                (c.is_active ? 'hover:bg-9e-ice/50' : 'opacity-50 hover:bg-gray-50')
              }
            >
              <td className="px-4 py-3">
                {c.cover_url ? (
                  <div className="relative h-8 w-12 shrink-0 overflow-hidden rounded-9e-sm bg-9e-ice">
                    <Image
                      src={c.cover_url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="48px"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="h-8 w-12 shrink-0 rounded-9e-sm bg-9e-ice" />
                )}
              </td>
              <td className="px-4 py-3">
                <p className="font-semibold text-9e-navy">{c.course_name}</p>
              </td>
              <td className="px-4 py-3">
                {c.external_url ? (
                  <a
                    href={c.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-[220px] items-center gap-1 truncate text-xs text-9e-action hover:underline"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                    <span className="truncate">{c.external_url}</span>
                  </a>
                ) : (
                  <span className="text-xs text-9e-slate-dp-50">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                <input
                  type="number"
                  value={c.sort_order}
                  onChange={(e) => handleSortChange(c, e.target.value)}
                  onBlur={() => handleSortCommit(c)}
                  disabled={busyId === c._id}
                  className="w-16 rounded-9e-sm border border-gray-200 px-2 py-1 text-center text-xs text-9e-navy focus:border-9e-action focus:outline-none disabled:opacity-50"
                />
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => handleToggle(c)}
                  disabled={busyId === c._id}
                  aria-label={c.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                  className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                    c.is_active ? 'bg-9e-action' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                      c.is_active ? 'left-4' : 'left-0.5'
                    }`}
                  />
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleDelete(c._id)}
                    disabled={busyId === c._id}
                    className="rounded-9e-sm border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busyId === c._id ? '...' : 'ลบ'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
