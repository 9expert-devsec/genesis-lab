'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { BookOpen, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  toggleCareerPathActive,
  updateCareerPathOrder,
  deleteCareerPath,
} from '@/lib/actions/career-paths';

function formatSyncedAt(iso) {
  if (!iso) return 'ยังไม่เคย sync';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'ยังไม่เคย sync';
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClasses(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'active') return 'bg-green-50 text-green-700 border-green-100';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

export function CareerPathsAdminClient({ careerPaths: initial, lastSyncedAt }) {
  const [busyId, setBusyId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  // The "are you sure?" target — null when no dialog is showing.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [, startTransition] = useTransition();

  const {
    items: rows,
    setItems: setRows,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initial, async (next) => {
    setRows(next.map((p, idx) => ({ ...p, display_order: idx })));
    setBusyId('__reorder__');
    try {
      await updateCareerPathOrder(next.map((p) => p.career_path_id));
    } finally {
      setBusyId(null);
    }
  });

  async function handleToggle(p) {
    setBusyId(p.career_path_id);
    startTransition(async () => {
      await toggleCareerPathActive(p.career_path_id, !p.is_active);
      setRows((cur) =>
        cur.map((r) =>
          r.career_path_id === p.career_path_id
            ? { ...r, is_active: !r.is_active }
            : r
        )
      );
      setBusyId(null);
    });
  }

  async function handleDelete(p) {
    setBusyId(p.career_path_id);
    setDeleteError(null);
    try {
      const res = await deleteCareerPath(p.career_path_id);
      if (res?.ok === false) {
        setDeleteError(res.error || 'ลบไม่สำเร็จ');
        return;
      }
      setRows((cur) =>
        cur.filter((r) => r.career_path_id !== p.career_path_id)
      );
      setConfirmDelete(null);
      if (res?.warning) setSyncMsg({ type: 'err', text: res.warning });
    } catch (err) {
      setDeleteError(err?.message ?? 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/admin/career-paths/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMsg({ type: 'err', text: data?.message ?? 'Sync failed' });
      } else {
        setSyncMsg({
          type: 'ok',
          text: `Sync สำเร็จ: ${data.synced ?? 0} รายการ`,
        });
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      setSyncMsg({ type: 'err', text: err?.message ?? 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            จัดการ Career Path
          </h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            Sync ล่าสุด: {formatSyncedAt(lastSyncedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span
              className={
                'text-xs ' +
                (syncMsg.type === 'ok' ? 'text-green-600' : 'text-red-600')
              }
            >
              {syncMsg.text}
            </span>
          )}
          <Link
            href="/admin/career-paths/new"
            className="inline-flex items-center gap-1 rounded-9e-md border border-9e-action px-3 py-2 text-sm font-bold text-9e-action hover:bg-9e-action hover:text-white"
          >
            <Plus className="h-4 w-4" /> สร้าง Career Path
          </Link>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {syncing ? 'กำลัง Sync…' : 'Sync จาก API'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-[80px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ภาพ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ชื่อ / Slug</th>
              <th className="w-32 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Upstream</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-36 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Sync ล่าสุด</th>
              <th className="w-24 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">หน้าเว็บ</th>
              <th className="w-28 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีข้อมูล — กด <strong>Sync จาก API</strong> เพื่อดึงข้อมูลครั้งแรก
                </td>
              </tr>
            )}
            {rows.map((p, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              const detailHref = p.api_slug ? `/${p.api_slug}` : null;
              const syncedAtLabel = p.synced_at
                ? new Date(p.synced_at).toLocaleString('th-TH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';
              return (
                <tr
                  key={p.career_path_id}
                  {...getDragProps(i)}
                  className={
                    'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                    (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                    (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                    (p.is_active
                      ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                      : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                  }
                >
                  <td className="px-2 py-3 align-middle">
                    <DragHandle />
                  </td>
                  <td className="px-3 py-3 text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {i + 1}
                  </td>
                  <td className="px-3 py-3">
                    {p.hero_image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.hero_image_url}
                        alt={p.hero_image_alt || p.title}
                        className="h-10 w-10 rounded-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-9e-ice text-xs font-bold text-9e-action dark:bg-[#0D1B2A]">
                        {p.title?.slice(0, 1) ?? '?'}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-9e-navy dark:text-white">
                      {p.title || '(ไม่มีชื่อ)'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      {p.api_slug || '—'}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                        statusBadgeClasses(p.upstream_status)
                      }
                    >
                      {p.upstream_status || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(p)}
                      disabled={busyId === p.career_path_id}
                      aria-label={p.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                      className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                        p.is_active ? 'bg-[#22C55E]' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                          p.is_active ? 'left-4' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {syncedAtLabel}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {detailHref ? (
                      <Link
                        href={detailHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-9e-action hover:underline dark:text-9e-air"
                      >
                        ดูหน้า <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-9e-slate-dp-50">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Link
                        href={`/admin/career-paths/${p.career_path_id}/courses`}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                        aria-label="จัดการคอร์ส"
                      >
                        <BookOpen className="h-3 w-3" /> จัดการคอร์ส
                      </Link>
                      <Link
                        href={`/admin/career-paths/${p.career_path_id}/edit`}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                        aria-label="แก้ไข"
                      >
                        <Pencil className="h-3 w-3" /> แก้ไข
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDelete(p);
                        }}
                        disabled={busyId === p.career_path_id}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        aria-label="ลบ"
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
          aria-labelledby="delete-cp-title"
        >
          <div className="w-full max-w-md rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]">
            <h2 id="delete-cp-title" className="text-base font-bold text-9e-navy dark:text-white">
              ยืนยันการลบ Career Path
            </h2>
            <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              คุณแน่ใจหรือไม่ว่าจะลบ <strong className="text-9e-navy dark:text-white">{confirmDelete.title}</strong>?
              การลบจะส่งคำสั่งลบไปยัง MSDB ด้วย และไม่สามารถย้อนกลับได้
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
                disabled={busyId === confirmDelete.career_path_id}
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                disabled={busyId === confirmDelete.career_path_id}
                className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === confirmDelete.career_path_id ? 'กำลังลบ…' : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}