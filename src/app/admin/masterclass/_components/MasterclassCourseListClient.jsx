'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { CalendarRange, ExternalLink, HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteMasterclassCourse } from '@/lib/actions/masterclass';

export function MasterclassCourseListClient({ courses: initial }) {
  const [rows, setRows] = useState(initial ?? []);
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [, startTransition] = useTransition();

  function handleDelete(course) {
    setBusyId(course._id);
    setDeleteError(null);
    startTransition(async () => {
      try {
        const res = await deleteMasterclassCourse(course._id);
        if (res?.ok === false) {
          setDeleteError(res.error || 'ลบไม่สำเร็จ');
          return;
        }
        setRows((cur) => cur.filter((r) => r._id !== course._id));
        setConfirmDelete(null);
      } catch (err) {
        setDeleteError(err?.message ?? 'ลบไม่สำเร็จ');
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            จัดการ Masterclass
          </h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ทั้งหมด {rows.length} หลักสูตร
          </p>
        </div>
        <Link
          href="/admin/masterclass/new"
          className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> สร้างหลักสูตรใหม่
        </Link>
      </div>

      <div className="mt-2 overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หัวข้อ / Slug</th>
              <th className="w-28 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">สถานะ</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">ลำดับ</th>
              <th className="w-72 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีหลักสูตร — กด <strong>สร้างหลักสูตรใหม่</strong> เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr
                key={c._id}
                className="border-b border-[var(--surface-border)] transition-colors last:border-0 hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40"
              >
                <td className="px-3 py-3">
                  <a
                    href={`/masterclass/${c.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-9e-navy hover:text-9e-action dark:text-white"
                  >
                    {c.title_th || '(ไม่มีชื่อ)'}
                    <ExternalLink className="h-3 w-3 text-9e-slate-dp-50" />
                  </a>
                  <p className="mt-0.5 truncate font-mono text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {c.slug || '—'}
                  </p>
                </td>
                <td className="px-3 py-3 text-center">
                  {c.is_published ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      เผยแพร่
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      ร่าง
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center">
                  <span
                    title={c.is_active ? 'Active' : 'Inactive'}
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      c.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                    }`}
                  />
                </td>
                <td className="px-3 py-3 text-center text-9e-navy dark:text-white">
                  {c.display_order ?? 0}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Link
                      href={`/admin/masterclass/${c._id}/edit`}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                    >
                      <Pencil className="h-3 w-3" /> แก้ไข
                    </Link>
                    <Link
                      href={`/admin/masterclass/${c._id}/batches`}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                    >
                      <CalendarRange className="h-3 w-3" /> จัดการรุ่น
                    </Link>
                    <Link
                      href={`/admin/masterclass/${c._id}/faqs`}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                    >
                      <HelpCircle className="h-3 w-3" /> FAQ
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDelete(c);
                      }}
                      disabled={busyId === c._id}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]">
            <h2 className="text-base font-bold text-9e-navy dark:text-white">
              ยืนยันการลบหลักสูตร
            </h2>
            <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              คุณแน่ใจหรือไม่ว่าจะลบ{' '}
              <strong className="text-9e-navy dark:text-white">{confirmDelete.title_th}</strong>?
              รุ่นทั้งหมดของหลักสูตรนี้จะถูกลบด้วย และไม่สามารถย้อนกลับได้
            </p>

            {deleteError && (
              <div className="mt-3 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {deleteError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(null);
                  setDeleteError(null);
                }}
                disabled={busyId === confirmDelete._id}
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                disabled={busyId === confirmDelete._id}
                className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === confirmDelete._id ? 'กำลังลบ…' : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
