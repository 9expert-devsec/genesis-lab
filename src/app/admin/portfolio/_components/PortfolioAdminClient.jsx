'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Plus, Trash2 } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  createClientLogo,
  updateClientLogo,
  deleteClientLogo,
  reorderClientLogos,
  createAtmospherePhoto,
  updateAtmospherePhoto,
  deleteAtmospherePhoto,
  reorderAtmospherePhotos,
} from '@/lib/actions/portfolio';

export function PortfolioAdminClient({ initialLogos, initialPhotos }) {
  const [tab, setTab] = useState('logos');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-[var(--surface-border)]">
        {[
          { key: 'logos',  label: 'โลโก้ลูกค้า' },
          { key: 'photos', label: 'ภาพบรรยากาศ' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors ' +
              (tab === t.key
                ? 'border-9e-action text-9e-action'
                : 'border-transparent text-9e-slate-dp-50 hover:text-9e-navy dark:hover:text-white')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'logos' ? (
        <ClientLogosTab initialLogos={initialLogos} />
      ) : (
        <AtmospherePhotosTab initialPhotos={initialPhotos} />
      )}
    </div>
  );
}

// ── Tab 1: Client Logos ────────────────────────────────────────────

function ClientLogosTab({ initialLogos }) {
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [, startTransition] = useTransition();

  const {
    items: logos,
    setItems: setLogos,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initialLogos, async (next) => {
    setLogos(next.map((b, idx) => ({ ...b, display_order: idx })));
    setBusy('__reorder__');
    try {
      await reorderClientLogos(next.map((b) => b._id));
    } finally {
      setBusy(null);
    }
  });

  function handleToggleActive(row) {
    setBusy(row._id);
    const fd = new FormData();
    fd.set('is_active', String(!row.is_active));
    startTransition(async () => {
      await updateClientLogo(row._id, fd);
      setLogos((cur) =>
        cur.map((r) => (r._id === row._id ? { ...r, is_active: !r.is_active } : r))
      );
      setBusy(null);
    });
  }

  function handleDelete(row) {
    if (!window.confirm('ลบโลโก้นี้?')) return;
    setBusy(row._id);
    startTransition(async () => {
      await deleteClientLogo(row._id);
      setLogos((cur) => cur.filter((r) => r._id !== row._id));
      setBusy(null);
    });
  }

  function handleAdded(newDoc) {
    if (newDoc) setLogos((cur) => [...cur, newDoc]);
    setShowAdd(false);
  }

  function handleUpdated(updated) {
    setLogos((cur) => cur.map((r) => (r._id === updated._id ? updated : r)));
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ทั้งหมด {logos.length} โลโก้
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> {showAdd ? 'ปิดฟอร์ม' : 'เพิ่มโลโก้'}
        </button>
      </div>

      {showAdd && <AddLogoForm onAdded={handleAdded} />}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-[80px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">โลโก้</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">บริษัท</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-32 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {logos.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีโลโก้ — กด <strong>เพิ่มโลโก้</strong> เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {logos.map((row, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              const isEditing = editingId === row._id;
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
                    <div className="relative h-[20px] w-[40px] overflow-hidden rounded bg-9e-ice dark:bg-[#0D1B2A]">
                      <Image
                        src={row.image_url}
                        alt={row.company_name}
                        fill
                        sizes="40px"
                        className="object-contain p-0.5"
                        draggable={false}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {isEditing ? (
                      <EditLogoRow row={row} onUpdated={handleUpdated} onCancel={() => setEditingId(null)} />
                    ) : (
                      <span className="font-medium text-9e-navy dark:text-white">{row.company_name}</span>
                    )}
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
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => setEditingId(row._id)}
                          className="rounded border border-9e-action px-2.5 py-1 text-xs text-9e-action hover:bg-9e-action hover:text-white"
                        >
                          แก้ไข
                        </button>
                      )}
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

function AddLogoForm({ onAdded }) {
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

    const file = formData.get('image_file');
    if (!file || typeof file !== 'object' || file.size === 0) {
      setFeedback({ type: 'err', message: 'กรุณาเลือกรูปโลโก้' });
      return;
    }
    const name = String(formData.get('company_name') ?? '').trim();
    if (!name) {
      setFeedback({ type: 'err', message: 'กรุณาระบุชื่อบริษัท' });
      return;
    }

    startTransition(async () => {
      const result = await createClientLogo(formData);
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
      <h2 className="text-base font-semibold text-9e-navy dark:text-white">เพิ่มโลโก้ลูกค้า</h2>

      <Field label="ชื่อบริษัท *">
        <input
          name="company_name"
          required
          placeholder="เช่น บริษัท เอบีซี จำกัด"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <Field
        label="โลโก้บริษัท *"
        hint="แนะนำ 320×160 px, PNG/SVG พื้นหลังโปร่งใส"
      >
        <input
          type="file"
          name="image_file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-9e-slate-dp-50 file:mr-4 file:rounded-9e-md file:border-0 file:bg-9e-action file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:cursor-pointer hover:file:bg-9e-brand"
        />
        {imagePreview && (
          <div className="relative mt-3 h-[80px] w-[160px] overflow-hidden rounded-xl border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
            <Image src={imagePreview} alt="พรีวิว" fill className="object-contain p-2" unoptimized />
          </div>
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
        <input type="checkbox" name="is_active" defaultChecked className="h-4 w-4 rounded accent-9e-action" />
        เปิดใช้งานทันที
      </label>

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

function EditLogoRow({ row, onUpdated, onCancel }) {
  const [name, setName] = useState(row.company_name);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  function handleFile(e) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : '');
  }

  function handleSave() {
    setFeedback(null);
    const fd = new FormData();
    fd.set('company_name', name);
    if (file) fd.set('image_file', file);
    startTransition(async () => {
      const res = await updateClientLogo(row._id, fd);
      if (res?.ok) {
        onUpdated(res.data);
      } else {
        setFeedback(res?.error ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
      />
      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="block w-full text-xs text-9e-slate-dp-50 file:mr-3 file:rounded file:border-0 file:bg-9e-action file:px-2 file:py-1 file:text-xs file:text-white"
      />
      {preview && (
        <div className="relative h-[40px] w-[80px] overflow-hidden rounded bg-9e-ice dark:bg-[#0D1B2A]">
          <Image src={preview} alt="พรีวิว" fill className="object-contain p-1" unoptimized />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded bg-9e-action px-3 py-1 text-xs font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1 text-xs text-9e-slate-dp-50 hover:bg-gray-50 dark:border-[#1e3a5f] dark:hover:bg-[#0D1B2A]"
        >
          ยกเลิก
        </button>
        {feedback && <span className="text-xs text-red-600">{feedback}</span>}
      </div>
    </div>
  );
}

// ── Tab 2: Atmosphere Photos ───────────────────────────────────────

function AtmospherePhotosTab({ initialPhotos }) {
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [, startTransition] = useTransition();

  const {
    items: photos,
    setItems: setPhotos,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initialPhotos, async (next) => {
    setPhotos(next.map((b, idx) => ({ ...b, display_order: idx })));
    setBusy('__reorder__');
    try {
      await reorderAtmospherePhotos(next.map((b) => b._id));
    } finally {
      setBusy(null);
    }
  });

  function handleToggleActive(row) {
    setBusy(row._id);
    const fd = new FormData();
    fd.set('is_active', String(!row.is_active));
    startTransition(async () => {
      await updateAtmospherePhoto(row._id, fd);
      setPhotos((cur) =>
        cur.map((r) => (r._id === row._id ? { ...r, is_active: !r.is_active } : r))
      );
      setBusy(null);
    });
  }

  function handleDelete(row) {
    if (!window.confirm('ลบภาพนี้?')) return;
    setBusy(row._id);
    startTransition(async () => {
      await deleteAtmospherePhoto(row._id);
      setPhotos((cur) => cur.filter((r) => r._id !== row._id));
      setBusy(null);
    });
  }

  function handleAdded(newDoc) {
    if (newDoc) setPhotos((cur) => [...cur, newDoc]);
    setShowAdd(false);
  }

  function handleUpdated(updated) {
    setPhotos((cur) => cur.map((r) => (r._id === updated._id ? updated : r)));
    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ทั้งหมด {photos.length} ภาพ
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> {showAdd ? 'ปิดฟอร์ม' : 'เพิ่มภาพ'}
        </button>
      </div>

      {showAdd && <AddPhotoForm onAdded={handleAdded} />}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-[100px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ภาพ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">คำบรรยาย</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-32 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {photos.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีภาพ — กด <strong>เพิ่มภาพ</strong> เพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {photos.map((row, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              const isEditing = editingId === row._id;
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
                    <div className="relative h-[60px] w-[80px] overflow-hidden rounded bg-9e-ice dark:bg-[#0D1B2A]">
                      <Image
                        src={row.image_url}
                        alt={row.caption_th || ''}
                        fill
                        sizes="80px"
                        className="object-cover"
                        draggable={false}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {isEditing ? (
                      <EditPhotoRow row={row} onUpdated={handleUpdated} onCancel={() => setEditingId(null)} />
                    ) : (
                      <span className="text-9e-navy dark:text-white">
                        {row.caption_th || (
                          <span className="text-9e-slate-dp-50 dark:text-[#94a3b8]">— (ไม่มีคำบรรยาย)</span>
                        )}
                      </span>
                    )}
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
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => setEditingId(row._id)}
                          className="rounded border border-9e-action px-2.5 py-1 text-xs text-9e-action hover:bg-9e-action hover:text-white"
                        >
                          แก้ไข
                        </button>
                      )}
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

function AddPhotoForm({ onAdded }) {
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

    const file = formData.get('image_file');
    if (!file || typeof file !== 'object' || file.size === 0) {
      setFeedback({ type: 'err', message: 'กรุณาเลือกภาพ' });
      return;
    }

    startTransition(async () => {
      const result = await createAtmospherePhoto(formData);
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
      <h2 className="text-base font-semibold text-9e-navy dark:text-white">เพิ่มภาพบรรยากาศ</h2>

      <Field label="ภาพบรรยากาศ *" hint="แนะนำ 800×600 px">
        <input
          type="file"
          name="image_file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-9e-slate-dp-50 file:mr-4 file:rounded-9e-md file:border-0 file:bg-9e-action file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:cursor-pointer hover:file:bg-9e-brand"
        />
        {imagePreview && (
          <div className="relative mt-3 h-[225px] w-[300px] overflow-hidden rounded-xl border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
            <Image src={imagePreview} alt="พรีวิว" fill className="object-cover" unoptimized />
          </div>
        )}
      </Field>

      <Field label="คำบรรยาย (ภาษาไทย)" hint="ไม่บังคับ">
        <input
          name="caption_th"
          placeholder="เช่น ห้องอบรมที่ 1 อาคารเอเวอร์กรีน"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
        <input type="checkbox" name="is_active" defaultChecked className="h-4 w-4 rounded accent-9e-action" />
        เปิดใช้งานทันที
      </label>

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

function EditPhotoRow({ row, onUpdated, onCancel }) {
  const [caption, setCaption] = useState(row.caption_th ?? '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  function handleFile(e) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : '');
  }

  function handleSave() {
    setFeedback(null);
    const fd = new FormData();
    fd.set('caption_th', caption);
    if (file) fd.set('image_file', file);
    startTransition(async () => {
      const res = await updateAtmospherePhoto(row._id, fd);
      if (res?.ok) {
        onUpdated(res.data);
      } else {
        setFeedback(res?.error ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  return (
    <div className="space-y-2">
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="คำบรรยาย (ไม่บังคับ)"
        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
      />
      <input
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="block w-full text-xs text-9e-slate-dp-50 file:mr-3 file:rounded file:border-0 file:bg-9e-action file:px-2 file:py-1 file:text-xs file:text-white"
      />
      {preview && (
        <div className="relative h-[60px] w-[80px] overflow-hidden rounded bg-9e-ice dark:bg-[#0D1B2A]">
          <Image src={preview} alt="พรีวิว" fill className="object-cover" unoptimized />
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded bg-9e-action px-3 py-1 text-xs font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1 text-xs text-9e-slate-dp-50 hover:bg-gray-50 dark:border-[#1e3a5f] dark:hover:bg-[#0D1B2A]"
        >
          ยกเลิก
        </button>
        {feedback && <span className="text-xs text-red-600">{feedback}</span>}
      </div>
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
