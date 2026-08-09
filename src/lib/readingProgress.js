// src/lib/readingProgress.js
//
// The reading-progress ring's two shared facts: WHERE its subject is, and HOW
// far through it the reader has got.
//
// ── WHY THE ANCHOR ID IS A CONSTANT AND NOT A STRING IN TWO FILES ───────────
// The ring used to live inside ArticleDetailClient and read the article body
// through a React ref — the coupling was free and could not break. Moving the
// ring into the layout's floating dock buys a consistent stack and pays for it
// with a DOM lookup: the ring now finds its subject by id, and a completely
// different file renders that id.
//
// Nothing connects those two facts at build time. Rename the id on either side
// and the ring does not throw, does not warn, and does not appear — it silently
// stops existing, on a page nobody checks, because it is decorative.
//
// So the id is declared once, here. ArticleDetailClient renders it, the ring
// queries it, neither holds a literal, and a test asserts the two ends still
// agree. That test is what replaces the coupling the ref version had for free —
// it is not belt-and-braces, it is the load-bearing part of this design.

import { matchesRoutePattern } from '@/lib/floatingDock';

/** The id on the article body element the ring measures. */
export const READING_PROGRESS_ANCHOR_ID = 'article-reading-body';

/**
 * The only routes where the anchor can ever exist: an article DETAIL page.
 *
 * `/articles/*` needs the trailing segment — `/articles` itself is the index,
 * which has no body to measure. Routed through the dock's matchesRoutePattern
 * rather than a fresh `startsWith`, because this repo already has one
 * segment-aware matcher and a second one is the duplication class it keeps
 * getting bitten by.
 */
export const READING_PROGRESS_ROUTE = '/articles/*';

export function isReadingProgressRoute(pathname) {
  return matchesRoutePattern(String(pathname ?? ''), READING_PROGRESS_ROUTE);
}

/**
 * Find the anchor, or watch for it — and on any route where it CANNOT appear,
 * do neither.
 *
 * ── WHY THIS IS A FUNCTION AND NOT JUST AN EFFECT BODY ──────────────────────
 * The ring mounts from the root layout, so it exists on every page. Without the
 * route gate the observer starts everywhere the anchor is absent and watches
 * `document.body` with `subtree: true` for the whole life of the page. That is
 * not idle: the landing page auto-advances a hero carousel and the chat panel
 * animates a typing indicator, so every frame of both wakes a callback that can
 * never succeed.
 *
 * Extracted so that "no observer is constructed off-article" is something a
 * test can COUNT, with an injected constructor, rather than something a reader
 * has to take on trust from the ordering of statements.
 *
 * Returns a cleanup function, always — callers do not branch on it.
 */
export function findOrWatchAnchor({ pathname, doc, ObserverCtor, onFound }) {
  const noop = () => {};
  if (!isReadingProgressRoute(pathname)) return noop;

  const found = doc.getElementById(READING_PROGRESS_ANCHOR_ID);
  if (found) {
    onFound(found);
    return noop;
  }

  // The article body is injected with dangerouslySetInnerHTML, so on a cold
  // navigation the ring can mount before it exists. Disconnects the moment it
  // lands; an observer fires only on real DOM changes, where a poll would fire
  // regardless.
  const observer = new ObserverCtor(() => {
    const late = doc.getElementById(READING_PROGRESS_ANCHOR_ID);
    if (!late) return;
    onFound(late);
    observer.disconnect();
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

/**
 * How far through the article the reader has scrolled.
 *
 * Extracted verbatim from the arithmetic that shipped inside
 * ArticleDetailClient's scroll handler, so the ring reads exactly what the top
 * progress bar reads. Pure, so the boundaries can be tested without a DOM:
 *
 *   pct     0–100, clamped. 0 when the article is shorter than the viewport,
 *           because there is nothing to scroll through and a partial ring on a
 *           page that does not scroll is noise.
 *   started whether the reader has reached the body at all. The ring is hidden
 *           until then — 100px of lead-in, matching the original.
 */
export function computeReadingProgress({
  contentTop,
  contentHeight,
  scrollY,
  viewportHeight,
}) {
  const total = contentHeight - viewportHeight;
  const scrolled = scrollY - contentTop;
  const pct =
    total > 0 ? Math.min(100, Math.max(0, Math.round((scrolled / total) * 100))) : 0;
  return { pct, started: scrollY > contentTop - 100 };
}
