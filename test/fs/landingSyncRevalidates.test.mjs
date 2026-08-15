import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * Rewriting the landing snapshot must regenerate the page built from it.
 *
 * ── THE FAILURE THIS COMES FROM ─────────────────────────────────────────────
 * The home page's ค้นหาสิ่งที่คุณสนใจ section showed "ไม่สามารถโหลดรายการได้ในขณะนี้"
 * on its Programs tab while Skills rendered fine. The data was not missing: the
 * `landing_cache` document held 8 programs, and the same page rendered
 * correctly against that same database locally. What was stale was the HTML.
 *
 * `src/app/page.jsx` exports no `revalidate` and no `dynamic`, so `/` is FULLY
 * STATIC — built once at deploy, refreshed only by an on-demand
 * `revalidatePath('/')`. Three of the four callers that rewrite the cache never
 * called it, including the 3-hourly cron that is the main path. So a snapshot
 * repaired at 08:36 could not reach a visitor at all, and the page kept serving
 * whatever the cache happened to say at build time — until the next deploy.
 *
 * The invariant belongs to the WRITE, not to each caller: whoever rewrites the
 * snapshot has by definition made the built page stale. This guard pins it
 * there, because "three of four call sites forgot" is exactly what a shared
 * invariant scattered across call sites looks like.
 *
 * A text scan: `syncLandingData` reaches mongoose, the MSDB client and eleven
 * admin actions at import time, so there is nothing a unit test can call.
 */

const SYNC = readSource('src/lib/landing/syncLandingData.js');
const PAGE = readSource('src/app/page.jsx');

test('the sync regenerates the home page after writing the cache', () => {
  assert.match(
    SYNC.code,
    /revalidatePath\('\/'\)/,
    'the landing sync writes the snapshot without regenerating the page built from it'
  );
  assert.match(
    SYNC.withImports,
    /import\s*\{[^}]*\brevalidatePath\b[^}]*\}\s*from\s*'next\/cache'/,
    'revalidatePath is used but not imported — a free identifier'
  );
});

test('the revalidate happens AFTER the cache write, not before', () => {
  // Before the write it would regenerate the page from the OLD snapshot and
  // then replace it — the same staleness, one step further along.
  const write = SYNC.code.indexOf('LandingCache.findOneAndUpdate');
  const revalidate = SYNC.code.indexOf("revalidatePath('/')");
  assert.notEqual(write, -1, 'the cache write is gone — has this been rewritten?');
  assert.notEqual(revalidate, -1);
  assert.ok(revalidate > write, 'revalidatePath runs before the snapshot is written');
});

test('the revalidate cannot fail the sync', () => {
  // `revalidatePath` throws outside a request/render scope, and the webhook
  // path calls this fire-and-forget. A sync that already wrote a good snapshot
  // must not be reported as failed because the regeneration hook was
  // unavailable — the next write tries again.
  const tail = SYNC.code.slice(SYNC.code.indexOf('LandingCache.findOneAndUpdate'));
  assert.match(
    tail,
    /try\s*\{[\s\S]{0,120}revalidatePath\('\/'\)[\s\S]{0,200}?\}\s*catch/,
    'revalidatePath is unguarded — it can throw and lose an otherwise good sync'
  );
});

// ── controls ────────────────────────────────────────────────────────────────

test('CONTROL: the home page is still statically built — which is WHY this matters', () => {
  // If `/` ever gains `export const revalidate` or `dynamic = 'force-dynamic'`,
  // it re-renders per request and the guard above is no longer load-bearing.
  // This control makes that a visible decision instead of a silent one: it
  // fails, someone reads this file, and the reasoning gets revisited.
  assert.doesNotMatch(
    PAGE.code,
    /export\s+const\s+(revalidate|dynamic)\s*=/,
    'page.jsx now configures its own caching — re-read whether the sync still needs to revalidate'
  );
});

test('CONTROL: the sync still WRITES the snapshot', () => {
  // Proves the assertions above are not passing against a gutted module: a
  // sync that revalidated but stopped writing would satisfy every match here
  // and serve a permanently empty page.
  assert.match(SYNC.code, /LandingCache\.findOneAndUpdate\(/);
  assert.match(SYNC.code, /upsert:\s*true/);
});
