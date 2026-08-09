'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronDown, Copy, ExternalLink, FileText, FolderOpen, Image as ImageIcon,
  Loader2, RefreshCw, Trash2, Upload,
} from 'lucide-react';

import {
  deleteMediaFile, listMediaCategories, listMediaFiles, signMediaUpload,
} from '@/lib/actions/media';
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

/**
 * The delete control for one row.
 *
 * ── WHY window.confirm AND NOT A CUSTOM MODAL ───────────────────────────────
 * It is what this admin already does — twenty-odd destructive actions across
 * the screens use it, several with the same `\n\n` detail line. A bespoke
 * dialog here would be the only one of its kind, and the thing that matters
 * about a delete confirmation is that it NAMES the thing and states the
 * consequence, which this does. The wording is the point, not the chrome.
 */
function DeleteFileButton({ file, busy, onDelete }) {
  const confirmThenDelete = () => {
    const message =
      `ลบไฟล์ "${file.filename}"\n\n`
      + `ลบถาวร — URL ${file.publicPath} จะใช้ไม่ได้อีก\n\n`
      + 'หน้าเว็บหรือบทความที่ลิงก์ไปยังไฟล์นี้จะเสีย และย้อนกลับไม่ได้';
    if (!window.confirm(message)) return;
    onDelete(file);
  };

  return (
    <button
      type="button"
      onClick={confirmThenDelete}
      disabled={busy}
      title={`ลบ ${file.publicPath}`}
      aria-label={`ลบไฟล์ ${file.publicPath}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Trash2 className="h-3.5 w-3.5" />}
      {busy ? 'กำลังลบ...' : 'ลบ'}
    </button>
  );
}

export default function MediaClient({ initialCategories, initialCounts, initialError }) {
  const [categories, setCategories] = useState(initialCategories);
  const [counts, setCounts] = useState(initialCounts ?? {});
  const [active, setActive] = useState(initialCategories[0] ?? '');
  const [files, setFiles] = useState([]);
  const [listing, setListing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState(initialError);
  const [cursors, setCursors] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const [deletingId, setDeletingId] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  /**
   * Files destroyed during this page view, filtered out of every later listing.
   *
   * ── WHY THIS IS NEEDED, MEASURED AGAINST THE LIVE ACCOUNT ───────────────────
   * Cloudinary's delivery endpoint reflects a destroy IMMEDIATELY — the URL
   * answers 404 "Resource not found" within the same second. Its Admin API
   * prefix listing does NOT: the destroyed asset kept coming back from
   * `api.resources` for over five minutes. Measured, with two controls — a
   * destroy with `invalidate` and one without behaved identically, and the
   * Search API reported the folder empty while `api.resources` still listed two
   * assets in it. The asset is gone; that endpoint is stale.
   *
   * Without this set the delete looks broken in the most alarming way possible:
   * the row disappears, the admin presses โหลดใหม่ to confirm, and the file they
   * just permanently destroyed is back in the list. It is NOT back — the URL is
   * already dead — but nothing on screen says so.
   *
   * A ref rather than state, because filtering must not itself trigger a render,
   * and it is read inside the load callbacks. It lives for the page view: a
   * reload clears it, by which time the index has caught up.
   */
  const deletedIds = useRef(new Set());
  const withoutDeleted = useCallback(
    (list) => list.filter((f) => !deletedIds.current.has(f.publicId)),
    [],
  );

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  }, []);

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

  /**
   * Load the FIRST page of a category, discarding whatever was on screen.
   *
   * Separate from loadMore because the two differ in more than the cursor: this
   * one resets the list and owns the `listing` spinner, that one appends and
   * owns `loadingMore`. Folding them into one function with a flag is how a
   * "load more" click ends up clearing the list it was supposed to extend.
   */
  const loadFiles = useCallback(async (category) => {
    if (!category) { setFiles([]); setCursors(null); setHasMore(false); return; }
    setListing(true);
    setListError('');
    setDeleteError('');
    try {
      const res = await listMediaFiles(category);
      if (!res.ok) {
        setListError(res.error ?? 'โหลดไฟล์ไม่สำเร็จ');
        setFiles([]); setCursors(null); setHasMore(false);
      } else {
        setFiles(withoutDeleted(res.files));
        setCursors(res.cursors);
        setHasMore(Boolean(res.hasMore));
      }
    } catch (err) {
      setListError(err?.message ?? 'โหลดไฟล์ไม่สำเร็จ');
      setFiles([]); setCursors(null); setHasMore(false);
    } finally {
      setListing(false);
    }
  }, [withoutDeleted]);

  /**
   * The next page, APPENDED.
   *
   * The merge de-duplicates by publicId. A cursor walk is not a snapshot — a
   * file uploaded between two clicks can shift the page boundary and hand back
   * a row already on screen — and React would then warn about the duplicate key
   * and the running count would be wrong.
   *
   * Sorting happens here, over everything loaded so far, because the server
   * cannot sort across pages without holding the whole prefix in memory. A row
   * from page two can therefore land ABOVE rows from page one, which is the
   * correct behaviour for an alphabetical list and would look like a bug in a
   * list that pretended pages were ordered chunks.
   */
  const loadMore = useCallback(async () => {
    if (!active || !hasMore || loadingMore || listing) return;
    setLoadingMore(true);
    setListError('');
    try {
      const res = await listMediaFiles(active, cursors);
      if (!res.ok) {
        setListError(res.error ?? 'โหลดเพิ่มไม่สำเร็จ');
        // The server hands back the cursors we came in with on failure, so the
        // next click retries this page instead of restarting the category.
        if (res.cursors) setCursors(res.cursors);
        return;
      }
      const incoming = withoutDeleted(res.files);
      setFiles((prev) => {
        const seen = new Set(prev.map((f) => f.publicId));
        const merged = [...prev, ...incoming.filter((f) => !seen.has(f.publicId))];
        merged.sort((a, b) => a.filename.localeCompare(b.filename));
        return merged;
      });
      setCursors(res.cursors);
      setHasMore(Boolean(res.hasMore));
    } catch (err) {
      setListError(err?.message ?? 'โหลดเพิ่มไม่สำเร็จ');
    } finally {
      setLoadingMore(false);
    }
  }, [active, cursors, hasMore, listing, loadingMore, withoutDeleted]);

  useEffect(() => { loadFiles(active); }, [active, loadFiles]);

  const refreshCategories = useCallback(async (preferred) => {
    const res = await listMediaCategories();
    if (!res.ok) return;
    setCategories(res.categories);
    setCounts(res.counts ?? {});
    if (preferred && res.categories.includes(preferred)) setActive(preferred);
    else if (!active && res.categories.length) setActive(res.categories[0]);
  }, [active]);

  /**
   * Destroy one file.
   *
   * The row is dropped from the list only AFTER the server confirms, never
   * optimistically: an optimistic removal on a destructive action shows the
   * admin a file that is gone when it is not, and the correction arrives as an
   * error message they have already scrolled past.
   *
   * `alreadyGone` is a success, not a failure — the asset is not there, which
   * is what was asked for. It is worded differently only so the admin knows
   * their click was not the one that did it.
   */
  const handleDelete = useCallback(async (file) => {
    setDeletingId(file.publicId);
    setDeleteError('');
    try {
      const res = await deleteMediaFile({
        publicPath: file.publicPath,
        resourceType: file.resourceType,
        // Sent to be COMPARED, never to be used as the delete target — the
        // server derives its own id and refuses if the two disagree.
        expectedPublicId: file.publicId,
      });
      if (!res.ok) { setDeleteError(res.error ?? 'ลบไฟล์ไม่สำเร็จ'); return; }

      deletedIds.current.add(file.publicId);
      setFiles((prev) => prev.filter((f) => f.publicId !== file.publicId));
      setCounts((prev) => (
        prev[active] > 0 ? { ...prev, [active]: prev[active] - 1 } : prev
      ));
      showToast(res.alreadyGone
        ? `${file.filename} ถูกลบไปแล้วก่อนหน้านี้ — นำออกจากรายการแล้ว`
        : `ลบ ${file.filename} แล้ว — URL ${file.publicPath} ใช้ไม่ได้อีกต่อไป`);
    } catch (err) {
      setDeleteError(err?.message ?? 'ลบไฟล์ไม่สำเร็จ');
    } finally {
      setDeletingId('');
    }
  }, [active, showToast]);

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
      {/*
        aria-busy rather than a disabled region: the tabs and the upload form
        above stay usable while a page loads, and the only thing that spins is
        this section. A page fetch is a Cloudinary round trip, and freezing the
        whole tab for it would make the list feel like the slowest thing on the
        screen even when the admin wanted to do something else.
      */}
      <section aria-busy={listing || loadingMore}>
        {toast ? (
          <div
            role="status"
            className="mb-3 flex items-start gap-2 rounded-9e-md border border-green-500/40 bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-400"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{toast}</span>
          </div>
        ) : null}

        {deleteError ? (
          <p role="alert" className="mb-3 text-sm text-red-500">{deleteError}</p>
        ) : null}

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
            {/*
              The running count, and whether more remain. `counts[active]` comes
              from the discovery walk, which has already visited every asset —
              so "50 จาก 81" is a real total rather than a guess, and an admin
              can tell a short category from a partly-loaded one.
            */}
            <p className="mb-2 text-xs text-9e-slate-dp-50">
              แสดง {files.length}
              {counts[active] > 0 ? ` จาก ${counts[active]}` : ''} ไฟล์ในหมวด {active}
              {hasMore ? ' · ยังมีอีก' : ' · ครบแล้ว'}
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
                  <DeleteFileButton
                    file={f}
                    busy={deletingId === f.publicId}
                    onDelete={handleDelete}
                  />
                </li>
              ))}
            </ul>

            {hasMore ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-9e-md border border-9e-action px-4 py-2 text-sm text-9e-action transition-colors hover:bg-9e-action hover:text-white disabled:opacity-50"
                >
                  {loadingMore
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <ChevronDown className="h-4 w-4" />}
                  {loadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
