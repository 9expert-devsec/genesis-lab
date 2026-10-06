'use client';

import { useEffect } from 'react';
import { isCountableArticle, viewDay, viewSessionKey } from '@/lib/articles/viewCounter';

export const VIEW_ENDPOINT = '/api/articles/view';

/**
 * Counts one anonymous view per tab per Bangkok day. Renders nothing.
 *
 * CLIENT-ONLY, AFTER MOUNT, which is what keeps /articles/[slug] static: the
 * page shell is ISR and must not read cookies, headers or searchParams on the
 * server (see the note on generateStaticParams there). The count is a POST the
 * browser makes after the cached HTML has already arrived.
 *
 * Skips:
 *   · `navigator.webdriver` — automation announces itself here;
 *   · drafts (inactive, or no publishedAt — buildJsonLd's definition) and any
 *     render under /admin, so editing never counts;
 *   · a tab that already counted this article today: sessionStorage holds
 *     `av:<id>:<YYYY-MM-DD>`. That key is the ONLY thing this writes on the
 *     device — no cookie, no localStorage, nothing that outlives the tab. If
 *     storage throws (private mode, blocked site data) the view is sent anyway.
 */
export function ArticleViewBeacon({ article }) {
  const id = article?._id ? String(article._id) : '';
  const countable = isCountableArticle(article);

  useEffect(() => {
    if (!countable) return;
    if (typeof navigator === 'undefined' || navigator.webdriver) return;
    if (window.location.pathname.startsWith('/admin')) return;

    const key = viewSessionKey(id, viewDay());
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch { /* storage unavailable — count anyway */ }

    const body = JSON.stringify({ id });
    let sent = false;
    try {
      sent = typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon(VIEW_ENDPOINT, new Blob([body], { type: 'application/json' }));
    } catch { /* fall through to fetch */ }
    if (!sent) {
      fetch(VIEW_ENDPOINT, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        credentials: 'omit',
      }).catch(() => {});
    }

    try {
      window.sessionStorage.setItem(key, '1');
    } catch { /* nothing to remember with — fine */ }
  }, [id, countable]);

  return null;
}
