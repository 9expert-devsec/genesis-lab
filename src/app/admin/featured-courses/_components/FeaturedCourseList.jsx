'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import {
  deleteFeaturedCourse,
  updateFeaturedCourse,
} from '@/lib/actions/featured-courses';

export function FeaturedCourseList({ courses: initial }) {
  const [courses, setCourses] = useState(initial);
  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

  async function handleDelete(id) {
    if (!confirm('ลบออกจาก featured?')) return;
    setBusyId(id);
    startTransition(async () => {
      await deleteFeaturedCourse(id);
      setCourses((prev) => prev.filter((c) => c._id !== id));
      setBusyId(null);
    });
  }

  async function handleToggle(course) {
    const fd = new FormData();
    fd.set('sort_order', String(course.sort_order));
    fd.set('active', String(!course.active));
    setBusyId(course._id);
    startTransition(async () => {
      await updateFeaturedCourse(course._id, fd);
      setCourses((prev) =>
        prev.map((c) =>
          c._id === course._id ? { ...c, active: !c.active } : c
        )
      );
      setBusyId(null);
    });
  }

  async function handleReorder(course, direction) {
    const idx = courses.findIndex((c) => c._id === course._id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= courses.length) return;

    const a = courses[idx];
    const b = courses[swapIdx];

    const fdA = new FormData();
    fdA.set('sort_order', String(b.sort_order));
    fdA.set('active', String(a.active));
    const fdB = new FormData();
    fdB.set('sort_order', String(a.sort_order));
    fdB.set('active', String(b.active));

    setBusyId(course._id);
    startTransition(async () => {
      await Promise.all([
        updateFeaturedCourse(a._id, fdA),
        updateFeaturedCourse(b._id, fdB),
      ]);
      setCourses((prev) => {
        const next = [...prev];
        next[idx] = { ...a, sort_order: b.sort_order };
        next[swapIdx] = { ...b, sort_order: a.sort_order };
        return next.sort((x, y) => x.sort_order - y.sort_order);
      });
      setBusyId(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--surface-border)] bg-9e-ice">
            <th className="w-8 px-4 py-3 text-left font-bold text-9e-navy">#</th>
            <th className="px-4 py-3 text-left font-bold text-9e-navy">คอร์ส</th>
            <th className="w-20 px-4 py-3 text-center font-bold text-9e-navy">
              Active
            </th>
            <th className="w-40 px-4 py-3 text-right font-bold text-9e-navy">
              จัดการ
            </th>
          </tr>
        </thead>
        <tbody>
          {courses.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-9e-slate">
                ยังไม่มีคอร์ส featured — เพิ่มด้วย Course ID ด้านบน
              </td>
            </tr>
          )}
          {courses.map((c, i) => (
            <tr
              key={c._id}
              className={
                c.active
                  ? 'border-b border-[var(--surface-border)] transition-colors last:border-0 hover:bg-9e-ice/50'
                  : 'border-b border-[var(--surface-border)] opacity-50 transition-colors last:border-0 hover:bg-gray-50'
              }
            >
              <td className="px-4 py-3 text-center text-9e-slate">{i + 1}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {c.course_cover_url ? (
                    <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-9e-sm bg-9e-ice">
                      <Image
                        src={c.course_cover_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    </div>
                  ) : (
                    <div className="h-9 w-16 shrink-0 rounded-9e-sm bg-9e-ice" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-9e-navy">
                      {c.course_id}
                    </p>
                    <p className="line-clamp-1 text-xs text-9e-slate">
                      {c.course_name}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => handleToggle(c)}
                  disabled={busyId === c._id}
                  aria-label={c.active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                  className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                    c.active ? 'bg-9e-primary' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                      c.active ? 'left-4' : 'left-0.5'
                    }`}
                  />
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleReorder(c, 'up')}
                    disabled={i === 0 || busyId === c._id}
                    className="rounded-9e-sm border border-gray-200 px-2 py-1 text-xs hover:bg-9e-ice disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorder(c, 'down')}
                    disabled={i === courses.length - 1 || busyId === c._id}
                    className="rounded-9e-sm border border-gray-200 px-2 py-1 text-xs hover:bg-9e-ice disabled:opacity-30"
                  >
                    ↓
                  </button>
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
