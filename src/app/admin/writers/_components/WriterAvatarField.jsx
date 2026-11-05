'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { checkUpload } from '@/lib/uploads/uploadRules';
import { renderCroppedBlob } from '@/lib/writers/avatarCrop';
import { WRITER_AVATAR_FOLDER } from '@/lib/writers/writerFields';
import { AvatarCropDialog } from './AvatarCropDialog';
import { WriterAvatar } from './WriterAvatar';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'));
    image.src = src;
  });
}

/**
 * Pick a photo, crop it, upload ONLY the crop.
 *
 * Stores the public_id, not the URL (see Writer.avatarPublicId). The upload
 * happens when the crop is accepted and the row is written by บันทึก, so a crop
 * that is never saved leaves an unreferenced file on Cloudinary.
 */
export function WriterAvatarField({ value, onChange }) {
  const inputRef = useRef(null);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

  function pick(e) {
    const file = e.target.files?.[0];
    // Reset so the same file can be picked again after closing the dialog.
    e.target.value = '';
    if (!file) return;
    const verdict = checkUpload(WRITER_AVATAR_FOLDER, file);
    if (!verdict.ok) {
      setError(verdict.error);
      return;
    }
    setError('');
    setSource(URL.createObjectURL(file));
  }

  async function apply(pixels) {
    setBusy(true);
    setError('');
    try {
      const blob = await renderCroppedBlob(await loadImage(source), pixels);
      const verdict = checkUpload(WRITER_AVATAR_FOLDER, blob);
      if (!verdict.ok) throw new Error(verdict.error);

      const fd = new FormData();
      fd.append('file', blob, blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
      fd.append('folder', WRITER_AVATAR_FOLDER);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `อัปโหลดไม่สำเร็จ (${res.status})`);
      if (!data?.publicId) throw new Error('อัปโหลดสำเร็จแต่ไม่ได้รับรหัสรูป');

      onChange(data.publicId);
      setSource(null);
    } catch (err) {
      setError(err?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <WriterAvatar publicId={value} px={140} source={256} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <Upload className="h-4 w-4" aria-hidden="true" /> อัปโหลดรูป
        </button>
        <button
          type="button"
          onClick={() => onChange('')}
          disabled={!value}
          className="inline-flex items-center gap-1.5 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" /> ลบ
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={pick}
        hidden
        data-testid="writer-avatar-input"
      />

      <p className="text-center text-xs text-[var(--text-muted)]">
        JPG/PNG/WebP ไม่เกิน 2 MB · เลือกไฟล์แล้วครอปเองได้ (ลากตำแหน่ง + ซูม) · แสดงเป็นวงกลมทุกที่
      </p>
      {error && !source && <p className="text-sm text-red-700" role="alert">{error}</p>}

      {source && (
        <AvatarCropDialog
          key={source}
          src={source}
          busy={busy}
          error={error}
          onApply={apply}
          onPickAgain={() => inputRef.current?.click()}
          onClose={() => { setSource(null); setError(''); }}
        />
      )}
    </div>
  );
}
