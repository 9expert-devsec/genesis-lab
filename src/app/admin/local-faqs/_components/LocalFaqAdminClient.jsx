'use client';

/**
 * LocalFaqAdminClient — read-only overview / directory of per-course FAQs.
 *
 * Since FAQs are now scoped to a specific course, editing happens on each
 * course's own FAQ editor (public course FAQ tab, or the career-path /
 * masterclass FAQ sub-pages). This page just groups what exists, resolves
 * course names, and links through. Orphaned FAQs (no course assigned — a
 * leftover from the category→per-course migration) are flagged at the top for
 * manual cleanup.
 */

import Link from 'next/link';
import { AlertTriangle, ArrowRight, HelpCircle } from 'lucide-react';

export function LocalFaqAdminClient({ groups = [], orphans = [] }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">FAQ (Local) — ภาพรวม</h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            FAQ ถูกผูกกับหลักสูตรแต่ละรายการ — แก้ไขได้ที่หน้าจัดการ FAQ ของหลักสูตรนั้น ๆ
          </p>
        </div>
      </div>

      {/* Orphan section — needs manual reassignment. */}
      {orphans.length > 0 && (
        <div className="mt-6 rounded-9e-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">
              ยังไม่ได้ผูกหลักสูตร — {orphans.length} รายการ
            </h2>
          </div>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/80">
            รายการเหล่านี้ไม่แสดงบนหน้าเว็บใด ๆ จนกว่าจะนำไปสร้างใหม่ในหน้าจัดการ FAQ ของหลักสูตรที่ถูกต้อง
            (คัดลอกเนื้อหาไปสร้างในหลักสูตรปลายทาง แล้วลบรายการนี้ทิ้ง)
          </p>
          <ul className="mt-3 space-y-1.5">
            {orphans.map((o) => (
              <li
                key={o._id}
                className="flex items-start gap-2 rounded-9e-sm bg-white/60 px-3 py-2 text-sm text-9e-navy dark:bg-black/20 dark:text-white"
              >
                <span className="mt-0.5 shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  {o.course_type}
                </span>
                <span>{o.question_th}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length === 0 && orphans.length === 0 && (
        <p className="mt-10 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ยังไม่มี FAQ ในระบบ
        </p>
      )}

      {/* Grouped directory. */}
      <div className="mt-6 space-y-8">
        {groups.map((group) => (
          <section key={group.course_type}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-9e-slate-dp-50 dark:text-[#94a3b8]">
              {group.label}
            </h2>
            <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
                    <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หลักสูตร</th>
                    <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">ทั้งหมด</th>
                    <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">ใช้งาน</th>
                    <th className="w-40 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr
                      key={item.ref_id}
                      className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40"
                    >
                      <td className="px-3 py-3">
                        <p className="font-semibold text-9e-navy dark:text-white">{item.name}</p>
                        <p className="mt-0.5 truncate font-mono text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                          {item.ref_id}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center text-9e-navy dark:text-white">{item.total}</td>
                      <td className="px-3 py-3 text-center text-9e-navy dark:text-white">{item.active}</td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={item.href}
                          className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-action hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
                        >
                          <HelpCircle className="h-3 w-3" /> จัดการ FAQ
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
