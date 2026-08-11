'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, Clock, User } from 'lucide-react';
import { ArrowSlider } from '@/components/ui/ArrowSlider';
import { READING_PROGRESS_ANCHOR_ID } from '@/lib/readingProgress';
import { coursePriceLabel } from '@/lib/coursePriceLabel';
import { ArticleImageLightbox } from './ArticleImageLightbox';

/**
 * Article detail page — client component, owns most of the rendering
 * so it can attach refs, inject heading IDs, and run the scroll/hover
 * effects against the actual DOM.
 *
 * Pieces of client-only UI it adds:
 *   1. Thin gradient progress bar pinned under the site nav, measured
 *      against the article content element so it reflects "how much
 *      of the body have I read?" rather than full-page scroll.
 *   2. Circular "XX%" hover badge in the bottom-right, same metric,
 *      visible only while the cursor is over the content.
 *   3. Vertical sticky share strip on the left (xl+ screens) — fades
 *      in once the reader enters the content zone. A horizontal share
 *      row above the divider stands in on smaller screens.
 *   4. Right-side sticky Table of Contents built from H2/H3 headings
 *      (xl+ screens), with the in-view heading highlighted.
 *   5. Clickable tag chips that link to `/articles?tag=X`.
 *
 * The server page passes everything it can pre-render (article doc,
 * resolved related articles + courses, reading-time count); this
 * component does no further data fetching.
 */
export function ArticleDetailClient({
  article,
  related = [],
  relatedCoursesData = [],
  minutes,
}) {
  const [barProgress, setBarProgress]   = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [tocItems, setTocItems]         = useState([]);
  const [activeTocId, setActiveTocId]   = useState('');
  const [pageUrl, setPageUrl]           = useState(
    `https://genesis-lab.9expert.app/articles/${article.slug}`
  );

  const contentRef = useRef(null);

  // Stable hover handlers so the memoized ArticleContent below sees
  // identical function references across renders — otherwise React.memo
  // would still re-render the prose div on every scroll-tick state
  // update and dangerouslySetInnerHTML would wipe the injected IDs.

  // SSR-safe share URL: seed from the slug so the first render matches
  // the server output, then swap to the real `window.location.href`
  // (which may carry tracking params, draft tokens, etc.) on mount.
  useEffect(() => {
    if (typeof window !== 'undefined') setPageUrl(window.location.href);
  }, []);

  // Inject IDs onto the rendered H2/H3 nodes AND build the TOC from
  // those same nodes — one pass, single source of truth.
  //
  // Strict Mode safety: instead of a module-level `didInject` ref
  // (which the cleanup function can't reset, so the second invocation
  // bails before injecting), we use a per-effect `cancelled` flag.
  // Each effect run gets its own fresh closure, so the first run's
  // cleanup setting `cancelled = true` only affects its own pending
  // timeouts — the second run starts clean.
  //
  // Retry strategy: try `inject()` synchronously first (catches the
  // common client-navigation case where the DOM is already painted).
  // If that fails, poll with increasing backoff (50/100/200/400/500ms)
  // to cover the dangerouslySetInnerHTML hydration gap.
  //
  // Duplicate-heading collision: track usage in `usedIds` so a second
  // "Introduction" becomes `introduction-2`, etc. — keeps anchor
  // navigation deterministic when the editor reuses titles.
  useEffect(() => {
    let cancelled = false;
    let timer;

    function inject() {
      const root = contentRef.current;
      if (!root || cancelled) return false;
      const headingEls = root.querySelectorAll('h2, h3');
      if (headingEls.length === 0) return false;

      const usedIds = {};
      headingEls.forEach((el) => {
        let id = slugifyHeading(el.textContent);
        if (usedIds[id]) {
          usedIds[id]++;
          id = `${id}-${usedIds[id]}`;
        } else {
          usedIds[id] = 1;
        }
        el.id = id;
      });

      if (!cancelled) {
        setTocItems(
          Array.from(headingEls).map((el) => ({
            id:    el.id,
            text:  el.textContent.trim(),
            level: Number(el.tagName.replace('H', '')),
          }))
        );
      }
      return true;
    }

    // Synchronous fast path.
    if (inject()) {
      return () => { cancelled = true; };
    }

    let attempt = 0;
    const delays = [50, 100, 200, 400, 500, 500, 500];

    function poll() {
      if (cancelled) return;
      if (inject()) return;
      if (attempt < delays.length) {
        timer = setTimeout(poll, delays[attempt++]);
      }
    }

    timer = setTimeout(poll, delays[attempt++]);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [article._id]);

  // Inject "Copy" buttons into every <pre> block inside the rendered article.
  // Uses the same retry strategy as the heading-ID injection above.
  useEffect(() => {
    let cancelled = false;
    let timer;

    function injectCopyButtons() {
      const root = contentRef.current;
      if (!root || cancelled) return false;

      const preEls = root.querySelectorAll('pre');
      if (preEls.length === 0) return false;

      preEls.forEach((pre) => {
        // Skip if already injected (Strict Mode double-invoke guard)
        if (pre.querySelector('[data-copy-btn]')) return;

        // Ensure the <pre> is positioned so the button can be absolute
        if (getComputedStyle(pre).position === 'static') {
          pre.style.position = 'relative';
        }

        const btn = document.createElement('button');
        btn.setAttribute('data-copy-btn', '');
        btn.setAttribute('aria-label', 'Copy code');
        btn.textContent = 'Copy';

        // Inline styles — no Tailwind class needed, avoids purge issues
        Object.assign(btn.style, {
          position: 'absolute',
          top: '10px',
          right: '10px',
          padding: '3px 10px',
          fontSize: '11px',
          fontFamily: 'inherit',
          fontWeight: '500',
          lineHeight: '1.5',
          color: '#e2e8f0',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '5px',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
          zIndex: '10',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        });

        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(255,255,255,0.16)';
        });
        btn.addEventListener('mouseleave', () => {
          if (btn.textContent !== '✓ Copied!') {
            btn.style.background = 'rgba(255,255,255,0.08)';
          }
        });

        btn.addEventListener('click', async () => {
          const code = pre.querySelector('code');
          const text = code ? code.innerText : pre.innerText;
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            // Fallback for older browsers / blocked clipboard
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }

          // Feedback state
          btn.textContent = '✓ Copied!';
          btn.style.color = '#86efac';       // green-300
          btn.style.borderColor = '#86efac';
          btn.style.background = 'rgba(134,239,172,0.10)';

          clearTimeout(btn._resetTimer);
          btn._resetTimer = setTimeout(() => {
            btn.textContent = 'Copy';
            btn.style.color = '#e2e8f0';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
            btn.style.background = 'rgba(255,255,255,0.08)';
          }, 2000);
        });

        pre.appendChild(btn);
      });

      return true;
    }

    // Try immediately (covers client-nav case where DOM already exists)
    if (injectCopyButtons()) return () => { cancelled = true; };

    // Retry with backoff for dangerouslySetInnerHTML hydration gap
    const delays = [50, 100, 200, 400, 500];
    let i = 0;
    function retry() {
      if (cancelled || i >= delays.length) return;
      timer = setTimeout(() => {
        if (!injectCopyButtons()) {
          i++;
          retry();
        }
      }, delays[i++]);
    }
    retry();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  // Empty deps: run once on mount. Article HTML does not change after mount.
  // The retry strategy handles the dangerouslySetInnerHTML timing gap.

  // Single scroll handler drives the bar, the badge visibility, and
  // the active-TOC highlight — all read off the same contentRef so
  // they can't disagree.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return undefined;

    function handleScroll() {
      const contentTop    = el.offsetTop;
      const contentHeight = el.offsetHeight;
      const scrolled      = window.scrollY - contentTop;
      const total         = contentHeight - window.innerHeight;
      const pct = total > 0
        ? Math.min(100, Math.max(0, Math.round((scrolled / total) * 100)))
        : 0;
      setBarProgress(pct);
      setShowProgress(window.scrollY > contentTop - 100);

      // Active heading = the last one whose top has scrolled above
      // ~110 px (clears the h-20 nav + 3 px progress bar + buffer).
      // Walks in document order and breaks as soon as a heading is
      // still below the threshold — the previous match is the active
      // one. IDs come straight off el.id (already set by the
      // injection effect above).
      const headingEls = Array.from(el.querySelectorAll('h2, h3'));
      let current = '';
      for (const h of headingEls) {
        if (h.getBoundingClientRect().top < 110) {
          current = h.id;
        } else {
          break;
        }
      }
      setActiveTocId(current);
    }

    // Hover used to be wired here to fade the progress ring in. The ring now
    // lives in the floating dock and attaches its own listeners to the same
    // element, so this component no longer tracks it. Scroll/resize only.
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [tocItems.length]); // re-bind once headings are injected

  // ── Table-image lightbox ──────────────────────────────────────────────────
  // BY DELEGATION, ON PURPOSE. The listener goes on the existing contentRef
  // node, never on the prose markup, and the open-image state lives HERE in the
  // parent. ArticleContent's props stay exactly `{ html, contentRef }`: adding
  // one would re-render the memoized body, let React diff
  // dangerouslySetInnerHTML, and wipe the heading IDs the injection effect
  // stamped on — silently breaking the table of contents and every anchor link
  // while the lightbox itself worked perfectly.
  //
  // SCOPED TO TABLE CELLS, which is what was asked: cell images are pinned to a
  // 3rem box by globals.css and are the ones that cannot be read. Body images
  // already render at their natural width. Corpus today: 1421 <img> in 352
  // articles, 22 of them inside a cell.
  //
  // The `closest('a')` bail keeps a linked image navigating. That case is
  // currently hypothetical — 0 of the 1421 images sit inside an <a> — so this
  // is defensive, not corrective, and it is one line.
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;

    const onClick = (e) => {
      const img = e.target.closest('img');
      if (!img || !root.contains(img)) return;
      if (!img.closest('td, th')) return;      // table cells only
      if (img.closest('a')) return;            // a linked image still navigates
      e.preventDefault();
      setLightboxImage({ src: img.currentSrc || img.src, alt: img.alt, trigger: img });
    };

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
    // contentRef is a stable ref object; the prose node it points at is created
    // once and kept alive by the memo, so this binds once for the page's life.
  }, []);

  // Share URLs — recomputed on every render so a late pageUrl swap
  // updates the links in place.
  const encodedUrl = encodeURIComponent(pageUrl);
  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    line:     `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  };

  return (
    <>
      {/* Portalled to <body> from inside the component, so it escapes every
          stacking context on the way down — see the component's docstring. */}
      <ArticleImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />

      {/* Top thin gradient progress bar — content-relative, hidden
          until the reader has actually started reading the body. */}
      {barProgress > 0 && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{ top: '80px' }}
          aria-hidden="true"
        >
          <div className="h-[3px] w-full bg-gray-100/80 dark:bg-white/10" />
          <div
            className="absolute left-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 via-blue-400 to-[#48B0FF] shadow-[0_0_8px_rgba(36,134,255,0.5)] transition-[width] duration-150 ease-out"
            style={{ width: `${barProgress}%` }}
          />
        </div>
      )}

      <div className="mx-auto max-w-[1200px] px-4 pb-20">
        {/* Back link sits above the grid so users still have a way
            out at every viewport size. */}
        <div className="pt-6">
          <Link
            href="/articles"
            className="inline-flex items-center gap-1 text-sm text-9e-action hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> กลับไปยังบทความทั้งหมด
          </Link>
        </div>

        <div className="mt-4 flex items-start gap-6">
          {/* ── Column 1 — Sticky social share strip (xl+ only) ── */}
          <div className="sticky top-28 hidden w-12 flex-shrink-0 flex-col items-center gap-3 xl:flex">
            {showProgress && (
              <>
                <span
                  className="mb-1 text-[12px] text-gray-400"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(270deg)' }}
                >
                  Share
                </span>
                <ShareIcon href={shareLinks.facebook} brand="facebook" />
                <ShareIcon href={shareLinks.line}     brand="line" />
                <ShareIcon href={shareLinks.linkedin} brand="linkedin" />
              </>
            )}
          </div>

          {/* ── Column 2 — Article content ── */}
          <article className="min-w-0 max-w-[900px] flex-1">
            {article.coverUrl && (
              <div className="overflow-hidden rounded-2xl bg-9e-ice dark:bg-[#0D1B2A]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.coverUrl}
                  alt={article.title}
                  className="aspect-video w-full object-cover"
                />
              </div>
            )}

            {article.author && (
              <p className="mt-2 text-sm text-gray-400 dark:text-[#94a3b8]">
                บทความโดย: {article.author}
              </p>
            )}

            <h1 className="mt-6 text-4xl font-bold leading-tight text-9e-navy dark:text-white">
              {article.title}
            </h1>

            {article.excerpt && (
              <p className="mt-3 text-lg leading-relaxed text-gray-500 dark:text-[#94a3b8]">
                {article.excerpt}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
              {article.author && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-4 w-4" /> {article.author}
                </span>
              )}
              {/* NO PUBLISH DATE. The owner's decision: articles are evergreen
                  reference material and a visible date makes a still-accurate
                  2024 piece look stale. `publishedAt` is untouched as DATA — it
                  still orders this list, the sitemap and search, and it still
                  gates publication — it simply is not shown. */}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" /> {minutes} นาที
              </span>
            </div>

            {(article.tags?.length ?? 0) > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {article.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/articles?tag=${encodeURIComponent(tag)}`}
                    className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Mobile horizontal share row — the sticky vertical
                strip in column 1 is hidden below xl, so we surface
                pill buttons here for tablets and phones. */}
            <div className="mt-4 flex flex-wrap items-center gap-3 xl:hidden">
              <span className="text-sm font-medium text-gray-500 dark:text-[#94a3b8]">Share:</span>
              <ShareLink href={shareLinks.facebook} brand="facebook" label="Facebook" />
              <ShareLink href={shareLinks.line}     brand="line"     label="LINE" />
              <ShareLink href={shareLinks.linkedin} brand="linkedin" label="LinkedIn" />
            </div>

            <hr className="my-8 border-[var(--surface-border)]" />

            <ArticleContent
              html={article.content}
              contentRef={contentRef}
            />

            {/* Related courses */}
            {relatedCoursesData.length > 0 && (
              <section className="mt-10 rounded-2xl border border-[var(--surface-border)] bg-white p-6 dark:bg-[#111d2c]">
                <h3 className="mb-5 text-lg font-bold text-9e-navy dark:text-white">
                  หลักสูตรที่เกี่ยวข้อง
                </h3>
                {/* `arrows="outside"` — this section's own p-6 gives the
                    -left-4 / -right-4 arrows room to hang into. */}
                <ArrowSlider
                  items={relatedCoursesData}
                  getKey={(c) => c.course_id}
                  renderItem={(c) => <RelatedCourseCard course={c} />}
                />
              </section>
            )}

            {/* Related articles */}
            {related.length > 0 && (
              <section className="mt-16 border-t border-[var(--surface-border)] pt-10">
                <h2 className="text-xl font-bold text-9e-navy dark:text-white">
                  บทความที่เกี่ยวข้อง
                </h2>
                {/* Every pinned article, in the admin-defined order — the
                    server applies no cap on the explicit-picks path.
                    `arrows="inside"` because this section is a bare
                    `border-t` with no horizontal padding: outside arrows
                    would sit in the xl column gutter (next to the share
                    strip / TOC) and hug the viewport edge below xl. */}
                <div className="mt-5">
                  <ArrowSlider
                    items={related}
                    getKey={(a) => a._id}
                    renderItem={(a) => <RelatedArticleCard article={a} />}
                    arrows="inside"
                  />
                </div>
              </section>
            )}
          </article>

          {/* ── Column 3 — Sticky Table of Contents (xl+ only) ── */}
          {tocItems.length > 1 && (
            <aside className="sticky top-28 hidden w-60 flex-shrink-0 xl:block">
              <div className="rounded-xl border border-[var(--surface-border)] bg-white p-4 dark:bg-[#111d2c]">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                  สารบัญ
                </p>
                {/* Internal scroll capped at 400 px so a heading-heavy
                    article doesn't grow the TOC past the viewport. */}
                <nav className="max-h-[400px] space-y-0.5 overflow-y-auto pr-1">
                  {tocItems.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(item.id);
                        if (!el) return;
                        // Manual offset (nav height + buffer) instead
                        // of scrollIntoView — keeps the heading clear
                        // of the sticky top bar.
                        const top = el.getBoundingClientRect().top + window.scrollY - 96;
                        window.scrollTo({ top, behavior: 'smooth' });
                      }}
                      className={
                        'flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-sm leading-snug transition-all duration-150 ' +
                        (item.level === 3 ? 'pl-5 text-[12px] ' : '') +
                        (activeTocId === item.id
                          ? 'bg-blue-50 font-semibold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:hover:bg-white/5 dark:hover:text-gray-200')
                      }
                    >
                      {item.level === 3 && (
                        <span className="mt-0.5 flex-shrink-0 text-gray-300">└</span>
                      )}
                      <span className="line-clamp-2">{item.text}</span>
                    </a>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* THE READING-PROGRESS RING USED TO BE HERE, `fixed bottom-20 right-8
          z-50`, a third independently-positioned element in the same corner as
          the dock. It now lives in FloatingActionDock's TOP slot — see
          src/components/ui/ReadingProgressRing.jsx — so all three floating
          controls are laid out by one flex column instead of by three sets of
          offsets that had to agree. The ring finds this page's body by the
          shared anchor id above; it needs nothing else from this component. */}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Slugify a heading into a stable DOM id. Preserves the Thai unicode
 * block + ASCII alphanumerics + hyphens; everything else collapses.
 * Falls back to a random suffix so an all-punctuation heading still
 * produces a valid id (and so we never write `id=""`).
 *
 * Used by ONE caller — the heading-injection effect — so the IDs in
 * the DOM and the IDs in the TOC array are guaranteed to match.
 */

/**
 * Memoized prose body.
 *
 * ArticleDetailClient updates state on every scroll event (progress %,
 * activeTocId, …) which would normally re-render this div
 * and let React diff `dangerouslySetInnerHTML` — wiping the IDs the
 * heading-injection effect just stamped onto each H2/H3.
 *
 * Wrapping in `memo` with a stable `html` prop pins the rendered
 * subtree: React keeps the exact same DOM nodes alive across parent
 * re-renders, so the injected IDs survive for the page's lifetime.
 *
 * Stable refs/callbacks come from the parent via `useCallback`; the
 * default shallow comparator handles the rest.
 */
const ArticleContent = memo(function ArticleContent({
  html,
  contentRef,
}) {
  return (
    <div
      ref={contentRef}
      // THE READING-PROGRESS RING FINDS THIS ELEMENT BY THIS ID, from the
      // floating dock in the root layout. The id is a shared constant, not a
      // literal, because nothing at build time connects the two files — rename
      // it on either side and the ring silently stops appearing rather than
      // failing. src/lib/readingProgress.js, and a test pins both ends.
      id={READING_PROGRESS_ANCHOR_ID}
      className="article-content prose prose-lg max-w-none prose-h2:border-l-4 prose-h2:border-blue-500 prose-h2:pl-4 prose-a:text-blue-600 prose-a:underline prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:px-4 prose-blockquote:py-2 prose-code:rounded prose-code:bg-blue-50 prose-code:px-1 prose-code:text-blue-700 prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-ol:list-decimal prose-ol:pl-6 prose-ul:list-disc prose-ul:pl-6 prose-li:my-1 prose-img:rounded-xl prose-img:shadow-md dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: html ?? '' }}
    />
  );
});

function slugifyHeading(text) {
  // Use explicit \u escapes for the Thai block — some build pipelines
  // re-encode literal Thai characters in source files, which would
  // silently neuter this regex on the live bundle.
  const base = String(text ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'heading-' + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ── Share buttons ────────────────────────────────────────────────

const BRAND = {
  facebook: { fg: '#1877F2' },
  line:     { fg: '#06C755' },
  linkedin: { fg: '#0A66C2' },
};

function ShareIcon({ href, brand }) {
  const { fg } = BRAND[brand];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Share ${brand}`}
      className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:text-white"
      style={{
        backgroundColor: `${fg}1a`,
        color: fg,
        borderColor: `${fg}33`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${fg}33`; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = `${fg}1a`; }}
    >
      <BrandGlyph brand={brand} />
    </a>
  );
}

function ShareLink({ href, brand, label }) {
  const { fg } = BRAND[brand];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
      style={{
        backgroundColor: `${fg}1a`,
        color: fg,
        borderColor: `${fg}33`,
      }}
    >
      <BrandGlyph brand={brand} />
      {label}
    </a>
  );
}

function BrandGlyph({ brand }) {
  if (brand === 'facebook') {
    return (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (brand === 'line') {
    return (
      <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

// ── Related cards ────────────────────────────────────────────────

function RelatedCourseCard({ course }) {
  const href = Array.isArray(course.website_urls) && course.website_urls[0]
    ? course.website_urls[0]
    : '#';
  const price = Number(course.course_price ?? 0);
  const days  = Number(course.course_trainingdays ?? 0);
  const hours = Number(course.course_traininghours ?? 0) || (days ? days * 6 : 0);

  const LEVEL_LABEL = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
  const levelKey   = course.course_levels != null ? Number(course.course_levels) : null;
  const levelLabel = levelKey ? LEVEL_LABEL[levelKey] : null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md dark:border-none dark:bg-9e-navy"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-9e-ice">
        {course.course_cover_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={course.course_cover_url}
            alt={course.course_name ?? ''}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        {/* Course ID */}
        <span className="mb-1 font-mono text-xs font-bold text-9e-action">
          {course.course_id}
        </span>

        {/* Course name with left accent — same as CourseCard */}
        <h4 className="mb-3 line-clamp-2 border-l-4 border-9e-action pl-2 text-sm font-bold leading-snug text-9e-navy dark:text-white">
          {course.course_name}
        </h4>

        {/* Duration + price row */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-xs text-9e-slate-dp-50 dark:text-[#b7c3d4]">
          {days > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" strokeWidth={1.75} />
              {days} วัน{hours ? ` (${hours} ชม.)` : ''}
            </span>
          ) : (
            <span />
          )}
          {/* Same treatment as the catalog card this block was copied from:
              nowrap on the label, and the enclosing row is `flex-wrap` so a
              narrow related-course card wraps the ROW rather than the words. */}
          <span className="whitespace-nowrap text-sm font-bold text-9e-navy dark:text-white">
            {coursePriceLabel(price, { suffix: '.-' })}
          </span>
        </div>

        {/* Level badge if available */}
        {levelLabel && (
          <div className="mt-2 text-[11px] text-9e-slate-dp-50 dark:text-[#b7c3d4]">
            {levelLabel}
          </div>
        )}
      </div>
    </a>
  );
}

function RelatedArticleCard({ article }) {
  return (
    <Link
      href={`/articles/${article.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-white transition-all hover:-translate-y-0.5 hover:shadow-9e-lg dark:bg-[#0D1B2A]"
    >
      <div className="aspect-video overflow-hidden bg-9e-ice dark:bg-[#111d2c]">
        {article.coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={article.coverUrl}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-9e-action">
            {article.title?.slice(0, 1) ?? '?'}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-base font-bold text-9e-navy dark:text-white">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-[#94a3b8]">
            {article.excerpt}
          </p>
        )}
        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-9e-action">
          อ่านเพิ่มเติม <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}