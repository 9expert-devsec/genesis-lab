'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  createMasterclassBatch,
  updateMasterclassBatch,
  deleteMasterclassBatch,
} from '@/lib/actions/masterclass';

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';
const labelCls = 'block text-sm font-medium text-9e-navy dark:text-white';

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function thaiDayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return `${WEEKDAYS[d.getDay()]}ที่ ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function toDateInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_STYLES = {
  draft:     'bg-gray-100 text-gray-600',
  open:      'bg-green-50 text-green-700',
  full:      'bg-red-50 text-red-700',
  closed:    'bg-amber-50 text-amber-700',
  cancelled: 'border border-red-300 text-red-600',
};

function emptyBatch(suggestedNo) {
  return {
    batch_no: suggestedNo,
    batch_label: '',
    dates: [],
    venue_name: '',
    venue_address: '',
    venue_map_url: '',
    venue_note: '',
    price_normal: '',
    price_early_bird: '',
    early_bird_deadline: '',
    early_bird_active: false,
    capacity: 50,
    status: 'draft',
    status_override: false,
    payment_enabled: false,
    internal_notes: '',
  };
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? 'bg-[#22C55E]' : 'bg-gray-300 dark:bg-[#1e3a5f]'
        }`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
      <span className="text-sm text-9e-navy dark:text-white">{label}</span>
    </label>
  );
}

export function MasterclassBatchListClient({ course, batches }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [form, setForm] = useState(emptyBatch(1));
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [isPending, startTransition] = useTransition();

  const nextBatchNo = (batches?.reduce((max, b) => Math.max(max, b.batch_no ?? 0), 0) ?? 0) + 1;

  function openCreate() {
    setEditingBatch(null);
    setForm(emptyBatch(nextBatchNo));
    setError(null);
    setShowForm(true);
  }

  function openEdit(batch) {
    setEditingBatch(batch);
    setForm({
      batch_no: batch.batch_no ?? 1,
      batch_label: batch.batch_label ?? '',
      dates: (batch.dates ?? []).map((d) => ({
        date: toDateInputValue(d.date),
        day_label: d.day_label ?? '',
      })),
      venue_name: batch.venue_name ?? '',
      venue_address: batch.venue_address ?? '',
      venue_map_url: batch.venue_map_url ?? '',
      venue_note: batch.venue_note ?? '',
      price_normal: batch.price_normal ?? '',
      price_early_bird: batch.price_early_bird ?? '',
      early_bird_deadline: toDateTimeLocalValue(batch.early_bird_deadline),
      early_bird_active: batch.early_bird_active ?? false,
      capacity: batch.capacity ?? 50,
      status: batch.status ?? 'draft',
      status_override: batch.status_override ?? false,
      payment_enabled: batch.payment_enabled ?? false,
      internal_notes: batch.internal_notes ?? '',
    });
    setError(null);
    setShowForm(true);
  }

  const set = (patch) => setForm((cur) => ({ ...cur, ...patch }));

  // dates dynamic list
  const addDate = () => set({ dates: [...form.dates, { date: '', day_label: '' }] });
  const updateDate = (i, patch) =>
    set({ dates: form.dates.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });
  const removeDate = (i) => set({ dates: form.dates.filter((_, idx) => idx !== i) });

  function buildData() {
    return {
      batch_no: Number(form.batch_no) || undefined,
      batch_label: form.batch_label.trim(),
      dates: form.dates
        .filter((d) => d.date)
        .map((d) => ({
          date: new Date(d.date).toISOString(),
          day_label: d.day_label || thaiDayLabel(d.date),
        })),
      venue_name: form.venue_name.trim(),
      venue_address: form.venue_address.trim(),
      venue_map_url: form.venue_map_url.trim(),
      venue_note: form.venue_note.trim(),
      price_normal: Number(form.price_normal) || 0,
      price_early_bird: form.price_early_bird === '' ? null : Number(form.price_early_bird),
      early_bird_deadline: form.early_bird_deadline ? new Date(form.early_bird_deadline).toISOString() : null,
      early_bird_active: form.early_bird_active,
      capacity: Number(form.capacity) || 0,
      status: form.status,
      status_override: form.status_override,
      payment_enabled: form.payment_enabled,
      internal_notes: form.internal_notes,
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.price_normal === '' || Number.isNaN(Number(form.price_normal))) {
      setError('กรุณากรอกราคาปกติ (price_normal)');
      return;
    }
    const data = buildData();
    startTransition(async () => {
      try {
        const res = editingBatch
          ? await updateMasterclassBatch(editingBatch._id, data)
          : await createMasterclassBatch(course._id, data);
        if (res?.ok === false) {
          setError(res.error || 'บันทึกไม่สำเร็จ');
          return;
        }
        setShowForm(false);
        setEditingBatch(null);
        router.refresh();
      } catch (err) {
        setError(err?.message ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  function handleDelete(batch) {
    startTransition(async () => {
      try {
        await deleteMasterclassBatch(batch._id);
        setConfirmDelete(null);
        router.refresh();
      } catch (err) {
        setError(err?.message ?? 'ลบไม่สำเร็จ');
      }
    });
  }

  return (
    <div>
      <Link
        href="/admin/masterclass"
        className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไป /admin/masterclass
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">จัดการรุ่น</h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {course.title_th} · ทั้งหมด {batches?.length ?? 0} รุ่น
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> เพิ่มรุ่น
        </button>
      </div>

      <div className="mt-2 overflow-x-auto rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">รุ่น</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">วันที่</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">สถานที่</th>
              <th className="px-3 py-3 text-right font-bold text-9e-navy dark:text-white">ราคาปกติ</th>
              <th className="px-3 py-3 text-right font-bold text-9e-navy dark:text-white">Early Bird</th>
              <th className="px-3 py-3 text-center font-bold text-9e-navy dark:text-white">ที่นั่ง</th>
              <th className="px-3 py-3 text-center font-bold text-9e-navy dark:text-white">สถานะ</th>
              <th className="px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Payment</th>
              <th className="px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {(!batches || batches.length === 0) && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีรุ่น — กด <strong>เพิ่มรุ่น</strong> เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {(batches ?? []).map((b) => (
              <tr key={b._id} className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40">
                <td className="px-3 py-3 font-semibold text-9e-navy dark:text-white">
                  {b.batch_label || `รุ่นที่ ${b.batch_no}`}
                </td>
                <td className="px-3 py-3 text-9e-navy dark:text-white">
                  {b.dates?.[0]?.day_label ? (
                    b.dates[0].day_label
                  ) : (
                    <span className="text-9e-slate-dp-50 dark:text-[#94a3b8]">—</span>
                  )}
                </td>
                <td className="max-w-[160px] truncate px-3 py-3 text-9e-navy dark:text-white" title={b.venue_name}>
                  {b.venue_name || <span className="text-9e-slate-dp-50">—</span>}
                </td>
                <td className="px-3 py-3 text-right text-9e-navy dark:text-white">
                  {Number(b.price_normal ?? 0).toLocaleString('th-TH')}
                </td>
                <td className="px-3 py-3 text-right text-9e-navy dark:text-white">
                  {b.price_early_bird != null ? (
                    <div>
                      <span>{Number(b.price_early_bird).toLocaleString('th-TH')}</span>
                      {b.early_bird_deadline && (
                        <span className="ml-1 inline-flex rounded-full bg-9e-lime/30 px-1.5 py-0.5 text-[10px] text-9e-navy">
                          {toDateInputValue(b.early_bird_deadline)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-9e-slate-dp-50">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-9e-navy dark:text-white">
                  {b.registered_count ?? 0}/{b.capacity ?? 0}
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[b.status] ?? STATUS_STYLES.draft}`}>
                    {b.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span
                    title={b.payment_enabled ? 'เปิดชำระเงิน' : 'ปิดชำระเงิน'}
                    className={`inline-block h-2.5 w-2.5 rounded-full ${b.payment_enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-[#1e3a5f]'}`}
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                    >
                      <Pencil className="h-3 w-3" /> แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(b)}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
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

      {/* Inline form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-gray-200 p-6 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-9e-navy dark:text-white">
              {editingBatch ? 'แก้ไขรุ่น' : 'เพิ่มรุ่นใหม่'}
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-9e-slate-dp-50 hover:text-red-500">
              <X size={18} />
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>batch_no</label>
              <input type="number" value={form.batch_no} onChange={(e) => set({ batch_no: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>batch_label</label>
              <input type="text" value={form.batch_label} onChange={(e) => set({ batch_label: e.target.value })} placeholder={`รุ่นที่ ${form.batch_no}`} className={inputCls} />
            </div>
          </div>

          {/* Dates */}
          <div className="mt-4">
            <span className={labelCls}>วันที่ (dates)</span>
            <div className="mt-1 space-y-2">
              {form.dates.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={d.date}
                    onChange={(e) => updateDate(i, { date: e.target.value, day_label: thaiDayLabel(e.target.value) })}
                    className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
                  />
                  <input
                    type="text"
                    value={d.day_label}
                    onChange={(e) => updateDate(i, { day_label: e.target.value })}
                    placeholder="เสาร์ที่ 15 มิถุนายน 2569"
                    className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
                  />
                  <button type="button" onClick={() => removeDate(i)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addDate}
                className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                <Plus size={14} /> เพิ่มวันที่
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>venue_name</label>
              <input type="text" value={form.venue_name} onChange={(e) => set({ venue_name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>venue_map_url</label>
              <input type="text" value={form.venue_map_url} onChange={(e) => set({ venue_map_url: e.target.value })} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>venue_address</label>
              <input type="text" value={form.venue_address} onChange={(e) => set({ venue_address: e.target.value })} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>venue_note</label>
              <input type="text" value={form.venue_note} onChange={(e) => set({ venue_note: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>price_normal *</label>
              <input type="number" value={form.price_normal} onChange={(e) => set({ price_normal: e.target.value })} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>price_early_bird</label>
              <input type="number" value={form.price_early_bird} onChange={(e) => set({ price_early_bird: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>early_bird_deadline</label>
              <input type="datetime-local" value={form.early_bird_deadline} onChange={(e) => set({ early_bird_deadline: e.target.value })} className={inputCls} />
            </div>
            <div className="flex items-end">
              <Toggle checked={form.early_bird_active} onChange={(v) => set({ early_bird_active: v })} label="early_bird_active" />
            </div>
            <div>
              <label className={labelCls}>capacity</label>
              <input type="number" value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>status</label>
              <select value={form.status} onChange={(e) => set({ status: e.target.value })} className={inputCls}>
                <option value="draft">draft</option>
                <option value="open">open</option>
                <option value="full">full</option>
                <option value="closed">closed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <Toggle checked={form.status_override} onChange={(v) => set({ status_override: v })} label="กำหนด Status เอง (ไม่คำนวณจากที่นั่ง)" />
            <Toggle checked={form.payment_enabled} onChange={(v) => set({ payment_enabled: v })} label="payment_enabled" />
          </div>

          <div className="mt-4">
            <label className={labelCls}>internal_notes</label>
            <textarea value={form.internal_notes} onChange={(e) => set({ internal_notes: e.target.value })} rows={3} className={inputCls} />
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]">
              ยกเลิก
            </button>
            <button type="submit" disabled={isPending} className="rounded-9e-md bg-9e-action px-6 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50">
              {isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </form>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]">
            <h2 className="text-base font-bold text-9e-navy dark:text-white">ยืนยันการลบรุ่น</h2>
            <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ลบ <strong className="text-9e-navy dark:text-white">{confirmDelete.batch_label || `รุ่นที่ ${confirmDelete.batch_no}`}</strong>?
              การลบไม่สามารถย้อนกลับได้
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={isPending} className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]">
                ยกเลิก
              </button>
              <button type="button" onClick={() => handleDelete(confirmDelete)} disabled={isPending} className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {isPending ? 'กำลังลบ…' : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
