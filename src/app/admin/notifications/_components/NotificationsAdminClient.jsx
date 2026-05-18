'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Plus } from 'lucide-react';
import {
  toggleNotificationActive,
  updateNotificationWeight,
  deleteNotification,
} from '@/lib/actions/site-notifications';
import { NotificationFormModal } from './NotificationFormModal';

const TYPE_LABEL = {
  topbar: { label: 'TOP BAR', cls: 'bg-blue-100 text-blue-700' },
  popup:  { label: 'POPUP',   cls: 'bg-purple-100 text-purple-700' },
};

const TRIGGER_LABEL = {
  immediate:   'Immediate',
  delay:       'Delay',
  exit_intent: 'Exit Intent',
  scroll:      'Scroll',
};

function formatDateRange(startISO, endISO) {
  const fmt = (v) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  const s = fmt(startISO);
  const e = fmt(endISO);
  if (!s && !e) return 'ตลอดเวลา';
  if (s && e) return `${s} → ${e}`;
  if (s) return `จาก ${s}`;
  return `ถึง ${e}`;
}

export function NotificationsAdminClient({ notifications: initial }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState('all'); // 'all' | 'topbar' | 'popup'
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [, startTransition] = useTransition();

  const visibleRows = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.display_type === filter);
  }, [rows, filter]);

  const counts = useMemo(() => ({
    all:    rows.length,
    topbar: rows.filter((r) => r.display_type === 'topbar').length,
    popup:  rows.filter((r) => r.display_type === 'popup').length,
  }), [rows]);

  async function handleToggle(row) {
    setBusyId(row._id);
    startTransition(async () => {
      await toggleNotificationActive(row._id, !row.active);
      setRows((cur) =>
        cur.map((r) => (r._id === row._id ? { ...r, active: !r.active } : r))
      );
      setBusyId(null);
    });
  }

  async function handleWeightBlur(row, value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next === row.weight) return;
    setBusyId(row._id);
    try {
      await updateNotificationWeight(row._id, next);
      setRows((cur) =>
        cur.map((r) => (r._id === row._id ? { ...r, weight: next } : r))
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`ลบ "${row.name}" ใช่หรือไม่?`)) return;
    setBusyId(row._id);
    try {
      await deleteNotification(row._id);
      setRows((cur) => cur.filter((r) => r._id !== row._id));
    } finally {
      setBusyId(null);
    }
  }

  function handleSaved() {
    setEditing(null);
    setCreating(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            Notifications &amp; Popups
          </h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ตั้งค่า Top Bar และ Popup ที่แสดงในหน้าเว็บไซต์
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> เพิ่มใหม่
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { k: 'all',    l: 'ทั้งหมด' },
          { k: 'topbar', l: 'Top Bar' },
          { k: 'popup',  l: 'Popup' },
        ].map((t) => {
          const active = filter === t.k;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => setFilter(t.k)}
              className={
                'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                (active
                  ? 'bg-9e-action text-white'
                  : 'border border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
              }
            >
              {t.l} ({counts[t.k]})
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-24 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Type</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ชื่อ</th>
              <th className="w-40 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">รายละเอียด</th>
              <th className="w-64 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ช่วงเวลา</th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Weight</th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-24 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มี Notification — กด <strong>+ เพิ่มใหม่</strong>
                </td>
              </tr>
            )}
            {visibleRows.map((r) => {
              const type = TYPE_LABEL[r.display_type] ?? TYPE_LABEL.popup;
              const isTopbar = r.display_type === 'topbar';
              return (
                <tr
                  key={r._id}
                  className={
                    'border-b border-[var(--surface-border)] last:border-0 ' +
                    (r.active
                      ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                      : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                  }
                >
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${type.cls}`}
                    >
                      {type.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-9e-navy dark:text-white">{r.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      {isTopbar
                        ? (r.message || '(ไม่มีข้อความ)')
                        : (r.image_url ? r.image_url.split('/').pop() : '(ไม่มีรูป)')}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {isTopbar ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-4 w-4 rounded border border-gray-300"
                          style={{ backgroundColor: r.bg_color || '#2486FF' }}
                          aria-label={`BG ${r.bg_color}`}
                        />
                        <span
                          className="inline-block h-4 w-4 rounded border border-gray-300"
                          style={{ backgroundColor: r.text_color || '#FFFFFF' }}
                          aria-label={`Text ${r.text_color}`}
                        />
                        {r.bg_image_url && (
                          <span className="text-[10px] font-bold text-9e-slate-dp-50">+IMG</span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                        {TRIGGER_LABEL[r.trigger] ?? r.trigger}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {formatDateRange(r.starts_at, r.ends_at)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="number"
                      defaultValue={r.weight}
                      onBlur={(e) => handleWeightBlur(r, e.target.value)}
                      className="w-16 rounded border border-[var(--surface-border)] bg-white px-2 py-1 text-center text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(r)}
                      disabled={busyId === r._id}
                      aria-label={r.active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                      className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                        r.active ? 'bg-[#22C55E]' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                          r.active ? 'left-4' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        aria-label="แก้ไข"
                        className="rounded p-1.5 text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        disabled={busyId === r._id}
                        aria-label="ลบ"
                        className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <NotificationFormModal
          initial={editing}
          onClose={handleSaved}
        />
      )}
    </div>
  );
}