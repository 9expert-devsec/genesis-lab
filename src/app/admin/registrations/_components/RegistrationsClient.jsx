'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all',       label: 'ทั้งหมด' },
  { value: 'pending',   label: 'รอดำเนินการ' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'paid',      label: 'ชำระแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  paid:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL = {
  pending:   'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  paid:      'ชำระแล้ว',
  cancelled: 'ยกเลิก',
};

const SCHEDULE_BADGE = {
  hybrid:    'bg-violet-100 text-violet-700',
  online:    'bg-emerald-100 text-emerald-700',
  classroom: 'bg-sky-100 text-sky-700',
};

const THAI_MONTHS = [
  'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.',
];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function refNo(id) {
  return String(id).slice(-8).toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────

export function RegistrationsClient({ initialData, initialStatus, initialQ }) {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ]           = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);

  // Push updated URL params — server re-fetches via page.jsx
  const navigate = useCallback((overrides = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    const next = { page: '1', status, q, ...overrides };
    Object.entries(next).forEach(([k, v]) => {
      if (v && v !== 'all' && v !== '') params.set(k, String(v));
      else params.delete(k);
    });
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, searchParams, router, status, q]);

  const handleSearch = (e) => {
    e.preventDefault();
    navigate({ q, page: '1' });
  };

  const handleStatusChange = (val) => {
    setStatus(val);
    navigate({ status: val, page: '1' });
  };

  const { items, total, page, pageCount } = initialData;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleStatusChange(opt.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                status === opt.value
                  ? 'bg-9e-navy text-9e-ice'
                  : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-border)]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="ml-auto flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ / อีเมล / หลักสูตร"
              className={cn(
                'h-9 w-64 rounded-9e-md border bg-[var(--surface)] pl-9 pr-3 text-sm',
                'border-[var(--surface-border)] text-[var(--text-primary)]',
                'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
              )}
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-9e-md bg-9e-navy px-4 text-xs font-semibold text-9e-ice hover:opacity-90"
          >
            ค้นหา
          </button>
        </form>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
              <tr>
                <Th>เลขอ้างอิง</Th>
                <Th>หลักสูตร</Th>
                <Th>วันอบรม</Th>
                <Th>รูปแบบ</Th>
                <Th>ผู้ประสานงาน</Th>
                <Th center>ผู้เข้าอบรม</Th>
                <Th center>ใบเสนอราคา</Th>
                <Th>สถานะ</Th>
                <Th>วันที่สมัคร</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-[var(--text-muted)]">
                    ไม่พบรายการที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr
                  key={row._id}
                  className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold text-9e-action">
                    {refNo(row._id)}
                  </td>
                  <td className="max-w-[180px] px-4 py-3">
                    <p className="truncate font-medium text-[var(--text-primary)]">{row.courseName}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{row.classDate}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {row.classDate || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ScheduleBadge type={row.scheduleType} mode={row.attendanceMode} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-primary)]">
                      {row.coordinator?.firstName} {row.coordinator?.lastName}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{row.coordinator?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-[var(--text-primary)]">
                    {row.attendeesCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.requestInvoice
                      ? <span className="text-xs font-semibold text-emerald-600">✓</span>
                      : <span className="text-xs text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-600'
                    )}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {fmtDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/registrations/${row._id}`}
                      className="text-xs font-semibold text-9e-action hover:underline"
                    >
                      ดูรายละเอียด →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {pageCount > 1 && (
        <Pagination page={page} pageCount={pageCount} onNavigate={navigate} />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Th({ children, center }) {
  return (
    <th className={cn(
      'px-4 py-3 text-xs font-medium text-[var(--text-secondary)]',
      center ? 'text-center' : 'text-left'
    )}>
      {children}
    </th>
  );
}

function ScheduleBadge({ type, mode }) {
  if (!type || type === 'classroom') {
    return <span className="text-xs text-[var(--text-muted)]">Classroom</span>;
  }
  return (
    <span className={cn(
      'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
      SCHEDULE_BADGE[type] ?? 'bg-slate-100 text-slate-600'
    )}>
      {type === 'hybrid'
        ? (mode === 'teams' ? 'Hybrid · Teams' : 'Hybrid · Class')
        : 'Online'}
    </span>
  );
}

function Pagination({ page, pageCount, onNavigate }) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  // Show max 7 page buttons: first, last, current ±2, and ellipsis gaps
  const visible = pages.filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2
  );

  return (
    <div className="flex items-center justify-center gap-1">
      <PagerBtn disabled={page <= 1} onClick={() => onNavigate({ page: page - 1 })}>
        ‹ ก่อนหน้า
      </PagerBtn>

      {visible.map((p, i) => {
        const prev = visible[i - 1];
        const gap  = prev && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && <span className="px-1 text-[var(--text-muted)]">…</span>}
            <PagerBtn
              active={p === page}
              onClick={() => onNavigate({ page: p })}
            >
              {p}
            </PagerBtn>
          </span>
        );
      })}

      <PagerBtn disabled={page >= pageCount} onClick={() => onNavigate({ page: page + 1 })}>
        ถัดไป ›
      </PagerBtn>
    </div>
  );
}

function PagerBtn({ children, onClick, disabled, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[36px] rounded-9e-md px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-9e-navy text-9e-ice'
          : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-muted)]',
        disabled && 'opacity-40 pointer-events-none'
      )}
    >
      {children}
    </button>
  );
}