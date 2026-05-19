'use client';

import { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

/**
 * ImageUploadField — Cloudinary upload + URL fallback in one control.
 *
 * Two ways to set the value:
 *   1. Pick a file → POSTs to /api/admin/upload, stores the returned
 *      `secure_url` in a hidden input named `name`.
 *   2. Paste a URL into the text field — useful when the image is
 *      already hosted somewhere.
 *
 * Either way, the FormData submitted by the parent form will carry
 * `name=<final URL>`.
 *
 * Props:
 *   name        — FormData key (e.g. "course_cover_url")
 *   currentUrl  — existing value (for edit mode)
 *   folder      — Cloudinary subfolder (must be in API allowlist)
 *   label       — visible field label
 *   hint        — small print under the label
 *   aspect      — preview box aspect ratio (default "16/9")
 */
export function ImageUploadField({
  name,
  currentUrl = '',
  folder = 'uploads',
  label,
  hint,
  aspect = '16/9',
  onChange,
}) {
  const fileInputRef = useRef(null);
  const [url, setUrlState] = useState(currentUrl || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Single setter so the optional `onChange` callback fires on every
  // change path (upload result, manual URL paste, clear).
  function setUrl(next) {
    setUrlState(next);
    if (typeof onChange === 'function') onChange(next);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }
      setUrl(data.url);
    } catch (err) {
      setError(err?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
      // Reset the input so the same file can be picked again after a
      // successful upload or an error.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function clearImage() {
    setUrl('');
    setError('');
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-9e-navy dark:text-white">
          {label}
        </label>
      )}
      {hint && (
        <p className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {hint}
        </p>
      )}

      <input type="hidden" name={name} value={url} />

      {url ? (
        <div
          className="relative overflow-hidden rounded-9e-md border border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]"
          style={{ aspectRatio: aspect, maxWidth: 480 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="preview"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={clearImage}
            aria-label="ลบรูป"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          className="flex items-center justify-center rounded-9e-md border border-dashed border-[var(--surface-border)] bg-9e-ice text-9e-slate-dp-50 dark:bg-[#0D1B2A]"
          style={{ aspectRatio: aspect, maxWidth: 480 }}
        >
          <ImageIcon className="h-8 w-8 opacity-40" aria-hidden="true" />
        </div>
      )}

      <div className="flex items-center gap-2">
        <label
          className={
            'inline-flex cursor-pointer items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium ' +
            (uploading
              ? 'opacity-50'
              : 'text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]')
          }
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? 'กำลังอัปโหลด…' : url ? 'เปลี่ยนรูป' : 'อัปโหลด'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={handleFile}
            className="hidden"
          />
        </label>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="หรือวาง URL ตรงนี้"
          className="flex-1 rounded-9e-md border border-[var(--surface-border)] bg-white px-2 py-1.5 font-mono text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
