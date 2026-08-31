'use client';

import { useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { ArticleCard } from '@/components/articles/ArticleCard';

// Pinned to the site timezone rather than the viewer's. A bare
// toLocaleDateString in a server-rendered client component formats in the
// server's zone (UTC on Vercel) on the first paint and the visitor's zone after
// hydration, so an article published at 18:00 Bangkok showed tomorrow's date
// until React swapped it out.
/**
 * ── THE FILTERS ARE PROPS, AND THERE IS NO `useSearchParams` ON THIS FILE ───
 *
 * `q`, `tag`, `program` and `skill` are read from the URL by page.jsx on every
 * render and passed straight down. None is copied into state, and the props are
 * no longer bundled under an `initialFilters` object — that name was the same
 * invitation the `initial*` prefix is banned for in test/fs/urlFilterNoState.
 *
 * ── THE DEFECT THIS REMOVES, WHICH WAS NOT MERELY COSMETIC ──────────────────
 * `q` alone was held as `useState(initialFilters.q)` while its three neighbours
 * were already derived. On a client-side navigation to the same route — the
 * header's bare /articles link, clicked while sitting on `?q=excel`, or Back —
 * React keeps the component instance, so the prop updated to `''` and the state
 * did not. The box went on showing `excel` over an unfiltered list.
 *
 * And then the debounce effect made it a URL defect rather than a display one:
 * its guard was `query === initialFilters.q`, which after such a navigation is
 * `'excel' === ''` — false. So ARRIVAL at a bare /articles scheduled a push of
 * `?q=excel` and put the old search back on, 400 ms after the reader thought
 * they had left it. That is the erasure shape from CourseListClient in its
 * worst form: arrival writing the URL.
 *
 * ── WHY THE SEARCH BOX IS UNCONTROLLED RATHER THAN A SUBMIT FORM ────────────
 * RegistrationsClient solves the same problem by making the input uncontrolled
 * with a `key`, and reading the term on SUBMIT. That shape is not copied here
 * because this is a public page whose search has always filtered as you type,
 * and a `key` tied to `q` cannot coexist with a debounce: our own push changes
 * `q` mid-typing, which would remount the input and discard whatever was typed
 * during the server round-trip.
 *
 * So the input is uncontrolled — no state, no setter, nothing to go stale —
 * and it is re-synced from the `q` prop only WHEN IT IS NOT FOCUSED. Not
 * focused means the change came from somewhere other than this keyboard: a nav
 * click, Back, a shared link. Focused means the reader is mid-word and the DOM
 * value is the truth. The effect depends on the `q` PROP, never on
 * searchParams, so it cannot become the URL-watching-and-URL-writing loop it
 * replaces.
 */
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
  q = '',
  tag = '',
  program = '',
  // NO `'all'` SENTINEL, unlike the ประเภท filter this replaced. That one used
  // `'all'` for "no filter" and the URL builder had to know to delete it, which
  // is a second spelling of empty and a second thing to keep in step. `''` is
  // what `navigate` already drops, and it is what page.jsx already reads back
  // out of searchParams, so the value round-trips through the URL unchanged.
  skill = '',
  // URL-ONLY AND CONTROL-LESS, and passed down for exactly one reason: so
  // `navigate` can put it back. Nothing on this page offers `?type=` any more
  // (see the long note in page.jsx), but a visitor who arrived on an old
  // `?type=video` link would otherwise lose it the instant they touched any
  // other filter — the list would silently widen under them.
  articleType = '',
}) {
  const router = useRouter();
  const pathname = usePathname();

  /**
   * The next URL, SERIALISED FROM THE PROPS.
   *
   * It was built by merging into `new URLSearchParams(useSearchParams())`, and
   * that hook was the only reason this subtree needed a Suspense boundary above
   * it. Every parameter the merge was preserving is now a prop, so the hook has
   * nothing left to supply and is gone.
   *
   * THE ONE THING THE MERGE DID THAT THIS DOES NOT: parameters this page knows
   * nothing about — `utm_source`, `gclid`, an experiment flag — were carried
   * across a filter click and are now dropped. Accepted rather than overlooked:
   * campaign parameters are consumed on the landing hit, the reader has already
   * arrived, and the alternative is reading `window.location.search` inside the
   * handler, which reintroduces a second source of truth for the URL to serve a
   * case with no reader.
   */
  const navigate = useCallback(
    (updates = {}) => {
      const next = { page: 1, q, tag, program, skill, type: articleType, ...updates };
      const params = new URLSearchParams();
      Object.entries(next).forEach(([k, v]) => {
        if (v === '' || v == null || v === 'all') return;
        if (k === 'page' && Number(v) <= 1) return;
        params.set(k, String(v));
      });
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, q, tag, program, skill, articleType]
  );

  // Debounce the search box → URL ?q=. Driven by the input event, so there is
  // no first-render case to skip and no state to compare against.
  const tRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => () => clearTimeout(tRef.current), []);

  const onSearchInput = (e) => {
    const term = e.target.value;
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => navigate({ q: term }), 400);
  };

  // Re-sync the uncontrolled box when the URL's `q` changes from anywhere other
  // than this keyboard. See the header for why focus is the discriminator.
  useEffect(() => {
    const el = inputRef.current;
    if (!el || el === document.activeElement) return;
    if (el.value !== q) el.value = q;
  }, [q]);

  const goToPage = (p) => {
    navigate({ page: p });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  return (
    // `px-4 pt-10 sm:p-6` — the shell's own padding started at `sm`, so below
    // 640px this white rounded-2xl card had NO horizontal padding at all and its
    // side corners and shadow fell off the screen. `pt-10` is kept rather than
    // folded into the `sm:p-6` shorthand because the extra top spacing above the
    // toolbar is deliberate at every width; `sm:p-6` still overrides all four
    // sides from 640px up, exactly as before.
    <div className="rounded-2xl bg-white px-4 pt-10 shadow-9e-lg dark:bg-[#111d2c] sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-9e-slate-dp-50" />
          <input
            type="search"
            ref={inputRef}
            defaultValue={q}
            onChange={onSearchInput}
            placeholder="ค้นหาบทความ..."
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-white py-2 pl-9 pr-3 text-sm text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>

        <select
          value={program}
          onChange={(e) => navigate({ program: e.target.value })}
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
          onChange={(e) => navigate({ skill: e.target.value })}
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
              onClick={() => navigate({ tag: '' })}
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