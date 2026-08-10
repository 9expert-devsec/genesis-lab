'use client';

import { ImageIcon, Youtube, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

/**
 * The course gallery — image slides and YouTube embeds, ordered.
 *
 * Lifted verbatim out of ExtensionEditor's `gallery` tab so the course editor
 * and nothing else owns it. It edits `CourseExtension.gallery`, which is the
 * genesis-side store, NOT an MSDB field — so it is controlled state handed up
 * to the parent, never a form input.
 *
 * This is the ONLY tabbed region in the course editor. Everything else the
 * editor does is a column or the rail; a tab is reserved for the one part that
 * is a workspace of its own rather than a field.
 */
export function CourseGalleryEditor({ gallery, onChange }) {
  const addImage = () =>
    onChange([...gallery, { type: 'image', url: '', alt: '', order: gallery.length }]);

  const addYoutube = () =>
    onChange([...gallery, { type: 'youtube', videoId: '', alt: '', order: gallery.length }]);

  const updateRow = (i, field, value) =>
    onChange(gallery.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const removeRow = (i) => onChange(gallery.filter((_, idx) => idx !== i));

  const moveRow = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= gallery.length) return;
    const next = [...gallery];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
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
          <ImageUploadField
            label="รูปภาพ"
            currentUrl={item.url}
            onChange={(url) => onChange(index, 'url', url)}
            folder="9exp-genesis/gallery"
          />
          <input
            type="text"
            value={item.alt}
            onChange={(e) => onChange(index, 'alt', e.target.value)}
            placeholder="Alt text (สำหรับ accessibility + SEO)"
            className="mt-2 w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-9e-action focus:ring-2 focus:ring-9e-action/20"
          />
        </>
      )}
    </div>
  );
}
