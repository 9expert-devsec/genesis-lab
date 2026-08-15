'use client';

import { useState } from 'react';
import { Upload, Copy, X, Check } from 'lucide-react';
import { signCourseOutlineUpload, recordCourseOutlineUpload } from '@/lib/actions/course-outlines';

/**
 * One course-outline PDF slot (TH or EN).
 *
 * ══ THE CLIENT NEVER NAMES THE FILE ═════════════════════════════════════════
 * It sends `courseId` + `lang` and receives a signed target back. The path in
 * the hidden input below is whatever the SERVER derived — it is not composed
 * here and must not be, because that path decides which Cloudinary asset an
 * `overwrite: true` upload destroys.
 *
 * ── WHY THE BUTTON IS DISABLED WITHOUT A course_id ──────────────────────────
 * The filename is derived from it. Uploading first and naming the course
 * afterwards would store the file under whatever the id was at upload time and
 * leave the saved path pointing at it — a stale link created by ordinary use
 * rather than by a mistake.
 *
 * ── THE HIDDEN INPUT IS ALWAYS PRESENT ──────────────────────────────────────
 * Empty value means "no outline", and shapePayload turns that into the
 * all-empty 8-key object. It is never omitted: an absent key asks MSDB to keep
 * what it already has, so clearing would silently do nothing.
 */
export function CourseOutlineUpload({ lang, courseId, initialPath = '', label }) {
  const [path, setPath] = useState(initialPath || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const ready = String(courseId ?? '').trim().length > 0;
  const inputName = `course_outline_${lang}_path`;

  async function onPick(event) {
    const file = event.target.files?.[0];
    event.target.value = '';                 // so re-picking the same file re-fires
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const signed = await signCourseOutlineUpload({
        courseId, lang, bytes: file.size,
      });
      if (!signed?.ok) { setError(signed?.error ?? 'ขอลายเซ็นอัปโหลดไม่สำเร็จ'); return; }

      // The signed params go up VERBATIM. Adding or dropping one invalidates
      // the signature, and Cloudinary's error for that is not obvious.
      const body = new FormData();
      for (const [k, v] of Object.entries(signed.params)) body.append(k, String(v));
      body.append('api_key', signed.apiKey);
      body.append('file', file);

      const res = await fetch(signed.uploadUrl, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error?.message ?? `อัปโหลดไม่สำเร็จ (HTTP ${res.status})`);
        return;
      }

      // The file is up. A failure to RECORD it is reported but must not read as
      // a failed upload, or the admin re-sends bytes that are already there.
      const recorded = await recordCourseOutlineUpload({
        courseId, lang, bytes: json?.bytes ?? file.size, contentType: file.type,
      });
      if (!recorded?.ok) setError(recorded?.error ?? null);

      setPath(signed.publicPath);
    } catch (err) {
      setError(err?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  function onCopy() {
    navigator.clipboard?.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /**
   * CLEARING DETACHES, IT DOES NOT DELETE.
   *
   * The Cloudinary asset stays. Removing bytes because someone unlinked a PDF
   * would destroy the only copy on a single click, and the delete path with its
   * own guards already exists in /admin/media for when that is really meant.
   */
  function onClear() {
    setPath('');
    setError(null);
  }

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] p-3">
      <input type="hidden" name={inputName} value={path} />

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-9e-slate-dp-50 dark:text-[#94a3b8]">{label}</span>
        {path ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-50"
          >
            <X className="h-3 w-3" /> ล้างค่า
          </button>
        ) : null}
      </div>

      {path ? (
        <div className="mb-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-9e-ice px-2 py-1 text-[11px] text-9e-navy dark:bg-[#0D1B2A] dark:text-white">
            {path}
          </code>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded border border-[var(--surface-border)] px-2 py-1 text-[11px]"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </button>
        </div>
      ) : (
        <p className="mb-2 text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">ยังไม่มีไฟล์</p>
      )}

      <label
        className={`inline-flex cursor-pointer items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs ${
          ready && !busy ? 'hover:bg-9e-ice dark:hover:bg-[#0D1B2A]' : 'cursor-not-allowed opacity-40'
        }`}
      >
        <Upload className="h-3.5 w-3.5" />
        {busy ? 'กำลังอัปโหลด…' : path ? 'อัปโหลดแทนที่ (PDF)' : 'อัปโหลด PDF'}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={!ready || busy}
          onChange={onPick}
        />
      </label>

      {!ready ? (
        <p className="mt-1 text-[11px] text-amber-700">กรอก course_id ก่อนจึงจะอัปโหลดได้</p>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
