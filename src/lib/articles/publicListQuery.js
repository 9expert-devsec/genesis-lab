/**
 * The public /articles list's URL state, carried into and back out of an
 * article page.
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 * A reader on /articles?page=3 opened an article, pressed กลับไปยังบทความทั้งหมด
 * and landed on page 1: the card linked to a bare /articles/{slug} and the
 * back link pointed at a bare /articles, so nothing between the two hops knew
 * where the reader had been. Same defect the admin lists had, same cure —
 * see lib/articles/adminListQuery for the admin list and lib/adminListQuery
 * for the mechanism.
 *
 * ── WHAT IS STATE HERE ──────────────────────────────────────────────────────
 * Everything /articles/page.jsx reads out of its searchParams: the page, the
 * search, the tag chip, the program and skill filters — and `type`, which no
 * control offers any more but which the page still honours (see the long note
 * there). If the page reads it, the way back has to reproduce it, or the fix is
 * the bug in a new place.
 *
 * ── THE ARTICLE PAGE STAYS ISR ──────────────────────────────────────────────
 * The article page has `revalidate = 3600` and MUST NOT read searchParams on
 * the server — that would make every article render per request to serve one
 * link. So the back link is a client component reading `useSearchParams`
 * inside its own Suspense boundary, with a bare /articles link as the
 * server-rendered fallback. See ArticleBackLink and
 * test/fs/articleDetailStaysIsr.
 */
import { listQueryReader, withListQuery } from '@/lib/adminListQuery';

export { withListQuery };

/** The params that make up the public article list's state, in URL order. */
export const PUBLIC_ARTICLE_LIST_PARAMS = ['page', 'q', 'tag', 'program', 'skill', 'type'];

/** The list's URL state as read off a set of search params, or '' when bare. */
export const articlePublicListQuery = listQueryReader(PUBLIC_ARTICLE_LIST_PARAMS);
