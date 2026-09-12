/**
 * GET /api/corpus/promotions
 *
 * Read-only: every promotion genesis is selling right now, as data, for the
 * chat agent. The shape, the liveness rules and the operator steps are in
 * docs/promotions-corpus-endpoint.md; the measurement it follows is
 * docs/promotions-corpus-phase-a.md.
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────
 *   x-api-key  compared against CORPUS_API_KEY — a key of its OWN, never the
 *              MSDB AI_API_KEY, so it can be rotated or revoked without touching
 *              the upstream integration.
 *   401        wrong or missing key. Empty body: nothing to learn from it.
 *   503        CORPUS_API_KEY is not set. FAIL CLOSED — see promotionsAuth.js;
 *              the cron route's skip-when-unset is the pattern NOT copied here.
 *
 * ── FRESHNESS ──────────────────────────────────────────────────────────────
 * force-dynamic and `Cache-Control: no-store`: a deadline that passes must be
 * gone on the next request, not within an ISR window. `now` is captured once
 * inside the builder and returned as `generated_at`.
 */
import { NextResponse } from 'next/server';
import { CORPUS_KEY_HEADER, corpusAuthStatus } from '@/lib/corpus/promotionsAuth';
import { buildPromotionsCorpus } from '@/lib/corpus/promotions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

export async function GET(req) {
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

  const body = await buildPromotionsCorpus();
  return NextResponse.json(body, { headers: NO_STORE });
}
