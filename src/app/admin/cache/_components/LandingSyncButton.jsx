'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Sync now" for landing_cache — PORTED UNCHANGED from the old
 * admin/landing-cache/_components/LandingCacheClient.jsx, which has since been
 * DELETED. Nothing imported it after the port; /admin/landing-cache is a
 * redirect to this console and the component it used to render was dead code
 * kept around only for this comment to point at.
 *
 * Same endpoint, same method, same router.refresh() afterwards as the original:
 * this control already existed and already shipped, and was moved rather than
 * introduced.
 *
 * The status card that used to wrap this lives in SnapshotPanel now, so this is
 * only the button and its two outcomes.
 */
export function LandingSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runSync() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/landing/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`);
      } else {
        setResult(data);
        // Refresh the server component so the panel above reflects the new
        // syncedAt / sections / syncErrors.
        router.refresh();
      }
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={runSync}
        disabled={loading}
        className="self-start rounded-9e-md bg-9e-action px-5 py-2.5 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand disabled:opacity-50"
      >
        {loading ? 'กำลัง sync...' : 'Sync ข้อมูลหน้า Home ตอนนี้'}
      </button>

      {error && (
        <div className="rounded-9e-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
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
