'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowRight, Pin, Search } from 'lucide-react';
import { shouldShowPinBadge } from '@/lib/articlePositioning';
import { formatSiteDateTime } from '@/lib/articlePublishTime';

// Pinned to the site timezone rather than the viewer's. A bare
// toLocaleDateString in a server-rendered client component formats in the
// server's zone (UTC on Vercel) on the first paint and the visitor's zone after
// hydration, so an article published at 18:00 Bangkok showed tomorrow's date
// until React swapped it out.
function formatDate(iso) {
  return formatSiteDateTime(iso, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ArticlesPageClient({
  articles,
  programs,
  programNames = {},
  skillNames = {},
  // `{ skill_id, skill_name }`, already narrowed to the skills ARTICLES CARRY
  // and already name-resolved and sorted by page.jsx. This component renders
  // them; it does not decide which are offerable — see the note there.
  skillOptions = [],
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
  // NO `'all'` SENTINEL, unlike the ประเภท filter this replaced. That one used
  // `'all'` for "no filter" and `pushWith` had to know to delete it, which is a
  // second spelling of empty and a second thing to keep in step. `''` is what
  // `pushWith` already drops, and it is what page.jsx already reads back out of
  // searchParams, so the value round-trips through the URL unchanged.
  const skill = initialFilters.skill ?? '';
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

        {/* Was the ประเภท (article / video) filter. Replaced rather than added
            beside: the type distinction stopped being visible anywhere on this
            page when the card's type badge was removed, so a control that
            SPLITS the list by it was sorting by something the reader could no
            longer see. Skill is what the rest of the site navigates by, and it
            is already on every card as a chip.

            `?type=` still works if it is in the URL — page.jsx keeps reading it
            and getArticles keeps filtering on it — it simply has no control any
            more. That is stated there rather than here, because the decision
            lives with the read. */}
        <select
          value={skill}
          onChange={(e) => pushWith({ skill: e.target.value })}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          <option value="">ทุก Skill</option>
          {skillOptions.map((s) => (
            <option key={s.skill_id} value={s.skill_id}>
              {s.skill_name}
            </option>
          ))}
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
              <ArticleCard
                key={a._id}
                article={a}
                programNames={programNames}
                skillNames={skillNames}
              />
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

/**
 * One card on /articles.
 *
 * ── THE TOP-LEFT OVERLAY: TYPE OUT, PROGRAM IN ──────────────────────────────
 * That slot used to say บทความ or บทความวิดีโอ on every card, so on a page where
 * the overwhelming majority are plain articles it was a label that read "this is
 * a thing on the articles page". The type is still a real distinction and still
 * filterable — the toolbar's ประเภท select, the `?type=` param and BlogSection
 * are all untouched — it just does not need to be stamped on every cover image
 * to be available.
 *
 * The slot now carries the article's PROGRAM, which is the thing a reader
 * scanning a grid of covers actually wants: which part of the catalogue this
 * belongs to. Same treatment as the badge it replaces — that was a deliberate
 * reuse rather than a coincidence, because the slot's job (one short,
 * high-contrast label over artwork) has not changed.
 *
 * THE CHIPS ARE NON-INTERACTIVE, AND THAT IS NOT AN OVERSIGHT. They sit inside
 * the cover `<Link>`, so making them link to `?program=` would nest an anchor
 * inside an anchor — invalid HTML that React will render anyway and that
 * browsers resolve by silently splitting the outer link, which breaks the card's
 * own click target. The filter for programs already exists in the toolbar.
 *
 * CAPPED AT 2, WITH NO "+N" COUNTER, unlike the skills row below. This slot
 * overlays the artwork rather than sitting in the text column: a third chip
 * starts covering the image, and a `+1` in that position reads as part of the
 * picture. The body's skill row keeps its own cap of 3 because it has the width.
 *
 * ── SKILLS REPLACE TAGS ON THE CARD, AND ONLY ON THE CARD ───────────────────
 * `tags` is a free-text field an author types; `skills` is a chosen reference to
 * the upstream taxonomy the rest of the site navigates by. The chip row now
 * shows the second. NOTHING ELSE MOVES: the `tags` field, the `?tag=` filter,
 * the toolbar's tag chip and the search box (which searches tags) are all
 * unchanged, so every existing tag link still works and this is a display
 * change rather than a data one.
 *
 * AN ID WITH NO NAME IS DROPPED, NEVER PRINTED — for BOTH rows, resolved the
 * same way so the two cannot drift. An article stores `skill_id` / `program_id`
 * strings and the names come from a separate service; when that service is
 * unreachable the map is empty (page.jsx catches to `{items: []}`), and when an
 * entry is retired upstream its id survives in old articles forever. Printing
 * the raw id would put `SK-014` on a public card, which is worse than showing
 * nothing — so an unresolved id is skipped, and a card with nothing left to show
 * renders NO WRAPPER AT ALL rather than an empty element: in the body that would
 * be a strip of padding, and in the overlay it would be a transparent box
 * floating on the artwork.
 */
function ArticleCard({ article, programNames = {}, skillNames = {} }) {
  const href = `/articles/${article.slug}`;
  // One resolver, two rows. Only the map, the field and the cap differ; if these
  // two ever stop looking identical, one of them has grown a rule the other
  // does not have.
  const resolve = (ids, names, cap) =>
    (ids ?? []).map((id) => names[String(id)]).filter(Boolean).slice(0, cap);
  const programTags = resolve(article.programs, programNames, 2);
  const skills = resolve(article.skills, skillNames, 3);
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
        {/* The overlay slot the type badge vacated. Rendered only when there is
            something to say — no wrapper, so a card with no resolvable program
            has a clean cover image. A <span> rather than a <div> because this
            subtree is inside the cover <a>. */}
        {programTags.length > 0 && (
          <span className="absolute left-3 top-3 flex flex-wrap gap-1">
            {programTags.map((name) => (
              <span
                key={name}
                className="rounded-full bg-9e-action px-2 py-0.5 text-[11px] font-medium text-white"
              >
                {name}
              </span>
            ))}
          </span>
        )}
        {/* Badge only — NOT the ordering. `isPinnedOnArticlePage` still decides
            where this card sits in the list (the cascade in
            src/lib/actions/articles.js is unchanged); shouldShowPinBadge decides
            whether it wears the glyph. The helper treats an ABSENT
            `showPinBadge` as ON, which is why this is not an inline field check
            — see the note on the helper. */}
        {shouldShowPinBadge(article) && (
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

        {skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {skills.map((name) => (
              <span
                key={name}
                className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#111d2c]"
              >
                {name}
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