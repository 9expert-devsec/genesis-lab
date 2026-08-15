'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveCourseExtension } from '@/lib/actions/course-extensions';
import { cn } from '@/lib/utils';
import { CoursePromoLinksTab } from './CoursePromoLinksTab';
import { EarlyBirdTab } from './EarlyBirdTab';
import { FaqTab } from './FaqTab';

/**
 * Promotions / Early Bird / FAQ / payment for a single course.
 *
 * SEO, the URL alias and the gallery USED to live here and now live in the
 * course editor (/admin/courses/[_id]/edit), alongside the fields they belong
 * with. What is left is the four editors that were never SEO: they keep this
 * screen, and the course editor's header links to it — the courses list no
 * longer has a SEO/Gallery button, so that link is their only way in.
 *
 * Client-only: holds form state, posts to `saveCourseExtension`, then
 * router.refresh() so the server component re-reads the doc.
 */

export function ExtensionEditor({
  courseId,
  courseName,
  initialData,
  initialPromoLinks = [],
  initialEarlyBird = null,
  initialPromos = [],
  initialFaqs = [],
}) {
  const router = useRouter();

  const [tab, setTab] = useState('promos');

  /**
   * ── PASS-THROUGH ONLY — READ, HELD, WRITTEN BACK UNCHANGED ─────────────────
   * SEO, the URL alias and the gallery moved to the course editor
   * (/admin/courses/[_id]/edit). Their INPUTS are gone from this screen, but
   * their VALUES cannot be: `saveCourseExtension` writes a whole document, and
   * every field it is not given falls back to a default — '' for the strings,
   * [] for tags and gallery, true for isPublished (course-extensions.js:118).
   *
   * So dropping this state would mean the การชำระเงิน tab's save silently blanks
   * every course's meta description, alias and gallery. They are seeded from the
   * loaded doc and handed straight back. Setters are deliberately not
   * destructured: there is nothing on this screen that may change them.
   */
  const [urlAlias] = useState((initialData?.urlAlias ?? '').replace(/^\//, ''));
  const [metaTitle] = useState(initialData?.metaTitle ?? '');
  const [metaDescription] = useState(initialData?.metaDescription ?? '');
  const [ogImage] = useState(initialData?.ogImage ?? '');
  const [tags] = useState((initialData?.tags ?? []).join(', '));
  const [gallery] = useState(
    Array.isArray(initialData?.gallery) ? initialData.gallery : []
  );
  const [isPublished] = useState(initialData?.isPublished !== false);

  // The one extension field this screen still EDITS.
  const [omisePaymentEnabled, setOmisePaymentEnabled] = useState(
    initialData?.omisePaymentEnabled === true
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveCourseExtension(courseId, {
        urlAlias,
        metaTitle,
        metaDescription,
        ogImage,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        gallery: gallery.map((item, i) => ({ ...item, order: i })),
        isPublished,
        omisePaymentEnabled,
      });
      if (result.ok) {
        setMessage({ type: 'ok', text: 'บันทึกเรียบร้อย ✓' });
        router.refresh();
      } else {
        setMessage({
          type: 'error',
          text: result.error ?? 'เกิดข้อผิดพลาด',
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message ?? 'เกิดข้อผิดพลาด' });
    } finally {
      setSaving(false);
    }
  }

  // Only the payment tab still writes the extension from this screen.
  const isExtensionTab = tab === 'payment';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {courseName}
        </h1>
        <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
          {courseId}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--surface-border)]">
        {[
          { id: 'promos', label: 'โปรโมชัน' },
          { id: 'earlybird', label: 'Early Bird' },
          { id: 'faq', label: `FAQ (${initialFaqs.length})` },
          { id: 'payment', label: 'การชำระเงิน' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-9e-action text-9e-action'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'promos' && (
        <CoursePromoLinksTab
          courseId={courseId}
          initialLinks={initialPromoLinks}
          initialPromos={initialPromos}
        />
      )}

      {tab === 'earlybird' && (
        <EarlyBirdTab
          courseId={courseId}
          initialData={initialEarlyBird}
          initialPromos={initialPromos}
        />
      )}

      {tab === 'faq' && (
        <FaqTab courseId={courseId} initialFaqs={initialFaqs} />
      )}

      {tab === 'payment' && (
        <div className="space-y-4">
          <label className="flex items-start gap-3 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={omisePaymentEnabled}
              onChange={(e) => setOmisePaymentEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-semibold">เปิดการชำระเงินออนไลน์ (Omise)</span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                เมื่อเปิด หน้าลงทะเบียนของคอร์สนี้จะให้ผู้เรียนเลือกชำระผ่าน
                บัตรเครดิต/เดบิต หรือ QR PromptPay ได้ทันที (นอกเหนือจากการขอใบเสนอราคา).
                เมื่อปิด คอร์สนี้จะใช้ขั้นตอนลงทะเบียนแบบเดิม (ขอใบเสนอราคาอย่างเดียว).
              </span>
            </span>
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            ราคาต่อรอบตั้งได้ที่หน้า “ตารางอบรม” (Schedules) — ช่อง “ราคาต่อท่าน”.
          </p>
        </div>
      )}

      {isExtensionTab && (
        <div className="flex items-center gap-3 border-t border-[var(--surface-border)] pt-4">
          <button
            type="button"
            onClick={handleSave}
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
      )}
    </div>
  );
}

