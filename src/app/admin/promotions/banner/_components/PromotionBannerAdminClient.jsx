'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Plus, Trash2 } from 'lucide-react';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DragHandle } from '@/components/ui/DragHandle';
import {
  savePromotionBanner,
  updatePromotionBanner,
  deletePromotionBanner,
  updatePromotionBannerOrder,
} from '@/lib/actions/promotion-banner';

export function PromotionBannerAdminClient({ initialBanners }) {
  const [busy, setBusy] = useState(null); // banner _id currently mutating, or '__reorder__'
  const [showAdd, setShowAdd] = useState(false);
  const [, startTransition] = useTransition();

  const {
    items: banners,
    setItems: setBanners,
    draggingIndex,
    dragOverIndex,
    getDragProps,
  } = useDragReorder(initialBanners, async (next) => {
    setBanners(next.map((b, idx) => ({ ...b, display_order: idx })));
    setBusy('__reorder__');
    try {
      await updatePromotionBannerOrder(next.map((b) => b._id));
    } finally {
      setBusy(null);
    }
  });

  function handleToggleActive(b) {
    setBusy(b._id);
    const fd = new FormData();
    fd.set('is_active', String(!b.is_active));
    startTransition(async () => {
      await updatePromotionBanner(b._id, fd);
      setBanners((cur) =>
        cur.map((row) =>
          row._id === b._id ? { ...row, is_active: !row.is_active } : row
        )
      );
      setBusy(null);
    });
  }

  function handleDelete(b) {
    if (!window.confirm('ลบแบนเนอร์นี้?')) return;
    setBusy(b._id);
    startTransition(async () => {
      await deletePromotionBanner(b._id);
      setBanners((cur) => cur.filter((row) => row._id !== b._id));
      setBusy(null);
    });
  }

  function handleAdded(newDoc) {
    if (newDoc) setBanners((cur) => [...cur, newDoc]);
    setShowAdd(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ทั้งหมด {banners.length} แบนเนอร์
        </p>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" /> {showAdd ? 'ปิดฟอร์ม' : 'เพิ่มแบนเนอร์'}
        </button>
      </div>

      {showAdd && <AddBannerForm onAdded={handleAdded} />}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-10 px-2 py-3" aria-label="ลาก" />
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-[140px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">รูป</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ลิงก์</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-20 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {banners.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มีแบนเนอร์ — กด <strong>เพิ่มแบนเนอร์</strong> เพื่อสร้างแบนเนอร์แรก
                </td>
              </tr>
            )}
            {banners.map((b, i) => {
              const isDragging = draggingIndex === i;
              const isDropTarget =
                dragOverIndex === i && draggingIndex !== null && draggingIndex !== i;
              return (
                <tr
                  key={b._id}
                  {...getDragProps(i)}
                  className={
                    'border-b border-[var(--surface-border)] transition-all duration-150 last:border-0 ' +
                    (isDragging ? 'opacity-50 ring-2 ring-9e-action ' : '') +
                    (isDropTarget ? 'border-t-2 border-t-9e-action ' : '') +
                    (b.is_active
                      ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                      : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                  }
                >
                  <td className="px-2 py-3 align-middle">
                    <DragHandle />
                  </td>
                  <td className="px-3 py-3 text-9e-slate-dp-50 dark:text-[#94a3b8]">{i + 1}</td>
                  <td className="px-3 py-3">
                    {b.image_url ? (
                      <div className="relative h-[60px] w-[120px] overflow-hidden rounded bg-9e-ice dark:bg-[#0D1B2A]">
                        <Image
                          src={b.image_url}
                          alt={b.alt_text || ''}
                          fill
                          sizes="120px"
                          className="object-cover"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="h-[60px] w-[120px] rounded bg-9e-ice dark:bg-[#0D1B2A]" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {b.alt_text && (
                      <p className="line-clamp-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                        alt: {b.alt_text}
                      </p>
                    )}
                    {b.link_url ? (
                      <a
                        href={b.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-1 text-xs text-9e-action hover:underline dark:text-9e-air"
                      >
                        {b.link_url}
                      </a>
                    ) : (
                      <span className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">— (ไม่มีลิงก์)</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(b)}
                      disabled={busy === b._id}
                      aria-label={b.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                      className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                        b.is_active ? 'bg-9e-action' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                          b.is_active ? 'left-4' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(b)}
                      disabled={busy === b._id}
                      className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-[#3a1818]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ลบ
                    </button>
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

function AddBannerForm({ onAdded }) {
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
      setFeedback({ type: 'err', message: 'กรุณาเลือกรูปภาพแบนเนอร์' });
      return;
    }

    startTransition(async () => {
      const result = await savePromotionBanner(formData);
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
      <h2 className="text-base font-semibold text-9e-navy dark:text-white">
        เพิ่มแบนเนอร์ใหม่
      </h2>

      <Field label="รูปแบนเนอร์ *" hint="แนะนำสัดส่วน 16:5 (เช่น 1920×600)">
        <input
          type="file"
          name="image_file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full text-sm text-9e-slate-dp-50 file:mr-4 file:rounded-9e-md file:border-0 file:bg-9e-action file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:cursor-pointer hover:file:bg-9e-brand"
        />
        {imagePreview && (
          <div className="relative mt-3 aspect-[16/5] w-full overflow-hidden rounded-xl border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
            <Image
              src={imagePreview}
              alt="พรีวิว"
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        )}
      </Field>

      <Field label="Alt text" hint="คำอธิบายรูปสำหรับ Screen reader">
        <input
          name="alt_text"
          placeholder="เช่น โปรโมชั่นพิเศษส่งท้ายปี"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <Field label="ลิงก์ปลายทาง (เลือกใส่)" hint="เปิดในแท็บใหม่ถ้าเริ่มต้นด้วย http(s)">
        <input
          name="link_url"
          type="url"
          placeholder="https://..."
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked
          className="h-4 w-4 rounded accent-9e-action"
        />
        เปิดใช้งานแบนเนอร์ทันที
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
