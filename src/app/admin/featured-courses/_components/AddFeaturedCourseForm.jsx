'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { addFeaturedCourse } from '@/lib/actions/featured-courses';

/**
 * Typeahead for picking a course to feature.
 *
 * `courses` is pre-filtered by the parent server page — already-featured
 * entries are excluded. No client fetch needed; we filter locally as the
 * user types (up to 8 results shown).
 */
export function AddFeaturedCourseForm({ courses = [] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState(null);
  const [isPending, startTransition] = useTransition();

  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered =
    query.trim().length < 1
      ? []
      : courses
          .filter((c) => {
            const q = query.toLowerCase();
            return (
              c.course_id?.toLowerCase().includes(q) ||
              c.course_name?.toLowerCase().includes(q)
            );
          })
          .slice(0, 8);

  function handleSelect(course) {
    setSelected(course);
    setQuery(course.course_name);
    setOpen(false);
    setMessage(null);
  }

  function handleClear() {
    setSelected(null);
    setQuery('');
    setMessage(null);
    inputRef.current?.focus();
  }

  function handleAdd() {
    if (!selected) return;
    const fd = new FormData();
    fd.set('course_id', selected.course_id);
    fd.set('course_name', selected.course_name ?? '');
    fd.set('course_cover_url', selected.course_cover_url ?? '');

    startTransition(async () => {
      const result = await addFeaturedCourse(fd);
      if (result.ok) {
        setMessage({
          type: 'ok',
          text: `เพิ่ม "${selected.course_name}" สำเร็จแล้ว`,
        });
        setSelected(null);
        setQuery('');
        // Small delay so revalidatePath finishes propagating before we
        // ask Next to re-fetch the server component.
        setTimeout(() => router.refresh(), 300);
      } else {
        setMessage({
          type: 'error',
          text: result.error ?? 'เกิดข้อผิดพลาด',
        });
      }
    });
  }

  return (
    <div className="space-y-3" ref={wrapRef}>
      <label className="block text-sm font-bold text-9e-navy">ค้นหาคอร์ส</label>

      <div className="relative">
        <div
          className={`flex items-center gap-2 rounded-9e-md border-2 px-3 transition-colors ${
            open
              ? 'border-9e-action ring-2 ring-9e-action/20'
              : 'border-gray-200 hover:border-9e-air'
          }`}
        >
          <Search size={16} className="shrink-0 text-9e-slate" />

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setOpen(true);
            }}
            onFocus={() => {
              if (query) setOpen(true);
            }}
            placeholder="พิมพ์ชื่อคอร์สหรือ Course ID เช่น Power BI, MSE-L1"
            className="flex-1 bg-transparent py-2.5 text-sm text-9e-navy placeholder:text-9e-slate/60 focus:outline-none"
          />

          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="ล้างการค้นหา"
              className="text-9e-slate transition-colors hover:text-9e-navy"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {open && filtered.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-9e-md border border-gray-200 bg-white shadow-9e-md">
            {filtered.map((course) => (
              <button
                type="button"
                key={course.course_id}
                onClick={() => handleSelect(course)}
                className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-9e-ice"
              >
                <div className="flex h-7 w-12 shrink-0 items-center justify-center overflow-hidden rounded-9e-sm bg-9e-ice">
                  {course.program?.programiconurl && (
                    <Image
                      src={course.program.programiconurl}
                      alt=""
                      width={20}
                      height={20}
                      className="object-contain"
                      unoptimized
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-9e-navy">
                    {course.course_name}
                  </p>
                  <p className="text-xs text-9e-slate">
                    {course.course_id}
                    {course.program?.program_name &&
                      ` · ${course.program.program_name}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {open && query.trim().length > 0 && filtered.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-9e-md border border-gray-200 bg-white px-4 py-3 text-sm text-9e-slate shadow-9e-md">
            ไม่พบคอร์สที่ค้นหา
          </div>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-3 rounded-9e-md border border-9e-air/30 bg-9e-ice p-3">
          <div className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-9e-sm bg-white">
            {selected.program?.programiconurl && (
              <Image
                src={selected.program.programiconurl}
                alt=""
                width={24}
                height={24}
                className="object-contain"
                unoptimized
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-9e-navy">
              {selected.course_name}
            </p>
            <p className="text-xs text-9e-slate">{selected.course_id}</p>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending}
            className="flex shrink-0 items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {isPending ? 'กำลังเพิ่ม...' : 'เพิ่ม'}
          </button>
        </div>
      )}

      {message && (
        <p
          className={`text-xs font-medium ${
            message.type === 'ok' ? 'text-green-600' : 'text-red-500'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
