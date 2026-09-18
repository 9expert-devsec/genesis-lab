'use client';

import { useState } from 'react';
import { Upload, Copy, X, Check, ExternalLink } from 'lucide-react';
import { signMasterclassOutlineUpload } from '@/lib/actions/masterclass-outlines';
import { outlineHref } from '@/lib/masterclass/masterclassOutline';

/**
 * Masterclass outline PDF — the ONLY writer of `course_outline_url`.
 *
 * Modelled on CourseOutlineUpload / CareerPathOutlineUpload. Controlled: the
 * form builds its save payload from state, so this reports the server-signed
 * publicPath through `onChange` and never a value the admin typed. The value
 * is DISPLAY-ONLY here — the free-text box it replaces let any string in.
 *
 * During the transition the stored value is still a full Cloudinary URL for
 * the two live courses. It is shown, openable, labelled as external, and the
 * upload replaces it; it is never blanked by this component.
 */
export function MasterclassOutlineUpload({ lang = 'th', slug, courseId = '', value = '', onChange, label }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const path = String(value ?? '');
  const href = outlineHref(path);
  const ready = String(slug ?? '').trim().length > 0;
  const isExternal = Boolean(path) && !path.startsWith('/files/');

  async function onPick(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so re-picking the same file re-fires
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const signed = await signMasterclassOutlineUpload({ courseId, slug, lang, bytes: file.size });
      if (!signed?.ok) { setError(signed?.error ?? 'ขอลายเซ็นอัปโหลดไม่สำเร็จ'); return; }

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
      onChange?.(signed.publicPath);
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

  function onClear() {
    onChange?.('');
    setError(null);
  }

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] p-3">
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
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded border border-[var(--surface-border)] px-2 py-1 text-[11px]"
            >
              <ExternalLink className="h-3 w-3" /> ดูไฟล์ที่อัพโหลด
            </a>
          ) : null}
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

      {isExternal ? (
        <p className="mb-2 text-[11px] text-amber-700">
          ลิงก์ภายนอก (ค่าเดิม) — อัปโหลดไฟล์ PDF เพื่อย้ายมาไว้บนโดเมนของเรา หรือล้างค่า
        </p>
      ) : null}

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
        <p className="mt-1 text-[11px] text-amber-700">กรอก slug ก่อนจึงจะอัปโหลดได้</p>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
