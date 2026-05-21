'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';

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

export function ArticlesPageClient({ articles, programs /* allTags */ }) {
  const searchParams = useSearchParams();

  const [query,         setQuery]         = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [typeFilter,    setTypeFilter]    = useState('all');
  // Seed from the `?tag=…` URL param so deep links from clickable
  // tags on the detail page land here pre-filtered.
  const [selectedTag,   setSelectedTag]   = useState(
    searchParams.get('tag') ?? ''
  );

  // Keep the filter in sync if the user navigates between tag links
  // without unmounting this component (App Router preserves state
  // across same-route navigations).
  useEffect(() => {
    setSelectedTag(searchParams.get('tag') ?? '');
  }, [searchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (selectedTag && !(a.tags ?? []).includes(selectedTag)) return false;
      if (programFilter && !(a.programs ?? []).includes(programFilter)) return false;
      if (typeFilter !== 'all' && a.articleType !== typeFilter) return false;
      if (!q) return true;
      const haystack = [a.title, a.excerpt].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [articles, query, programFilter, typeFilter, selectedTag]);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-9e-lg dark:bg-[#111d2c] sm:p-6">
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
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          <option value="all">ประเภททั้งหมด</option>
          <option value="article">บทความ</option>
          <option value="video">บทความวิดีโอ</option>
        </select>
      </div>

      {selectedTag && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-[#94a3b8]">กรองตาม tag:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            #{selectedTag}
            <button
              type="button"
              onClick={() => setSelectedTag('')}
              className="ml-1 hover:text-red-500"
              aria-label="ล้าง tag filter"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          ไม่พบบทความที่ตรงกับเงื่อนไข
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <ArticleCard key={a._id} article={a} />
          ))}
        </div>
      )}
    </div>
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