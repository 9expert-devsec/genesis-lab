'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Plus, Trash2 } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  createNearbyPlace,
  updateNearbyPlace,
  toggleNearbyPlaceActive,
  deleteNearbyPlace,
  reorderNearbyPlaces,
} from '@/lib/actions/nearby-places';

const TYPE_OPTIONS = [
  { value: 'hotel', label: 'โรงแรม' },
  { value: 'food',  label: 'ร้านอาหาร' },
  { value: 'cafe',  label: 'ร้านกาแฟ' },
  { value: 'bar',   label: 'ผับ/ร้านอาหาร' },
  { value: 'drink', label: 'เครื่องดื่ม' },
];

const TYPE_BADGE = {
  hotel: 'bg-sky-100 text-sky-700',
  food:  'bg-orange-100 text-orange-700',
  cafe:  'bg-amber-100 text-amber-700',
  bar:   'bg-violet-100 text-violet-700',
  drink: 'bg-cyan-100 text-cyan-700',
};

const COL_COUNT = 8;

export function NearbyPlacesAdminClient({ initialPlaces }) {
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [, startTransition] = useTransition();

  const {
    items: places,
    setItems: setPlaces,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initialPlaces, async (next) => {
    setPlaces(next.map((p, idx) => ({ ...p, display_order: idx })));
    setBusy('__reorder__');
    try {
      await reorderNearbyPlaces(next.map((p) => p._id));
    } finally {
      setBusy(null);
    }
  });

  function handleToggleActive(row) {
    setBusy(row._id);
    startTransition(async () => {
      await toggleNearbyPlaceActive(row._id, !row.is_active);
      setPlaces((cur) =>
        cur.map((r) => (r._id === row._id ? { ...r, is_active: !r.is_active } : r))
      );
      setBusy(null);
    });
  }

  function handleDelete(row) {
    if (!window.confirm(`ลบ "${row.name}" ถาวร?`)) return;
    setBusy(row._id);
    startTransition(async () => {
      await deleteNearbyPlace(row._id);
      setPlaces((cur) => cur.filter((r) => r._id !== row._id));
      setBusy(null);
    });
  }

  function handleAdded(newDoc) {
    if (newDoc) setPlaces((cur) => [...cur, newDoc]);
    setShowAdd(false);
  }

  function handleUpdated(updated) {
    setPlaces((cur) => cur.map((r) => (r._id === updated._id ? updated : r)));
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ทั้งหมด {places.length} รายการ · ลากเพื่อเรียงลำดับ
        </p>
        <button
          type="button"
          onClick={() => { setShowAdd((v) => !v); setEditingId(null); }}
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> {showAdd ? 'ปิดฟอร์ม' : 'เพิ่มสถานที่'}
        </button>
      </div>

      {showAdd && <AddPlaceForm onAdded={handleAdded} />}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-[80px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ภาพ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ชื่อ</th>
              <th className="w-32 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ประเภท</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">ระยะ</th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-32 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {places.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีรายการ — กด <strong>เพิ่มสถานที่</strong> เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {places.map((row, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              const isEditing = editingId === row._id;

              if (isEditing) {
                return (
                  <tr key={row._id} className="border-b border-[var(--surface-border)] last:border-0 bg-9e-ice/30 dark:bg-[#0D1B2A]/30">
                    <td colSpan={COL_COUNT} className="px-3 py-4">
                      <EditPlaceForm
                        row={row}
                        onUpdated={handleUpdated}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={row._id}
                  {...getDragProps(i)}
                  className={
                    'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                    (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                    (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                    (row.is_active
                      ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                      : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                  }
                >
                  <td className="px-2 py-3 align-middle">
                    <DragHandle />
                  </td>
                  <td className="px-3 py-3 text-9e-slate-dp-50 dark:text-[#94a3b8]">{i + 1}</td>
                  <td className="px-3 py-3">
                    <div className="relative h-[48px] w-[64px] overflow-hidden rounded bg-9e-ice dark:bg-[#0D1B2A]">
                      {row.image_url ? (
                        <Image
                          src={row.image_url}
                          alt={row.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                          draggable={false}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-9e-navy dark:text-white">{row.name}</p>
                    {row.detail && (
                      <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">{row.detail}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        'inline-block rounded-full px-2 py-0.5 text-xs font-semibold ' +
                        (TYPE_BADGE[row.type] ?? 'bg-slate-100 text-slate-600')
                      }
                    >
                      {row.label || TYPE_OPTIONS.find((t) => t.value === row.type)?.label || row.type}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {row.distance}m · {row.walk}min
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(row)}
                      disabled={busy === row._id}
                      aria-label={row.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                      className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                        row.is_active ? 'bg-9e-action' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                          row.is_active ? 'left-4' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setEditingId(row._id); setShowAdd(false); }}
                        className="rounded border border-9e-action px-2.5 py-1 text-xs text-9e-action hover:bg-9e-action hover:text-white"
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={busy === row._id}
                        className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-[#3a1818]"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> ลบ
                      </button>
                    </div>
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

// ── Add form ───────────────────────────────────────────────────────

function AddPlaceForm({ onAdded }) {
  const [imagePreview, setImagePreview] = useState('');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    const form = e.target;
    const formData = new FormData(form);
    formData.set('is_active', formData.get('is_active') === 'on' ? 'true' : 'false');

    startTransition(async () => {
      const result = await createNearbyPlace(formData);
      if (result?.ok) {
        onAdded?.(result.data);
        form.reset();
        setImagePreview('');
        setFeedback(null);
      } else {
        setFeedback({ type: 'err', message: result?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-white p-5 dark:bg-[#111d2c]"
    >
      <h2 className="text-base font-semibold text-9e-navy dark:text-white">เพิ่มสถานที่</h2>

      <PlaceFields
        imagePreview={imagePreview}
        onFileChange={handleFileChange}
      />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        {feedback && (
          <span className={'text-xs ' + (feedback.type === 'ok' ? 'text-green-600' : 'text-red-600')}>
            {feedback.message}
          </span>
        )}
      </div>
    </form>
  );
}

// ── Edit form (inline, full-width row) ─────────────────────────────

function EditPlaceForm({ row, onUpdated, onCancel }) {
  const [imagePreview, setImagePreview] = useState('');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    const form = e.target;
    const formData = new FormData(form);
    formData.set('is_active', formData.get('is_active') === 'on' ? 'true' : 'false');

    startTransition(async () => {
      const result = await updateNearbyPlace(row._id, formData);
      if (result?.ok) {
        onUpdated(result.data);
      } else {
        setFeedback({ type: 'err', message: result?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-9e-navy dark:text-white">
        แก้ไข: {row.name}
      </h3>

      <PlaceFields
        defaults={row}
        imagePreview={imagePreview || row.image_url}
        onFileChange={handleFileChange}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-9e-slate-dp-50 hover:bg-gray-50 dark:border-[#1e3a5f] dark:hover:bg-[#0D1B2A]"
        >
          ยกเลิก
        </button>
        {feedback && (
          <span className={'text-xs ' + (feedback.type === 'ok' ? 'text-green-600' : 'text-red-600')}>
            {feedback.message}
          </span>
        )}
      </div>
    </form>
  );
}

// ── Shared form body ───────────────────────────────────────────────

function PlaceFields({ defaults = {}, imagePreview, onFileChange }) {
  const inputCls =
    'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="ชื่อสถานที่ *">
        <input
          name="name"
          required
          defaultValue={defaults.name ?? ''}
          placeholder="เช่น Casa Lapin Ratchathewi"
          className={inputCls}
        />
      </Field>

      <Field label="ประเภท *">
        <select
          name="type"
          required
          defaultValue={defaults.type ?? 'food'}
          className={inputCls}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <Field label="ป้าย label (ไทย)" hint="เว้นว่างเพื่อใช้ค่า default ของประเภท">
        <input
          name="label"
          defaultValue={defaults.label ?? ''}
          placeholder="เช่น ร้านกาแฟ"
          className={inputCls}
        />
      </Field>

      <Field label="รายละเอียด">
        <input
          name="detail"
          defaultValue={defaults.detail ?? ''}
          placeholder="เช่น กาแฟ เบเกอรี่"
          className={inputCls}
        />
      </Field>

      <Field label="ระยะทาง (เมตร) *">
        <input
          name="distance"
          type="number"
          min="0"
          required
          defaultValue={defaults.distance ?? ''}
          placeholder="36"
          className={inputCls}
        />
      </Field>

      <Field label="เวลาเดิน (นาที) *">
        <input
          name="walk"
          type="number"
          min="1"
          required
          defaultValue={defaults.walk ?? 1}
          placeholder="1"
          className={inputCls}
        />
      </Field>

      <Field label="เวลาทำการ">
        <input
          name="hours"
          defaultValue={defaults.hours ?? ''}
          placeholder="ทุกวัน 08:00 - 18:00 น."
          className={inputCls}
        />
      </Field>

      <Field label="เบอร์โทรศัพท์">
        <input
          name="phone"
          defaultValue={defaults.phone ?? ''}
          placeholder="081-234-5678"
          className={inputCls}
        />
      </Field>

      <div className="sm:col-span-2">
        <Field label="Google Maps URL">
          <input
            name="maps"
            defaultValue={defaults.maps ?? ''}
            placeholder="https://maps.google.com/?q=..."
            className={inputCls}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field label="รูปภาพ" hint="แนะนำ 800×600 px">
          <input
            type="file"
            name="image_file"
            accept="image/*"
            onChange={onFileChange}
            className="block w-full text-sm text-9e-slate-dp-50 file:mr-4 file:rounded-9e-md file:border-0 file:bg-9e-action file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:cursor-pointer hover:file:bg-9e-brand"
          />
          {imagePreview && (
            <div className="relative mt-3 h-[120px] w-[160px] overflow-hidden rounded-xl border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <Image src={imagePreview} alt="พรีวิว" fill className="object-cover" unoptimized />
            </div>
          )}
          <p className="mt-2 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">หรือกรอก URL รูปภาพแทนการอัปโหลด:</p>
          <input
            name="image_url"
            defaultValue={defaults.image_url ?? ''}
            placeholder="https://..."
            className={inputCls + ' mt-1'}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={defaults.is_active ?? true}
          className="h-4 w-4 rounded accent-9e-action"
        />
        แสดงบนหน้าเว็บ
      </label>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
        {label}
        {hint && <span className="ml-2 font-normal italic">{hint}</span>}
      </p>
      {children}
    </div>
  );
}