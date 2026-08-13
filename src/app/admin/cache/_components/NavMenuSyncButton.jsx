'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Sync now" for nav_menu_cache — the mega menu snapshot.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * POST /api/admin/navmenu/sync shipped with ZERO callers. The only sync control
 * on this screen drove syncLandingData, and landing_cache is not in the mega
 * menu's read chain at any point — PublicHeader reads nav_menu_cache via
 * getNavMenuData, and nothing else writes that document except the 3-hourly
 * cron. So an admin who renamed a course, saw the old name in the menu and
 * pressed the only button available got a fresh landing_cache timestamp and no
 * change to the menu, which reads as "the sync button is broken". It was not;
 * it was the wrong button, and the right one had no UI.
 *
 * ── SHAPED AFTER LandingSyncButton, DELIBERATELY ───────────────────────────
 * Same fetch/loading/error/result structure, same router.refresh() so the panel
 * above re-reads its own numbers, same raw-JSON result block. Two sync controls
 * three inches apart that behave differently under failure is a worse outcome
 * than any improvement either could have made alone.
 *
 * ONE addition, and it is not cosmetic: this sync can REFUSE. The nav downgrade
 * guard returns `{ ok: false, refused: true, verdict, reason }` on HTTP 200 with
 * the snapshot untouched. `res.ok` is true for that, so the landing button's
 * shape would render a refusal as a success with some JSON under it. A refusal
 * is the outcome an admin most needs to actually read, so it gets its own
 * branch. landing_cache can refuse the same way and DowngradeRefusalPanel
 * surfaces it from the stored document on the next render; this is the same
 * fact delivered at the moment of the press.
 *
 * ── WHAT THE BUTTON MUST NOT IMPLY ─────────────────────────────────────────
 * That the menu a visitor is looking at has changed. It has not necessarily:
 * the sync writes a Mongo document and calls revalidatePath('/', 'layout'), and
 * whether any given cached page has been regenerated is not readable from
 * application code. The caveat is NOT written here — it is <SyncedAtCaveat />,
 * mounted beside this button in SnapshotPanel, already the binding wording for
 * every syncedAt on this screen (§E of the inventory: an INFERRED value carries
 * its limitation in the UI text). A second sentence saying the same thing in
 * slightly different words is how the two drift apart.
 */
export function NavMenuSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runSync() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/navmenu/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
        // Refresh the server component so the panel above reflects the new
        // syncedAt / status / group counts.
        router.refresh();
      }
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  const refused = Boolean(result?.refused);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={runSync}
        disabled={loading}
        className="self-start rounded-9e-md bg-9e-action px-5 py-2.5 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand disabled:opacity-50"
      >
        {loading ? 'กำลัง sync...' : 'Sync เมกะเมนูหลักสูตรตอนนี้'}
      </button>

      {error && (
        <div className="rounded-9e-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {refused && (
        <div className="rounded-9e-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-bold">ถูกปฏิเสธ — สแนปช็อตเดิมไม่ถูกแตะต้อง </span>
          {result?.reason ?? 'ตัวป้องกัน downgrade ปฏิเสธการเขียนรอบนี้'}
        </div>
      )}

      {result && (
        <pre className="overflow-auto rounded-9e-md bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
