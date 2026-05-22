'use client';

/**
 * CareerPathRegistrationsClient — admin dashboard for browsing,
 * filtering, and triaging incoming Career Path registrations.
 *
 * The status enum is fixed Thai-only (mirrors the legacy PHP workflow);
 * each value gets a colour and an inline `<select>` lets ops change
 * status without leaving the table.
 */

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Eye, Search, Trash2 } from 'lucide-react';
import {
  deleteCareerPathRegistration,
  updateRegistrationStatus,
} from '@/lib/actions/career-path-registrations';

const STATUS_OPTIONS = [
  'ลงทะเบียน',
  'ออกใบเสนอราคาแล้ว',
  'รอเพิ่มข้อมูลผู้เรียน',
  'สำเร็จ',
  'มีรอบถูกยกเลิก',
  'ยกเลิก',
  'ใบเสนอราคาหมดอายุ',
];

const STATUS_BADGE = {
  'ลงทะเบียน':            'bg-blue-50 text-blue-700 border-blue-100',
  'ออกใบเสนอราคาแล้ว':    'bg-yellow-50 text-yellow-700 border-yellow-100',
  'รอเพิ่มข้อมูลผู้เรียน': 'bg-orange-50 text-orange-700 border-orange-100',
  'สำเร็จ':               'bg-green-50 text-green-700 border-green-100',
  'มีรอบถูกยกเลิก':       'bg-red-50 text-red-700 border-red-100',
  'ยกเลิก':               'bg-gray-100 text-gray-600 border-gray-200',
  'ใบเสนอราคาหมดอายุ':    'bg-gray-100 text-gray-600 border-gray-200',
};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CareerPathRegistrationsClient({ registrations: initial, total }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        r.contactFirstName,
        r.contactLastName,
        r.contactEmail,
        r.careerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter]);

  function handleStatusChange(reg, next) {
    if (next === reg.status) return;
    setBusyId(reg._id);
    startTransition(async () => {
      const res = await updateRegistrationStatus(reg._id, next);
      if (res?.ok) {
        setRows((cur) =>
          cur.map((r) => (r._id === reg._id ? { ...r, status: next } : r))
        );
      }
      setBusyId(null);
    });
  }

  async function handleDelete(reg) {
    setBusyId(reg._id);
    setDeleteError(null);
    try {
      const res = await deleteCareerPathRegistration(reg._id);
      if (res?.ok === false) {
        setDeleteError(res.error || 'ลบไม่สำเร็จ');
        return;
      }
      setRows((cur) => cur.filter((r) => r._id !== reg._id));
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err?.message ?? 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            Career Path Registrations
          </h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ทั้งหมด {total} รายการ (แสดง {rows.length})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-9e-slate-dp-50" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา ชื่อ / email / career path…"
              className="w-72 rounded-9e-md border border-[var(--surface-border)] bg-white py-2 pl-8 pr-3 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          >
            <option value="">ทุกสถานะ</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ชื่อ-นามสกุล</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Career Path</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">คอร์ส</th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">ผู้เข้าอบรม</th>
              <th className="w-36 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">วันที่สมัคร</th>
              <th className="w-56 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">สถานะ</th>
              <th className="w-28 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {rows.length === 0
                    ? 'ยังไม่มีการลงทะเบียน'
                    : 'ไม่พบรายการที่ตรงกับการค้นหา'}
                </td>
              </tr>
            )}
            {filtered.map((r, i) => {
              const badgeClass = STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600 border-gray-200';
              return (
                <tr
                  key={r._id}
                  className="border-b border-[var(--surface-border)] hover:bg-9e-ice/40 dark:hover:bg-[#0D1B2A]/40 last:border-0"
                >
                  <td className="px-3 py-3 text-9e-slate-dp-50 dark:text-[#94a3b8]">{i + 1}</td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-9e-navy dark:text-white">
                      {r.contactFirstName} {r.contactLastName}
                    </p>
                    <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      {r.contactEmail}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-9e-navy dark:text-white">
                      {r.careerName}
                    </p>
                    <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      {r.careerSlug}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {Array.isArray(r.selectedCourses) ? r.selectedCourses.length : 0}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {r.attendeeCount ?? 1}
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {formatDate(r.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={r.status}
                      onChange={(e) => handleStatusChange(r, e.target.value)}
                      disabled={busyId === r._id}
                      className={
                        'w-full cursor-pointer rounded-full border px-3 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-9e-action disabled:opacity-50 ' +
                        badgeClass
                      }
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/admin/career-path-registrations/${r._id}`}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                      >
                        <Eye className="h-3 w-3" /> ดูรายละเอียด
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDelete(r);
                        }}
                        disabled={busyId === r._id}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
              ยืนยันการลบการลงทะเบียน
            </h2>
            <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ลบรายการของ{' '}
              <strong className="text-9e-navy dark:text-white">
                {confirmDelete.contactFirstName} {confirmDelete.contactLastName}
              </strong>
              ? การลบไม่สามารถย้อนกลับได้
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
