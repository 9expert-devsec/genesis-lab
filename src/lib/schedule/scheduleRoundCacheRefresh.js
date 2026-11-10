/**
 * The round-change refresh that is NOT a Next cache tag — shared by the admin
 * round save (lib/actions/schedules.js) and the MSDB `schedule.*` webhook
 * (lib/webhooks/handlers.js), so a round that is closed, reopened, moved or
 * deleted leaves the two non-tag caches that hold rounds:
 *
 *   1. the /search corpus — an IN-PROCESS 30-minute TTL (lib/search/searchCorpus).
 *      `resetSearchCorpusCache()` clears it on THE SERVING INSTANCE ONLY; other
 *      warm instances keep theirs until their own TTL, and /search's ISR
 *      (revalidate = 1800) bounds the rest. A tag bust cannot reach it.
 *   2. landing_cache — the Mongo snapshot the home page reads, rebuilt by
 *      `syncLandingData` (the same function the course webhook triggers). It is
 *      a FULL-SITE sync (courses, programs, featured, per-course rounds), so it
 *      runs AFTER the response via `after()`, never on the admin's click. It
 *      records only `syncedAt`, not a duration.
 *
 * Neither may fail the caller: the round write has already happened upstream.
 */

import { after } from 'next/server';

async function runLandingSync() {
  try {
    const { syncLandingData } = await import('@/lib/landing/syncLandingData');
    const started = Date.now();
    await syncLandingData();
    // eslint-disable-next-line no-console
    console.log(`[scheduleRoundCacheRefresh] landing sync done in ${Date.now() - started}ms`);
  } catch (err) {
    console.warn('[scheduleRoundCacheRefresh] landing sync failed:', err?.message ?? err);
  }
}

export async function refreshRoundCachesOutsideTags() {
  try {
    const { resetSearchCorpusCache } = await import('@/lib/search/searchCorpus');
    resetSearchCorpusCache();
  } catch (err) {
    console.warn('[scheduleRoundCacheRefresh] search corpus reset failed:', err?.message ?? err);
  }

  try {
    after(runLandingSync);
  } catch (err) {
    // after() throws outside a request scope (scripts, tests). Fall back to
    // fire-and-forget, exactly as the course webhook's landing sync does.
    runLandingSync();
  }
}
