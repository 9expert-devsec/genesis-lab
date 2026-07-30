'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Pencil,
  Pin,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import {
  deleteArticle,
  moveArticleToPosition,
  repositionArticle,
  setArticlePinBadge,
  toggleArticleActive,
  toggleArticleFeaturedOnLanding,
} from '@/lib/actions/articles';
import { assignArticleRanks } from '@/lib/articleRank';
import { formatSiteDateTime } from '@/lib/articlePublishTime';
import { describeListWindow } from '@/lib/adminListWindow';
import {
  applyPositionPlan,
  isPositioned,
  shouldShowPinBadge,
} from '@/lib/articlePositioning';

// Split into two parts so the "เผยแพร่" column can stack date over time and
// stay inside a w-32 budget instead of forcing a single wide line.
//
// Both halves are pinned to the SITE timezone, not the viewer's. This is a
// client component that Next server-renders first, so bare toLocaleDateString/
// toLocaleTimeString produced the server's zone (UTC on Vercel) on the first
// paint and the browser's zone after hydration — React swaps the text in with
// no warning, so the column could read "31 ก.ค. 01:00" for one frame and
// "30 ก.ค. 18:00" after, for the same document.
function formatDateParts(iso) {
  if (!iso) return { date: '—', time: '' };
  if (!formatSiteDateTime(iso)) return { date: '—', time: '' };
  return {
    date: formatSiteDateTime(iso, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    time: formatSiteDateTime(iso, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export function ArticlesAdminClient({
  articles: initial,
  total: serverTotal = 0,
  reachable: serverReachable = 0,
}) {
  const [rows, setRows] = useState(initial);
  // The COLLECTION size, from countDocuments — not the number of rows fetched.
  // Seeded once from the server payload, exactly like `rows` above, so the two
  // stay in step: both are local mirrors that only this component's mutation
  // handlers move. The delete handler decrements it, or the banner would keep
  // counting a row that no longer exists among the hidden ones.
  const [total, setTotal] = useState(serverTotal);
  // How many of those the admin can actually GET TO from here — see the
  // contract on describeListWindow. Deliberately a prop rather than
  // `rows.length`: today they are equal, but once a pager exists this page will
  // hold 12 rows and be able to reach all 484, and a component that derived
  // this from its own row count would then announce 472 phantom missing
  // articles on every page.
  const [reachable, setReachable] = useState(serverReachable);
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();

  // ── Public-ordering rank ───────────────────────────────────────
  // Computed over `rows` — the COMPLETE set the server handed us — and never
  // over `filtered` or `pageRows`. Pagination here is client-side
  // (`filtered.slice`), so a rank derived from the visible rows would restart
  // at 1 on page 2 and would change whenever someone typed in the search box.
  // Keyed by id and looked up during render instead of being spliced into the
  // row objects, so `rows` stays the plain server payload that every mutation
  // handler already updates.
  const rankById = useMemo(() => {
    const m = new Map();
    for (const a of assignArticleRanks(rows)) {
      m.set(String(a._id), { rank: a.rank, rankBasis: a.rankBasis, pinTie: a.pinTie });
    }
    return m;
  }, [rows]);

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

  // ── Can this list reach everything? ────────────────────────────
  // NOT measured against `filtered` or `pageRows`: those two are the admin's
  // own narrowing, which they chose and can see. `reachable` vs `total` is the
  // drop nobody asked for.
  const listWindow = useMemo(
    () => describeListWindow({ reachable, total }),
    [reachable, total]
  );

  // M — the live size of the positioned block, and the upper bound of every
  // move control. DERIVED from the rows, never a constant: the only positions
  // that exist are 1..M, and a control offering more than that would be offering
  // what the model cannot store.
  const blockSize = useMemo(() => rows.filter(isPositioned).length, [rows]);

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

  /**
   * Every positioning change goes through the same path: the SERVER re-reads the
   * block, runs a planner, applies it in one bulkWrite, and hands the plan back.
   * The plan is then replayed locally so the optimistic state and the persisted
   * state come out of one piece of arithmetic rather than two kept in step.
   *
   * This client used to compute the plan itself and POST it. It does not any
   * more: `rows` is a page-load snapshot, and a move renumbers the WHOLE block,
   * so a plan computed in a tab left open since this morning would write a
   * block-wide renumbering derived from stale data. See the block comment in
   * src/lib/actions/articles.js.
   *
   * `applyPositionPlan` handles MULTI-ROW plans — a move renumbers every row it
   * passes — so this cannot be simplified into "patch the clicked row".
   */
  function runAction(a, call) {
    setBusyId(a._id);
    startTransition(async () => {
      const res = await call();
      if (res?.ok && res.plan) setRows((cur) => applyPositionPlan(cur, res.plan));
      setBusyId(null);
    });
  }

  const handlePromote = (a) => runAction(a, () => repositionArticle(a._id, 'promote'));
  const handleDemote = (a) => runAction(a, () => repositionArticle(a._id, 'demote'));
  const handleMoveTo = (a, target) => runAction(a, () => moveArticleToPosition(a._id, target));
  const handleBadgeToggle = (a) =>
    runAction(a, () =>
      setArticlePinBadge(a._id, !shouldShowPinBadge({ ...a, isPinnedOnArticlePage: true })));

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
      // BOTH counts move, or the banner starts lying in one direction or the
      // other: the deleted article left the collection AND left the set this
      // page can reach. Decrementing only `total` would show it as newly
      // hidden; decrementing only `reachable` would invent a hidden row.
      setTotal((t) => Math.max(0, t - 1));
      setReachable((r) => Math.max(0, r - 1));
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
            {/* `total` — the COLLECTION size from countDocuments. This line used
                to read `rows.length`, i.e. it reported the fetch size as the
                collection size: authoritative, and wrong by 284. */}
            ทั้งหมด {total} บทความ · เข้าถึงได้ {listWindow.reachable} · แสดง {pageRows.length} จาก {filtered.length} รายการ
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

      {/* ── The truncation banner ────────────────────────────────────────────
          THIS is the fix, not the fetch size. The defect class here is a SILENT
          DROP: 284 of 484 articles were absent from this list and absent from
          the search box that filters it, and every surface on the page —
          including the row count in the header — agreed that nothing was wrong.
          A larger window would have moved the cliff, not removed it.

          So the banner is loud, it names the exact number of missing rows, and
          it says outright that the search box cannot reach them, because
          "ไม่พบบทความ" from a search over a truncated set is what convinced an
          admin the article had been deleted. It is `role="alert"` rather than
          decorative styling so it is announced.

          IT MUST OUTLIVE THIS FETCH. Server-side pagination makes every row
          reachable, so this banner goes SILENT rather than firing on every page
          — that is the correct behaviour, not a reason to delete it. It stays
          because the NEXT surface that cannot reach part of its collection (a
          capped filter, a partial fetch, a search that only covers one page)
          gets the same treatment instead of a second silent drop. */}
      {listWindow.truncated && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-3 rounded-9e-md border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-500 dark:bg-amber-950/40"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-bold text-amber-900 dark:text-amber-200">
              รายการนี้ไม่ครบ — ซ่อนอยู่ {listWindow.hidden} บทความ
            </p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              หน้านี้เข้าถึงได้เพียง {listWindow.reachable} จากทั้งหมด {listWindow.total} บทความ
              และช่องค้นหาด้านบนกรองเฉพาะ {listWindow.reachable} รายการที่เข้าถึงได้เท่านั้น
              — บทความอีก {listWindow.hidden} รายการจึงค้นหาไม่พบที่นี่ ไม่ว่าจะเปลี่ยนหน้าอย่างไรก็ตาม
              แม้จะยังมีอยู่จริงและแสดงบนหน้าเว็บตามปกติ
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c] mt-2">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th
                className="w-24 px-3 py-3 text-left font-bold text-9e-navy dark:text-white"
                title="ลำดับจริงบนหน้า /articles — นับจากบทความทั้งหมด ไม่ใช่เฉพาะหน้านี้"
              >
                ลำดับบน /articles
              </th>
              <th className="w-16 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">ภาพ</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">หัวข้อ / Slug</th>
              <th className="hidden w-28 px-3 py-3 text-left font-bold text-9e-navy dark:text-white xl:table-cell">ประเภท</th>
              <th className="w-40 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Tags</th>
              <th className="hidden w-28 px-3 py-3 text-left font-bold text-9e-navy dark:text-white xl:table-cell">ผู้เขียน</th>
              <th className="w-32 px-3 py-3 text-left font-bold text-9e-navy dark:text-white">เผยแพร่</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Active</th>
              {/* The tooltip used to end with a parenthetical insisting that
                  position and badge were two different things. It existed only
                  to talk the reader out of a conclusion the UI itself was
                  inviting — the rank column was drawing the badge's pin and
                  saying the badge's noun. With the vocabularies now disjoint
                  that clause defends against nothing, so it is gone; the
                  description of what each zone does stays, because that is
                  useful either way. A tooltip whose job is to explain why the
                  UI is confusing is the signal to change the UI. */}
              <th
                className="w-48 px-3 py-3 text-left font-bold text-9e-navy dark:text-white"
                title="ตำแหน่ง = ย้ายบทความขึ้นบล็อกบนสุด · ป้าย = แสดงหมุดบนการ์ด"
              >
                ตำแหน่ง / ป้าย
              </th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Landing</th>
              <th className="w-20 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                {/* Stays 11: ประเภท/ผู้เขียน are hidden with `hidden xl:table-cell`,
                    never unmounted, so the header always has 11 <th> to span. */}
                <td colSpan={11} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {rows.length === 0 ? (
                    <>ยังไม่มีบทความ — กด <strong>สร้างบทความ</strong> เพื่อเริ่มต้น</>
                  ) : (
                    'ไม่พบบทความที่ตรงกับการค้นหา'
                  )}
                </td>
              </tr>
            )}
            {pageRows.map((a) => (
              <tr
                key={a._id}
                className={
                  'border-b border-[var(--surface-border)] transition-colors last:border-0 ' +
                  (a.active
                    ? 'hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40'
                    : 'opacity-60 hover:bg-gray-50 dark:hover:bg-[#0D1B2A]/30')
                }
              >
                <td className="px-3 py-3">
                  <RankCell info={rankById.get(String(a._id))} pinOrder={a.pinOrder} />
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
                  {/* Below xl the ประเภท / ผู้เขียน columns are collapsed — the
                      same two values surface here so nothing is lost. */}
                  <p className="mt-0.5 truncate text-xs text-9e-slate-dp-50 dark:text-[#94a3b8] xl:hidden">
                    {a.articleType === 'video' ? 'วิดีโอ' : 'บทความ'} · {a.author || '—'}
                  </p>
                </td>
                <td className="hidden px-3 py-3 xl:table-cell">
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
                    {(a.tags ?? []).slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#0D1B2A]"
                      >
                        {t}
                      </span>
                    ))}
                    {(a.tags?.length ?? 0) > 2 && (
                      <span className="text-[11px] text-9e-slate-dp-50">
                        +{a.tags.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden px-3 py-3 text-xs text-9e-navy dark:text-white xl:table-cell">
                  <span className="block max-w-[5.5rem] truncate" title={a.author || undefined}>
                    {a.author || '—'}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {(() => {
                    const { date, time } = formatDateParts(a.publishedAt);
                    return (
                      <>
                        <span className="block">{date}</span>
                        {time && (
                          <span className="block text-9e-slate-dp-50 dark:text-[#94a3b8]">
                            {time}
                          </span>
                        )}
                      </>
                    );
                  })()}
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
                <td className="px-3 py-3">
                  <PositionCell
                    article={a}
                    busy={busyId === a._id}
                    blockSize={blockSize}
                    onPromote={() => handlePromote(a)}
                    onDemote={() => handleDemote(a)}
                    onMoveTo={(target) => handleMoveTo(a, target)}
                    onBadgeToggle={() => handleBadgeToggle(a)}
                  />
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
                      <Pencil className="h-3 w-3" />
                      {/* Icon-only below xl; the aria-label above keeps it named. */}
                      <span className="hidden xl:inline">แก้ไข</span>
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
                      <Trash2 className="h-3 w-3" />
                      <span className="hidden xl:inline">ลบ</span>
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

/**
 * Position and badge — two concerns that used to be one checkbox.
 *
 * ── LAYOUT ──────────────────────────────────────────────────────────────────
 * Three controls do not fit as three peer icons in a narrow column: they would
 * read as three settings of one thing, which is exactly the confusion this
 * commit exists to remove. So the cell is split into TWO LABELLED ZONES with a
 * hairline between them — ตำแหน่ง (what moves the article) above, ป้าย (what
 * decorates it) below — and the column is widened from w-24 to w-48 to hold
 * them. Two zones, not three, because the order number is not a third concern:
 * it only exists once an article is positioned, so it lives inside the position
 * zone and is absent otherwise.
 *
 * ── TELLING THE TWO TOGGLES APART WITHOUT A TOOLTIP ──────────────────────────
 * They are deliberately not the same kind of control:
 *   position → a BUTTON with a DIRECTIONAL ARROW and a text label
 *              (↑ จัดตำแหน่ง / ↓ ปลดตำแหน่ง). Arrows mean movement.
 *   badge    → a SWITCH carrying the PIN GLYPH, no direction, no movement.
 * Different shape, different icon family, different verb. A reader scanning the
 * column sees "button with an arrow" versus "switch with a pin".
 *
 * ── THE MODEL'S LIMIT IS RESPECTED HERE (b-005) ─────────────────────────────
 * A date-ordered row gets a PROMOTE BUTTON and nothing else. The list is two
 * contiguous blocks, so the only positions that EXIST are 1..M where M is the
 * live block size. "Position 12" is not a thing when the block holds 10 —
 * ranks 11+ belong to the date-ordered mass and cannot be assigned, because
 * expressing them would need empty slots between the blocks, i.e. a
 * fixed-slot model the schema does not have.
 *
 * That is why the free `<input type="number">` is GONE. It let an admin type
 * any integer into one row while the action wrote it without looking at the
 * others, so duplicates and gaps were a normal thing to type — production ended
 * up holding 1,1,2,3,4,5,6,7,9,10. A duplicate is not cosmetic: the cascade
 * falls through to publishedAt, so the number the admin typed stops deciding the
 * position, and because the tie eats two slots the box and the ลำดับ column
 * legitimately disagree.
 *
 * Its replacement is two BOUNDED controls, both routed through
 * planMoveToPosition, which re-emits the whole block as contiguous 1..M:
 *
 *   ↑ / ↓        one step, disabled at the ends
 *   ย้ายไปลำดับ   a select of exactly 1..M — the answer to "move this from 10
 *                to 5" in one action instead of five clicks
 *
 * M is passed in from the live row set, never hardcoded. Do NOT reintroduce a
 * free text field alongside these: the point is not that typing is inconvenient,
 * it is that duplicates and gaps become unrepresentable.
 */
function PositionCell({ article, busy, blockSize, onPromote, onDemote, onMoveTo, onBadgeToggle }) {
  const positioned = article.isPinnedOnArticlePage === true;
  const badgeOn = article.showPinBadge !== false;

  const M = Math.max(0, Number(blockSize) || 0);
  const at = Number(article.pinOrder) || 0;
  const atTop = at <= 1;
  const atBottom = at >= M;

  return (
    <div className="flex flex-col gap-2">
      {/* ── zone 1: position ── */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ตำแหน่ง
        </p>
        {positioned ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              {/* ±1. Disabled at the ends rather than hidden, so the control
                  does not reflow as an article moves through the block. */}
              <button
                type="button"
                onClick={() => onMoveTo(at - 1)}
                disabled={busy || atTop}
                aria-label={`เลื่อนขึ้นหนึ่งลำดับ (ปัจจุบันลำดับ ${at})`}
                title="เลื่อนขึ้นหนึ่งลำดับ"
                className="inline-flex h-6 w-6 items-center justify-center rounded-9e-sm border border-[var(--surface-border)] text-9e-navy hover:bg-9e-ice disabled:opacity-30 dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onMoveTo(at + 1)}
                disabled={busy || atBottom}
                aria-label={`เลื่อนลงหนึ่งลำดับ (ปัจจุบันลำดับ ${at})`}
                title="เลื่อนลงหนึ่งลำดับ"
                className="inline-flex h-6 w-6 items-center justify-center rounded-9e-sm border border-[var(--surface-border)] text-9e-navy hover:bg-9e-ice disabled:opacity-30 dark:text-white dark:hover:bg-[#0D1B2A]"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              {/* Exactly 1..M. Not a text field — see the note above. */}
              <select
                value={at}
                onChange={(e) => onMoveTo(Number(e.target.value))}
                disabled={busy || M <= 1}
                aria-label="ย้ายไปลำดับ"
                title={`ย้ายไปลำดับ (1–${M})`}
                className="rounded border border-[var(--surface-border)] bg-white px-1 py-0.5 text-xs text-9e-navy disabled:opacity-50 dark:bg-[#0D1B2A] dark:text-white"
              >
                {Array.from({ length: M }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={onDemote}
              disabled={busy}
              className="inline-flex items-center gap-1 self-start whitespace-nowrap rounded-9e-sm border border-[var(--surface-border)] px-1.5 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice disabled:opacity-50 dark:text-white dark:hover:bg-[#0D1B2A]"
            >
              <ArrowDownToLine className="h-3 w-3" />
              {/* Not a bare `ปลด` — with position and badge now spelled
                  differently everywhere else, an unqualified verb here is the
                  one control left that does not say WHICH of the two it
                  releases. */}
              ปลดตำแหน่ง
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPromote}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-9e-sm border border-9e-action px-2 py-1 text-[11px] font-medium text-9e-action hover:bg-9e-action/10 disabled:opacity-50"
          >
            <ArrowUpToLine className="h-3 w-3" />
            จัดตำแหน่ง
          </button>
        )}
      </div>

      {/* ── zone 2: badge ── */}
      <div className="border-t border-[var(--surface-border)] pt-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ป้าย
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={badgeOn}
            onClick={onBadgeToggle}
            disabled={busy}
            aria-label={badgeOn ? 'ซ่อนป้ายหมุด' : 'แสดงป้ายหมุด'}
            className={`relative h-4 w-8 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              badgeOn ? 'bg-9e-action' : 'bg-gray-300 dark:bg-[#1e3a5f]'
            }`}
          >
            <span
              className={`absolute top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white shadow transition-all ${
                badgeOn ? 'left-4' : 'left-0.5'
              }`}
            >
              <Pin className="h-2 w-2 text-9e-action" strokeWidth={3} />
            </span>
          </button>
          {/* Badge-without-position is ALLOWED and stored, but has no public
              effect — shouldShowPinBadge gates on positioning too. Say so here
              rather than disabling the switch: demoting must not silently erase
              a badge preference the admin set, and they may reasonably set it
              before promoting. */}
          {!positioned && badgeOn && (
            <span className="text-[10px] leading-tight text-amber-600">
              จะแสดงเมื่อจัดตำแหน่งแล้ว
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The article's position on /articles.
 *
 * A bare number would read identically for two different claims: "someone put
 * this here" and "this is simply the Nth most recent article". The three states
 * are given three different SHAPES, not three shades of the same one — a solid
 * pill with an arrow, plain muted text, or no number at all — so the difference
 * survives a glance down the column:
 *
 *   manual            solid brand pill + ↑ glyph — a chosen position
 *   manual, tied      solid AMBER pill + ↑ glyph — a chosen position that is
 *                     not actually being honoured: another positioned article
 *                     holds the same pinOrder, so `publishedAt` broke the tie
 *                     and the number the admin typed did not decide this spot
 *   by date           plain muted number, no pill, labelled ตามวันที่
 *   not published     no number at all — an inactive article is absent from
 *                     /articles, so it HAS no position, and inventing one would
 *                     also shift every real rank
 *
 * ── THIS COLUMN DOES NOT SPEAK THE BADGE'S VOCABULARY (b-004) ───────────────
 * `isPinnedOnArticlePage` (has a manual POSITION) and `showPinBadge` (draws the
 * pin BADGE on the public card) were split into two independent fields, and the
 * ป้าย switch in PositionCell owns the badge. This cell keys off `rankBasis`,
 * i.e. POSITION — so when it drew a Pin glyph and the word ปักหมุด it was using
 * the badge's icon and the badge's noun to report something else entirely. An
 * admin who switched ป้าย off saw a pin still sitting in this column and read
 * it as "I removed the pin and it is still there".
 *
 * So: the pin glyph and the word หมุด belong to the badge and nowhere else. The
 * arrow here is deliberately the SAME glyph as the จัดตำแหน่ง button that
 * creates this state, so the pill reads as the result of that button. The
 * labels are a matched pair — กำหนดเอง / ตามวันที่ — which is the actual
 * question this column answers: did someone choose this spot, or did the date?
 * test/fs/adminRankVocabulary.test.mjs holds the boundary.
 */
function RankCell({ info, pinOrder }) {
  if (!info || info.rank == null) {
    return (
      <div className="text-9e-slate-dp-50 dark:text-[#94a3b8]">
        <span className="text-sm">—</span>
        <span className="block text-[10px] leading-tight">ไม่เผยแพร่</span>
      </div>
    );
  }

  if (info.rankBasis === 'pinned') {
    const tie = info.pinTie;
    return (
      <div>
        <span
          className={
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white ' +
            (tie ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-9e-action')
          }
          title={
            tie
              ? `กำหนดตำแหน่งไว้ที่ลำดับ ${pinOrder ?? 0} — แต่มีบทความอื่นใช้ลำดับเดียวกัน ตำแหน่งจริงจึงตัดสินด้วยวันที่เผยแพร่`
              : `ตำแหน่งที่กำหนดเอง — กำหนดตำแหน่งไว้ที่ลำดับ ${pinOrder ?? 0}`
          }
        >
          {/* The glyph from the จัดตำแหน่ง button, not the badge's pin. */}
          <ArrowUpToLine className="h-3 w-3" strokeWidth={2.5} />
          {info.rank}
        </span>
        <span
          className={
            'block text-[10px] leading-tight ' +
            (tie ? 'font-medium text-amber-600' : 'text-9e-action')
          }
        >
          {/* `ลำดับซ้ำ` IS NOW A CORRUPTION TRIPWIRE, NOT A NORMAL STATE.
              The free number input that made ties reachable is gone; every
              position now goes through planMoveToPosition, which re-emits the
              block as contiguous 1..M, so no sequence of admin actions can
              produce a duplicate. If this pill ever appears, something wrote
              pinOrder outside the planner — a stray script, a restored backup,
              a hand edit in Compass — and the number in the control has stopped
              deciding the position it claims to.
              Kept deliberately: an unreachable branch that fires is a signal,
              and deleting it would trade a visible symptom for a silent one.
              Do not invest further in it; test/render keeps it honest. */}
          {tie ? 'ลำดับซ้ำ' : 'กำหนดเอง'}
        </span>
      </div>
    );
  }

  return (
    <div className="text-9e-slate-dp-50 dark:text-[#94a3b8]">
      <span className="text-sm tabular-nums" title="ตำแหน่งนี้มาจากวันที่เผยแพร่ ไม่ได้กำหนดเอง">
        {info.rank}
      </span>
      <span className="block text-[10px] leading-tight">ตามวันที่</span>
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
