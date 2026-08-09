'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, Copy, ExternalLink, FileText, FolderOpen, Image as ImageIcon,
  Loader2, RefreshCw, Upload,
} from 'lucide-react';

import { listMediaCategories, listMediaFiles, signMediaUpload } from '@/lib/actions/media';
import { ALLOWED_UPLOAD_EXTENSIONS } from '@/lib/legacyUploadPolicy.mjs';

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');

/**
 * The copy button, with its own confirmation state.
 *
 * Split out because the confirmation has to be PER ROW: one shared "copied!"
 * flag in the parent lights up every row at once, which tells the admin nothing
 * about which URL is now on their clipboard.
 */
function CopyUrlButton({ url, label = 'คัดลอกลิงก์' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API needs a secure context and permission. Falling back keeps
      // the button useful on http:// previews instead of failing silently.
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={url}
      aria-label={`${label}: ${url}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-9e-sm border px-2 py-1 text-xs transition-colors ${
        copied
          ? 'border-green-500 text-green-600'
          : 'border-9e-action text-9e-action hover:bg-9e-action hover:text-white'
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'คัดลอกแล้ว' : label}
    </button>
  );
}

export default function MediaClient({ initialCategories, initialError }) {
  const [categories, setCategories] = useState(initialCategories);
  const [active, setActive] = useState(initialCategories[0] ?? '');
  const [files, setFiles] = useState([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState(initialError);
  const [truncated, setTruncated] = useState(false);

  const [file, setFile] = useState(null);
  const [targetCategory, setTargetCategory] = useState(initialCategories[0] ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploaded, setUploaded] = useState(null);
  const inputRef = useRef(null);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const effectiveCategory = useMemo(
    () => (newCategory.trim() ? newCategory.trim() : targetCategory),
    [newCategory, targetCategory],
  );

  const loadFiles = useCallback(async (category) => {
    if (!category) { setFiles([]); return; }
    setListing(true);
    setListError('');
    try {
      const res = await listMediaFiles(category);
      if (!res.ok) { setListError(res.error ?? 'โหลดไฟล์ไม่สำเร็จ'); setFiles([]); }
      else { setFiles(res.files); setTruncated(Boolean(res.truncated)); }
    } catch (err) {
      setListError(err?.message ?? 'โหลดไฟล์ไม่สำเร็จ');
      setFiles([]);
    } finally {
      setListing(false);
    }
  }, []);

  useEffect(() => { loadFiles(active); }, [active, loadFiles]);

  const refreshCategories = useCallback(async (preferred) => {
    const res = await listMediaCategories();
    if (!res.ok) return;
    setCategories(res.categories);
    if (preferred && res.categories.includes(preferred)) setActive(preferred);
    else if (!active && res.categories.length) setActive(res.categories[0]);
  }, [active]);

  const handleUpload = async () => {
    setUploadError('');
    setUploaded(null);
    if (!file) { setUploadError('กรุณาเลือกไฟล์'); return; }
    if (!effectiveCategory) { setUploadError('กรุณาเลือกหรือตั้งชื่อหมวดหมู่'); return; }

    setUploading(true);
    try {
      // 1. Ask the server to authorise THIS file. The allow-list, the size cap
      //    and the name-clash check all run there, before a signature exists.
      const signed = await signMediaUpload({
        category: effectiveCategory,
        filename: file.name,
        bytes: file.size,
      });
      if (!signed.ok) { setUploadError(signed.error); return; }

      // 2. Send the bytes STRAIGHT to Cloudinary. They never pass through this
      //    app, which is what keeps a 40 MB PDF from meeting the 4.5 MB
      //    serverless body cap.
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', signed.apiKey);
      for (const [k, v] of Object.entries(signed.params)) fd.append(k, String(v));

      const res = await fetch(signed.uploadUrl, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(body?.error?.message ?? `อัปโหลดไม่สำเร็จ (${res.status})`);
        return;
      }

      // 3. public_id IS the path, so it is already live. Nothing to deploy.
      setUploaded({ publicPath: signed.publicPath, bytes: file.size, name: file.name });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      if (newCategory.trim()) {
        setTargetCategory(effectiveCategory);
        setNewCategory('');
        await refreshCategories(effectiveCategory);
      }
      setActive(effectiveCategory);
      await loadFiles(effectiveCategory);
    } catch (err) {
      setUploadError(err?.message ?? 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-6">
      {/* ── UPLOAD ───────────────────────────────────────────────────── */}
      <section className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
        <p className="mb-3 text-sm font-semibold text-9e-navy dark:text-white">อัปโหลดไฟล์</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-9e-slate-dp-50">หมวดหมู่</span>
            <select
              value={targetCategory}
              onChange={(e) => { setTargetCategory(e.target.value); setNewCategory(''); }}
              disabled={uploading || !categories.length}
              className="w-full rounded-9e-sm border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy disabled:opacity-50 dark:bg-[#0d1926] dark:text-white"
            >
              {categories.length === 0 ? <option value="">— ยังไม่มีหมวดหมู่ —</option> : null}
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-9e-slate-dp-50">
              หรือสร้างหมวดหมู่ใหม่
            </span>
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="เช่น brochure"
              disabled={uploading}
              className="w-full rounded-9e-sm border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy placeholder:text-9e-slate-dp-50/60 disabled:opacity-50 dark:bg-[#0d1926] dark:text-white"
            />
          </label>
        </div>

        <div className="mt-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            disabled={uploading}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setUploadError('');
              setUploaded(null);
            }}
            className="block w-full text-sm text-9e-slate-dp-50 file:mr-3 file:rounded-9e-sm file:border-0 file:bg-9e-action/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-9e-action hover:file:bg-9e-action/20"
          />
          {file ? (
            <p className="mt-2 text-xs text-9e-slate-dp-50">
              {file.name} · {formatBytes(file.size)}
              {effectiveCategory ? (
                <> → <span className="text-9e-action">/files/{effectiveCategory}/{file.name}</span></>
              ) : null}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploading || !effectiveCategory}
          className="mt-4 inline-flex items-center gap-2 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0047CC] disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
        </button>

        <p className="mt-2 text-xs text-9e-slate-dp-50">
          รองรับรูปภาพและเอกสาร · เอกสารไม่เกิน 10 MB (ไฟล์ใหญ่กว่านี้จะรองรับในเวอร์ชันถัดไป)
        </p>

        {uploadError ? <p className="mt-3 text-sm text-red-500">{uploadError}</p> : null}

        {uploaded ? (
          <div className="mt-3 rounded-9e-md border border-green-500/40 bg-green-50 p-3 dark:bg-green-500/10">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              อัปโหลดสำเร็จ — ไฟล์พร้อมใช้งานแล้ว
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-white px-2 py-1 text-xs text-9e-navy dark:bg-[#0d1926] dark:text-white">
                {origin}{uploaded.publicPath}
              </code>
              <CopyUrlButton url={`${origin}${uploaded.publicPath}`} />
              <a
                href={uploaded.publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-9e-sm border border-9e-action px-2 py-1 text-xs text-9e-action hover:bg-9e-action hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                เปิด
              </a>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── CATEGORY TABS ────────────────────────────────────────────── */}
      {categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--surface-border)] pb-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActive(c)}
              aria-current={active === c ? 'page' : undefined}
              className={`rounded-9e-sm px-3 py-1.5 text-sm transition-colors ${
                active === c
                  ? 'bg-9e-action text-white'
                  : 'text-9e-slate-dp-50 hover:bg-9e-action/10 hover:text-9e-action'
              }`}
            >
              {c}
            </button>
          ))}
          <button
            type="button"
            onClick={() => loadFiles(active)}
            disabled={listing}
            title="โหลดใหม่"
            className="ml-auto inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-xs text-9e-slate-dp-50 hover:text-9e-action disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${listing ? 'animate-spin' : ''}`} />
            โหลดใหม่
          </button>
        </div>
      ) : null}

      {/* ── FILE LIST ────────────────────────────────────────────────── */}
      <section>
        {listError ? <p className="text-sm text-red-500">{listError}</p> : null}

        {!listError && categories.length === 0 ? (
          <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] p-8 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-9e-slate-dp-50" strokeWidth={1.5} />
            <p className="mt-2 text-sm text-9e-slate-dp-50">
              ยังไม่มีหมวดหมู่ — อัปโหลดไฟล์แรกโดยตั้งชื่อหมวดหมู่ใหม่ด้านบน
            </p>
          </div>
        ) : null}

        {!listError && categories.length > 0 && listing ? (
          <p className="flex items-center gap-2 text-sm text-9e-slate-dp-50">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด...
          </p>
        ) : null}

        {!listError && !listing && categories.length > 0 && files.length === 0 ? (
          <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] p-8 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-9e-slate-dp-50" strokeWidth={1.5} />
            <p className="mt-2 text-sm text-9e-slate-dp-50">
              หมวดหมู่ <span className="font-medium">{active}</span> ยังไม่มีไฟล์
            </p>
          </div>
        ) : null}

        {!listing && files.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-9e-slate-dp-50">
              {files.length} ไฟล์ในหมวด {active}
              {truncated ? ' (แสดง 200 รายการแรก)' : ''}
            </p>
            <ul className="flex flex-col gap-2">
              {files.map((f) => (
                <li
                  key={f.publicId}
                  className="flex items-center gap-3 rounded-9e-md border border-[var(--surface-border)] bg-white p-2.5 dark:bg-[#111d2c]"
                >
                  {f.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.thumbUrl}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      className="h-10 w-10 shrink-0 rounded-9e-sm object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-9e-sm bg-9e-action/10 text-9e-action">
                      {f.resourceType === 'image'
                        ? <ImageIcon className="h-5 w-5" strokeWidth={1.75} />
                        : <FileText className="h-5 w-5" strokeWidth={1.75} />}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-9e-navy dark:text-white">
                      {f.filename}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-9e-slate-dp-50">
                      {f.publicPath} · {f.format?.toUpperCase()} · {formatBytes(f.bytes)}
                    </p>
                  </div>

                  <CopyUrlButton url={`${origin}${f.publicPath}`} />
                  <a
                    href={f.publicPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="เปิดไฟล์"
                    className="inline-flex shrink-0 items-center rounded-9e-sm border border-[var(--surface-border)] p-1.5 text-9e-slate-dp-50 hover:text-9e-action"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
