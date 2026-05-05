'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  savePromotionConfig,
  deletePromotionConfig,
} from '@/lib/actions/promotions';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function PromotionConfigForm({ promotion, config }) {
  const [form, setForm] = useState({
    url_slug:         config?.url_slug ?? '',
    meta_title:       config?.meta_title ?? '',
    meta_description: config?.meta_description ?? '',
    og_image_url:     config?.og_image_url ?? '',
  });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState(null);

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const slugTrimmed = form.url_slug.trim();
  const slugValid = slugTrimmed === '' || SLUG_RE.test(slugTrimmed);
  const previewUrl = slugTrimmed ? `/promotions/${slugTrimmed}` : null;

  const onSave = () => {
    setFeedback(null);
    if (!slugValid) {
      setFeedback({ type: 'err', message: 'Slug ใช้ได้เฉพาะ a-z, 0-9, และ -' });
      return;
    }
    startTransition(async () => {
      const result = await savePromotionConfig(promotion.promotion_id, form);
      if (result?.ok) {
        setFeedback({ type: 'ok', message: 'บันทึกแล้ว' });
      } else {
        setFeedback({ type: 'err', message: result?.error ?? 'บันทึกไม่สำเร็จ' });
      }
    });
  };

  const onDelete = () => {
    if (!config?._id) return;
    if (!window.confirm('ลบการตั้งค่า URL & SEO ของโปรโมชั่นนี้?')) return;
    startTransition(async () => {
      await deletePromotionConfig(promotion.promotion_id);
      setForm({ url_slug: '', meta_title: '', meta_description: '', og_image_url: '' });
      setFeedback({ type: 'ok', message: 'ลบแล้ว' });
    });
  };

  return (
    <div className="rounded-2xl border border-[var(--surface-border)] bg-white p-6 dark:bg-[#111d2c]">
      <div className="grid grid-cols-1 gap-4">
        <Field
          label="URL Slug"
          hint="ตัวพิมพ์เล็กและขีดกลางเท่านั้น เช่น mid-year-sale-2026"
        >
          <input
            type="text"
            value={form.url_slug}
            onChange={update('url_slug')}
            placeholder={promotion.promotion_id}
            className={
              'w-full rounded-lg border px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-primary/30 dark:bg-[#0D1B2A] dark:text-white ' +
              (slugValid
                ? 'border-gray-200 dark:border-[#1e3a5f] bg-white'
                : 'border-red-400 bg-red-50 dark:bg-[#3a1818]')
            }
          />
          {previewUrl && (
            <p className="mt-1 text-xs text-9e-slate dark:text-[#94a3b8]">
              พรีวิว:{' '}
              <Link
                href={previewUrl}
                target="_blank"
                className="text-9e-primary hover:underline dark:text-9e-sky"
              >
                {previewUrl}
              </Link>
            </p>
          )}
        </Field>

        <Field label="Meta Title">
          <input
            type="text"
            value={form.meta_title}
            onChange={update('meta_title')}
            placeholder={promotion.title}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-primary/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
          />
        </Field>

        <Field label="Meta Description">
          <textarea
            value={form.meta_description}
            onChange={update('meta_description')}
            rows={3}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-primary/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
          />
        </Field>

        <Field label="OG Image URL">
          <input
            type="url"
            value={form.og_image_url}
            onChange={update('og_image_url')}
            placeholder="https://..."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-2 focus:ring-9e-primary/30 dark:border-[#1e3a5f] dark:bg-[#0D1B2A] dark:text-white"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            disabled={pending}
            onClick={onSave}
            className="rounded-lg bg-9e-primary px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
          >
            {pending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          {config?._id && (
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-[#0D1B2A]"
            >
              ลบการตั้งค่า
            </button>
          )}
          {feedback && (
            <span
              className={
                'text-xs ' +
                (feedback.type === 'ok' ? 'text-green-600' : 'text-red-600')
              }
            >
              {feedback.message}
            </span>
          )}
        </div>
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
