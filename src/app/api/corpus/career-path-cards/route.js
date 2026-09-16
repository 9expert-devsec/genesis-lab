/**
 * GET /api/corpus/career-path-cards
 *
 * Read-only: one card per active Career Path — title, short description,
 * hero image, the course list, URL and the price the detail page
 * shows — for the chat widget's career-path card. What is
 * served and what is deliberately not is in src/lib/corpus/careerPathCards.js;
 * the survey it follows is docs/career-path-chat-card-phase-a.md.
 *
 * A SIBLING of /api/corpus/masterclass-cards in the same shell: the data lives
 * in genesis Mongo (career_paths), read through the listing's own selector.
 *
 * ── AUTH — the same key and the same check as the three sibling routes ───────
 *   x-api-key  compared against CORPUS_API_KEY via corpusAuthStatus.
 *   401        wrong or missing key. Empty body.
 *   503        CORPUS_API_KEY is not set. FAIL CLOSED — see promotionsAuth.js.
 *
 * ── FRESHNESS ──────────────────────────────────────────────────────────────
 * force-dynamic and `Cache-Control: no-store`, as the siblings: an admin edit
 * (display_order, is_active, a resync) must be visible on the next call.
 *
 * ── 500 ────────────────────────────────────────────────────────────────────
 * A read that throws is answered with 500 `corpus_invalid` and nothing else —
 * a partial card list is not served.
 */
import { NextResponse } from 'next/server';
import { CORPUS_KEY_HEADER, corpusAuthStatus } from '@/lib/corpus/promotionsAuth';
import { buildCareerPathCards } from '@/lib/corpus/careerPathCards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

/**
 * The handler with its reads injectable, so the test tier can drive the 200
 * path without Mongo. `GET` below is this with no deps — production.
 */
export async function handleGet(req, deps = {}) {
  const status = corpusAuthStatus(req.headers.get(CORPUS_KEY_HEADER), process.env.CORPUS_API_KEY);
  if (status === 503) {
    return NextResponse.json(
      { error: 'corpus_unavailable', message: 'the corpus endpoint is not configured on this deployment' },
      { status: 503, headers: NO_STORE }
    );
  }
  if (status !== 200) {
    return new NextResponse(null, { status: 401, headers: NO_STORE });
  }

  let body;
  try {
    body = await buildCareerPathCards(deps);
  } catch (err) {
    (deps.log ?? console.error)('[corpus/career-path-cards] build failed:', err);
    return NextResponse.json({ error: 'corpus_invalid' }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json(body, { headers: NO_STORE });
}

export async function GET(req) {
  return handleGet(req);
}
