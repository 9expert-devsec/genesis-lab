/**
 * Schedule a nav-menu resync to run AFTER the current Server Action's response
 * has been sent.
 *
 * ── WHY THIS EXISTS, WHEN THE SYNC ALREADY HAD TWO CALLERS ─────────────────
 * It had a 3-hourly CRON and a BUTTON on /admin/cache, and neither is reachable
 * from a server action that has just changed a course code:
 *
 *   · the cron is up to three hours away, and the mega menu is on every public
 *     page. For that whole window it links to `/<old-code>-training-course`;
 *   · the button is a manual step on another screen, gated on the
 *     `landing_cache` RBAC key. A `courses` admin who can rename may not hold
 *     it, so "go and press it" is advice that does not work for the person
 *     being given it — and the whole point of this round is that the admin
 *     renames and is DONE.
 *
 * So the action calls the sync FUNCTION directly, exactly as
 * `triggerLandingSync` already calls `syncLandingData`. That is not a bypass of
 * the route's authorisation: the route's `requireAdmin('landing_cache')` gates
 * a USER-INITIATED cache operation on the cache console. This is a CONSEQUENCE
 * of an already-authorised `courses` write, and the caller has been through
 * `requireAdmin('courses')` before anything reached here. The landing sync has
 * been drawing that same distinction since it was written.
 *
 * ── `after()`, FOR THE REASON THE LANDING ONE USES IT ──────────────────────
 * The sync fans out to several upstream calls. Awaiting it would tack that onto
 * the rename's response, and the rename has already done the only work whose
 * failure matters. The callback swallows its own errors so a transient sync
 * failure cannot surface as a failed rename — the rename DID happen, and
 * reporting otherwise would be the worse lie.
 *
 * ── NO `allowShrink` ──────────────────────────────────────────────────────
 * Left at its default `false`, so the downgrade guard still applies. A rename
 * does not remove a course — the count upstream is identical before and after —
 * so a shrink during a rename resync is a signal that something ELSE is wrong,
 * and it should refuse and say so rather than be waved through by a flag this
 * caller had no reason to set.
 */

import { after } from 'next/server';
import { syncNavMenuData } from '@/lib/navmenu/syncNavMenuData';

/**
 * @param {object} [options]
 * @param {string} [options.actor] attributed on a refusal — defaults to naming
 *   the rename, so a downgrade refusal points at what provoked it rather than
 *   at `system:cron`, which would be a lie.
 */
export function triggerNavMenuSync({ actor = 'admin:course-rename' } = {}) {
  try {
    after(async () => {
      try {
        const result = await syncNavMenuData({ actor });
        // eslint-disable-next-line no-console
        console.log('[triggerNavMenuSync] resync complete:', result?.status ?? 'ok');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[triggerNavMenuSync] background resync failed:', err?.message ?? err);
      }
    });
  } catch (err) {
    // `after()` throws outside a Server Component / Action / Route Handler /
    // Middleware. Never break the caller — same contract as triggerLandingSync.
    // eslint-disable-next-line no-console
    console.warn('[triggerNavMenuSync] could not schedule:', err?.message ?? err);
  }
}
