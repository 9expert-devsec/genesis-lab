'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Pencil, Pin, Plus, Search, Star, Trash2 } from 'lucide-react';
import {
  deleteArticle,
  toggleArticleActive,
  toggleArticleFeaturedOnLanding,
  toggleArticlePinnedOnArticlePage,
  updateArticlePinOrder,
} from '@/lib/actions/articles';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ArticlesAdminClient({ articles: initial }) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((a) =>
      [a.title, a.slug, a.author, ...(a.tags ?? [])]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [rows, query]);

  // ── Client-side pagination over the filtered rows ──────────────
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the search query changes.
  useEffect(() => { setPage(1); }, [query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Clamp page if the filtered set shrank (e.g. after delete or search).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  function handleToggle(a) {
    setBusyId(a._id);
    startTransition(async () => {
      const res = await toggleArticleActive(a._id, !a.active);
      if (res?.ok) {
        setRows((cur) =>
          cur.map((r) => (r._id === a._id ? { ...r, active: !r.active } : r))
        );
      }
      setBusyId(null);
    });
  }

  function handleTogglePin(a) {
    const next = !a.isPinnedOnArticlePage;
    setBusyId(a._id);
    startTransition(async () => {
      const res = await toggleArticlePinnedOnArticlePage(a._id, next);
      if (res?.ok) {
        setRows((cur) =>
          cur.map((r) => (r._id === a._id ? { ...r, isPinnedOnArticlePage: next } : r))
        );
      }
      setBusyId(null);
    });
  }

  function handleToggleFeatured(a) {
    const next = !a.featuredOnLanding;
    setBusyId(a._id);
    startTransition(async () => {
      const res = await toggleArticleFeaturedOnLanding(a._id, next);
      if (res?.ok) {
        setRows((cur) =>
          cur.map((r) => (r._id === a._id ? { ...r, featuredOnLanding: next } : r))
        );
      }
      setBusyId(null);
    });
  }

  function handlePinOrderChange(a, value) {
    const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
    // Optimistic — the field is editable mid-typing, no busy state.
    setRows((cur) =>
      cur.map((r) => (r._id === a._id ? { ...r, pinOrder: numeric } : r))
    );
    startTransition(async () => {
      await updateArticlePinOrder(a._id, numeric);
    });
  }

  async function handleDelete(a) {
    setBusyId(a._id);
    setDeleteError(null);
    try {
      const res = await deleteArticle(a._id);
      if (res?.ok === false) {
        setDeleteError(res.error || 'ลบไม่สำเร็จ');
        return;
      }
      setRows((cur) => cur.filter((r) => r._id !== a._id));
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err?.message ?? 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            จัดการบทความ
          </h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ทั้งหมด {rows.length} บทความ · แสดง {pageRows.length} จาก {filtered.length} รายการ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-9e-slate-dp-50" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา title / slug / author / tag…"
              className="w-72 rounded-9e-md border border-[var(--surface-border)] bg-white py-2 pl-8 pr-3 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
            />
          </div>
          <Link
            href="/admin/articles/new"
            className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
          >
            <Plus className="h-4 w-4" /> สร้างบทความ
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c] mt-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-[80px] px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ภาพ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หัวข้อ / Slug</th>
              <th className="w-28 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ประเภท</th>
              <th className="w-48 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Tags</th>
              <th className="w-40 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ผู้เขียน</th>
              <th className="w-40 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">เผยแพร่</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Pin /articles</th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Landing</th>
              <th className="w-28 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {rows.length === 0 ? (
                    <>ยังไม่มีบทความ — กด <strong>สร้างบทความ</strong> เพื่อเริ่มต้น</>
                  ) : (
                    'ไม่พบบทความที่ตรงกับการค้นหา'
                  )}
                </td>
              </tr>
            )}
            {pageRows.map((a, i) => (
              <tr
                key={a._id}
                className={
                  'border-b border-[var(--surface-border)] transition-colors last:border-0 ' +
                  (a.active
                    ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                    : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                }
              >
                <td className="px-3 py-3 text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {(page - 1) * PAGE_SIZE + i + 1}
                </td>
                <td className="px-3 py-3">
                  {a.coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={a.coverUrl}
                      alt={a.title}
                      className="h-10 w-10 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-9e-ice text-xs font-bold text-9e-action dark:bg-[#0D1B2A]">
                      {a.title?.slice(0, 1) ?? '?'}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <p className="line-clamp-1 font-semibold text-9e-navy dark:text-white">
                    {a.title || '(ไม่มีชื่อ)'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {a.slug || '—'}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                      (a.articleType === 'video'
                        ? 'border-purple-100 bg-purple-50 text-purple-700'
                        : 'border-blue-100 bg-blue-50 text-blue-700')
                    }
                  >
                    {a.articleType === 'video' ? 'วิดีโอ' : 'บทความ'}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(a.tags ?? []).slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#0D1B2A]"
                      >
                        {t}
                      </span>
                    ))}
                    {(a.tags?.length ?? 0) > 3 && (
                      <span className="text-[11px] text-9e-slate-dp-50">
                        +{a.tags.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-9e-navy dark:text-white">
                  {a.author || '—'}
                </td>
                <td className="px-3 py-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {formatDate(a.publishedAt)}
                </td>
                <td className="px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggle(a)}
                    disabled={busyId === a._id}
                    aria-label={a.active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                    className={`relative h-4 w-8 rounded-full transition-colors disabled:opacity-50 ${
                      a.active ? 'bg-[#22C55E]' : 'bg-gray-300 dark:bg-[#1e3a5f]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                        a.active ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleTogglePin(a)}
                      disabled={busyId === a._id}
                      aria-label={a.isPinnedOnArticlePage ? 'ยกเลิกการปักหมุด' : 'ปักหมุดที่หน้า /articles'}
                      title={a.isPinnedOnArticlePage ? 'ยกเลิก Pin' : 'Pin บทความนี้'}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-9e-ice disabled:opacity-50 dark:hover:bg-[#0D1B2A]"
                    >
                      <Pin
                        className={`h-4 w-4 transition-colors ${
                          a.isPinnedOnArticlePage
                            ? 'fill-9e-action text-9e-action'
                            : 'text-gray-300 dark:text-[#1e3a5f]'
                        }`}
                        strokeWidth={2}
                      />
                    </button>
                    {a.isPinnedOnArticlePage && (
                      <input
                        type="number"
                        min="0"
                        value={a.pinOrder ?? 0}
                        onChange={(e) => handlePinOrderChange(a, e.target.value)}
                        title="ลำดับ Pin (น้อย = ขึ้นก่อน)"
                        className="w-12 rounded border border-[var(--surface-border)] bg-white px-1 py-0.5 text-center text-xs text-9e-navy dark:bg-[#0D1B2A] dark:text-white"
                      />
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(a)}
                    disabled={busyId === a._id}
                    aria-label={a.featuredOnLanding ? 'ยกเลิกการแสดงบน Landing' : 'แสดงบน Landing'}
                    title={a.featuredOnLanding ? 'แสดงบน Landing แล้ว' : 'แสดงบน Landing'}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-9e-ice disabled:opacity-50 dark:hover:bg-[#0D1B2A]"
                  >
                    <Star
                      className={`h-4 w-4 ${
                        a.featuredOnLanding
                          ? 'fill-yellow-500 text-yellow-500'
                          : 'text-gray-300 dark:text-[#1e3a5f]'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Link
                      href={`/admin/articles/${a._id}/edit`}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                      aria-label="แก้ไข"
                    >
                      <Pencil className="h-3 w-3" /> แก้ไข
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDelete(a);
                      }}
                      disabled={busyId === a._id}
                      className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      aria-label="ลบ"
                    >
                      <Trash2 className="h-3 w-3" /> ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager page={page} totalPages={totalPages} onGo={setPage} />

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-article-title"
        >
          <div className="w-full max-w-md rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]">
            <h2 id="delete-article-title" className="text-base font-bold text-9e-navy dark:text-white">
              ยืนยันการลบบทความ
            </h2>
            <p className="mt-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              คุณแน่ใจหรือไม่ว่าจะลบ <strong className="text-9e-navy dark:text-white">{confirmDelete.title}</strong>?
              การลบไม่สามารถย้อนกลับได้
            </p>

            {deleteError && (
              <div className="mt-3 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {deleteError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(null);
                  setDeleteError(null);
                }}
                disabled={busyId === confirmDelete._id}
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                disabled={busyId === confirmDelete._id}
                className="rounded-9e-md bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busyId === confirmDelete._id ? 'กำลังลบ…' : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pager({ page, totalPages, onGo }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(totalPages - 1, page + 1);
  pages.push(1);
  if (lo > 2) pages.push('…');
  for (let n = lo; n <= hi; n++) pages.push(n);
  if (hi < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  const btn = 'min-w-9 h-9 px-3 rounded-9e-md border text-sm transition';
  return (
    <nav className="flex items-center justify-center gap-2 py-4" aria-label="แบ่งหน้า">
      <button type="button" disabled={page <= 1} onClick={() => onGo(page - 1)}
        className={`${btn} border-[var(--surface-border)] disabled:opacity-40`}>ก่อนหน้า</button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-9e-slate-dp-50">…</span>
        ) : (
          <button key={p} type="button" onClick={() => onGo(p)}
            aria-current={p === page ? 'page' : undefined}
            className={p === page
              ? `${btn} border-9e-action bg-9e-action text-white`
              : `${btn} border-[var(--surface-border)] text-9e-navy hover:border-9e-action dark:text-white`}>
            {p}
          </button>
        )
      )}
      <button type="button" disabled={page >= totalPages} onClick={() => onGo(page + 1)}
        className={`${btn} border-[var(--surface-border)] disabled:opacity-40`}>ถัดไป</button>
    </nav>
  );
}
