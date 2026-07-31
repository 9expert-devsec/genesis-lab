'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import {
  deleteArticle,
  moveArticleOneStep,
  moveArticleToBlockTop,
  moveArticleToRank,
  toggleArticleActive,
  toggleArticleFeaturedOnLanding,
} from '@/lib/actions/articles';
import { assignArticleRanks } from '@/lib/articleRank';
import { formatSiteDateTime } from '@/lib/articlePublishTime';
import { describeListWindow } from '@/lib/adminListWindow';
// `describeRankTarget` is a DESCRIBER, not a plan builder. The client renders
// its warning; the server refuses with the same sentence. No plan builder is
// imported here and none may be — see test/fs/articlePinOrderWrites and
// test/fs/adminRankVocabulary.
import { STEP_REFUSALS, describeAllOrderControls, describeRankTarget } from '@/lib/articleOrdering';
// `Pin` and `shouldShowPinBadge` left with the ป้าย switch. The badge is now
// set in ONE place — the article edit screen — and this list neither reads nor
// writes it. `applyPositionPlan` stays: it replays the plan the server returns.
import { applyPositionPlan } from '@/lib/articlePositioning';

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

  // The highest rank in the COLLECTION — the upper bound of every rank input on
  // the page. Derived from the ranks the ranker just produced, never a constant
  // and never `rows.length`: an inactive article holds no rank, so the row count
  // would offer numbers no article can hold and the input would promise targets
  // the server refuses.
  const maxRank = useMemo(() => {
    let m = 0;
    for (const v of rankById.values()) if (v.rank != null && v.rank > m) m = v.rank;
    return m;
  }, [rankById]);

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

  // What each row's three ordering controls should look like.
  //
  // DERIVED FROM THE PLANNERS, over the COMPLETE row set — never over `filtered`
  // or `pageRows`. The neighbour that decides whether an arrow is live is the
  // neighbour in the COLLECTION, and this list is paged twelve at a time and
  // filtered by a search box, so the row above another on screen is routinely
  // not the row above it in the ordering. Deriving from the visible rows would
  // grey out the arrows on the first and last row of every page.
  //
  // This is DISPLAY ONLY. The server re-reads and re-plans on every click, and
  // its refusal — not this disabled attribute — is what actually enforces
  // anything. They agree because both come out of describeOrderControls.
  // ONE sort for the whole list, not one per row per control: the single-row
  // form measured 244 ms over 486 articles here, in a memo that reruns after
  // every click.
  const controlsById = useMemo(() => describeAllOrderControls(rows), [rows]);

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

  const handleStep = (a, direction) => runAction(a, () => moveArticleOneStep(a._id, direction));
  const handleToTop = (a) => runAction(a, () => moveArticleToBlockTop(a._id));
  const handleRank = (a, rank) => runAction(a, () => moveArticleToRank(a._id, rank));

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
                ลำดับ
              </th>
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
                  saying the badge's noun. A tooltip whose job is to explain why
                  the UI is confusing is the signal to change the UI.

                  It then described TWO zones, ลำดับ and ป้าย, because the cell
                  held both. The ป้าย switch has moved to the article edit
                  screen, so the second half described a control that is not
                  here — the same defect one step further on, since a tooltip
                  naming a switch nobody can find is worse than no tooltip. What
                  is left says what this column does, and where the badge went,
                  so the answer to "where is the ป้าย toggle" is on the screen
                  that used to have it. */}
              <th
                className="w-48 px-3 py-3 text-left font-bold text-9e-navy dark:text-white"
                title="เลื่อนบทความขึ้นหรือลงทีละหนึ่ง หรือย้ายขึ้นบนสุดของกลุ่ม · การปักหมุดและป้ายหมุดตั้งค่าที่หน้าแก้ไขบทความ"
              >
                จัดลำดับ
              </th>
              <th className="w-20 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Home</th>
              <th className="w-20 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                {/* 10, counted from the header row, not from what is visible:
                    ประเภท/ผู้เขียน are hidden with `hidden xl:table-cell` and are
                    never unmounted, so the header always has 10 <th> to span.
                    Was 11 until the cover-image column was removed. */}
                <td colSpan={10} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
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
                  <RankCell info={rankById.get(String(a._id))} />
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
                  <OrderCell
                    busy={busyId === a._id}
                    controls={controlsById.get(String(a._id))}
                    tie={rankById.get(String(a._id))?.pinTie === true}
                    rank={rankById.get(String(a._id))?.rank ?? null}
                    maxRank={maxRank}
                    // Bound to `rows` — the COMPLETE set — not to `pageRows`.
                    // Same reason the arrows are: the collection decides, not
                    // the twelve rows on screen.
                    describeRank={(target) => describeRankTarget(rows, a._id, target)}
                    onStep={(direction) => handleStep(a, direction)}
                    onToTop={() => handleToTop(a)}
                    onRank={(rank) => handleRank(a, rank)}
                  />
                </td>
                <td className="px-3 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(a)}
                    disabled={busyId === a._id}
                    aria-label={a.featuredOnLanding ? 'ยกเลิกการแสดงบนหน้าแรก (Home)' : 'แสดงบนหน้าแรก (Home)'}
                    title={a.featuredOnLanding ? 'แสดงบนหน้าแรก (Home) แล้ว' : 'แสดงบนหน้าแรก (Home)'}
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
 * Why an ordering control is dead, in the admin's language.
 *
 * A disabled control with no explanation is indistinguishable from a broken one,
 * and two of these three reasons are things nobody would guess: "the row above
 * you is in the pinned group" and "this row is carrying corrupt data". The
 * reason CODES come from src/lib/articleOrdering.js — the same values the server
 * action refuses with — so the sentence on screen and the sentence in the error
 * response cannot describe different situations.
 */
function refusalText(reason, direction) {
  if (reason === STEP_REFUSALS.PIN_BOUNDARY) {
    return direction === 'up'
      ? 'เหนือขึ้นไปเป็นบทความที่ปักหมุดไว้ — ถ้าต้องการขึ้นไปอยู่กลุ่มนั้น ให้ปักหมุดที่หน้าแก้ไขบทความ'
      : 'ถัดลงไปเป็นบทความที่ไม่ได้ปักหมุด — ถ้าต้องการออกจากกลุ่มปักหมุด ให้เลิกปักหมุดที่หน้าแก้ไขบทความ';
  }
  if (reason === STEP_REFUSALS.STRAY_PIN_ORDER) {
    return 'บทความนี้มีลำดับปักหมุดค้างอยู่ทั้งที่ไม่ได้ปักหมุด จึงเลื่อนไม่ได้ — รัน normalize:positions เพื่อซ่อม';
  }
  if (reason === STEP_REFUSALS.ALREADY_TOP) return 'อยู่บนสุดของกลุ่มนี้แล้ว';
  return direction === 'up' ? 'อยู่บนสุดของรายการแล้ว' : 'อยู่ล่างสุดของรายการแล้ว';
}

/**
 * What "to the top" actually delivers, said out loud.
 *
 * For a pinned row it is position 1 and the label is honest as written. For an
 * unpinned row it is the top of the NORMAL ordering, which is NOT position 1 —
 * the pinned group sits above it, so with five pinned articles the row lands at
 * position 6. The old copy promised the top of the page and the model never
 * delivered it; b-004 was exactly this, the data changing while the words did
 * not, so the number is derived from the live pinned count rather than written
 * into a string.
 */
function toTopTitle({ pinned, pinnedCount }) {
  if (pinned) return 'ย้ายขึ้นบนสุดของกลุ่มปักหมุด (ลำดับที่ 1)';
  if (pinnedCount === 0) return 'ย้ายขึ้นบนสุดของรายการ (ลำดับที่ 1)';
  return `ย้ายขึ้นบนสุดของลำดับปกติ — จะอยู่ลำดับที่ ${pinnedCount + 1} เพราะมีบทความปักหมุดอยู่ ${pinnedCount} รายการเหนือขึ้นไป`;
}

/**
 * Ordering and badge — two concerns that used to be one checkbox.
 *
 * ── EVERY ROW GETS THE CONTROLS. THAT IS THE ENTIRE POINT ───────────────────
 * There is no จัดตำแหน่ง button any more and nothing to switch on first. Every
 * article carries its own `sortKey`, so every article can be moved. What used to
 * be a two-step affordance — promote it into a block, then order it inside that
 * block — is now one step, on all 486 rows.
 *
 * ── THE ป้าย ZONE IS GONE, AND WITH IT THE LABELS ───────────────────────────
 * This cell used to hold TWO labelled zones with a hairline between them: ลำดับ
 * (what moves the article) above, ป้าย (what decorates it) below. The labels
 * existed for exactly one reason — to stop three peer icons in a narrow column
 * reading as three settings of one thing — so when the badge switch left, the
 * thing the labels were disambiguating left with it and they went too. One
 * concept, one group of controls, no header inside a cell whose column header
 * already says จัดลำดับ.
 *
 * The badge now has ONE control, on the article edit screen, beside the pin
 * toggle it depends on (`shouldShowPinBadge` gates the badge on the pinned
 * state, so the two belong together and were a scroll apart). Having it here as
 * well was the residue of the era when position and badge were one field: it
 * put a per-document decoration switch twelve to a page, next to arrows that
 * exist to be clicked repeatedly, which is how a misclick on the wrong control
 * gets cheap and frequent.
 *
 * WHAT STAYED, and neither is the badge: the อยู่กลุ่มปักหมุด pill, which is
 * why the boundary arrow is dead and is about ORDERING; and the ลำดับซ้ำ
 * tripwire. See their own notes below.
 *
 * ── THERE IS A NUMBER INPUT AGAIN, AND WHAT MAKES THIS ONE SAFE ─────────────
 * This block used to be headed "WHY THERE IS NO NUMBER INPUT" and to end with
 * "fixed-slot targeting is not coming back". It came back. Rewriting the note
 * rather than leaving it is the point: an authoritative comment that contradicts
 * the component it sits on is worse than no comment, and this file's own history
 * (b-004, and the tooltip that existed to argue the UI was not confusing) is
 * what that costs.
 *
 * The objection was never "a number is a bad way to say where something goes".
 * It was three specific things, and each has an answer now:
 *
 *   1. THE OLD FREE FIELD WROTE WHAT IT WAS GIVEN. `updateArticlePinOrder` took
 *      an integer and stored it, with no view of the other rows, so duplicates
 *      and gaps were a normal thing to type — production held
 *      1,1,2,3,4,5,6,7,9,10. HERE THE NUMBER NEVER REACHES THE DATABASE. It is
 *      posted to `moveArticleToRank`, which RE-READS the collection, resolves
 *      the rank to the row currently holding it, and hands that row's position
 *      to a planner. The client cannot supply a value that is persisted; the
 *      structural guard is test/fs/articlePinOrderWrites.
 *   2. THE REPLACEMENT WAS A SELECT OF 1..M. Coherent while M was the pinned
 *      block of five; not a control at 486 options. An input does not grow.
 *   3. A SLOT IS NOT A RANK. The retired action took a position; this takes the
 *      NUMBER THE COLUMN IS SHOWING, which counts active articles only. One
 *      inactive row above and the two differ — see the block comment on
 *      planMoveToRank.
 *
 * And the behaviour that makes it safe rather than merely convenient: a target
 * across the pinned boundary is REFUSED, not half-applied, and an out-of-range
 * number is REFUSED RATHER THAN CLAMPED. The warning under the input comes from
 * `describeRankTarget`, which is the same function the server refuses with — so
 * there is no second condition here that could drift from the action and leave a
 * live-looking input that silently does nothing.
 *
 * The arrows stay. They are still the right control for nudging, and they are
 * the only one that needs no arithmetic from the person using it.
 *
 * ── THE INPUT TARGETS TRUE RANKS, NOT THE VISIBLE PAGE ──────────────────────
 * With the search box filled or on page 2, committing a rank can make the row
 * appear to jump somewhere unexpected or vanish from view entirely — because
 * the number means its position in the WHOLE collection, and the visible list is
 * a filtered, paginated window onto that. This is stated rather than fixed: it
 * was already true and already accepted for the arrows (which plan against true
 * neighbours for the same reason), and the alternative — ranking within the
 * filtered view — would mean a number that changes meaning as you type in the
 * search box.
 *
 * ── THE DISABLED STATES ARE DERIVED, NOT RE-DERIVED ─────────────────────────
 * `controls` comes from describeOrderControls, which computes each button's
 * state by RUNNING THE PLANNER the server action will run. A second set of
 * conditions written here would eventually disagree with it, and the symptom
 * would be a live-looking button that silently does nothing — the exact class of
 * defect this round closes.
 */
function OrderCell({ busy, controls, tie, rank, maxRank, describeRank, onStep, onToTop, onRank }) {
  // `null` means "not being edited": the box shows the row's live rank and
  // follows it as the list changes. A string means the admin is typing, and
  // from then until Enter / blur / Escape the box shows exactly what they typed
  // — including something the server would refuse, because hiding it would be
  // the input silently correcting a claim.
  const [draft, setDraft] = useState(null);
  const editing = draft !== null;
  const seen = editing ? describeRank(draft) : null;
  const warning = seen?.message ?? null;

  function commit() {
    if (!editing) return;
    // Refuse HERE with the sentence already on screen. Not a second condition —
    // `seen` came out of describeRankTarget, which is what the action refuses
    // with, so this cannot reject something the server would allow or submit
    // something it would not.
    if (warning) return;
    if (seen?.noop) { setDraft(null); return; }
    const value = draft;
    setDraft(null);
    onRank(value);
  }

  const c = controls ?? {
    position: null, pinned: false, pinnedCount: 0,
    up: { enabled: false, reason: null },
    down: { enabled: false, reason: null },
    top: { enabled: false, reason: null },
  };

  const arrow = (direction, spec, Glyph) => (
    <button
      type="button"
      onClick={() => onStep(direction)}
      disabled={busy || !spec.enabled}
      aria-label={
        direction === 'up'
          ? `เลื่อนขึ้นหนึ่งลำดับ (ปัจจุบันลำดับ ${c.position ?? '—'})`
          : `เลื่อนลงหนึ่งลำดับ (ปัจจุบันลำดับ ${c.position ?? '—'})`
      }
      title={spec.enabled
        ? (direction === 'up' ? 'เลื่อนขึ้นหนึ่งลำดับ' : 'เลื่อนลงหนึ่งลำดับ')
        : refusalText(spec.reason, direction)}
      className="inline-flex h-6 w-6 items-center justify-center rounded-9e-sm border border-[var(--surface-border)] text-9e-navy hover:bg-9e-ice disabled:opacity-30 dark:text-white dark:hover:bg-[#0D1B2A]"
    >
      <Glyph className="h-3 w-3" />
    </button>
  );

  return (
    /* ── the ordering controls ──
       ONE group now. This used to be `zone 1` of two; the guards in
       test/fs/adminRankVocabulary.test.mjs slice on this marker, so if it moves,
       re-point them — they throw naming the anchor rather than passing on an
       empty slice. */
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {/* Disabled at the ends rather than hidden, so the cell does not
            reflow as an article moves through the list. */}
        {arrow('up', c.up, ChevronUp)}
        {arrow('down', c.down, ChevronDown)}
        <button
          type="button"
          onClick={onToTop}
          disabled={busy || !c.top.enabled}
          aria-label="ย้ายขึ้นบนสุด"
          title={c.top.enabled ? toTopTitle(c) : refusalText(c.top.reason, 'up')}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-9e-sm border border-[var(--surface-border)] px-1.5 py-1 text-[11px] font-medium text-9e-navy hover:bg-9e-ice disabled:opacity-30 dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <ArrowUpToLine className="h-3 w-3" />
          ขึ้นบนสุด
        </button>
        {/* min and max are DERIVED from the live collection — `maxRank` is the
            highest rank the ranker just produced. Hardcoding either would let
            the box offer a number the server refuses, which is the same
            live-looking-control defect the disabled arrows exist to avoid.
            An inactive row has no rank at all, so the box is disabled and says
            why rather than accepting a number that cannot mean anything. */}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={maxRank}
          value={editing ? draft : (rank ?? '')}
          disabled={busy || rank == null}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); }
            // Escape ABANDONS: back to the row's real rank, nothing sent. A
            // half-typed number left in the box after the admin gave up would
            // be committed by the next blur.
            if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
          }}
          onBlur={commit}
          aria-label={rank == null ? 'ระบุลำดับไม่ได้' : `ระบุลำดับ (ปัจจุบันลำดับ ${rank} จาก ${maxRank})`}
          title={rank == null
            ? 'บทความนี้ยังไม่เผยแพร่ จึงไม่มีลำดับบนหน้า /articles'
            : `พิมพ์ลำดับที่ต้องการ (1–${maxRank}) แล้วกด Enter · กด Esc เพื่อยกเลิก`}
          className="h-6 w-14 rounded-9e-sm border border-[var(--surface-border)] bg-white px-1 text-center text-[11px] tabular-nums text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action disabled:opacity-30 dark:bg-[#0D1B2A] dark:text-white"
        />
      </div>
      {/* THE WARNING IS THE SERVER'S OWN SENTENCE, rendered as the admin types.
          There is deliberately no second condition in this component: whatever
          describeRankTarget says here is what moveArticleToRank will say back,
          so the input cannot offer a number the action rejects. Amber rather
          than red because nothing has failed yet — the admin is mid-thought. */}
      {warning && (
        <span className="w-40 text-[10px] leading-tight text-amber-600" role="status">
          {warning}
        </span>
      )}
      {/* WHY the boundary arrow is dead. Without this the disabled ↑ on the
          first unpinned row looks like a bug, and the pinned group is
          otherwise invisible in this column now that the rank cell is a
          plain number. Says กลุ่มปักหมุด rather than a bare ปักหมุด so it
          reads as "which group this row is in" — a statement about ORDERING,
          which is why it stayed when the badge switch did not. */}
      {c.pinned && (
        <span className="inline-flex w-fit items-center rounded-full bg-9e-action/10 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-9e-action">
          อยู่กลุ่มปักหมุด
        </span>
      )}
      {/* `ลำดับซ้ำ` IS A CORRUPTION TRIPWIRE, NOT A NORMAL STATE, and it
          moved here from the rank column when that column became a plain
          number. Duplicate pinOrder values are unreachable through this UI —
          every pinned move goes through planMoveToPosition, which re-emits
          the block as contiguous 1..M — so if this pill ever appears,
          something wrote pinOrder outside the planner: a restored backup, a
          hand edit in Compass, a stray script. Kept deliberately: an
          unreachable branch that fires is a signal, and deleting it trades a
          visible symptom for a silent one. Do not invest further in it. */}
      {tie && (
        <span
          className="inline-flex w-fit items-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-white"
          title="มีบทความอื่นใช้ลำดับปักหมุดเดียวกัน ตำแหน่งจริงจึงตัดสินด้วยลำดับปกติแทน"
        >
          ลำดับซ้ำ
        </span>
      )}
    </div>
  );
}

/**
 * The article's position on /articles. A number, and nothing else.
 *
 * ── WHY THE กำหนดเอง / ตามวันที่ PAIR IS GONE ───────────────────────────────
 * That pair answered a real question while it had two possible answers: did
 * someone CHOOSE this spot, or did the publish date decide it? Both states
 * existed because only articles in the pinned block had a chosen position and
 * everything else fell back to `publishedAt`.
 *
 * Every article now carries its own `sortKey` and every article can be moved, so
 * the question has exactly one answer for all 486 rows and a label reporting it
 * is noise that reads as information. Worse, it would be WRONG for the common
 * case: a row nobody has ever touched still has a chosen position in the sense
 * the label meant — the backfill chose it. The labels went with the distinction
 * they described.
 *
 * The pinned group has not disappeared, it moved to where it is actionable: the
 * ลำดับ zone in OrderCell, beside the arrow it explains being disabled.
 *
 * ── THIS COLUMN STILL DOES NOT SPEAK THE BADGE'S VOCABULARY (b-004) ─────────
 * The original defect was this column drawing a `<Pin>` glyph and the word
 * ปักหมุด to report POSITION, while the ป้าย switch owned the badge — so an
 * admin who turned the badge off saw a pin still sitting here and read it as "I
 * removed the pin and it is still there". A plain number cannot reproduce that,
 * and it must not acquire the vocabulary back: `isPinnedOnArticlePage` now
 * genuinely means pinned, which makes หมุด MORE tempting here, not less.
 * test/fs/adminRankVocabulary.test.mjs holds the boundary.
 *
 * `rank: null` — an inactive article is absent from /articles, so it HAS no
 * position. Inventing one would also shift every real rank.
 */
function RankCell({ info }) {
  if (!info || info.rank == null) {
    return (
      <div className="text-9e-slate-dp-50 dark:text-[#94a3b8]">
        <span className="text-sm">—</span>
        <span className="block text-[10px] leading-tight">ไม่เผยแพร่</span>
      </div>
    );
  }

  return (
    <span
      className="text-sm font-semibold tabular-nums text-9e-navy dark:text-white"
      title="ลำดับจริงบนหน้า /articles นับจากบทความทั้งหมด"
    >
      {info.rank}
    </span>
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
