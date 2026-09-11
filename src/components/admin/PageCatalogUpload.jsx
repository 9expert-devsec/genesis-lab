'use client';

import { useState } from 'react';
import { Upload, X, FileText } from 'lucide-react';
import {
  signPageCatalogUpload,
  recordPageCatalogUpload,
  removePageCatalog,
} from '@/lib/actions/page-catalogs';
import { hasCatalog } from '@/lib/pageCatalog';

/**
 * Upload / replace / remove the catalog PDF of one program or skill.
 *
 * ── CourseOutlineUpload WITH THE LANGUAGE REMOVED, AND ONE REAL DIFFERENCE ──
 * The outline's component is a FORM FIELD: it holds the path in a hidden
 * input and the course form's save writes it. This one has no form to ride —
 * the page-config editor saves through actions field by field — so the record
 * step persists the upload itself and "remove" is an action too. Everything
 * else is the outline's flow: sign → browser-direct POST to Cloudinary with
 * the signed params VERBATIM → record what landed.
 *
 * The file is live the moment it lands (overwrite in place, same URL), so
 * there is no "unsaved" state here and nothing to discard.
 */
export function PageCatalogUpload({ kind, id, initialCatalog = null }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const present = hasCatalog({ catalogPdf: catalog });

  async function onPick(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so re-picking the same file re-fires
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const signed = await signPageCatalogUpload({
        kind, id, filename: file.name, contentType: file.type, bytes: file.size,
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
      const recorded = await recordPageCatalogUpload({
        kind, id, bytes: json?.bytes ?? file.size, contentType: file.type,
      });
      if (!recorded?.ok) { setError(recorded?.error ?? null); return; }
      setCatalog(recorded.catalogPdf);
    } catch (err) {
      setError(err?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!window.confirm('ลบแคตตาล็อกออกจากหน้านี้? ปุ่มดาวน์โหลดจะหายไปทันที')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await removePageCatalog({ kind, id });
      if (!res?.ok) { setError(res?.error ?? 'ลบไม่สำเร็จ'); return; }
      setCatalog(res.catalogPdf);
    } catch (err) {
      setError(err?.message ?? 'ลบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  const fileName = present ? catalog.path.slice(catalog.path.lastIndexOf('/') + 1) : '';
  const uploadedAt = present && catalog.uploadedAt ? new Date(catalog.uploadedAt) : null;

  return (
    <div className="rounded-lg border border-[var(--surface-border)] bg-white p-3 dark:bg-9e-navy" data-testid="page-catalog-upload">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-9e-slate-dp-50 dark:text-[#94a3b8]">
          แคตตาล็อก (PDF ภาษาไทย)
        </span>
        {present ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <X className="h-3 w-3" /> ลบไฟล์
          </button>
        ) : null}
      </div>

      {present ? (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-9e-navy dark:text-white">
          <FileText className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden="true" />
          <a
            href={catalog.path}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate font-medium text-9e-action hover:underline"
          >
            {fileName}
          </a>
          {uploadedAt && !Number.isNaN(uploadedAt.getTime()) ? (
            <span className="shrink-0 text-9e-slate-dp-50 dark:text-[#94a3b8]">
              อัปโหลด {uploadedAt.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
              {catalog.version > 1 ? ` · ครั้งที่ ${catalog.version}` : ''}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mb-2 text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ยังไม่มีไฟล์ — หน้าเว็บจะไม่แสดงปุ่มดาวน์โหลด
        </p>
      )}

      <label
        className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-xs ${
          busy ? 'cursor-not-allowed opacity-40' : 'hover:bg-9e-ice dark:hover:bg-[#0D1B2A]'
        }`}
      >
        <Upload className="h-3.5 w-3.5" />
        {busy ? 'กำลังดำเนินการ…' : present ? 'อัปโหลดแทนที่ (PDF)' : 'อัปโหลด PDF'}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={busy}
          onChange={onPick}
        />
      </label>

      {error ? <p className="mt-1 text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
