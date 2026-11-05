'use client';

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, Plus } from 'lucide-react';
import { setWriterActive } from '@/lib/actions/writers';
import { WRITER_TYPE_LABELS } from '@/lib/writers/writerFields';
import { WriterAvatar } from './WriterAvatar';

/**
 * The writer list. `status` and `q` are props, read from the URL on the server,
 * and are never copied into state: changing a filter pushes a URL and the server
 * re-queries. The `useState` below is only what a pending toggle is doing.
 */

const TABS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'active', label: 'ใช้งาน' },
  { value: 'inactive', label: 'ปิดใช้งาน' },
];

const TH = 'px-4 py-3 text-left font-bold text-9e-navy dark:text-white';

export function WritersAdminClient({ rows, counts, status, q }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const navigate = useCallback(
    (overrides = {}) => {
      const next = { status, q, ...overrides };
      const params = new URLSearchParams();
      Object.entries(next).forEach(([k, v]) => {
        const value = String(v ?? '').trim();
        if (value && !(k === 'status' && value === 'all')) params.set(k, value);
      });
      const qs = params.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [router, pathname, status, q]
  );

  async function toggle(row) {
    if (row.isDefault) return;
    if (row.isActive && !window.confirm(`ปิดใช้งาน "${row.displayName}"?`)) return;
    setBusyId(row._id);
    setMessage(null);
    try {
      const res = await setWriterActive(row._id, !row.isActive);
      if (res?.ok) router.refresh();
      else setMessage(res?.error ?? 'บันทึกไม่สำเร็จ');
    } catch (err) {
      setMessage(err?.message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  const nothingSeeded = counts.all === 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">ผู้เขียน</h1>
          <p className="mt-1 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            โปรไฟล์ผู้เขียนบทความ — แสดงที่ /writer และใน &quot;บทความโดย&quot; ของทุกบทความ
          </p>
        </div>
        <Link
          href="/admin/writers/new"
          className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-4 py-2 text-sm font-bold text-white hover:bg-9e-brand"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> เพิ่มผู้เขียน
        </Link>
      </div>

      {message && (
        <p className="mt-3 text-sm text-red-700" role="alert" data-testid="writers-message">{message}</p>
      )}

      <div className="mt-5 overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-white dark:bg-[#111d2c]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--surface-border)] p-3">
          <div className="inline-flex rounded-9e-md border border-[var(--surface-border)] p-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                data-testid={`writers-tab-${tab.value}`}
                aria-pressed={status === tab.value}
                onClick={() => navigate({ status: tab.value })}
                className={
                  'rounded-9e-sm px-3 py-1 text-sm font-medium transition-colors ' +
                  (status === tab.value
                    ? 'bg-9e-action text-white'
                    : 'text-[var(--text-secondary)] hover:bg-9e-ice dark:hover:bg-[#0D1B2A]')
                }
              >
                {tab.label} {counts[tab.value]}
              </button>
            ))}
          </div>
          {/* Uncontrolled and re-keyed: a navigation that changes `q` remounts it. */}
          <input
            key={q}
            type="search"
            defaultValue={q}
            placeholder="ค้นหาชื่อหรือ slug"
            data-testid="writers-search"
            onKeyDown={(e) => { if (e.key === 'Enter') navigate({ q: e.currentTarget.value }); }}
            className="w-full max-w-xs rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm dark:bg-[#0D1B2A] dark:text-white"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--surface-border)] bg-9e-ice dark:bg-[#0D1B2A]">
                <th className={TH}>ผู้เขียน</th>
                <th className={TH}>ประเภท</th>
                <th className={TH}>ผูกกับวิทยากร</th>
                <th className={TH}>บทความ</th>
                <th className={TH}>สถานะ</th>
                <th className="px-4 py-3" aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[var(--text-muted)]" data-testid="writers-empty">
                    {nothingSeeded
                      ? 'ยังไม่มีผู้เขียน — รัน seed เพื่อสร้าง 9Expert Academy'
                      : 'ไม่พบผู้เขียนตามเงื่อนไขนี้'}
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row._id}
                  data-testid="writer-row"
                  className={
                    'border-b border-[var(--surface-border)] last:border-b-0 ' +
                    (row.isActive ? '' : 'opacity-50')
                  }
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <WriterAvatar publicId={row.avatarPublicId} px={40} source={72} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-9e-navy dark:text-white">{row.displayName}</span>
                          {row.isDefault && (
                            <span
                              data-testid="writer-default-pill"
                              className="inline-flex items-center rounded-full bg-9e-action/10 px-2 py-0.5 text-[11px] font-medium text-9e-action"
                            >
                              ผู้เขียนหลัก
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">/writer/{row.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{WRITER_TYPE_LABELS[row.type]}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.instructorName || '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{row.articleCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.isActive}
                        aria-label={`สถานะของ ${row.displayName}`}
                        disabled={row.isDefault || busyId === row._id}
                        onClick={() => toggle(row)}
                        className={
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed ' +
                          (row.isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')
                        }
                      >
                        <span
                          className={
                            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ' +
                            (row.isActive ? 'translate-x-4' : 'translate-x-1')
                          }
                        />
                      </button>
                      {row.isDefault && (
                        <Lock className="h-3.5 w-3.5 text-[var(--text-muted)]" data-testid="writer-lock" aria-hidden="true" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/writers/${row._id}`}
                      className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
                    >
                      แก้ไข
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 rounded-9e-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
        9Expert Academy ปิดใช้งาน/ลบไม่ได้ — เป็นผู้เขียนเริ่มต้นของบทความใหม่ และเป็นปลายทางที่บทความถูกโอนไปเมื่อปิดใช้งานผู้เขียนคนอื่น
      </p>
    </div>
  );
}
