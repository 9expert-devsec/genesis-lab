'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { WRITER_FEATURED_COURSE_LIMIT } from '@/lib/writers/writerFields';

const RESULT_LIMIT = 8;

/**
 * Pick up to three online courses for the profile card, in order.
 *
 * `options` is every online course (toOnlineCourseOptions), keyed by the stable
 * `o_course_id`. A picked id that is no longer upstream stays listed, marked, so
 * the admin can see and remove it; the public page skips it either way.
 * The server re-checks the limit (writerSchema).
 */
export function OnlineCoursePicker({ options, value, onChange }) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const full = value.length >= WRITER_FEATURED_COURSE_LIMIT;

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return options
      .filter((o) => o.name.toLowerCase().includes(term) || o.id.toLowerCase().includes(term))
      .slice(0, RESULT_LIMIT);
  }, [options, query]);

  function move(index, delta) {
    const next = [...value];
    const [id] = next.splice(index, 1);
    next.splice(index + delta, 0, id);
    onChange(next);
  }

  return (
    <div data-testid="writer-course-picker">
      {value.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          ยังไม่ได้เลือก — แสดงหลักสูตรของวิทยากรที่ผูกไว้อัตโนมัติ (สูงสุด {WRITER_FEATURED_COURSE_LIMIT})
        </p>
      ) : (
        <ol className="space-y-2" data-testid="writer-course-picks">
          {value.map((id, index) => {
            const option = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-9e-md border border-[var(--surface-border)] p-2">
                <span className="w-5 shrink-0 text-center text-xs font-bold text-[var(--text-muted)]">{index + 1}</span>
                <span className="min-w-0 flex-1 text-sm text-9e-navy dark:text-white">
                  {option ? option.name : <span className="text-red-700">{id} (ไม่พบหลักสูตรนี้แล้ว — ไม่แสดงบนหน้าเว็บ)</span>}
                </span>
                <button
                  type="button"
                  aria-label="เลื่อนขึ้น"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="shrink-0 rounded-9e-sm p-1 text-[var(--text-muted)] hover:bg-9e-ice disabled:opacity-30 dark:hover:bg-[#0D1B2A]"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="เลื่อนลง"
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                  className="shrink-0 rounded-9e-sm p-1 text-[var(--text-muted)] hover:bg-9e-ice disabled:opacity-30 dark:hover:bg-[#0D1B2A]"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="นำออก"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  className="shrink-0 rounded-9e-sm p-1 text-[var(--text-muted)] hover:bg-9e-ice hover:text-red-700 dark:hover:bg-[#0D1B2A]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <input
        type="search"
        value={query}
        disabled={full}
        placeholder={full ? `เลือกครบ ${WRITER_FEATURED_COURSE_LIMIT} หลักสูตรแล้ว` : 'ค้นหาหลักสูตรออนไลน์ตามชื่อ…'}
        aria-label="ค้นหาหลักสูตรออนไลน์"
        onChange={(e) => setQuery(e.target.value)}
        className="mt-3 w-full rounded-9e-md border border-[var(--surface-border)] px-3 py-2 text-sm text-9e-navy disabled:opacity-50 dark:bg-[#0D1B2A] dark:text-white"
      />
      {!full && results.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--surface-border)] rounded-9e-md border border-[var(--surface-border)]">
          {results.map((option) => {
            const picked = value.includes(option.id);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={picked}
                  onClick={() => { onChange([...value, option.id]); setQuery(''); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-9e-navy hover:bg-9e-ice disabled:cursor-not-allowed disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
                >
                  <span className="min-w-0">{option.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-9e-action">{picked ? 'เลือกแล้ว' : '+ เพิ่ม'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!full && query.trim() && results.length === 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">ไม่พบหลักสูตรที่ตรงกับคำค้น</p>
      )}
    </div>
  );
}
