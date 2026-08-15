/**
 * The reset ORCHESTRATORS — the code that actually writes.
 *
 * Every dependency is injected. That is not testing decoration: it is the only
 * way the destructive paths get exercised at all, because the hard constraint
 * on this round is that no destructive path runs against production, ever. The
 * fakes are the only place a purge is allowed to happen.
 *
 * Both functions follow the same skeleton, and the ORDER is the ruling:
 *
 *      read live  →  build/fetch replacement  →  assess  →  write (or refuse)
 *
 * Nothing is removed before the replacement exists. There is no branch in
 * either function that deletes first, and no argument that reorders them.
 */

import {
  VERDICT,
  assessBuild,
  assessReplace,
  assessPreview,
  permitsWrite,
} from '@/lib/cache-console/resetPlan';

/**
 * ── RESET A SINGLE-DOCUMENT SNAPSHOT (landing_cache, nav_menu_cache) ────────
 *
 * "Reset" differs from "sync" in exactly one way, and it is the destructive
 * way: a sync preserves the previous payload when the run fails
 * (syncLandingData.js:444 — `if (status === 'error' && previousDoc?.data)`),
 * whereas a reset replaces the stored document wholesale. That is what makes it
 * worth a guard: a reset can discard a last-known-good section that upstream
 * currently cannot serve.
 *
 * ── RULING 1, MADE STRUCTURAL ───────────────────────────────────────────────
 * `build()` runs to completion first and its result is assessed BEFORE
 * `replace()` is called. If the build is incomplete or empty, `replace` is
 * never invoked and the stored document is left exactly as it was. There is no
 * delete step anywhere in this function — the write is a single conditional
 * update that swaps the payload.
 *
 * ── CONCURRENCY: A COMPARE-AND-SWAP, AND WHAT IT ACTUALLY GUARANTEES ────────
 * `replace()` is handed the `syncedAt` the preview observed and must apply the
 * update ONLY to a document still carrying it. MongoDB applies a single
 * `findOneAndUpdate` atomically to one document, so of two concurrent applies
 * exactly one matches and the other matches nothing and is told so. A cron that
 * lands between the preview and the apply moves `syncedAt` and the apply
 * refuses rather than overwriting the cron's fresher snapshot.
 *
 * What it does NOT guarantee: it is not a lock. It does not stop a cron
 * starting a sync a millisecond after this update commits and overwriting it —
 * that is last-write-wins between two complete, valid snapshots, which is not a
 * lost update in any sense that matters here. The thing being prevented is a
 * write computed against a state that no longer exists.
 */
export async function resetSnapshot({
  target,
  preview,
  now,
  readLive,
  build,
  replace,
}) {
  const live = await readLive();

  const previewCheck = assessPreview(preview, { target, beforeCount: live.beforeCount }, now);
  if (!permitsWrite(previewCheck.verdict)) {
    return { ok: false, ...previewCheck, wrote: false };
  }

  // BUILD FIRST. Nothing above this line has written, and nothing writes until
  // the assessment below passes.
  const built = await build();

  const buildCheck = assessBuild({ complete: built.complete, itemCount: built.itemCount });
  if (!permitsWrite(buildCheck.verdict)) {
    return { ok: false, ...buildCheck, wrote: false, built: summarise(built) };
  }

  const swapped = await replace({ data: built.data, expectSyncedAt: live.syncedAt });
  if (!swapped) {
    return {
      ok: false,
      verdict: VERDICT.REFUSE_DRIFTED,
      reason:
        'มีการเขียนสแนปช็อตนี้จากที่อื่นระหว่างที่กำลังยืนยัน (cron หรือแอดมินอีกคน) — '
        + 'ไม่ได้เขียนทับ กรุณากดดูตัวอย่างใหม่ '
        + '(the document changed under us; nothing was written)',
      wrote: false,
    };
  }

  return {
    ok: true,
    verdict: VERDICT.OK,
    reason: '',
    wrote: true,
    before: live.summary,
    after: summarise(built),
  };
}

function summarise(built) {
  return {
    itemCount: built?.itemCount ?? 0,
    sections: built?.sections ?? null,
    complete: Boolean(built?.complete),
  };
}

/**
 * ── REPLACE-SET A MIRROR COLLECTION ─────────────────────────────────────────
 *
 * The only action in this console that can lose data permanently. The four
 * mirror syncs never delete, so a record removed upstream keeps its local row
 * forever; this is the one path that purges those rows, and therefore the one
 * path that can purge rows that were never meant to go.
 *
 * ── RULING 2, MADE STRUCTURAL ───────────────────────────────────────────────
 * The incoming id set is fetched and counted BEFORE anything is deleted, the
 * verdict is computed from LIVE numbers (never from the preview's — see
 * assessPreview's note on why no signature is needed), and `remove()` is
 * reached only through `permitsWrite`.
 *
 * ── CONCURRENCY: NOT A LOCK, AND SAYING SO ──────────────────────────────────
 * A replace-set spans many documents, so there is no single-document
 * compare-and-swap to lean on the way the snapshot reset does. What is here
 * instead:
 *
 *   · the id list to delete is computed inside this call, from a read taken
 *     inside this call — never from the preview;
 *   · the delete is scoped to that explicit list, so it can only ever remove
 *     rows this call decided on;
 *   · the drift check refuses when the collection changed since the preview.
 *
 * The residual risk, stated rather than papered over: two admins confirming
 * within the same window both compute the same purge set, the first deletes it,
 * the second deletes nothing further. That is idempotent, not excluded. A row
 * created upstream and synced in BETWEEN this call's read and its delete would
 * not be in the purge list, so it survives. There is no window in which this
 * deletes a row it did not see.
 */
export async function resetMirror({
  target,
  preview,
  confirmed = false,
  now,
  readLive,
  fetchUpstreamIds,
  remove,
}) {
  const live = await readLive();

  const previewCheck = assessPreview(preview, { target, beforeCount: live.beforeCount }, now);
  if (!permitsWrite(previewCheck.verdict)) {
    return { ok: false, ...previewCheck, wrote: false, removedCount: 0 };
  }

  // FETCH FIRST. No delete has been issued and none can be until the verdict
  // below permits it.
  const upstream = await fetchUpstreamIds();

  // An upstream read that FAILED is not an empty upstream. `unwrap()` cannot
  // tell them apart, so the fetcher reports it explicitly and this refuses
  // before the counts are even compared — otherwise an outage would present as
  // a purge of the entire collection.
  if (!upstream.ok) {
    return {
      ok: false,
      verdict: VERDICT.REFUSE_INCOMPLETE,
      reason:
        `อ่านข้อมูลต้นทางไม่สำเร็จ (${upstream.error ?? 'unknown'}) — ไม่ได้ลบอะไรเลย `
        + '(upstream read failed; nothing was deleted)',
      wrote: false,
      removedCount: 0,
    };
  }

  const keep = new Set(upstream.ids.map(String));
  const doomed = live.ids.filter((id) => !keep.has(String(id)));
  const afterCount = live.beforeCount - doomed.length;

  // THE VERDICT IS RECOMPUTED FROM LIVE DATA. The preview's numbers were used
  // for drift detection only; nothing the caller sent decides this.
  const replaceCheck = assessReplace({
    beforeCount: live.beforeCount,
    afterCount,
    confirmed,
  });
  if (!permitsWrite(replaceCheck.verdict)) {
    return { ok: false, ...replaceCheck, wrote: false, removedCount: 0, doomed };
  }

  if (doomed.length === 0) {
    // Nothing to purge is a successful no-op, not a failure — but it must not
    // report `wrote: true`, because the audit row keys off that.
    return {
      ok: true, verdict: VERDICT.OK, reason: '', wrote: false,
      removedCount: 0, ...replaceCheck,
    };
  }

  const removedCount = await remove(doomed);

  return {
    ok: true,
    verdict: VERDICT.OK,
    reason: '',
    wrote: true,
    removedCount,
    doomed,
    ...replaceCheck,
  };
}
