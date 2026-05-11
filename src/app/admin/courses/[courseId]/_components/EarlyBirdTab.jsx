'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveEarlyBird } from '@/lib/actions/course-promos';
import { getActivePromotionsForAdmin } from '@/lib/actions/promotions';
import { cn } from '@/lib/utils';

/**
 * EarlyBirdTab — single-form editor for the per-course Early Bird
 * banner. Saves directly via `saveEarlyBird`; on success we
 * router.refresh() so the SEO + Gallery tab counts (and any other
 * server-rendered indicators) pick up the new state.
 */

function toDatetimeLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function EarlyBirdTab({
  courseId,
  initialData = null,
  initialPromos = [],
}) {
  const router = useRouter();
  const [promos, setPromos] = useState(initialPromos);
  const [isActive, setIsActive] = useState(
    initialData?.is_active ?? false
  );
  const [promotionId, setPromotionId] = useState(
    initialData?.promotion_id ?? ''
  );
  const [scheduleId, setScheduleId] = useState(
    initialData?.schedule_id ?? ''
  );
  const [labelTh, setLabelTh] = useState(
    initialData?.label_th ?? 'Early Bird'
  );
  const [specialPrice, setSpecialPrice] = useState(
    initialData?.special_price ?? ''
  );
  const [deadline, setDeadline] = useState(
    toDatetimeLocal(initialData?.deadline)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!initialPromos?.length) {
      getActivePromotionsForAdmin().then((list) => {
        if (Array.isArray(list)) setPromos(list);
      });
    }
  }, [initialPromos]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const result = await saveEarlyBird(courseId, {
      promotion_id: promotionId,
      schedule_id: scheduleId,
      label_th: labelTh,
      special_price: specialPrice === '' ? null : Number(specialPrice),
      deadline: deadline ? new Date(deadline).toISOString() : null,
      is_active: isActive,
    });
    setSaving(false);
    if (result?.ok) {
      setMessage({ type: 'ok', text: 'บันทึกเรียบร้อย ✓' });
      router.refresh();
    } else {
      setMessage({ type: 'error', text: result?.error ?? 'บันทึกไม่สำเร็จ' });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        เปิดใช้งาน Early Bird
      </label>

      <Field label="โปรโมชันที่แสดง (ใช้ thumbnail จากโปรโมชันนี้)">
        <select
          value={promotionId}
          onChange={(e) => setPromotionId(e.target.value)}
          className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
        >
          <option value="">— ไม่ผูกโปรโมชัน (ไม่แสดง thumbnail) —</option>
          {promos.map((p) => (
            <option key={p.promotion_id} value={p.promotion_id}>
              {p.title}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Schedule ID (สำหรับปุ่ม Register)">
        <input
          type="text"
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
          placeholder="65fa1234567890abcdef..."
          className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
        />
      </Field>

      <Field label="ชื่อป้าย">
        <input
          type="text"
          value={labelTh}
          onChange={(e) => setLabelTh(e.target.value)}
          placeholder="Early Bird"
          className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
        />
      </Field>

      <Field label="ราคาพิเศษ (บาท)">
        <input
          type="number"
          min="0"
          step="1"
          value={specialPrice}
          onChange={(e) => setSpecialPrice(e.target.value)}
          placeholder="0"
          className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
        />
      </Field>

      <Field label="วัน-เวลาสิ้นสุด Early Bird (countdown target)">
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
        />
      </Field>

      <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
        Countdown จะซ่อนอัตโนมัติเมื่อถึงเวลา deadline
        และจะไม่แสดงหน้าเว็บหาก is_active = false
      </p>

      <div className="flex items-center gap-3 border-t border-[var(--surface-border)] pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-9e-md bg-9e-action px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-9e-brand disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        {message && (
          <span
            className={cn(
              'text-sm font-medium',
              message.type === 'ok' ? 'text-green-600' : 'text-red-600'
            )}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}
