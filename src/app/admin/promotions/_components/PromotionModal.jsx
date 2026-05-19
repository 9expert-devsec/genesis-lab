'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import {
  createPromotion,
  updatePromotion,
} from '@/lib/actions/promotions';

function isoDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function PromotionModal({ promotion, courses, onClose, onSaved }) {
  const isEdit = Boolean(promotion?._id);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // `name` is the display title — Genesis previously called it `title`,
  // but MSDB's field is `name`. We keep one source of truth here.
  const [name, setName]                   = useState(promotion?.title ?? promotion?.name ?? '');
  // `label` is the short badge shown over the banner (e.g. "ลด 20%").
  // MSDB requires it on create.
  const [label, setLabel]                 = useState(promotion?.label ?? '');
  // Rich-text body + plain-text summary. `detail_html` is the canonical
  // upstream field; `html_content` is the legacy mirror still emitted by
  // older syncs. Either may be set on a given record — accept both.
  const [detailHtml, setDetailHtml]   = useState(
    promotion?.detail_html ?? promotion?.html_content ?? ''
  );
  const [detailPlain, setDetailPlain] = useState(promotion?.detail_plain ?? '');
  const [startDate, setStartDate] = useState(isoDate(promotion?.start_date ?? promotion?.start_at));
  const [endDate, setEndDate]     = useState(isoDate(promotion?.end_date   ?? promotion?.end_at));
  const [imageUrl, setImageUrl]   = useState(promotion?.thumbnail_url ?? promotion?.image_url ?? '');
  const [isPublished, setIsPublished] = useState(promotion?.is_published !== false);
  const [isPinned, setIsPinned]       = useState(Boolean(promotion?.is_pinned));
  const [relatedIds, setRelatedIds]   = useState(promotion?.related_course_ids ?? []);

  function toggleCourse(courseId) {
    setRelatedIds((cur) =>
      cur.includes(courseId) ? cur.filter((x) => x !== courseId) : [...cur, courseId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    // FormData keys mirror MSDB's field names — see
    // `src/lib/actions/promotions.js` shapeBody for the contract.
    const fd = new FormData();
    fd.set('name',         name);
    fd.set('label',        label);
    fd.set('detail_html',  detailHtml);
    fd.set('detail_plain', detailPlain);
    fd.set('start_at',     startDate);
    fd.set('end_at',       endDate);
    fd.set('image_url',    imageUrl);
    if (isPublished) fd.set('is_published', 'on');
    if (isPinned)    fd.set('is_pinned',    'on');
    for (const id of relatedIds) fd.append('related_public_courses', id);

    startTransition(async () => {
      const res = isEdit
        ? await updatePromotion(promotion._id, fd)
        : await createPromotion(fd);
      if (res?.ok) onSaved();
      else setError(res?.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl rounded-9e-lg bg-white p-6 shadow-xl dark:bg-[#111d2c]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-9e-navy dark:text-white">
            {isEdit ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่น'}
          </h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="text-9e-slate-dp-50 hover:text-9e-navy">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ชื่อโปรโมชั่น *</span>
            <input
              required
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">ป้ายกำกับ *</span>
            <span className="mt-0.5 block text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ข้อความสั้นๆ ที่แสดงเป็น badge เช่น "ลด 20%", "ฟรี", "Early Bird"
            </span>
            <input
              required
              type="text"
              name="label"
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ลด 20%"
              className={inputCls}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-9e-navy dark:text-white">
                รายละเอียด (HTML)
                <span className="ml-2 text-xs font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  รองรับ HTML/CSS inline
                </span>
              </label>
              <textarea
                value={detailHtml}
                onChange={(e) => setDetailHtml(e.target.value)}
                rows={12}
                spellCheck={false}
                placeholder={'<h2>หัวข้อโปรโมชัน</h2>\n<p>รายละเอียด...</p>'}
                className="mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-9e-ice px-3 py-2 font-mono text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-9e-navy dark:text-white">
                Live Preview
                <span className="ml-2 text-xs font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  อัปเดตทันทีตามที่พิมพ์
                </span>
              </label>
              {/* Trusted admin-authored HTML — same trust model as the
                  MSDB admin form. If we ever expand the audience, swap
                  to DOMPurify before rendering. */}
              <div
                className="prose prose-sm dark:prose-invert mt-1 min-h-[16rem] max-w-none overflow-auto rounded-9e-md border border-[var(--surface-border)] bg-white p-3 text-sm dark:bg-[#0D1B2A] dark:text-white"
                dangerouslySetInnerHTML={{
                  __html:
                    detailHtml ||
                    '<span class="text-gray-300">ยังไม่มีเนื้อหา</span>',
                }}
              />
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">
              สรุปย่อ (Plain text)
              <span className="ml-2 text-xs font-normal text-9e-slate-dp-50 dark:text-[#94a3b8]">
                ใช้บน card / SEO — เว้นว่างแล้วระบบจะสร้างจาก HTML ให้
              </span>
            </span>
            <textarea
              rows={3}
              value={detailPlain}
              onChange={(e) => setDetailPlain(e.target.value)}
              placeholder="สรุปสั้นๆ ของโปรโมชัน"
              className={inputCls}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-9e-navy dark:text-white">วันที่เริ่ม *</span>
              <input
                required
                type="date"
                name="start_at"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-9e-navy dark:text-white">วันที่สิ้นสุด *</span>
              <input
                required
                type="date"
                name="end_at"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-9e-navy dark:text-white">URL รูป Banner</span>
            <input
              type="url"
              name="image_url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://res.cloudinary.com/…"
              className={inputCls + ' font-mono text-xs'}
            />
          </label>

          <div>
            <span className="text-sm font-medium text-9e-navy dark:text-white">หลักสูตรที่เกี่ยวข้อง</span>
            <p className="mt-0.5 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              ไม่เลือก = ใช้ได้ทุกหลักสูตร
            </p>
            <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-9e-md border border-[var(--surface-border)] p-2">
              {courses.length === 0 && (
                <span className="text-xs text-9e-slate-dp-50">โหลด courses ไม่ได้</span>
              )}
              {courses.map((c) => {
                const id = c.course_id;
                const active = relatedIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleCourse(id)}
                    className={
                      'rounded-full px-2 py-0.5 text-[11px] transition-colors ' +
                      (active
                        ? 'bg-9e-action text-white'
                        : 'border border-[var(--surface-border)] bg-white text-9e-navy hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white')
                    }
                  >
                    {id}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4"
              />
              เผยแพร่ (Published)
            </label>
            <label className="flex items-center gap-2 text-sm text-9e-navy dark:text-white">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="h-4 w-4"
              />
              ปักหมุด (Pinned)
            </label>
          </div>

          <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-[var(--surface-border)] bg-white px-6 py-3 dark:bg-[#111d2c]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
            >
              {pending ? 'กำลังบันทึก…' : isEdit ? 'บันทึก' : 'สร้าง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white';
