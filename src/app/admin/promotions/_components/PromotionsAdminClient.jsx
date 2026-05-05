'use client';

import { useMemo, useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  togglePromotionActive,
  updatePromotionOrder,
} from '@/lib/actions/promotions';

function formatRange(startISO, endISO) {
  const fmt = (v) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const s = fmt(startISO);
  const e = fmt(endISO);
  if (s && e) return `${s} – ${e}`;
  return e ?? s ?? '—';
}

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

export function PromotionsAdminClient({ promotions: initial, configMap, lastSyncedAt }) {
  const [busyId, setBusyId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
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
      await updatePromotionOrder(next.map((p) => p.promotion_id));
    } finally {
      setBusyId(null);
    }
  });

  // Map for quick lookup of config.url_slug per row.
  const slugFor = useMemo(
    () => (id) => configMap?.[id]?.url_slug ?? null,
    [configMap]
  );

  async function handleToggle(p) {
    setBusyId(p.promotion_id);
    startTransition(async () => {
      await togglePromotionActive(p.promotion_id, !p.is_active);
      setRows((cur) =>
        cur.map((r) =>
          r.promotion_id === p.promotion_id ? { ...r, is_active: !r.is_active } : r
        )
      );
      setBusyId(null);
    });
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/admin/promotions/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMsg({ type: 'err', text: data?.message ?? 'Sync failed' });
      } else {
        setSyncMsg({
          type: 'ok',
          text: `Sync สำเร็จ: ${data.synced ?? 0} รายการ`,
        });
        // Reload — we want fresh data from the sync that just ran.
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
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">โปรโมชั่น</h1>
          <p className="mt-1 text-xs text-9e-slate dark:text-[#94a3b8]">
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
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-9e-md bg-9e-primary px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
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
              <th className="w-[100px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ภาพ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ชื่อ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Slug</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ช่วงเวลา</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-28 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-9e-slate dark:text-[#94a3b8]">
                  ยังไม่มีข้อมูล — กด <strong>Sync จาก API</strong> เพื่อดึงข้อมูลครั้งแรก
                </td>
              </tr>
            )}
            {rows.map((p, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              const slug = slugFor(p.promotion_id);
              const editHref = `/admin/promotions/${encodeURIComponent(p.promotion_id)}/config`;
              return (
                <tr
                  key={p.promotion_id}
                  {...getDragProps(i)}
                  className={
                    'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                    (isDragging ? 'opacity-50 ring-2 ring-9e-primary ' : '') +
                    (isDropTarget ? 'border-t-2 border-t-9e-primary ' : '') +
                    (p.is_active
                      ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                      : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                  }
                >
                  <td className="px-2 py-3 align-middle">
                    <DragHandle />
                  </td>
                  <td className="px-3 py-3 text-9e-slate dark:text-[#94a3b8]">{i + 1}</td>
                  <td className="px-3 py-3">
                    {p.thumbnail_url ? (
                      <div className="relative h-[50px] w-[80px] overflow-hidden rounded bg-9e-ice dark:bg-[#0D1B2A]">
                        <Image
                          src={p.thumbnail_url}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-cover"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="h-[50px] w-[80px] rounded bg-9e-ice dark:bg-[#0D1B2A]" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="line-clamp-2 font-medium text-9e-navy dark:text-white">
                      {p.title || '(ไม่มีชื่อ)'}
                    </p>
                    <p className="mt-0.5 text-xs text-9e-slate dark:text-[#94a3b8]">
                      ID: {p.promotion_id}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={editHref}
                      className="text-xs text-9e-primary hover:underline dark:text-9e-sky"
                    >
                      {slug || '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-slate dark:text-[#94a3b8]">
                    {formatRange(p.start_date, p.end_date)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(p)}
                      disabled={busyId === p.promotion_id}
                      aria-label={p.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                      className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                        p.is_active ? 'bg-9e-primary' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                          p.is_active ? 'left-4' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={editHref}
                      className="inline-flex items-center rounded border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                    >
                      ตั้งค่า
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
