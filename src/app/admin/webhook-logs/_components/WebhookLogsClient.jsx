'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { replayWebhookEvent } from '@/lib/actions/webhook-logs';

const EVENT_OPTIONS = [
  { value: '',            label: 'ทุก event' },
  { value: 'course',      label: 'course.*' },
  { value: 'schedule',    label: 'schedule.*' },
  { value: 'promotion',   label: 'promotion.*' },
  { value: 'career_path', label: 'career_path.*' },
  { value: 'faq',         label: 'faq.*' },
  { value: 'instructor',  label: 'instructor.*' },
];

const STATUS_OPTIONS = [
  { value: '',      label: 'ทั้งหมด' },
  { value: 'ok',    label: 'ok' },
  { value: 'error', label: 'error' },
];

function fmtRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)        return `${Math.round(diff)}s ago`;
  if (diff < 3600)      return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
  return d.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function truncate(s, n = 80) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

export function WebhookLogsClient({
  initialLogs,
  total,
  page,
  pageCount,
  eventFilter,
  statusFilter,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const logs = initialLogs;
  const [busyId, setBusyId] = useState(null);
  const [replayMsg, setReplayMsg] = useState(null);
  const [, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState(null);

  function pushFilter(next) {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else   q.delete(k);
    }
    // Always reset to page 1 when a filter changes (unless caller
    // explicitly set page).
    if (!('page' in next)) q.delete('page');
    router.push(`${pathname}?${q.toString()}`);
  }

  async function handleReplay(log) {
    setBusyId(log._id);
    setReplayMsg(null);
    try {
      const res = await replayWebhookEvent(log._id);
      if (res?.ok) {
        setReplayMsg({ type: 'ok', text: `Replay สำเร็จ: ${log.event}` });
      } else {
        setReplayMsg({ type: 'err', text: res?.error ?? 'Replay failed' });
      }
      // Force a server-data refetch so the new replay row appears.
      startTransition(() => router.refresh());
    } catch (err) {
      setReplayMsg({ type: 'err', text: err?.message ?? 'Replay failed' });
    } finally {
      setBusyId(null);
    }
  }

  const prevHref = (() => {
    if (page <= 1) return null;
    const q = new URLSearchParams(params);
    q.set('page', String(page - 1));
    return `${pathname}?${q.toString()}`;
  })();
  const nextHref = (() => {
    if (page >= pageCount) return null;
    const q = new URLSearchParams(params);
    q.set('page', String(page + 1));
    return `${pathname}?${q.toString()}`;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            Webhook Logs
          </h1>
          <p className="mt-1 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
            รวม {total.toLocaleString()} รายการ — เก็บอัตโนมัติ 30 วัน
          </p>
        </div>
        {replayMsg && (
          <span
            className={
              'text-xs ' +
              (replayMsg.type === 'ok' ? 'text-green-600' : 'text-red-600')
            }
          >
            {replayMsg.text}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={eventFilter}
          onChange={(e) => pushFilter({ event: e.target.value })}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-1.5 text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          {EVENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => pushFilter({ status: e.target.value })}
          className="rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-1.5 text-xs text-9e-navy focus:outline-none focus:ring-1 focus:ring-9e-action dark:bg-[#0D1B2A] dark:text-white"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Event</th>
              <th className="w-24 px-3 py-3 text-center font-bold text-9e-navy dark:text-white">Status</th>
              <th className="px-3 py-3 text-left font-bold text-9e-navy dark:text-white">Error</th>
              <th className="w-32 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">เวลา</th>
              <th className="w-32 px-3 py-3 text-right font-bold text-9e-navy dark:text-white">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  ยังไม่มี webhook log
                </td>
              </tr>
            )}
            {logs.flatMap((log) => {
              const isExpanded = expandedId === log._id;
              const rows = [
                <tr
                  key={log._id}
                  className="border-b border-[var(--surface-border)] last:border-0 hover:bg-9e-ice/50 dark:hover:bg-[#0D1B2A]/40"
                >
                  <td className="px-3 py-3 font-mono text-xs text-9e-navy dark:text-white">
                    {log.event || '—'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={
                        'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                        (log.status === 'ok'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700')
                      }
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]" title={log.error}>
                    {truncate(log.error, 80) || '—'}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]" title={log.processed_at}>
                    {fmtRelative(log.processed_at)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : log._id)}
                        className="rounded border border-[var(--surface-border)] px-2 py-1 text-[11px] text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                      >
                        {isExpanded ? 'ซ่อน' : 'ดู JSON'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReplay(log)}
                        disabled={busyId === log._id}
                        className="rounded bg-9e-action px-2 py-1 text-[11px] font-bold text-white hover:bg-9e-brand disabled:opacity-50"
                      >
                        {busyId === log._id ? '…' : 'Replay'}
                      </button>
                    </div>
                  </td>
                </tr>,
              ];
              if (isExpanded) {
                rows.push(
                  <tr key={`${log._id}-payload`} className="border-b border-[var(--surface-border)]">
                    <td colSpan={5} className="bg-9e-ice/30 px-3 py-3 dark:bg-[#0D1B2A]/40">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-9e-navy dark:text-white">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                );
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
        <span>หน้า {page} / {pageCount}</span>
        <div className="flex gap-2">
          {prevHref ? (
            <Link href={prevHref} className="rounded border border-[var(--surface-border)] px-3 py-1.5 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
              ← Prev
            </Link>
          ) : (
            <span className="rounded border border-[var(--surface-border)] px-3 py-1.5 opacity-40">← Prev</span>
          )}
          {nextHref ? (
            <Link href={nextHref} className="rounded border border-[var(--surface-border)] px-3 py-1.5 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
              Next →
            </Link>
          ) : (
            <span className="rounded border border-[var(--surface-border)] px-3 py-1.5 opacity-40">Next →</span>
          )}
        </div>
      </div>
    </div>
  );
}
