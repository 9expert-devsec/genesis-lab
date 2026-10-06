'use client';

import { useId, useState } from 'react';
import { sortChecks } from '@/lib/seo/articleSeoChecks';

/**
 * The article form's SEO score + checklist (SEO-1). Presentational only — the
 * checks come from lib/seo/articleSeoChecks.js.
 *
 * Status is always TEXT as well as colour (✓ ผ่าน / ! ควรปรับ / ✗ ยังไม่ผ่าน /
 * – ข้าม), so it reads the same without colour vision and to a screen reader.
 * Rows are ordered bad → warn → good → na, and the list collapses behind a real
 * <button aria-expanded> so a long form stays usable.
 */

const STATUS = {
  good: { icon: '✓', text: 'ผ่าน',       cls: 'text-green-700 dark:text-green-400' },
  warn: { icon: '!', text: 'ควรปรับ',    cls: 'text-amber-700 dark:text-amber-400' },
  bad:  { icon: '✗', text: 'ยังไม่ผ่าน', cls: 'text-red-700 dark:text-red-400' },
  na:   { icon: '–', text: 'ข้าม',       cls: 'text-9e-slate-dp-50 dark:text-[#94a3b8]' },
};

export function SeoChecklist({ score, checks }) {
  const [open, setOpen] = useState(true);
  const listId = useId();
  const headingId = useId();
  const ordered = sortChecks(checks);
  const counts = ordered.reduce((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {});

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
        <span>คะแนน SEO</span>
        <span className="font-semibold text-9e-navy dark:text-white">{score}/100</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-9e-ice dark:bg-[#0D1B2A]">
        <div
          className={
            'h-full transition-all ' +
            (score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500')
          }
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <h4 id={headingId} className="text-xs font-semibold text-9e-navy dark:text-white">
          รายการตรวจ SEO
        </h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-9e-action hover:underline"
        >
          {open ? 'ซ่อน' : 'แสดง'}
          <span className="sr-only"> รายการตรวจ SEO</span>
          {!open && (
            <span className="ml-1 text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ({counts.bad ?? 0} ยังไม่ผ่าน · {counts.warn ?? 0} ควรปรับ)
            </span>
          )}
        </button>
      </div>

      <ul id={listId} aria-labelledby={headingId} hidden={!open} className="mt-2 space-y-1.5">
        {ordered.map((c) => {
          const s = STATUS[c.status];
          return (
            <li key={c.id} className={'flex gap-2 text-[11px] leading-snug' + (c.status === 'na' ? ' opacity-60' : '')}>
              <span aria-hidden="true" className={'w-3 shrink-0 text-center font-bold ' + s.cls}>{s.icon}</span>
              <span className="min-w-0">
                <span className={'font-semibold ' + s.cls}>{s.text}</span>
                <span className="text-9e-navy dark:text-white"> · {c.label}</span>
                {c.hint && c.status !== 'good' && (
                  <span className="block text-[10px] text-9e-slate-dp-50 dark:text-[#94a3b8]">{c.hint}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
