'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowRight, Pin, Search } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ArticlesPageClient({
  articles,
  programs,
  page,
  totalPages,
  total,
  initialFilters,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Filters other than the search box are read straight from the URL
  // (the server re-renders with the correct page on every change), so
  // `initialFilters` is always the live source of truth for them.
  const program = initialFilters.program ?? '';
  const type = initialFilters.type ?? 'all';
  const tag = initialFilters.tag ?? '';

  // Search is debounced, so it gets its own local input state.
  const [query, setQuery] = useState(initialFilters.q ?? '');

  // Build a URL with merged params; resets to page 1 on any filter change.
  const pushWith = useCallback(
    (updates, resetPage = true) => {
      const next = new URLSearchParams(sp?.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v === '' || v == null || v === 'all') next.delete(k);
        else next.set(k, String(v));
      });
      if (resetPage) next.delete('page');
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, sp]
  );

  // Debounce the search box → URL ?q=. Skip the no-op first render.
  const tRef = useRef(null);
  useEffect(() => {
    if (query === (initialFilters.q ?? '')) return;
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => pushWith({ q: query }), 400);
    return () => clearTimeout(tRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const goToPage = (p) => {
    pushWith({ page: p }, false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  return (
    <div className="rounded-2xl bg-white pt-10 shadow-9e-lg dark:bg-[#111d2c] sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-9e-slate-dp-50" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาบทความ..."
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white py-2 pl-9 pr-3 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>

        <select
          value={program}
          onChange={(e) => pushWith({ program: e.target.value })}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          <option value="">ทุก Program</option>
          {programs.map((p) => (
            <option key={p.program_id} value={p.program_id}>
              {p.program_name || p.program_id}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(e) => pushWith({ type: e.target.value })}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          <option value="all">ประเภททั้งหมด</option>
          <option value="article">บทความ</option>
          <option value="video">บทความวิดีโอ</option>
        </select>
      </div>

      {tag && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-[#94a3b8]">กรองตาม tag:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            #{tag}
            <button
              type="button"
              onClick={() => pushWith({ tag: '' })}
              className="ml-1 hover:text-red-500"
              aria-label="ล้าง tag filter"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {total === 0 ? (
        <p className="py-16 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ไม่พบบทความที่ตรงกับเงื่อนไข
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <ArticleCard key={a._id} article={a} />
            ))}
          </div>
          <Pager page={page} totalPages={totalPages} onGo={goToPage} />
        </>
      )}
    </div>
  );
}

function Pager({ page, totalPages, onGo }) {
  if (totalPages <= 1) return null;

  // Compact window: 1 … (p-1) p (p+1) … last
  const pages = [];
  const push = (n) => pages.push(n);
  const windowSize = 1;
  const lo = Math.max(2, page - windowSize);
  const hi = Math.min(totalPages - 1, page + windowSize);
  push(1);
  if (lo > 2) pages.push('…');
  for (let n = lo; n <= hi; n++) push(n);
  if (hi < totalPages - 1) pages.push('…');
  if (totalPages > 1) push(totalPages);

  const btn = 'min-w-9 h-9 px-3 rounded-9e-md border text-sm transition';
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="แบ่งหน้า">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onGo(page - 1)}
        className={`${btn} border-[var(--surface-border)] disabled:opacity-40`}
      >
        ก่อนหน้า
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="px-1 text-9e-slate-dp-50">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onGo(p)}
            aria-current={p === page ? 'page' : undefined}
            className={
              p === page
                ? `${btn} border-9e-action bg-9e-action text-white`
                : `${btn} border-[var(--surface-border)] text-9e-navy hover:border-9e-action dark:text-white`
            }
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
        className={`${btn} border-[var(--surface-border)] disabled:opacity-40`}
      >
        ถัดไป
      </button>
    </nav>
  );
}

function ArticleCard({ article }) {
  const href = `/articles/${article.slug}`;
  const isVideo = article.articleType === 'video';
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-9e-lg dark:bg-[#0D1B2A]">
      <Link href={href} className="relative block aspect-video overflow-hidden bg-9e-ice dark:bg-[#111d2c]">
        {article.coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={article.coverUrl}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-9e-action">
            {article.title?.slice(0, 1) ?? '?'}
          </div>
        )}
        <span
          className={
            'absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-medium text-white ' +
            (isVideo ? 'bg-purple-600' : 'bg-9e-action')
          }
        >
          {isVideo ? 'บทความวิดีโอ' : 'บทความ'}
        </span>
        {article.isPinnedOnArticlePage && (
          <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm dark:bg-[#0D1B2A]/90">
            <Pin className="h-3.5 w-3.5 text-9e-action" strokeWidth={2.5} />
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-lg font-bold text-9e-navy dark:text-white">
          <Link href={href} className="hover:text-9e-action">
            {article.title}
          </Link>
        </h3>

        {article.excerpt && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-[#94a3b8]">
            {article.excerpt}
          </p>
        )}

        {(article.tags?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {article.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#111d2c]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          <span>{formatDate(article.publishedAt) || '—'}</span>
          <Link
            href={href}
            className="inline-flex items-center gap-1 font-semibold text-9e-action hover:underline"
          >
            อ่านเพิ่มเติม <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}