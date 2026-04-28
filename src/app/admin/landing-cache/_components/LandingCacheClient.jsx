'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const STATUS_COLOR = {
  ok:      'text-green-600',
  partial: 'text-yellow-600',
  error:   'text-red-600',
};

export function LandingCacheClient({ initialCache }) {
  const router = useRouter();
  const [cache] = useState(initialCache);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const status = cache?.status ?? 'no cache';
  const statusClass =
    STATUS_COLOR[cache?.status] ?? 'text-[var(--text-muted)]';

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
        // Refresh the server component so the status card reflects
        // the new syncedAt / sections / errors.
        router.refresh();
      }
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status card */}
      <div className="flex flex-col gap-3 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[var(--text-primary)]">Status</span>
          <span className={cn('font-bold uppercase', statusClass)}>{status}</span>
        </div>
        <div className="text-sm text-[var(--text-secondary)]">
          Last synced:{' '}
          {cache?.syncedAt
            ? new Date(cache.syncedAt).toLocaleString('th-TH')
            : 'Never'}
        </div>

        {cache?.sections && (
          <div className="mt-2 grid grid-cols-3 gap-3">
            {Object.entries(cache.sections).map(([key, count]) => (
              <div
                key={key}
                className="rounded-9e-md bg-[var(--surface-muted)] p-3 text-center"
              >
                <div className="text-lg font-bold text-[var(--text-primary)]">
                  {count}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{key}</div>
              </div>
            ))}
          </div>
        )}

        {cache?.syncErrors?.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-sm font-medium text-red-600">
              Last sync errors:
            </p>
            <ul className="flex flex-col gap-0.5">
              {cache.syncErrors.map((e, i) => (
                <li
                  key={i}
                  className="break-all font-mono text-xs text-red-500"
                >
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sync button */}
      <button
        type="button"
        onClick={runSync}
        disabled={loading}
        className="rounded-9e-md bg-9e-primary px-6 py-3 font-medium text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand disabled:opacity-50"
      >
        {loading ? 'กำลัง sync...' : 'Sync ข้อมูลหน้า Home ตอนนี้'}
      </button>

      {error && (
        <div className="rounded-9e-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <pre className="overflow-auto rounded-9e-md bg-[var(--surface-muted)] p-4 text-xs text-[var(--text-secondary)]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
