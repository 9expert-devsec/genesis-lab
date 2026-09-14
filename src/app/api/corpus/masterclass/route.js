/**
 * GET /api/corpus/masterclass
 *
 * Read-only: the content of every published Masterclass course, as plain-text
 * fields, for the chat agent's corpus sync. What is served and what is
 * deliberately not is in src/lib/corpus/masterclass.js and in
 * docs/masterclass-corpus-endpoint.md; the measurement it follows is
 * docs/masterclass-corpus-phase-a.md.
 *
 * ── AUTH — the same key and the same check as /api/corpus/promotions ────────
 *   x-api-key  compared against CORPUS_API_KEY via corpusAuthStatus.
 *   401        wrong or missing key. Empty body.
 *   503        CORPUS_API_KEY is not set. FAIL CLOSED — see promotionsAuth.js.
 *
 * ── FRESHNESS ──────────────────────────────────────────────────────────────
 * force-dynamic and `Cache-Control: no-store`, as the sibling route: the sync
 * that calls this decides its own cadence, and an admin edit must be visible
 * on the next call, not after an ISR window. `generated_at` says when.
 *
 * ── 500 ────────────────────────────────────────────────────────────────────
 * The builder throws if any emitted string still carries markup. That is
 * answered with 500 `corpus_invalid` and nothing else — a partial or tagged
 * corpus is not served.
 */
import { NextResponse } from 'next/server';
import { CORPUS_KEY_HEADER, corpusAuthStatus } from '@/lib/corpus/promotionsAuth';
import { buildMasterclassCorpus } from '@/lib/corpus/masterclass';

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
    body = await buildMasterclassCorpus(deps);
  } catch (err) {
    (deps.log ?? console.error)('[corpus/masterclass] build failed:', err);
    return NextResponse.json({ error: 'corpus_invalid' }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json(body, { headers: NO_STORE });
}

export async function GET(req) {
  return handleGet(req);
}
