import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetSnapshot, resetMirror } from '@/lib/cache-console/applyReset';
import { VERDICT, PREVIEW_MAX_AGE_MS } from '@/lib/cache-console/resetPlan';

/**
 * The orchestrators, driven against fakes that RECORD EVERY CALL IN ORDER.
 *
 * Order is the subject, not a detail. Ruling 1 is a statement about sequence —
 * build before replace, never delete before build — and the only way to assert
 * a sequence is to observe one. A test that checked only the return value would
 * pass against an implementation that deleted first and rebuilt afterwards,
 * which is the exact reversal being defended against.
 *
 * These fakes are also the ONLY place a purge happens anywhere in this round.
 * The hard constraint is that no destructive path runs against production, so
 * every claim below is a claim about this harness — and where a claim needs a
 * real database to prove, it is listed as unproven rather than asserted.
 */

const NOW = 1_760_000_000_000;

function snapshotHarness({ buildResult, swapOk = true, liveCount = 27 } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      target: 'landing_cache',
      now: NOW,
      readLive: async () => {
        calls.push('readLive');
        return {
          beforeCount: liveCount,
          syncedAt: '2026-08-12T03:00:00.000Z',
          summary: { itemCount: liveCount },
        };
      },
      build: async () => {
        calls.push('build');
        return buildResult;
      },
      replace: async (args) => {
        calls.push(`replace(expect=${args.expectSyncedAt})`);
        return swapOk;
      },
    },
  };
}

const FRESH_PREVIEW = {
  target: 'landing_cache',
  beforeCount: 27,
  issuedAt: NOW - 1_000,
};

// ══ RULING 1 — BUILD BEFORE REPLACE, AND NEVER A DELETE ════════════════════

test('RULING 1: the ORDER is readLive → build → replace', () => {
  const h = snapshotHarness({ buildResult: { complete: true, itemCount: 27, data: {} } });
  return resetSnapshot({ preview: FRESH_PREVIEW, ...h.deps }).then((r) => {
    assert.equal(r.ok, true);
    assert.deepEqual(h.calls, [
      'readLive',
      'build',
      'replace(expect=2026-08-12T03:00:00.000Z)',
    ]);
  });
});

test('RULING 1 REVERSED: a FAILED build never reaches replace at all', async () => {
  // The reversal: emptying the document and then trying to refill it. If
  // `replace` is ever called before the build is assessed, this goes red.
  const h = snapshotHarness({ buildResult: { complete: false, itemCount: 4, data: {} } });
  const r = await resetSnapshot({ preview: FRESH_PREVIEW, ...h.deps });

  assert.equal(r.ok, false);
  assert.equal(r.verdict, VERDICT.REFUSE_INCOMPLETE);
  assert.equal(r.wrote, false);
  assert.ok(!h.calls.some((c) => c.startsWith('replace')), 'replace was NEVER called');
});

test('RULING 1 REVERSED: an EMPTY build never reaches replace either', async () => {
  const h = snapshotHarness({ buildResult: { complete: true, itemCount: 0, data: {} } });
  const r = await resetSnapshot({ preview: FRESH_PREVIEW, ...h.deps });
  assert.equal(r.verdict, VERDICT.REFUSE_EMPTY);
  assert.ok(!h.calls.some((c) => c.startsWith('replace')));
});

test('CONTROL: the harness CAN record a replace — the assertions above are not vacuous', async () => {
  // Without this, "replace was never called" passes against a harness whose
  // replace fake was never wired up.
  const h = snapshotHarness({ buildResult: { complete: true, itemCount: 27, data: {} } });
  await resetSnapshot({ preview: FRESH_PREVIEW, ...h.deps });
  assert.ok(h.calls.some((c) => c.startsWith('replace')), 'the fake does record');
});

test('the compare-and-swap carries the syncedAt the preview saw', async () => {
  // What makes two concurrent applies resolve to one winner: the update is
  // conditional on the document still being the one that was previewed.
  const h = snapshotHarness({ buildResult: { complete: true, itemCount: 27, data: {} } });
  await resetSnapshot({ preview: FRESH_PREVIEW, ...h.deps });
  assert.ok(h.calls.includes('replace(expect=2026-08-12T03:00:00.000Z)'));
});

test('a LOST compare-and-swap reports drift and claims no write', async () => {
  // The cron landed between the preview and the apply. Nothing was overwritten.
  const h = snapshotHarness({
    buildResult: { complete: true, itemCount: 27, data: {} },
    swapOk: false,
  });
  const r = await resetSnapshot({ preview: FRESH_PREVIEW, ...h.deps });
  assert.equal(r.ok, false);
  assert.equal(r.verdict, VERDICT.REFUSE_DRIFTED);
  assert.equal(r.wrote, false);
});

test('RULING 3 on the snapshot path: no preview means no build and no write', async () => {
  // Note it does not even BUILD — a refused apply should not fan out to
  // upstream on the strength of a request that was never going to be honoured.
  const h = snapshotHarness({ buildResult: { complete: true, itemCount: 27, data: {} } });
  const r = await resetSnapshot({ preview: null, ...h.deps });
  assert.equal(r.verdict, VERDICT.REFUSE_NO_PREVIEW);
  assert.deepEqual(h.calls, ['readLive'], 'it stopped after the live read');
});

test('RULING 3 on the snapshot path: a stale preview is refused before building', async () => {
  const h = snapshotHarness({ buildResult: { complete: true, itemCount: 27, data: {} } });
  const stale = { ...FRESH_PREVIEW, issuedAt: NOW - PREVIEW_MAX_AGE_MS - 1 };
  const r = await resetSnapshot({ preview: stale, ...h.deps });
  assert.equal(r.verdict, VERDICT.REFUSE_STALE);
  assert.deepEqual(h.calls, ['readLive']);
});

// ══ RULING 2 — THE COLLAPSE GUARD, ON THE PATH THAT DELETES ════════════════

function mirrorHarness({ liveIds, upstream, removed = null } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      target: 'faqs',
      now: NOW,
      readLive: async () => {
        calls.push('readLive');
        return { beforeCount: liveIds.length, ids: liveIds };
      },
      fetchUpstreamIds: async () => {
        calls.push('fetchUpstream');
        return upstream;
      },
      remove: async (ids) => {
        calls.push(`remove(${ids.length})`);
        return removed ?? ids.length;
      },
    },
  };
}

const IDS_40 = Array.from({ length: 40 }, (_, i) => `f${i}`);
const previewFor = (n) => ({ target: 'faqs', beforeCount: n, issuedAt: NOW - 1_000 });

test('RULING 2: the ORDER is readLive → fetchUpstream → remove', async () => {
  const h = mirrorHarness({
    liveIds: IDS_40,
    upstream: { ok: true, ids: IDS_40.slice(0, 39) },
  });
  const r = await resetMirror({ preview: previewFor(40), ...h.deps });
  assert.equal(r.ok, true);
  assert.deepEqual(h.calls, ['readLive', 'fetchUpstream', 'remove(1)']);
});

test('RULING 2 REVERSED: a COLLAPSE deletes nothing without confirmation', async () => {
  // 40 → 5 is an 87% loss. `remove` must never be reached.
  const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: true, ids: IDS_40.slice(0, 5) } });
  const r = await resetMirror({ preview: previewFor(40), ...h.deps });

  assert.equal(r.ok, false);
  assert.equal(r.verdict, VERDICT.CONFIRM_COLLAPSE);
  assert.equal(r.removedCount, 0);
  assert.ok(!h.calls.some((c) => c.startsWith('remove')), 'remove was NEVER called');
  assert.match(r.reason, /35/, 'the refusal names how many would go');
});

test('the same collapse DOES delete once confirmed', async () => {
  const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: true, ids: IDS_40.slice(0, 5) } });
  const r = await resetMirror({ preview: previewFor(40), confirmed: true, ...h.deps });
  assert.equal(r.ok, true);
  assert.equal(r.removedCount, 35);
  assert.ok(h.calls.includes('remove(35)'));
});

test('RULING 2 REVERSED: an EMPTY upstream set deletes nothing, confirmed or not', async () => {
  for (const confirmed of [false, true]) {
    const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: true, ids: [] } });
    const r = await resetMirror({ preview: previewFor(40), confirmed, ...h.deps });
    assert.equal(r.verdict, VERDICT.REFUSE_EMPTY, `confirmed=${confirmed}`);
    assert.equal(r.removedCount, 0);
    assert.ok(!h.calls.some((c) => c.startsWith('remove')), `confirmed=${confirmed}`);
  }
});

test('a FAILED upstream read is not an empty upstream — nothing is deleted', async () => {
  // The distinction unwrap() cannot make, made here explicitly. Without it an
  // outage presents as "upstream has no rows" and purges the collection.
  const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: false, error: 'timeout' } });
  const r = await resetMirror({ preview: previewFor(40), confirmed: true, ...h.deps });
  assert.equal(r.ok, false);
  assert.equal(r.verdict, VERDICT.REFUSE_INCOMPLETE);
  assert.match(r.reason, /timeout/);
  assert.ok(!h.calls.some((c) => c.startsWith('remove')));
});

test('the delete is scoped to an EXPLICIT id list computed in this call', async () => {
  // Not a filter, not a "delete where not in upstream" query evaluated server
  // side at some later moment: the exact ids this call decided on. A row synced
  // in after the read is not in the list and cannot be caught by it.
  const h = mirrorHarness({
    liveIds: ['a', 'b', 'c', 'd', 'e'],
    upstream: { ok: true, ids: ['a', 'b', 'c', 'd'] },
  });
  const r = await resetMirror({ preview: previewFor(5), ...h.deps });
  assert.deepEqual(r.doomed, ['e']);
  assert.ok(h.calls.includes('remove(1)'));
});

test('nothing to purge is a successful NO-OP that does not claim a write', async () => {
  // `wrote` is what the audit row keys off, so a no-op reporting true would put
  // a reset row in the trail for a reset that removed nothing.
  const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: true, ids: IDS_40 } });
  const r = await resetMirror({ preview: previewFor(40), ...h.deps });
  assert.equal(r.ok, true);
  assert.equal(r.wrote, false);
  assert.equal(r.removedCount, 0);
  assert.ok(!h.calls.some((c) => c.startsWith('remove')));
});

test('RULING 3 on the mirror path: no preview means no upstream fetch and no delete', async () => {
  const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: true, ids: [] } });
  const r = await resetMirror({ preview: null, confirmed: true, ...h.deps });
  assert.equal(r.verdict, VERDICT.REFUSE_NO_PREVIEW);
  assert.deepEqual(h.calls, ['readLive'], 'it stopped after the live read');
});

test('RULING 3 on the mirror path: DRIFT since the preview refuses the delete', async () => {
  // The preview saw 40; the collection now holds 38 because a cron ran. The
  // numbers the admin confirmed describe a collection that no longer exists.
  const h = mirrorHarness({
    liveIds: IDS_40.slice(0, 38),
    upstream: { ok: true, ids: IDS_40.slice(0, 30) },
  });
  const r = await resetMirror({ preview: previewFor(40), confirmed: true, ...h.deps });
  assert.equal(r.verdict, VERDICT.REFUSE_DRIFTED);
  assert.ok(!h.calls.some((c) => c.startsWith('remove')));
});

test('the verdict is recomputed from LIVE data, not from the preview numbers', async () => {
  /**
   * The reason no signature is needed on the preview. A caller supplying
   * flattering counts — 40 → 39, a routine purge — must not be able to talk the
   * guard out of a real collapse. Here the preview matches live (so drift
   * passes) but upstream really returns 5, and the guard fires on THAT.
   */
  const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: true, ids: IDS_40.slice(0, 5) } });
  const r = await resetMirror({
    preview: { ...previewFor(40), afterCount: 39, removed: 1 }, // flattering, and ignored
    ...h.deps,
  });
  assert.equal(r.verdict, VERDICT.CONFIRM_COLLAPSE);
  assert.equal(r.removed, 35, 'the real number, not the one supplied');
});

test('CONTROL: the mirror harness CAN reach remove — the negatives are not vacuous', async () => {
  const h = mirrorHarness({ liveIds: IDS_40, upstream: { ok: true, ids: IDS_40.slice(0, 39) } });
  await resetMirror({ preview: previewFor(40), ...h.deps });
  assert.ok(h.calls.some((c) => c.startsWith('remove')));
});
