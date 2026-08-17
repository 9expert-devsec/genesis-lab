import { NextResponse } from 'next/server';
import { getSearchCorpus } from '@/lib/search/searchCorpus';
import { searchCorpusFor, SEARCH_MIN_CHARS } from '@/lib/search/matchSearch';

/**
 * GET /api/search?q=… → `{ term, active, results, counts, total }`.
 *
 * ── ROUTE HANDLER, NOT A SERVER ACTION ──────────────────────────────────────
 * Three reasons, in order of how much they matter here:
 *
 *  1. ABORTABILITY. This backs a 200ms-debounced type-ahead, where the correct
 *     behaviour when the query changes is to cancel the request in flight. A
 *     `fetch` to a route takes an `AbortSignal`; a server action has no
 *     equivalent — you can ignore its result, but it still runs and still
 *     occupies the queue.
 *  2. SERIALISATION. Next runs server actions one at a time per client, in
 *     submission order. That is right for mutations and exactly wrong for a
 *     type-ahead: a slow reply for "pow" delays the reply for "power bi".
 *  3. IDEMPOTENCE AND CACHING. This is a read, keyed entirely by its URL.
 *     Actions are POSTs and uncacheable by construction; a GET can carry
 *     `Cache-Control` and be served from a CDN for a repeated query.
 *
 * The handler owns NO matching rules — fetch the corpus, call the pure matcher,
 * serialise. Every rule worth testing is in @/lib/search/matchSearch.js.
 */

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = String(new URL(request.url).searchParams.get('q') ?? '');

  // Short-circuit BEFORE touching the corpus: a one-character query must not
  // trigger a cold build. The matcher would return the same empty shape, but
  // only after the corpus had been assembled to be ignored.
  if (q.trim().length < SEARCH_MIN_CHARS) {
    return NextResponse.json(searchCorpusFor({}, q));
  }

  try {
    const corpus = await getSearchCorpus();
    return NextResponse.json(searchCorpusFor(corpus, q), {
      headers: {
        // Repeated queries (a shared link, a back-navigation) are served
        // without rebuilding anything. Shorter than the corpus TTL on purpose:
        // this caches a RESULT, and a result may be stale in ways the corpus
        // is not.
        'cache-control': 'public, s-maxage=300, stale-while-revalidate=1800',
      },
    });
  } catch (err) {
    // A failure must be reported AS a failure. Returning an empty result set
    // here would render "ไม่พบผลลัพธ์" — telling the visitor their query has
    // no matches, which is a different and false statement.
    console.error('[api/search] corpus or match failed:', err);
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
}
