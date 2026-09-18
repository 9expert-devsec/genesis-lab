'use client';

import { useState } from 'react';
import { Upload, Copy, X, Check, ExternalLink } from 'lucide-react';
import {
  signCareerPathOutlineUpload,
  recordCareerPathOutlineUpload,
} from '@/lib/actions/career-path-outlines';
import { isFilesPdfPath } from '@/lib/careerPaths/careerPathOutline';

/**
 * Career-path outline PDF — an upload button where a text box used to be.
 *
 * Modelled on CourseOutlineUpload, with two differences that follow from the
 * form it sits in:
 *
 *   · CONTROLLED, not a hidden input. CareerPathForm builds its FormData from
 *     state on submit (`fd.set('links_outlineUrl', outlineUrl)`), so this
 *     reports the returned publicPath through `onChange` and the form carries
 *     it into MSDB exactly as it carried the pasted URL before. The client
 *     never types a path: `value` only ever becomes what the server signed.
 *
 *   · A LEFTOVER EXTERNAL VALUE IS SHOWN, NOT BLANKED. Until the re-point
 *     script has run, `links.outlineUrl` may still be a 9exp.link paste. That
 *     link works for visitors today, so it is rendered read-only, labelled as
 *     external, with a link to open it — and the upload replaces it. The save
 *     guard in career-paths.js refuses to WRITE such a value, so the only way
 *     forward from an external paste is an upload (or clearing it).
 */
export function CareerPathOutlineUpload({
  lang = 'th',
  apiSlug,
  careerPathId = '',
  value = '',
  onChange,
  label,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const path = String(value ?? '');
  const ready = String(apiSlug ?? '').trim().length > 0;
  const isOurs = isFilesPdfPath(path);
  const isExternal = Boolean(path) && !isOurs;

  async function onPick(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so re-picking the same file re-fires
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const signed = await signCareerPathOutlineUpload({
        careerPathId, apiSlug, lang, bytes: file.size,
      });
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

      const recorded = await recordCareerPathOutlineUpload({
        careerPathId, apiSlug, lang, bytes: json?.bytes ?? file.size, contentType: file.type,
      });
      if (!recorded?.ok) setError(recorded?.error ?? null);
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
          <a
            href={path}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded border border-[var(--surface-border)] px-2 py-1 text-[11px]"
          >
            <ExternalLink className="h-3 w-3" /> เปิดไฟล์
          </a>
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
          ลิงก์ภายนอก (ค่าเดิม) — ระบบจะไม่บันทึกลิงก์ภายนอกอีกต่อไป อัปโหลดไฟล์ PDF เพื่อแทนที่ หรือล้างค่า
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
