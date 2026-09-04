'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ExternalLink, Eye, EyeOff, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  deleteCustomPage,
  toggleCustomPageStatus,
  publishCustomPage,
} from '@/lib/actions/customPages';
import {
  deletePageBuilderPage,
  publishPageStatus,
} from '@/lib/actions/pageBuilder';

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

// Status → badge colour + Thai label. Builder pages carry the richer status
// set (scheduled/closed/archived); advanced-HTML only draft/published.
function statusBadge(status) {
  if (status === 'published') return { cls: 'border-green-100 bg-green-50 text-green-700', label: 'เผยแพร่แล้ว' };
  if (status === 'draft')     return { cls: 'border-amber-100 bg-amber-50 text-amber-700', label: 'ฉบับร่าง' };
  const labels = { scheduled: 'ตั้งเวลา', closed: 'ปิดแล้ว', archived: 'เก็บถาวร' };
  return { cls: 'border-gray-200 bg-gray-50 text-gray-600', label: labels[status] ?? status };
}

const rowKey = (p) => `${p._type}:${p._id}`;

export function CustomPagesAdminClient({ pages: initial, canCreateAdvanced = false }) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | draft | published
  const [typeFilter, setTypeFilter] = useState('all');      // all | builder | advanced_html
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p._type !== typeFilter) return false;
      if (!q) return true;
      return [p.title, p.slug]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter, typeFilter]);

  // ── Client-side pagination over the filtered rows ──────────────
  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [query, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // BUILDER rows go through publishPageStatus (the draft/published split,
  // round 2), not updatePageStatus. Three reasons, in order of how badly the
  // old path failed:
  //
  //   1. updatePageStatus snapshots doc.toObject() on publish, which since
  //      round 1 carries `draft`. Publishing from this list would archive an
  //      unpublished edit into PageVersion as though it had once been live —
  //      while NOT promoting it, so the stale content went public at the same
  //      time. publishPageStatus promotes the draft and strips it from the
  //      snapshot.
  //   2. It had no conflict check at all. The row carries the updatedAt it
  //      was listed with, so a toggle against a page someone else has since
  //      edited is now rejected instead of silently stamping over it.
  //   3. The response carries the fresh updatedAt, so a second toggle on the
  //      same row works without a reload.
  //
  // The DATES ARE PASSED THROUGH DELIBERATELY. publishPageStatus validates
  // the whole { status, publishStartDate, publishEndDate } window, and those
  // two fields default to null when absent — so omitting them would silently
  // WIPE a scheduled page's window on an unrelated status toggle. The list
  // reads whole documents, so it already holds both.
  //
  // ── THE advanced_html BRANCH SPLITS, BECAUSE CustomPage NOW HAS A DRAFT ────
  //
  // The note that stood here said "CustomPage has no draft, no snapshot and no
  // conflict token, and toggleCustomPageStatus stays its path". The first clause
  // stopped being true when the draft split landed, and the consequence is
  // exactly the one the builder branch above was rewritten to avoid:
  // toggleCustomPageStatus sets `status` and nothing else, so publishing from
  // this list would make the STALE live content public while the author's
  // pending draft sat unpromoted beside it.
  //
  // So the two directions now take different paths, mirroring the split the
  // editor's own controls make:
  //
  //   draft -> published   publishCustomPage    promotes the draft, then flips
  //                        the status. The ONE path that makes a page public.
  //   published -> draft   toggleCustomPageStatus  a takedown. Writes `status`
  //                        alone and leaves the pending draft untouched, because
  //                        unpublishing and abandoning your work are different
  //                        decisions.
  //
  // No conflict token is passed on either: CustomPage has no updatedAt guard, so
  // this list is exactly as safe as it was — that gap is unchanged by this round
  // and is not silently claimed to be fixed.
  function handleToggleStatus(p) {
    const next = p.status === 'published' ? 'draft' : 'published';
    setBusyId(p._id);
    setActionError(null);
    startTransition(async () => {
      let res;
      if (p._type === 'builder') {
        res = await publishPageStatus(
          p._id,
          {
            status: next,
            publishStartDate: p.publishStartDate ?? null,
            publishEndDate: p.publishEndDate ?? null,
          },
          p.updatedAt,
        );
      } else {
        res = next === 'published'
          ? await publishCustomPage(p._id)
          : await toggleCustomPageStatus(p._id, next);
      }
      if (res?.ok) {
        // publishPageStatus COERCES a publish the actor's tier does not allow
        // rather than erroring (it preserves their other edits). The old
        // action returned an explicit Thai message instead, so say so here
        // rather than let the row quietly snap back to its old badge.
        const applied = res.status ?? next;
        if (applied !== next) {
          setActionError('ต้องมีสิทธิ์ marketing ขึ้นไปเพื่อเผยแพร่/ตั้งเวลา');
        }
        setRows((cur) => cur.map((r) => (rowKey(r) === rowKey(p)
          ? { ...r, status: applied, updatedAt: res.updatedAt ?? r.updatedAt }
          : r)));
      } else {
        setActionError(res?.error ?? 'อัปเดตสถานะไม่สำเร็จ');
      }
      setBusyId(null);
    });
  }

  async function handleDelete(p) {
    setBusyId(p._id);
    setDeleteError(null);
    try {
      const res = p._type === 'builder'
        ? await deletePageBuilderPage(p._id)
        : await deleteCustomPage(p._id);
      if (res?.ok === false) {
        setDeleteError(res.error || 'ลบไม่สำเร็จ');
        return;
      }
      setRows((cur) => cur.filter((r) => rowKey(r) !== rowKey(p)));
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err?.message ?? 'ลบไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  const publishedCount = rows.filter((r) => r.status === 'published').length;

  function editHref(p) {
    return p._type === 'builder'
      ? `/admin/pages/builder/${p._id}/edit`
      : `/admin/pages/${p._id}/edit`;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            จัดการหน้าเพจ
          </h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            ทั้งหมด {rows.length} หน้า · เผยแพร่แล้ว {publishedCount} · แสดง {pageRows.length} จาก {filtered.length} รายการ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-9e-slate-dp-50" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหา title / slug…"
              className="w-64 rounded-9e-md border border-[var(--surface-border)] bg-white py-2 pl-8 pr-3 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-9e-md border border-[var(--surface-border)] bg-white py-2 px-3 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          >
            <option value="all">ทุกประเภท</option>
            <option value="builder">Builder</option>
            <option value="advanced_html">Advanced HTML</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-9e-md border border-[var(--surface-border)] bg-white py-2 px-3 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="published">เผยแพร่แล้ว</option>
            <option value="draft">ฉบับร่าง</option>
          </select>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
          >
            <Plus className="h-4 w-4" /> สร้างหน้าใหม่
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mt-2 rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {actionError}
        </div>
      )}

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c] mt-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="w-8 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">#</th>
              <th className="w-32 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ประเภท</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หัวข้อ / Slug</th>
              <th className="w-32 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">สถานะ</th>
              <th className="w-44 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">แก้ไขล่าสุด</th>
              <th className="w-56 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {rows.length === 0 ? (
                    <>ยังไม่มีหน้าเพจ — กด <strong>สร้างหน้าใหม่</strong> เพื่อเริ่มต้น</>
                  ) : (
                    'ไม่พบหน้าเพจที่ตรงกับการค้นหา'
                  )}
                </td>
              </tr>
            )}
            {pageRows.map((p, i) => {
              const published = p.status === 'published';
              const isBuilder = p._type === 'builder';
              const badge = statusBadge(p.status);
              return (
                <tr
                  key={rowKey(p)}
                  className={
                    'border-b border-[var(--surface-border)] transition-colors last:border-0 ' +
                    (published
                      ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                      : 'opacity-70 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                  }
                >
                  <td className="px-3 py-3 text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
                        (isBuilder
                          ? 'border-9e-action/30 bg-9e-action/10 text-9e-action'
                          : 'border-gray-200 bg-gray-50 text-gray-600')
                      }
                    >
                      {isBuilder ? 'Builder' : 'Advanced HTML'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <p className="line-clamp-1 font-semibold text-9e-navy dark:text-white">
                      {p.title || '(ไม่มีชื่อ)'}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                      /{p.slug || '—'}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ' + badge.cls}>
                      {badge.label}
                    </span>
                    {/* A pending unpublished draft, marked next to the status
                        rather than as a column: the row already says what the
                        PUBLIC sees, and this says the server is holding
                        something it does not. Builder rows only — CustomPage
                        has no draft field, and `isBuilder` gates it rather
                        than a truthiness check on `p.draft`, so a field-name
                        collision on an advanced_html row could never light
                        this up. No query change: the list reads whole
                        documents (getPageBuilderPages has no .select()). */}
                    {isBuilder && p.draft != null && (
                      <span
                        data-testid="pending-draft-dot"
                        title="มีฉบับร่างที่ยังไม่เผยแพร่"
                        className="ml-1.5 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
                      >
                        ฉบับร่างรอเผยแพร่
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                    {formatDate(p.updatedAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {/* Public view — advanced-HTML only; the builder renderer is Phase 2. */}
                      {published && !isBuilder && (
                        <a
                          href={`/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                          aria-label="เปิดดูหน้าเพจ"
                        >
                          <ExternalLink className="h-3 w-3" /> ดู
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(p)}
                        disabled={busyId === p._id}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
                        aria-label={published ? 'ยกเลิกการเผยแพร่' : 'เผยแพร่'}
                      >
                        {published ? (
                          <><EyeOff className="h-3 w-3" /> ซ่อน</>
                        ) : (
                          <><Eye className="h-3 w-3" /> เผยแพร่</>
                        )}
                      </button>
                      <Link
                        href={editHref(p)}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-[var(--surface-border)] px-2 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                        aria-label="แก้ไข"
                      >
                        <Pencil className="h-3 w-3" /> แก้ไข
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDelete(p);
                        }}
                        disabled={busyId === p._id}
                        className="inline-flex items-center gap-1 rounded-9e-sm border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        aria-label="ลบ"
                      >
                        <Trash2 className="h-3 w-3" /> ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pager page={page} totalPages={totalPages} onGo={setPage} />

      {showPicker && (
        <NewPagePicker
          canCreateAdvanced={canCreateAdvanced}
          onClose={() => setShowPicker(false)}
        />
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-page-title"
        >
          <div className="w-full max-w-md rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]">
            <h2 id="delete-page-title" className="text-base font-bold text-9e-navy dark:text-white">
              ยืนยันการลบหน้าเพจ
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

// Two-option "new page" picker. Advanced HTML is legacy raw-HTML and is hidden
// below developer tier (not merely disabled) — an editor never sees the option.
function NewPagePicker({ canCreateAdvanced, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-page-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-9e-lg bg-white p-6 shadow-9e-lg dark:bg-[#111d2c]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-page-title" className="text-base font-bold text-9e-navy dark:text-white">
            สร้างหน้าใหม่
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3">
          <Link
            href="/admin/pages/builder/new"
            className="block rounded-9e-md border border-9e-action bg-9e-action/5 p-4 hover:bg-9e-action/10"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold text-9e-navy dark:text-white">Page Builder</span>
              <span className="rounded-full bg-9e-action px-2 py-0.5 text-[10px] font-bold text-white">แนะนำ</span>
            </div>
            <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
              สร้างหน้าแบบ section-based พร้อม preset ตามแบรนด์ (ค่าเริ่มต้น)
            </p>
          </Link>

          {canCreateAdvanced && (
            <Link
              href="/admin/pages/new"
              className="block rounded-9e-md border border-[var(--surface-border)] p-4 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-9e-navy dark:text-white">Advanced HTML</span>
                <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-500">legacy</span>
              </div>
              <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                หน้าแบบ raw HTML (สำหรับ developer เท่านั้น)
              </p>
            </Link>
          )}
        </div>
      </div>
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
