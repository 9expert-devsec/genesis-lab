'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, Youtube, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { saveCourseExtension } from '@/lib/actions/course-extensions';
import { cn } from '@/lib/utils';
import { CoursePromoLinksTab } from './CoursePromoLinksTab';
import { EarlyBirdTab } from './EarlyBirdTab';

/**
 * SEO + gallery editor for a single course.
 *
 * Client-only: holds form state, posts to `saveCourseExtension`, then
 * router.refresh() so the server component re-reads the doc and the
 * "URL Alias / Tags / Gallery counts" on the list page reflect the
 * change without a full reload.
 */

export function ExtensionEditor({
  courseId,
  courseName,
  initialData,
  initialPromoLinks = [],
  initialEarlyBird = null,
  initialPromos = [],
}) {
  const router = useRouter();

  const [tab, setTab] = useState('seo');

  // Strip leading slash for editing — we add it back on save.
  const aliasInit = (initialData?.urlAlias ?? '').replace(/^\//, '');
  const [urlAlias, setUrlAlias] = useState(aliasInit);
  const [metaTitle, setMetaTitle] = useState(initialData?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(
    initialData?.metaDescription ?? ''
  );
  const [ogImage, setOgImage] = useState(initialData?.ogImage ?? '');
  const [tags, setTags] = useState((initialData?.tags ?? []).join(', '));
  const [gallery, setGallery] = useState(
    Array.isArray(initialData?.gallery) ? initialData.gallery : []
  );
  const [isPublished, setIsPublished] = useState(
    initialData?.isPublished !== false
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Gallery operations.
  function addImage() {
    setGallery((g) => [
      ...g,
      { type: 'image', url: '', alt: '', order: g.length },
    ]);
  }
  function addYoutube() {
    setGallery((g) => [
      ...g,
      { type: 'youtube', videoId: '', alt: '', order: g.length },
    ]);
  }
  function updateRow(i, field, value) {
    setGallery((g) =>
      g.map((row, idx) => (idx === i ? { ...row, [field]: value } : row))
    );
  }
  function removeRow(i) {
    setGallery((g) => g.filter((_, idx) => idx !== i));
  }
  function moveRow(i, dir) {
    setGallery((g) => {
      const j = i + dir;
      if (j < 0 || j >= g.length) return g;
      const next = [...g];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

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

  const isExtensionTab = tab === 'seo' || tab === 'gallery';

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
          { id: 'seo', label: 'SEO & Meta' },
          { id: 'gallery', label: `Gallery (${gallery.length})` },
          { id: 'promos', label: 'โปรโมชัน' },
          { id: 'earlybird', label: 'Early Bird' },
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

      {tab === 'seo' && (
        <div className="flex flex-col gap-4">
          <Field label="URL Alias">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-muted)]">/</span>
              <input
                type="text"
                value={urlAlias}
                onChange={(e) => setUrlAlias(e.target.value)}
                placeholder="excel-ai-business-training-course"
                className="flex-1 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
              />
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              ถ้าว่างจะใช้ <code>/{courseId.toLowerCase()}-training-course</code> โดยอัตโนมัติ
            </p>
          </Field>

          <Field label={`Meta Title (${metaTitle.length}/60)`}>
            <input
              type="text"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              maxLength={120}
              placeholder={courseName}
              className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
            />
          </Field>

          <Field label={`Meta Description (${metaDescription.length}/160)`}>
            <textarea
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="คำอธิบายสั้นสำหรับ Search Engine และ Social Share..."
              className="w-full resize-none rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
            />
          </Field>

          <Field label="OG Image URL">
            <input
              type="url"
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder="https://res.cloudinary.com/..."
              className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
            />
          </Field>

          <Field label="Tags (คั่นด้วย comma)">
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Excel, AI, Business"
              className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
            />
            แสดงผลในเว็บสาธารณะ (alias resolution)
          </label>
        </div>
      )}

      {tab === 'gallery' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addImage}
              className="inline-flex items-center gap-2 rounded-9e-md border border-9e-action px-4 py-2 text-sm text-9e-action transition-colors hover:bg-9e-action hover:text-white"
            >
              <ImageIcon className="h-4 w-4" />
              เพิ่มรูปภาพ
            </button>
            <button
              type="button"
              onClick={addYoutube}
              className="inline-flex items-center gap-2 rounded-9e-md border border-red-500 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-500 hover:text-white"
            >
              <Youtube className="h-4 w-4" />
              เพิ่ม YouTube
            </button>
          </div>

          {gallery.length === 0 ? (
            <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)] py-8 text-center text-sm text-[var(--text-muted)]">
              ยังไม่มีรูปภาพหรือวิดีโอ
            </p>
          ) : (
            gallery.map((item, i) => (
              <GalleryRow
                key={i}
                item={item}
                index={i}
                lastIndex={gallery.length - 1}
                onChange={updateRow}
                onRemove={removeRow}
                onMove={moveRow}
              />
            ))
          )}
        </div>
      )}

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

function GalleryRow({ item, index, lastIndex, onChange, onRemove, onMove }) {
  return (
    <div className="flex flex-col gap-3 rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
            item.type === 'youtube'
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-100 text-blue-700'
          )}
        >
          {item.type === 'youtube' ? (
            <Youtube className="h-3 w-3" />
          ) : (
            <ImageIcon className="h-3 w-3" />
          )}
          {item.type === 'youtube' ? 'YouTube' : 'Image'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="ย้ายขึ้น"
            className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === lastIndex}
            aria-label="ย้ายลง"
            className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label="ลบ"
            className="rounded p-1 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {item.type === 'youtube' ? (
        <input
          type="text"
          value={item.videoId}
          onChange={(e) => onChange(index, 'videoId', e.target.value)}
          placeholder="YouTube Video ID (เช่น dQw4w9WgXcQ)"
          className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
        />
      ) : (
        <>
          <input
            type="url"
            value={item.url}
            onChange={(e) => onChange(index, 'url', e.target.value)}
            placeholder="https://res.cloudinary.com/..."
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
          />
          <input
            type="text"
            value={item.alt}
            onChange={(e) => onChange(index, 'alt', e.target.value)}
            placeholder="Alt text (สำหรับ accessibility + SEO)"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
          />
        </>
      )}
    </div>
  );
}
