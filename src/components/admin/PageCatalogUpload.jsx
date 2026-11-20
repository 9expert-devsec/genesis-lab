'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Upload, X, FileText } from 'lucide-react';
import {
  preparePageCatalogUpload,
  recordPageCatalogUpload,
  removePageCatalog,
} from '@/lib/actions/page-catalogs';
import { hasCatalog } from '@/lib/pageCatalog';
import { PAGE_CATALOG_CONTENT_TYPE, refusePageCatalogSize } from '@/lib/pageCatalogPaths.mjs';

/** The note after a successful upload — Blob serves new bytes ~10 s later. */
export const PAGE_CATALOG_PROPAGATION_NOTE =
  'อัปโหลดแล้ว — หน้าเว็บอาจใช้เวลาประมาณ 10 วินาทีกว่าจะแสดงไฟล์ใหม่';

/**
 * Upload / replace / remove the catalog PDF of one program or skill.
 *
 * ── ONE PATH FOR EVERY SIZE: A BLOB CLIENT UPLOAD ───────────────────────────
 * prepare → upload() straight from the browser to Vercel Blob → record. The
 * bytes never pass through a function (Vercel caps request bodies at 4.5 MB),
 * and Cloudinary's 10 MB raw ceiling no longer applies to this field — the
 * limit here is 64 MB. The public URL is unchanged: the config keeps its
 * root-relative path and next.config.mjs serves it from Blob.
 *
 * The pathname handed to upload() is the one the SERVER derived in prepare;
 * the token route re-derives it from the receipt and refuses anything else, so
 * this component cannot steer which file is overwritten.
 *
 * The file is live the moment it lands (overwrite in place, same URL), so
 * there is no "unsaved" state here and nothing to discard — but the CDN can
 * take ~10 s to serve the new bytes, which the success note says.
 */
export function PageCatalogUpload({ kind, id, initialCatalog = null }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // null | 0..100
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);

  const present = hasCatalog({ catalogPdf: catalog });

  async function onPick(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so re-picking the same file re-fires
    if (!file) return;

    setError(null);
    setNote(null);

    // Refuse locally first — the server repeats every check.
    const tooBig = refusePageCatalogSize(file.size);
    if (tooBig) { setError(tooBig); return; }

    setBusy(true);
    try {
      const prep = await preparePageCatalogUpload({
        kind, id, filename: file.name, contentType: file.type, bytes: file.size,
      });
      if (!prep?.ok) { setError(prep?.error ?? 'เตรียมการอัปโหลดไม่สำเร็จ'); return; }

      setProgress(0);
      let blob;
      try {
        blob = await upload(prep.blobPathname, file, {
          access: 'public',
          contentType: PAGE_CATALOG_CONTENT_TYPE,
          handleUploadUrl: '/api/admin/page-catalogs/upload',
          // THE ONLY VALUE THE ROUTE TRUSTS. It reads the target out of the
          // stored receipt, never out of here.
          clientPayload: JSON.stringify({ receiptId: prep.receiptId }),
          onUploadProgress: ({ percentage }) => setProgress(Math.round(Number(percentage) || 0)),
        });
      } catch (err) {
        setError(`อัปโหลดไม่สำเร็จ — ${err?.message ?? err}`);
        return;
      }

      // The file is up. A failure to RECORD it is reported but must not read as
      // a failed upload, or the admin re-sends bytes that are already there.
      const recorded = await recordPageCatalogUpload({
        kind, id, receiptId: prep.receiptId, url: blob?.url, pathname: blob?.pathname,
      });
      if (!recorded?.ok) { setError(recorded?.error ?? null); return; }
      setCatalog(recorded.catalogPdf);
      setNote(PAGE_CATALOG_PROPAGATION_NOTE);
    } catch (err) {
      setError(err?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onRemove() {
    if (!window.confirm('ลบแคตตาล็อกออกจากหน้านี้? ปุ่มดาวน์โหลดจะหายไปทันที')) return;
    setBusy(true);
    setError(null);
    setNote(null);
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
        {busy
          ? progress !== null ? `กำลังอัปโหลด… ${progress}%` : 'กำลังดำเนินการ…'
          : present ? 'อัปโหลดแทนที่ (PDF)' : 'อัปโหลด PDF'}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={busy}
          onChange={onPick}
        />
      </label>

      {progress !== null ? (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-9e-ice dark:bg-[#0D1B2A]"
          role="progressbar"
          aria-label="ความคืบหน้าการอัปโหลด"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-full bg-9e-action transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {note ? <p className="mt-1 text-[11px] text-green-700 dark:text-green-400">{note}</p> : null}
      {error ? <p className="mt-1 text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
