'use server';

/**
 * The cache console's write actions — preview (read-only) and apply
 * (destructive), for the four mirror collections.
 *
 * ── EVERY EXPORT HERE IS A PUBLIC POST ENDPOINT ─────────────────────────────
 * In a 'use server' module every export is invocable over the network, which is
 * why each one opens with `requireAdmin`. The audit plan makes the same point
 * about the three dead sync actions: an uncalled export is not inert, it is an
 * unreachable-by-the-UI but publicly-invocable mutation.
 *
 * ── WHY THE ACTION LAYER AND NOT A ROUTE ────────────────────────────────────
 * The existing sync BUTTONS post to the `/api/admin/<name>/sync` routes, and
 * instrumenting those is sweep round 6's job — it has to solve actor-and-menu
 * resolution once for all seven route handlers, and doing it ad hoc here would
 * establish a second pattern before the first exists. These are NEW actions, so
 * they take the established shape: `requireAdmin(pageKey)` hands over both the
 * menu and the actor in one call, which is the asset §6 of the plan is built
 * around.
 *
 * (No glob is written in that route path above. A `*` immediately followed by a
 * `/` closes a block comment, which silently turned the rest of this header into
 * code and the whole file into a syntax error the first time it was written.)
 *
 * ── THE MENU IS A LITERAL AT EVERY SITE, NOT A SHARED CONSTANT ──────────────
 * `requireAdmin('landing_cache')` and `menu: 'landing_cache'` are spelled out
 * in each function rather than hoisted. That is not repetition anyone forgot to
 * clean up: test/fs/auditCoverage compares the menu a function AUDITS against
 * the menu it GUARDS, statically, in the same function body. A shared constant
 * makes the two unverifiable and lets one drift from the other silently, which
 * is the failure the check exists for.
 *
 * ── THE ORDER IS mutate → revalidate → audit (§8.12) ────────────────────────
 * and a not-ok return writes no row, consistent with "if the write throws there
 * is no row".
 *
 * ── ONE HUMAN ACTION IS ONE ROW ─────────────────────────────────────────────
 * A purge that removes 22 rows is ONE audit row with the count in the payload,
 * not 22 rows. Two rows would only be right if two different RECORDS changed,
 * and here the record that changed is the collection.
 */

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { dbConnect } from '@/lib/db/connect';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { mirrorTarget, MIRROR_KEYS } from '@/lib/cache-console/resetTargets';
import { resetMirror } from '@/lib/cache-console/applyReset';
import { assessReplace, assessPreview, permitsWrite, VERDICT } from '@/lib/cache-console/resetPlan';
import { sectionCountsOf } from '@/lib/cache-console/downgradeGuard';
// STATIC, not a dynamic import inside the function. auditCoverage's walk
// resolves static imports only, so a dynamic one would classify this file's
// override as READ-ONLY — it writes the snapshot through this very function —
// and the 'every mutating export records an audit row' check would skip it.
// The classification would then be correct by luck rather than by the guard.
import { syncLandingData } from '@/lib/landing/syncLandingData';

/**
 * Read every local row's Mongo `_id` alongside its mirror id.
 *
 * ── WHY THE PURGE IS KEYED ON `_id` AND NOT ON THE MIRROR ID ────────────────
 * MEASURED on production: `instructors` holds 16 rows, of which 6 carry no
 * `instructor_id` at all. Those six are records an admin created directly
 * rather than ones a sync brought in, and they must never be doomed: nothing
 * upstream can vouch for them, so "absent from the upstream list" is true of
 * them permanently. They are excluded EXPLICITLY and reported, rather than
 * falling out of a `.filter(Boolean)` by accident — an accident that inverts
 * the moment someone keys the comparison differently.
 *
 * CORRECTION, kept rather than quietly rewritten: this note previously also
 * cited a DUPLICATED `instructor_id` as justification. There is none. The
 * check that reported it grouped on the field without excluding missing
 * values, so the six null-id rows collapsed into one `_id: null` bucket and
 * were reported as a duplicated value — one finding counted twice, and the
 * wrong one, since a missing id and a duplicated id have opposite consequences.
 *
 * Keying on `_id` is still right, and the surviving reason is the stronger one:
 * one id is one row BY CONSTRUCTION, so `removedCount` cannot exceed what the
 * admin confirmed even if a duplicate appears upstream later. That is a
 * property of the key space rather than of today's data, which is what a guard
 * against a destructive action should rest on.
 *
 * `unmanaged` is returned so the preview can say so on screen: a count of 10
 * next to a collection of 16 is a number that needs its own sentence.
 */
async function readMirrorState(target) {
  const Model = await target.model();
  const rows = await Model.find({}, { [target.idField]: 1, _id: 1 }).lean();

  const managed = [];
  let unmanaged = 0;
  for (const r of rows) {
    const mirrorId = r?.[target.idField];
    if (mirrorId === undefined || mirrorId === null || mirrorId === '') unmanaged += 1;
    else managed.push({ _id: String(r._id), mirrorId: String(mirrorId) });
  }

  return {
    beforeCount: managed.length,
    totalRows: rows.length,
    unmanaged,
    managed,
    // The purge operates on these. `ids` stays the Mongo _id list so the
    // orchestrator's doomed set and the delete speak one key space.
    ids: managed.map((m) => m._id),
    mirrorIdOf: Object.fromEntries(managed.map((m) => [m._id, m.mirrorId])),
  };
}

/**
 * PREVIEW — read-only, and safe to run against production.
 *
 * Returns what an apply WOULD do: the current count, the incoming count, the
 * delta, and the ids that would disappear. It computes the verdict too, so the
 * screen can say "this will need a second confirmation" before the admin
 * commits to reading it — but the apply recomputes that verdict from its own
 * live read and never trusts this one.
 */
export async function previewMirrorReset(key) {
  await requireAdmin('landing_cache');

  const target = mirrorTarget(key);
  if (!target) return { ok: false, error: `ไม่รู้จักแคช "${key}"` };

  await dbConnect();

  let live;
  try {
    live = await readMirrorState(target);
  } catch (err) {
    return { ok: false, error: `อ่านข้อมูลในระบบไม่สำเร็จ: ${err?.message ?? err}` };
  }

  let upstreamIds;
  try {
    upstreamIds = await target.fetchUpstream();
  } catch (err) {
    // A failed upstream read is NOT an empty upstream. Reporting it as a
    // preview showing "0 incoming" would put a full-purge number on the screen
    // and invite someone to confirm it.
    return {
      ok: false,
      error:
        `อ่านข้อมูลต้นทางไม่สำเร็จ: ${err?.message ?? err} — `
        + 'ยังไม่ทราบว่าจะมีการเปลี่ยนแปลงอะไร',
    };
  }

  const keep = new Set(upstreamIds.map(String));
  // Doomed = managed rows whose MIRROR id is absent upstream, carried as Mongo
  // _ids so the count and the delete cannot disagree (see readMirrorState).
  const doomed = live.managed.filter((m) => !keep.has(m.mirrorId));
  const afterCount = live.beforeCount - doomed.length;
  const assessment = assessReplace({ beforeCount: live.beforeCount, afterCount });

  return {
    ok: true,
    preview: {
      target: key,
      beforeCount: live.beforeCount,
      issuedAt: Date.now(),
    },
    label: target.label,
    idField: target.idField,
    beforeCount: live.beforeCount,
    upstreamCount: upstreamIds.length,
    afterCount,
    // The ids that would go. Capped for display; `removed` carries the true
    // number so a cap can never understate the loss.
    totalRows: live.totalRows,
    unmanaged: live.unmanaged,
    doomedSample: doomed.slice(0, 20).map((m) => m.mirrorId),
    doomedTotal: doomed.length,
    verdict: assessment.verdict,
    reason: assessment.reason,
    needsConfirm: assessment.verdict === VERDICT.CONFIRM_COLLAPSE,
    refused: assessment.verdict === VERDICT.REFUSE_EMPTY,
  };
}

/**
 * APPLY — the destructive one.
 *
 * Every guard lives in `resetMirror`, which is driven here with real readers
 * and a real delete. Nothing about the decision is made in this file: this
 * supplies the I/O and records what happened.
 */
export async function applyMirrorReset(key, preview, confirmed = false) {
  const session = await requireAdmin('landing_cache');

  const target = mirrorTarget(key);
  if (!target) return { ok: false, error: `ไม่รู้จักแคช "${key}"` };

  await dbConnect();
  const Model = await target.model();

  /**
   * The orchestrator owns the ordering, so it calls `readLive` itself — and the
   * upstream translation below needs the SAME read's mirror-id map, not a
   * second one. Captured here as the orchestrator takes it, rather than read
   * twice: two reads is two states, and the whole point of this round is that a
   * delete computed against one state must not be applied to another.
   */
  let liveState = null;

  let result;
  try {
    result = await resetMirror({
      target: key,
      preview,
      confirmed,
      now: Date.now(),
      readLive: async () => {
        liveState = await readMirrorState(target);
        return liveState;
      },
      // The orchestrator compares live.ids (Mongo _ids) against this set, so
      // the upstream mirror ids are translated into the _ids they correspond
      // to. A local row whose mirror id is absent upstream simply has no entry
      // here and falls out as doomed.
      fetchUpstreamIds: async () => {
        try {
          const upstream = new Set((await target.fetchUpstream()).map(String));
          const survivingLocalIds = Object.entries(liveState.mirrorIdOf)
            .filter(([, mirrorId]) => upstream.has(mirrorId))
            .map(([_id]) => _id);
          return { ok: true, ids: survivingLocalIds };
        } catch (err) {
          return { ok: false, error: err?.message ?? String(err) };
        }
      },
      // BY _id. One id, one row — so removedCount cannot exceed what was
      // previewed even when a mirror id is duplicated locally.
      remove: async (doomedIds) => {
        const res = await Model.deleteMany({ _id: { $in: doomedIds } });
        return res?.deletedCount ?? 0;
      },
    });
  } catch (err) {
    return { ok: false, error: `ลบไม่สำเร็จ: ${err?.message ?? err}` };
  }

  if (!result.ok) {
    // A refusal is not a row. Nothing changed, so the trail has nothing to
    // record — and a row for every refused click would bury the ones that
    // actually purged something.
    return { ok: false, verdict: result.verdict, error: result.reason };
  }

  if (result.wrote) {
    for (const p of target.revalidate) {
      try { revalidatePath(p); } catch (err) {
        console.warn(`[cache-console] revalidatePath(${p}) skipped:`, err?.message ?? err);
      }
    }

    /**
     * ONE ROW. `recordId` is the collection key — the identifier the action
     * ACTUALLY used to select its target, not a re-derived one — and the
     * counts come from the values `resetMirror` computed rather than being
     * recounted here. Two parsers of one fact is how the join breaks silently.
     *
     * The pre-image is the count and the ids that went. Once the rows are
     * deleted there is nothing left to resolve them against, which is the same
     * reasoning §8.12 applies to `deleteCourse`'s label read.
     */
    recordAdminActionAfter({
      menu:        'landing_cache',
      action:      'reset',
      entity:      'mirror',
      recordId:    key,
      recordLabel: target.label,
      before:      { rowCount: result.before },
      after:       { rowCount: result.after },
      meta: {
        removedCount: result.removedCount,
        shrinkPercent: Math.round(result.shrinkRatio * 100),
        confirmedCollapse: Boolean(confirmed),
        // Capped by the writer anyway; a sample is enough to start an
        // investigation and the count above is the claim that matters.
        // Mongo _ids, which is what was deleted. The mirror ids are on the
        // screen; these are what a recovery would need to look for.
        removedIdsSample: (result.doomed ?? []).slice(0, 20),
        unmanagedRowsUntouched: liveState?.unmanaged ?? 0,
      },
      actor: { id: session.user?.id, name: session.user?.name },
    });
  }

  return {
    ok: true,
    removedCount: result.removedCount,
    before: result.before,
    after: result.after,
    wrote: result.wrote,
  };
}

/** The keys the UI may pass, so a client cannot probe for others. */
export async function listMirrorResetKeys() {
  await requireAdmin('landing_cache');
  return [...MIRROR_KEYS];
}

// ── THE DOWNGRADE OVERRIDE ──────────────────────────────────────────────────

/**
 * PREVIEW the refused downgrade. Read-only, and cheap.
 *
 * It reads the refusal the SYNC already recorded rather than rebuilding, for
 * two reasons. The numbers it shows are then the ones a real refused run
 * actually computed — not a second build's, which could differ from both the
 * refusal and the eventual apply. And a rebuild costs the full 5-15s upstream
 * fan-out, which is not a thing to spend on a screen someone is only reading.
 *
 * The staleness shape is round 3's, not a second vocabulary: `issuedAt` plus a
 * `beforeCount` the apply re-reads and compares. Here `beforeCount` is the
 * stored snapshot's own `syncedAt`, which is what changes if a cron writes
 * between the two clicks.
 */
export async function previewSnapshotOverride() {
  await requireAdmin('landing_cache');
  await dbConnect();

  const LandingCache = (await import('@/models/LandingCache')).default;
  const doc = await LandingCache.findOne({ key: 'homepage_v1' }).lean();

  if (!doc) {
    return { ok: false, error: 'ยังไม่มีสแนปช็อต — ไม่มีอะไรให้ override' };
  }
  if (!doc.lastRefusal) {
    return { ok: false, error: 'ไม่มีการปฏิเสธค้างอยู่ — sync ล่าสุดเขียนได้ตามปกติ' };
  }

  const r = doc.lastRefusal;
  return {
    ok: true,
    preview: {
      target: 'landing_cache',
      // The compare-and-swap key. A cron writing between preview and apply
      // moves this, and the apply refuses rather than overwriting it.
      beforeCount: doc.syncedAt ? new Date(doc.syncedAt).getTime() : 0,
      issuedAt: Date.now(),
    },
    refusedAt: r.at ?? null,
    actor: r.actor ?? null,
    reason: r.reason ?? '',
    shrunk: r.shrunk ?? [],
    vanished: r.vanished ?? [],
    storedSections: r.storedSections ?? {},
    incomingSections: r.incomingSections ?? {},
    storedSyncedAt: doc.syncedAt ?? null,
  };
}

/**
 * APPLY the override — accept the shrinkage and let one run write.
 *
 * ── THIS IS AN OVERRIDE, NOT A RESET, AND RULING 1 STILL HOLDS ──────────────
 * It re-runs the sync with the guard bypassed for that single call. The sync
 * builds the full replacement first and only writes a complete, non-empty one;
 * on a total failure it still preserves the previous payload. There is no path
 * here that empties the document, and `allowShrink` is a parameter rather than
 * stored state precisely so it cannot outlive this call.
 *
 * The numbers RECORDED are the ones the run actually produced, not the ones the
 * preview showed — §8.12's rule that a row logs the value the action used. The
 * preview's numbers are used only to detect that the world moved.
 */
export async function applySnapshotOverride(preview) {
  const session = await requireAdmin('landing_cache');
  await dbConnect();

  const LandingCache = (await import('@/models/LandingCache')).default;
  const doc = await LandingCache.findOne({ key: 'homepage_v1' }).lean();
  if (!doc) return { ok: false, error: 'ยังไม่มีสแนปช็อต — ไม่มีอะไรให้ override' };

  const live = {
    target: 'landing_cache',
    beforeCount: doc.syncedAt ? new Date(doc.syncedAt).getTime() : 0,
  };
  const check = assessPreview(preview, live, Date.now());
  if (!permitsWrite(check.verdict)) {
    return { ok: false, verdict: check.verdict, error: check.reason };
  }

  const beforeSections = sectionCountsOf(doc.data);

  let result;
  try {
    result = await syncLandingData({
      allowShrink: true,
      actor: session.user?.id ? String(session.user.id) : 'admin',
    });
  } catch (err) {
    return { ok: false, error: `sync ไม่สำเร็จ: ${err?.message ?? err}` };
  }

  // The sync can still refuse for a reason the override does not cover — an
  // incomplete build, say. Ruling 1 outranks the override.
  if (result?.refused) {
    return { ok: false, verdict: result.verdict, error: result.reason };
  }

  const after = await LandingCache.findOne({ key: 'homepage_v1' }).lean();
  const afterSections = sectionCountsOf(after?.data);

  recordAdminActionAfter({
    menu:        'landing_cache',
    action:      'override',
    entity:      'snapshot',
    recordId:    'homepage_v1',
    recordLabel: 'สแนปช็อตหน้าแรก',
    before:      { sections: beforeSections },
    after:       { sections: afterSections },
    meta: {
      overrodeDowngrade: true,
      refusedShrunk: doc.lastRefusal?.shrunk ?? [],
      syncStatus: result?.status ?? null,
      syncErrorCount: Array.isArray(result?.errors) ? result.errors.length : 0,
    },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return { ok: true, before: beforeSections, after: afterSections, status: result?.status ?? null };
}
