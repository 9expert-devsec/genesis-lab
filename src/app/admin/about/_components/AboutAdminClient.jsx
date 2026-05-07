'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  saveInstructor,
  updateInstructor,
  deleteInstructor,
  updateInstructorOrder,
  toggleInstructorActive,
  saveAboutConfig,
} from '@/lib/actions/about';

export function AboutAdminClient({ initialInstructors, initialConfig }) {
  const [tab, setTab] = useState('instructors');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-[var(--surface-border)]">
        {[
          { key: 'instructors', label: 'อาจารย์' },
          { key: 'text',        label: 'ข้อความหน้าเกี่ยวกับเรา' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
              (tab === t.key
                ? 'border-9e-action text-9e-action'
                : 'border-transparent text-9e-slate hover:text-9e-navy dark:hover:text-white')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'instructors' ? (
        <InstructorsSection initialInstructors={initialInstructors} />
      ) : (
        <ConfigSection initialConfig={initialConfig} />
      )}
    </div>
  );
}

// ── Instructors ────────────────────────────────────────────────────

function InstructorsSection({ initialInstructors }) {
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [, startTransition] = useTransition();

  const {
    items: rows,
    setItems: setRows,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initialInstructors, async (next) => {
    setRows(next.map((r, idx) => ({ ...r, display_order: idx })));
    setBusy('__reorder__');
    try {
      await updateInstructorOrder(next.map((r) => r._id));
    } finally {
      setBusy(null);
    }
  });

  function handleToggle(row) {
    setBusy(row._id);
    startTransition(async () => {
      await toggleInstructorActive(row._id, !row.is_active);
      setRows((cur) =>
        cur.map((r) => (r._id === row._id ? { ...r, is_active: !r.is_active } : r))
      );
      setBusy(null);
    });
  }

  function handleDelete(row) {
    if (!window.confirm(`ลบ "${row.name}" จากรายชื่ออาจารย์?`)) return;
    setBusy(row._id);
    startTransition(async () => {
      await deleteInstructor(row._id);
      setRows((cur) => cur.filter((r) => r._id !== row._id));
      setBusy(null);
    });
  }

  function handleAdded(newDoc) {
    if (newDoc) setRows((cur) => [...cur, newDoc]);
    setShowAdd(false);
  }

  function handleUpdated(updated) {
    if (!updated) return;
    setRows((cur) => cur.map((r) => (r._id === updated._id ? { ...r, ...updated } : r)));
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-9e-slate dark:text-[#94a3b8]">
          ทั้งหมด {rows.length} ท่าน
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> {showAdd ? 'ปิดฟอร์ม' : 'เพิ่มอาจารย์'}
        </button>
      </div>

      {showAdd && <AddInstructorForm onAdded={handleAdded} />}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-[80px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">รูป</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ชื่อ / ตำแหน่ง</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-24 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-9e-slate dark:text-[#94a3b8]">
                  ยังไม่มีอาจารย์ — กด <strong>เพิ่มอาจารย์</strong> เพื่อสร้างคนแรก
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              const isEditing = editingId === row._id;
              return (
                <RowFragment
                  key={row._id}
                  row={row}
                  index={i}
                  busy={busy}
                  isDragging={isDragging}
                  isDropTarget={isDropTarget}
                  isEditing={isEditing}
                  dragProps={getDragProps(i)}
                  onToggle={() => handleToggle(row)}
                  onDelete={() => handleDelete(row)}
                  onEdit={() => setEditingId(isEditing ? null : row._id)}
                  onUpdated={handleUpdated}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowFragment({
  row, index, busy, isDragging, isDropTarget, isEditing, dragProps,
  onToggle, onDelete, onEdit, onUpdated,
}) {
  return (
    <>
      <tr
        {...dragProps}
        className={
          'border-b border-[var(--surface-border)] transition-all duration-150 ' +
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
        <td className="px-3 py-3 text-9e-slate dark:text-[#94a3b8]">{index + 1}</td>
        <td className="px-3 py-3">
          {row.image_url ? (
            <div className="relative h-12 w-12 overflow-hidden rounded-full bg-9e-ice dark:bg-[#0D1B2A]">
              <Image
                src={row.image_url}
                alt={row.name}
                fill
                sizes="48px"
                className="object-cover object-top"
                draggable={false}
              />
            </div>
          ) : (
            <div className="h-12 w-12 rounded-full bg-9e-ice dark:bg-[#0D1B2A]" />
          )}
        </td>
        <td className="px-3 py-3">
          <p className="font-medium text-9e-navy dark:text-white">{row.name}</p>
          {row.title && (
            <p className="mt-0.5 text-xs text-9e-slate dark:text-[#94a3b8]">
              {row.title}
            </p>
          )}
        </td>
        <td className="px-3 py-3 text-center">
          <button
            type="button"
            onClick={onToggle}
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
        <td className="px-3 py-3">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center rounded border border-[var(--surface-border)] px-2 py-1.5 text-xs hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
            >
              {isEditing ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy === row._id}
              className="inline-flex items-center rounded border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-[#3a1818]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {isEditing && (
        <tr>
          <td colSpan={6} className="bg-9e-ice/40 px-4 py-4 dark:bg-[#0D1B2A]/50">
            <EditInstructorForm row={row} onUpdated={onUpdated} />
          </td>
        </tr>
      )}
    </>
  );
}

function AddInstructorForm({ onAdded }) {
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
      const result = await saveInstructor(formData);
      if (result?.ok) {
        onAdded?.(result.data);
        form.reset();
        setImagePreview('');
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
      <h2 className="text-base font-semibold text-9e-navy dark:text-white">
        เพิ่มอาจารย์ใหม่
      </h2>

      <FormFields imagePreview={imagePreview} onFileChange={handleFileChange} />

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

function EditInstructorForm({ row, onUpdated }) {
  const [imagePreview, setImagePreview] = useState(row.image_url ?? '');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    const formData = new FormData(e.target);
    formData.set('is_active', formData.get('is_active') === 'on' ? 'true' : 'false');

    startTransition(async () => {
      const result = await updateInstructor(row._id, formData);
      if (result?.ok) {
        setFeedback({ type: 'ok', message: 'บันทึกแล้ว' });
        onUpdated?.(result.data);
      } else {
        setFeedback({ type: 'err', message: result?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="image_url" value={row.image_url ?? ''} />
      <input type="hidden" name="image_public_id" value={row.image_public_id ?? ''} />
      <FormFields
        imagePreview={imagePreview}
        onFileChange={handleFileChange}
        defaults={{ name: row.name, title: row.title, is_active: row.is_active }}
      />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
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

function FormFields({ imagePreview, onFileChange, defaults = {} }) {
  return (
    <>
      <Field label="รูปอาจารย์" hint="แนะนำสัดส่วน 3:4 (เช่น 600×800)">
        <input
          type="file"
          name="image_file"
          accept="image/*"
          onChange={onFileChange}
          className="block w-full text-sm text-9e-slate file:mr-4 file:rounded-9e-md file:border-0 file:bg-9e-action file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:cursor-pointer hover:file:bg-9e-brand"
        />
        {imagePreview && (
          <div className="relative mt-3 h-40 w-32 overflow-hidden rounded-xl border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
            <Image
              src={imagePreview}
              alt="พรีวิว"
              fill
              className="object-cover object-top"
              unoptimized
            />
          </div>
        )}
      </Field>

      <Field label="ชื่อ *">
        <input
          name="name"
          required
          defaultValue={defaults.name ?? ''}
          placeholder="เช่น อาจารย์เอก"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <Field label="ตำแหน่ง / ความเชี่ยวชาญ">
        <input
          name="title"
          defaultValue={defaults.title ?? ''}
          placeholder="เช่น Microsoft Excel Specialist"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={defaults.is_active ?? true}
          className="h-4 w-4 rounded accent-9e-action"
        />
        แสดงบนหน้าเกี่ยวกับเรา
      </label>
    </>
  );
}

// ── About config (text fields) ─────────────────────────────────────

function ConfigSection({ initialConfig }) {
  const [form, setForm] = useState({
    tagline:     initialConfig?.tagline ?? '',
    description: initialConfig?.description ?? '',
    mission:     initialConfig?.mission ?? '',
    vision:      initialConfig?.vision ?? '',
  });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveAboutConfig(form);
      if (result?.ok) {
        setFeedback({ type: 'ok', message: 'บันทึกแล้ว' });
      } else {
        setFeedback({ type: 'err', message: result?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-white p-6 dark:bg-[#111d2c]">
      <Field label="Tagline" hint="ข้อความใต้หัวข้อในหน้า hero">
        <input
          type="text"
          value={form.tagline}
          onChange={update('tagline')}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <Field label="Description" hint="ย่อหน้าหลักของส่วน 'เรื่องราวของเรา'">
        <textarea
          value={form.description}
          onChange={update('description')}
          rows={4}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <Field label="Mission">
        <textarea
          value={form.mission}
          onChange={update('mission')}
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <Field label="Vision">
        <textarea
          value={form.vision}
          onChange={update('vision')}
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
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
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-9e-slate dark:text-[#94a3b8]">
        {label}
        {hint && <span className="ml-2 font-normal italic">{hint}</span>}
      </p>
      {children}
    </div>
  );
}
