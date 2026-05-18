'use client';

import { useMemo, useState, useTransition } from 'react';
import { Pencil, X } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  toggleFaqActive,
  updateFaqOrder,
  updateFaqCategoryOverride,
} from '@/lib/actions/faqs';

const ALL = '__ALL__';
const ACTIVE_ALL = 'all';
const ACTIVE_ON  = 'on';
const ACTIVE_OFF = 'off';

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

function effectiveCategory(row) {
  return row?.category_override ?? row?.upstream_category ?? 'ทั่วไป';
}

function truncate(s, n = 60) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function CategoryCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    row.category_override ?? row.upstream_category ?? ''
  );
  const [saving, setSaving] = useState(false);

  async function commit(next) {
    setSaving(true);
    try {
      await onSave(row.faq_id, next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(value);
            if (e.key === 'Escape') {
              setValue(row.category_override ?? row.upstream_category ?? '');
              setEditing(false);
            }
          }}
          onBlur={() => commit(value)}
          disabled={saving}
          className="w-full min-w-[140px] rounded border border-9e-action px-2 py-1 text-xs text-9e-navy focus:outline-none disabled:opacity-50 dark:bg-[#0D1B2A] dark:text-white"
          placeholder={row.upstream_category || 'ไม่มี'}
        />
      </div>
    );
  }

  const isOverridden = row.category_override != null;
  const shown = effectiveCategory(row);

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group flex items-center gap-1 text-left text-xs font-medium text-9e-navy hover:text-9e-action dark:text-white"
          title="คลิกเพื่อแก้ไข"
        >
          <span className="truncate">{shown}</span>
          <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
        {isOverridden && row.upstream_category && (
          <p className="mt-0.5 truncate text-[10px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ต้นทาง: {row.upstream_category}
          </p>
        )}
      </div>
      {isOverridden && (
        <button
          type="button"
          onClick={() => commit('')}
          className="shrink-0 text-9e-slate-dp-50 hover:text-red-500"
          title="ล้างค่าที่ตั้งเอง"
          aria-label="ล้างค่าที่ตั้งเอง"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function FaqsAdminClient({ faqs: initial, lastSyncedAt }) {
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
      await updateFaqOrder(next.map((p) => p.faq_id));
    } finally {
      setBusyId(null);
    }
  });

  // Categories derived from current rows (so newly-overridden categories
  // appear in the filter without a reload).
  const categories = useMemo(() => {
    const set = new Set(rows.map(effectiveCategory));
    return [...set].sort();
  }, [rows]);

  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [activeFilter, setActiveFilter]     = useState(ACTIVE_ALL);
  const [query, setQuery]                   = useState('');

  const activeCount   = rows.filter((r) => r.is_active).length;
  const inactiveCount = rows.length - activeCount;

  const trimmedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((r) => {
    if (categoryFilter !== ALL && effectiveCategory(r) !== categoryFilter) {
      return false;
    }
    if (activeFilter === ACTIVE_ON && !r.is_active) return false;
    if (activeFilter === ACTIVE_OFF && r.is_active) return false;
    if (trimmedQuery && !(r.question ?? '').toLowerCase().includes(trimmedQuery)) {
      return false;
    }
    return true;
  });

  // Map a visible-row index → its index in the master `rows` array.
  // Drag-and-drop must mutate the master order, not the filtered view.
  const rowIndexByFaqId = useMemo(() => {
    const m = new Map();
    rows.forEach((r, i) => m.set(r.faq_id, i));
    return m;
  }, [rows]);

  async function handleToggle(r) {
    setBusyId(r.faq_id);
    startTransition(async () => {
      await toggleFaqActive(r.faq_id, !r.is_active);
      setRows((cur) =>
        cur.map((row) =>
          row.faq_id === r.faq_id ? { ...row, is_active: !row.is_active } : row
        )
      );
      setBusyId(null);
    });
  }

  async function handleCategoryOverride(faqId, value) {
    await updateFaqCategoryOverride(faqId, value);
    const trimmed = typeof value === 'string' ? value.trim() : '';
    const next = trimmed.length > 0 ? trimmed : null;
    setRows((cur) =>
      cur.map((row) =>
        row.faq_id === faqId ? { ...row, category_override: next } : row
      )
    );
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/admin/faqs/sync', { method: 'POST' });
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

  const dragDisabled =
    categoryFilter !== ALL || activeFilter !== ACTIVE_ALL || trimmedQuery.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">จัดการ FAQ</h1>
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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter(ALL)}
            className={
              'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
              (categoryFilter === ALL
                ? 'bg-9e-action text-white'
                : 'border border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
            }
          >
            ทั้งหมด ({rows.length})
          </button>
          {categories.map((cat) => {
            const count = rows.filter((r) => effectiveCategory(r) === cat).length;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
                  (active
                    ? 'bg-9e-action text-white'
                    : 'border border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
                }
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-9e-md border border-[var(--surface-border)] text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter(ACTIVE_ALL)}
              className={
                'px-2.5 py-1 ' +
                (activeFilter === ACTIVE_ALL
                  ? 'bg-9e-action text-white'
                  : 'bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
              }
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter(ACTIVE_ON)}
              className={
                'border-l border-[var(--surface-border)] px-2.5 py-1 ' +
                (activeFilter === ACTIVE_ON
                  ? 'bg-9e-action text-white'
                  : 'bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
              }
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter(ACTIVE_OFF)}
              className={
                'border-l border-[var(--surface-border)] px-2.5 py-1 ' +
                (activeFilter === ACTIVE_OFF
                  ? 'bg-9e-action text-white'
                  : 'bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
              }
            >
              Inactive ({inactiveCount})
            </button>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาคำถาม…"
            className="w-56 rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-1.5 text-xs text-9e-navy placeholder:text-9e-slate-dp-50 focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>
      </div>

      {dragDisabled && (
        <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ปิดตัวกรองทั้งหมดเพื่อจัดเรียงลำดับ (Drag &amp; Drop)
        </p>
      )}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">คำถาม</th>
              <th className="w-56 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หมวดหมู่</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-32 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">Sync ล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]"
                >
                  {rows.length === 0 ? (
                    <>
                      ยังไม่มีข้อมูล — กด <strong>Sync จาก API</strong> เพื่อดึงข้อมูลครั้งแรก
                    </>
                  ) : (
                    <>ไม่พบรายการที่ตรงกับตัวกรอง</>
                  )}
                </td>
              </tr>
            )}
            {visibleRows.map((r) => {
              const masterIdx = rowIndexByFaqId.get(r.faq_id) ?? 0;
              const dragProps = dragDisabled ? {} : getDragProps(masterIdx);
              const isDragging = !dragDisabled && draggingIndex === masterIdx;
              const isDropTarget =
                !dragDisabled &&
                dragOverIndex === masterIdx &&
                draggingIndex !== null &&
                draggingIndex !== masterIdx;
              const syncedAtLabel = r.synced_at
                ? new Date(r.synced_at).toLocaleString('th-TH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';
              return (
                <tr
                  key={r.faq_id}
                  {...dragProps}
                  className={
                    'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                    (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                    (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                    (r.is_active
                      ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                      : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                  }
                >
                  <td className="px-2 py-3 align-middle">
                    {dragDisabled ? (
                      <div className="px-1" aria-hidden="true" />
                    ) : (
                      <DragHandle />
                    )}
                  </td>
                  <td className="px-3 py-3 text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {masterIdx + 1}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-9e-navy dark:text-white" title={r.question}>
                      {truncate(r.question, 80)}
                    </p>
                    <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      ID: {r.faq_id}
                    </p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <CategoryCell row={r} onSave={handleCategoryOverride} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(r)}
                      disabled={busyId === r.faq_id}
                      aria-label={r.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                      className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                        r.is_active ? 'bg-[#22C55E]' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                          r.is_active ? 'left-4' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {syncedAtLabel}
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